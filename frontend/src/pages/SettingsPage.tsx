import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCircle2,
  Globe,
  LogOut,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { UserRole } from '../types';

const TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const SettingsPage: React.FC = () => {
  const { profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [role, setRole] = useState<UserRole>(profile?.role || 'both');
  const [timezone, setTimezone] = useState(profile?.timezone || 'Asia/Kolkata');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phoneNumber || '');
  const [emailEnabled, setEmailEnabled] = useState(
    profile?.notificationPreferences?.emailEnabled ?? true
  );
  const [smsEnabled, setSmsEnabled] = useState(
    profile?.notificationPreferences?.smsEnabled ?? false
  );
  const [escalationDelayMinutes, setEscalationDelayMinutes] = useState(
    profile?.notificationPreferences?.escalationDelayMinutes ?? 15
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setRole(profile.role);
      setTimezone(profile.timezone);
      setPhoneNumber(profile.phoneNumber || '');
      setEmailEnabled(profile.notificationPreferences?.emailEnabled ?? true);
      setSmsEnabled(profile.notificationPreferences?.smsEnabled ?? false);
      setEscalationDelayMinutes(profile.notificationPreferences?.escalationDelayMinutes ?? 15);
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.updateProfile({
        fullName: fullName.trim(),
        role,
        timezone,
        phoneNumber: phoneNumber.trim() || undefined,
        notificationPreferences: {
          emailEnabled,
          smsEnabled,
          escalationDelayMinutes,
        },
      });
      await refreshProfile();
      setSuccess('Profile, timezone, and notification preferences saved to Amazon DynamoDB.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    signOut();
    navigate('/');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          Account & Safety Settings
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Manage your profile, IANA timezone, notification preferences, caregiver permissions, and Cognito session security.
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

      <form onSubmit={handleSave} className="space-y-6">
        {/* User Profile & Timezone */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <User className="h-4 w-4 text-teal-600" />
            User Profile & IANA Timezone
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Verified Cognito Email
              </label>
              <input
                type="email"
                disabled
                value={profile?.email || ''}
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-sm text-slate-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Primary Portal Mode</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="both">Patient & Caregiver (Both)</option>
                <option value="patient">Patient Only</option>
                <option value="caregiver">Caregiver Only</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Globe className="h-3.5 w-3.5 text-teal-600" />
                Default IANA Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Bell className="h-4 w-4 text-teal-600" />
            Reminder & Caregiver Escalation Preferences
          </h2>

          <div className="space-y-3 text-xs">
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              <span className="font-medium text-slate-700">
                Enable Amazon SNS / SES Email Reminders & Caregiver Escalation Alerts
              </span>
            </label>

            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={smsEnabled}
                onChange={(e) => setSmsEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              <span className="font-medium text-slate-700">
                Record SMS / Mobile Escalation Preference
              </span>
            </label>

            <div className="pt-2 max-w-xs">
              <label className="block font-semibold text-slate-700 mb-1">
                Default Response Window Before Caregiver Escalation (Minutes)
              </label>
              <select
                value={escalationDelayMinutes}
                onChange={(e) => setEscalationDelayMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value={15}>15 Minutes (Standard Default)</option>
                <option value={30}>30 Minutes</option>
                <option value={60}>60 Minutes</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold px-6 py-2.5 text-xs shadow transition-colors"
          >
            {saving ? 'Saving Preferences...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Caregiver Permissions & Account Security */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-teal-600" />
            Caregiver Permissions Management
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Review active caregivers, audit single-use invitation tokens, or immediately revoke caregiver access.
          </p>
          <Link
            to="/caregivers"
            className="inline-block text-xs font-bold text-teal-700 hover:underline"
          >
            Open Caregiver Access Controls →
          </Link>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-600" />
            Account Security & Session
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Cognito Subject ID: <code className="text-slate-800">{profile?.userId}</code>
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 text-xs transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out of DoseGuard AI
          </button>
        </div>
      </div>
    </div>
  );
};

