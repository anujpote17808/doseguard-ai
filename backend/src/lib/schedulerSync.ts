import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  FlexibleTimeWindowMode,
  GetScheduleCommand,
  ScheduleState,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import { ENV, scheduler } from './aws';
import { AppError, logger } from './http';
import { Medication } from '../types/models';

export function buildScheduleName(medicationId: string): string {
  // Stable, deterministic schedule identifier safe for EventBridge Scheduler (alphanumeric, -, _)
  const cleanId = medicationId.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 48);
  return `dg-med-${cleanId}`;
}

export function buildCronExpression(scheduleTime: string, frequency: Medication['frequency']): string {
  const [hourStr, minuteStr] = scheduleTime.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (frequency === 'WEEKLY') {
    // Runs every Monday at HH:mm in the patient's timezone
    return `cron(${minute} ${hour} ? * MON *)`;
  }
  // DAILY, TWICE_DAILY (primary), CUSTOM default to daily cron
  return `cron(${minute} ${hour} * * ? *)`;
}

export async function syncMedicationSchedule(medication: Medication): Promise<string> {
  const scheduleName = buildScheduleName(medication.medicationId);

  if (!ENV.STATE_MACHINE_ARN || !ENV.SCHEDULER_ROLE_ARN) {
    logger('WARN', 'SCHEDULER_ENV_NOT_CONFIGURED', {
      medicationId: medication.medicationId,
      scheduleName,
    });
    return scheduleName;
  }

  const scheduleExpression = buildCronExpression(medication.scheduleTime, medication.frequency);
  const state = medication.active ? ScheduleState.ENABLED : ScheduleState.DISABLED;

  const inputPayload = JSON.stringify({
    patientId: medication.patientId,
    medicationId: medication.medicationId,
    scheduledTime: medication.scheduleTime,
    responseWindowSeconds: 900, // 15 minutes standard default
  });

  const scheduleParams = {
    Name: scheduleName,
    GroupName: ENV.SCHEDULER_GROUP_NAME,
    ScheduleExpression: scheduleExpression,
    ScheduleExpressionTimezone: medication.timezone,
    FlexibleTimeWindow: {
      Mode: FlexibleTimeWindowMode.OFF,
    },
    State: state,
    Description: `DoseGuard AI recurring reminder for medication ${medication.medicationId}`,
    Target: {
      Arn: ENV.STATE_MACHINE_ARN,
      RoleArn: ENV.SCHEDULER_ROLE_ARN,
      Input: inputPayload,
      RetryPolicy: {
        MaximumEventAgeInSeconds: 3600,
        MaximumRetryAttempts: 2,
      },
    },
  };

  try {
    // Check if schedule already exists
    let exists = false;
    try {
      await scheduler.send(
        new GetScheduleCommand({
          Name: scheduleName,
          GroupName: ENV.SCHEDULER_GROUP_NAME,
        })
      );
      exists = true;
    } catch (getErr: unknown) {
      const errName = getErr && typeof getErr === 'object' && 'name' in getErr ? String(getErr.name) : '';
      if (errName !== 'ResourceNotFoundException') {
        throw getErr;
      }
    }

    if (exists) {
      await scheduler.send(new UpdateScheduleCommand(scheduleParams));
      logger('INFO', 'EVENTBRIDGE_SCHEDULE_UPDATED', {
        medicationId: medication.medicationId,
        scheduleName,
        timezone: medication.timezone,
        scheduleExpression,
        state,
      });
    } else {
      await scheduler.send(new CreateScheduleCommand(scheduleParams));
      logger('INFO', 'EVENTBRIDGE_SCHEDULE_CREATED', {
        medicationId: medication.medicationId,
        scheduleName,
        timezone: medication.timezone,
        scheduleExpression,
        state,
      });
    }

    return scheduleName;
  } catch (err) {
    logger('ERROR', 'EVENTBRIDGE_SCHEDULE_SYNC_FAILED', {
      medicationId: medication.medicationId,
      scheduleName,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(
      502,
      'SCHEDULE_PROVISIONING_FAILED',
      'Failed to provision recurring medication reminder schedule in Amazon EventBridge Scheduler. Reminders are not active.'
    );
  }
}

export async function removeMedicationSchedule(medicationId: string): Promise<void> {
  const scheduleName = buildScheduleName(medicationId);
  if (!ENV.STATE_MACHINE_ARN || !ENV.SCHEDULER_ROLE_ARN) {
    return;
  }

  try {
    await scheduler.send(
      new DeleteScheduleCommand({
        Name: scheduleName,
        GroupName: ENV.SCHEDULER_GROUP_NAME,
      })
    );
    logger('INFO', 'EVENTBRIDGE_SCHEDULE_DELETED', {
      medicationId,
      scheduleName,
    });
  } catch (err: unknown) {
    const errName = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
    if (errName === 'ResourceNotFoundException') {
      return;
    }
    logger('ERROR', 'EVENTBRIDGE_SCHEDULE_DELETE_FAILED', {
      medicationId,
      scheduleName,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(
      502,
      'SCHEDULE_DELETE_FAILED',
      'Failed to delete recurring schedule in Amazon EventBridge Scheduler.'
    );
  }
}

