import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ENV } from '../lib/aws';
import { assertPatientAccess } from '../lib/caregiverAuth';
import { extractAuthPrincipal, handleError, jsonResponse } from '../lib/http';
import { materializeTodayDosesForPatient } from './doseHandler';
import { DoseRecord, Medication, NotificationRecord } from '../types/models';

export interface DailyAdherencePoint {
  date: string;
  taken: number;
  missed: number;
  pending: number;
  adherenceRate: number;
}

export function computeAdherenceMetrics(doses: DoseRecord[]) {
  const totalDoses = doses.length;
  const takenCount = doses.filter((d) => d.status === 'TAKEN').length;
  const missedCount = doses.filter((d) => d.status === 'MISSED').length;
  const pendingCount = doses.filter((d) => d.status === 'PENDING').length;

  const resolvedCount = takenCount + missedCount;
  const overallAdherenceRate =
    resolvedCount > 0
      ? Math.round((takenCount / resolvedCount) * 100)
      : totalDoses > 0
        ? Math.round((takenCount / totalDoses) * 100)
        : 100;

  // Group by scheduledDate
  const byDateMap = new Map<string, { taken: number; missed: number; pending: number }>();
  for (const dose of doses) {
    const entry = byDateMap.get(dose.scheduledDate) || { taken: 0, missed: 0, pending: 0 };
    if (dose.status === 'TAKEN') entry.taken += 1;
    else if (dose.status === 'MISSED') entry.missed += 1;
    else entry.pending += 1;
    byDateMap.set(dose.scheduledDate, entry);
  }

  const dailySeries: DailyAdherencePoint[] = Array.from(byDateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => {
      const resolved = counts.taken + counts.missed;
      const total = resolved + counts.pending;
      const adherenceRate =
        resolved > 0
          ? Math.round((counts.taken / resolved) * 100)
          : total > 0
            ? Math.round((counts.taken / total) * 100)
            : 100;
      return {
        date,
        taken: counts.taken,
        missed: counts.missed,
        pending: counts.pending,
        adherenceRate,
      };
    });

  return {
    totalDoses,
    takenCount,
    missedCount,
    pendingCount,
    overallAdherenceRate,
    dailySeries,
  };
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const requestId = event.requestContext?.requestId;
  try {
    const principal = extractAuthPrincipal(event);
    const rawPath = event.rawPath || '';
    const requestedPatientId = event.queryStringParameters?.patientId || principal.userId;

    await assertPatientAccess(principal.userId, requestedPatientId, 'VIEW_ONLY');

    const [doses, medsRes, notifRes] = await Promise.all([
      materializeTodayDosesForPatient(requestedPatientId),
      ddb.send(
        new QueryCommand({
          TableName: ENV.MEDICATIONS_TABLE,
          KeyConditionExpression: 'patientId = :pid',
          ExpressionAttributeValues: { ':pid': requestedPatientId },
        })
      ),
      ddb.send(
        new QueryCommand({
          TableName: ENV.NOTIFICATIONS_TABLE,
          KeyConditionExpression: 'recipientUserId = :uid',
          ExpressionAttributeValues: { ':uid': requestedPatientId },
          Limit: 50,
        })
      ),
    ]);

    const medications = (medsRes.Items || []) as Medication[];
    const notifications = (notifRes.Items || []) as NotificationRecord[];
    const metrics = computeAdherenceMetrics(doses);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400 * 1000).toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400 * 1000).toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    const todayMetrics = computeAdherenceMetrics(
      doses.filter((d) => d.scheduledDate === todayStr)
    );
    const weeklyMetrics = computeAdherenceMetrics(
      doses.filter((d) => d.scheduledDate >= sevenDaysAgo)
    );
    const monthlyMetrics = computeAdherenceMetrics(
      doses.filter((d) => d.scheduledDate >= thirtyDaysAgo)
    );

    if (rawPath.endsWith('/analytics/summary')) {
      return jsonResponse(200, {
        patientId: requestedPatientId,
        activeMedicationsCount: medications.filter((m) => m.active).length,
        totalMedicationsCount: medications.length,
        today: {
          total: todayMetrics.totalDoses,
          taken: todayMetrics.takenCount,
          missed: todayMetrics.missedCount,
          pending: todayMetrics.pendingCount,
          adherenceRate: todayMetrics.overallAdherenceRate,
        },
        weeklyAdherenceRate: weeklyMetrics.overallAdherenceRate,
        monthlyAdherenceRate: monthlyMetrics.overallAdherenceRate,
        overallAdherenceRate: metrics.overallAdherenceRate,
        totalTaken: metrics.takenCount,
        totalMissed: metrics.missedCount,
        totalPending: metrics.pendingCount,
        recentAlertsCount: notifications.filter(
          (n) => n.type === 'CAREGIVER_MISSED_DOSE_ALERT' || n.type === 'PATIENT_REMINDER'
        ).length,
      });
    }

    // GET /api/v1/analytics/adherence
    return jsonResponse(200, {
      patientId: requestedPatientId,
      dailyAdherence: todayMetrics.overallAdherenceRate,
      weeklyAdherence: weeklyMetrics.overallAdherenceRate,
      monthlyAdherence: monthlyMetrics.overallAdherenceRate,
      dailySeries: metrics.dailySeries,
      totals: {
        taken: metrics.takenCount,
        missed: metrics.missedCount,
        pending: metrics.pendingCount,
        total: metrics.totalDoses,
      },
      medicationHistory: doses
        .slice()
        .sort((a, b) =>
          `${b.scheduledDate}T${b.scheduledTime}`.localeCompare(`${a.scheduledDate}T${a.scheduledTime}`)
        )
        .slice(0, 50),
      alertHistory: notifications
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 30),
    });
  } catch (err) {
    return handleError(err, requestId);
  }
};

