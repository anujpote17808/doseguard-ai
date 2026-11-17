import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../services/api';
import {
  CaregiverConnection,
  CaregiverInvitationSummary,
  CaregiverPermission,
} from '../types';

export const CaregiverManagementPage: React.FC = () => {
  const [myCaregivers, setMyCaregivers] = useState<CaregiverConnection[]>([]);
  const [myInvitations, setMyInvitations] = useState<CaregiverInvitationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create Invitation state
  const [relationship, setRelationship] = useState('Daughter');
  const [allowManageMeds, setAllowManageMeds] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState(48);
  const [generatedPasscode, setGeneratedPasscode] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);

  // Redeem Invitation state
  const [redeemPasscode, setRedeemPasscode] = useState('');
  const [caregiverDisplayName, setCaregiverDisplayName] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const loadCaregiverData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCaregivers();
      setMyCaregivers(res.myCaregivers);
      setMyInvitations(res.myInvitations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load caregiver connections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCaregiverData();
  }, [loadCaregiverData]);

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingInvite(true);
    setError(null);
    setSuccess(null);
    setGeneratedPasscode(null);

    try {
      const permissions: CaregiverPermission[] = allowManageMeds
        ? ['VIEW_ONLY', 'MANAGE_MEDICATIONS']
        : ['VIEW_ONLY'];

      const res = await api.createCaregiverInvitation({
        relationship,
        permissions,
        expiresInHours,
      });

      setGeneratedPasscode(res.passcode);
      setSuccess(
        'Cryptographic caregiver invitation generated! Copy the one-time passcode below—only its SHA-256 hash is stored in DynamoDB.'
      );
      await loadCaregiverData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invitation');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRedeemInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedeeming(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await api.redeemCaregiverInvitation({
        passcode: redeemPasscode.trim(),
        caregiverName: caregiverDisplayName.trim() || undefined,
      });
      setRedeemPasscode('');
      setSuccess(
        `Successfully connected as authorized caregiver (${res.connection.relationship}) for patient ${res.connection.patientName}!`
      );
      await loadCaregiverData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to redeem invitation passcode');
    } finally {
      setRedeeming(false);
    }
  };

  const handleRevoke = async (id: string, label: string) => {
    setError(null);
    setSuccess(null);
    try {
      await api.revokeCaregiverOrInvitation(id);
      setSuccess(`Revoked access for ${label}.`);
      await loadCaregiverData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke access');
    }
  };

  const copyPasscode = () => {
    if (!generatedPasscode) return;
    navigator.clipboard.writeText(generatedPasscode);
    setSuccess('Passcode copied to clipboard!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Caregiver Invitations & Access Control
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Single-use cryptographic passcodes hashed with SHA-256, enforced by atomic DynamoDB conditional expressions and TTL expiration.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Two-Column Action Cards: Generate Invitation (As Patient) & Redeem Passcode (As Caregiver) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Generate Invitation */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                1. Generate Caregiver Passcode (As Patient)
              </h2>
              <p className="text-xs text-slate-500">
                Create a time-limited, single-use invitation for a family member or nurse
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateInvitation} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Caregiver Relationship *
                </label>
                <input
                  type="text"
                  required
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="e.g., Daughter, Son, Spouse, Nurse"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Expiration Window *
                </label>
                <select
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value={24}>24 Hours</option>
                  <option value={48}>48 Hours</option>
                  <option value={72}>72 Hours</option>
                  <option value={168}>7 Days</option>
                </select>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-start gap-2.5">
              <input
                id="perm-manage"
                type="checkbox"
                checked={allowManageMeds}
                onChange={(e) => setAllowManageMeds(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              <label htmlFor="perm-manage" className="text-xs text-slate-700">
                <span className="font-bold block">Grant MANAGE_MEDICATIONS Permission</span>
                <span className="text-slate-500">
                  If unchecked, caregiver receives strict VIEW_ONLY access (can view schedules, adherence, and receive missed-dose alerts, but cannot alter schedules).
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={creatingInvite}
              className="w-full rounded-xl bg-navy-900 hover:bg-navy-800 text-white font-bold py-2.5 text-sm shadow transition-colors"
            >
              {creatingInvite ? 'Generating Secure Token...' : 'Generate One-Time Passcode'}
            </button>
          </form>

          {generatedPasscode && (
            <div className="rounded-xl bg-navy-950 text-white p-4 border border-teal-500/40 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-teal-300 font-bold uppercase tracking-wider">
                <span>One-Time Caregiver Passcode (Shown Once)</span>
                <Lock className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center justify-between gap-2 bg-navy-900 px-3.5 py-2.5 rounded-lg border border-slate-800">
                <code className="text-sm font-mono font-bold text-teal-400 tracking-wider">
                  {generatedPasscode}
                </code>
                <button
                  type="button"
                  onClick={copyPasscode}
                  className="inline-flex items-center gap-1 rounded-md bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 px-2.5 py-1 text-xs font-semibold"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Share this code securely with your caregiver. Self-redemption and reuse are blocked by DynamoDB conditional writes.
              </p>
            </div>
          )}
        </div>

        {/* Redeem Invitation */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                2. Redeem Patient Passcode (As Caregiver)
              </h2>
              <p className="text-xs text-slate-500">
                Enter a passcode shared by a patient to link your Cognito account as their caregiver
              </p>
            </div>
          </div>

          <form onSubmit={handleRedeemInvitation} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Secret Passcode Token *
              </label>
              <input
                type="text"
                required
                value={redeemPasscode}
                onChange={(e) => setRedeemPasscode(e.target.value)}
                placeholder="DG-XXXX-XXXX-XXXX-XXXX"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm uppercase focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Your Display Name (Shown to Patient)
              </label>
              <input
                type="text"
                value={caregiverDisplayName}
                onChange={(e) => setCaregiverDisplayName(e.target.value)}
                placeholder="e.g., Dr. Rohan Mehta / Priya Sharma"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={redeeming}
              className="w-full rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold py-2.5 text-sm shadow transition-colors"
            >
              {redeeming ? 'Verifying SHA-256 Token...' : 'Redeem Invitation & Link Patient'}
            </button>
          </form>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-[11px] text-slate-600 space-y-1">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-teal-600" />
              Zero-Trust Verification Rules
            </div>
            <p>
              • Self-redemption (`patientId === caregiverId`) is rejected.<br />
              • Expired or revoked tokens are rejected.<br />
              • Atomic single-use condition prevents concurrent replay attacks.
            </p>
          </div>
        </div>
      </div>

      {/* Connected Caregivers & Invitation History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connected Caregivers */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-teal-600" />
            Connected Caregivers Monitoring My Doses ({myCaregivers.length})
          </h2>

          {loading ? (
            <p className="text-xs text-slate-500 py-6 text-center">Loading caregivers...</p>
          ) : myCaregivers.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No caregivers connected yet. Generate a passcode above to invite a caregiver.
            </p>
          ) : (
            <div className="space-y-3">
              {myCaregivers.map((cg) => (
                <div
                  key={cg.connectionId}
                  className="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{cg.caregiverName}</span>
                      <span className="rounded-md bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 text-[11px] font-semibold">
                        {cg.relationship}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{cg.caregiverEmail}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {cg.permissions.map((perm) => (
                        <span
                          key={perm}
                          className="rounded bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-mono font-semibold"
                        >
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRevoke(cg.caregiverId, cg.caregiverName)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 px-3 py-1.5 text-xs font-semibold"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invitation Audit Trail */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">
            Invitation Audit History ({myInvitations.length})
          </h2>

          {myInvitations.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No caregiver invitations generated yet.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {myInvitations.map((inv) => (
                <div
                  key={inv.invitationId}
                  className="rounded-xl border border-slate-200 p-3.5 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">
                      Relationship: {inv.relationship}
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      Permissions: {inv.permissions.join(', ')}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Expires: {new Date(inv.expiresAt).toLocaleString()}
                      {inv.redeemedByCaregiverName &&
                        ` • Redeemed by ${inv.redeemedByCaregiverName}`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        inv.status === 'REDEEMED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : inv.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {inv.status}
                    </span>
                    {inv.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(inv.invitationId, `Invitation ${inv.invitationId}`)}
                        className="text-rose-600 hover:underline font-semibold"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

