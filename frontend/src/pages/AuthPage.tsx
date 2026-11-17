import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  ServerCog,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  cognitoConfirmPasswordReset,
  cognitoConfirmSignUp,
  cognitoForgotPassword,
  cognitoSignUp,
  getRuntimeConfig,
  isCognitoConfigured,
  setRuntimeConfig,
} from '../services/cognitoAuth';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset';

export const AuthPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialMode = (searchParams.get('mode') as AuthMode) || 'signin';
  const [mode, setMode] = useState<AuthMode>(initialMode);

  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Runtime AWS CDK Output Configuration panel (allows connecting deployed CDK outputs directly in browser if .env wasn't baked)
  const currentCfg = getRuntimeConfig();
  const [showConfigModal, setShowConfigModal] = useState(!isCognitoConfigured());
  const [cfgRegion, setCfgRegion] = useState(currentCfg.region);
  const [cfgApiUrl, setCfgApiUrl] = useState(currentCfg.apiBaseUrl);
  const [cfgPoolId, setCfgPoolId] = useState(currentCfg.userPoolId);
  const [cfgClientId, setCfgClientId] = useState(currentCfg.userPoolClientId);

  const handleSaveRuntimeConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setRuntimeConfig({
      region: cfgRegion.trim() || 'ap-south-1',
      apiBaseUrl: cfgApiUrl.trim().replace(/\/$/, ''),
      userPoolId: cfgPoolId.trim(),
      userPoolClientId: cfgClientId.trim(),
    });
    setShowConfigModal(false);
    setSuccessMsg('AWS CDK Runtime Configuration saved. You can now register and sign in with Amazon Cognito.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      if (mode === 'signin') {
        await signIn(email, password);
        navigate('/dashboard');
      } else if (mode === 'signup') {
        const res = await cognitoSignUp(email, password, fullName);
        if (res.userConfirmed) {
          setSuccessMsg('Account created and confirmed! You can now sign in.');
          setMode('signin');
        } else {
          setSuccessMsg('Verification code sent to your email. Please enter it below.');
          setMode('verify');
        }
      } else if (mode === 'verify') {
        await cognitoConfirmSignUp(email, verificationCode);
        setSuccessMsg('Email verified! Please sign in with your password.');
        setMode('signin');
      } else if (mode === 'forgot') {
        await cognitoForgotPassword(email);
        setSuccessMsg('Password reset code sent to your email.');
        setMode('reset');
      } else if (mode === 'reset') {
        await cognitoConfirmPasswordReset(email, verificationCode, newPassword);
        setSuccessMsg('Password has been reset successfully. Please sign in.');
        setMode('signin');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-950 via-navy-900 to-navy-800 text-white flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-teal-300 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to DoseGuard AI Home
        </Link>

        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center shadow-lg">
            <ShieldCheck className="h-6 w-6 text-navy-950" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              DoseGuard <span className="text-teal-400">AI</span>
            </h1>
            <p className="text-xs text-slate-300">
              Amazon Cognito Zero-Trust Identity & JWT Authentication
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md space-y-4">
        <div className="bg-navy-900/95 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-8">
          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-navy-950 rounded-xl border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
              }}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-teal-500 text-navy-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
              }}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-teal-500 text-navy-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {errorMsg && (
            <div className="mb-5 rounded-xl bg-rose-950/80 border border-rose-500/40 p-3.5 text-xs text-rose-200 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 p-3.5 text-xs text-emerald-200 flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Eleanor Vance"
                    className="w-full rounded-xl bg-navy-950 border border-slate-700 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="patient@example.com"
                  className="w-full rounded-xl bg-navy-950 border border-slate-700 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                />
              </div>
            </div>

            {(mode === 'signin' || mode === 'signup') && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, upper, lower, number"
                    className="w-full rounded-xl bg-navy-950 border border-slate-700 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {(mode === 'verify' || mode === 'reset') && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Verification Code
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="6-digit code from Cognito email"
                    className="w-full rounded-xl bg-navy-950 border border-slate-700 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {mode === 'reset' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    className="w-full rounded-xl bg-navy-950 border border-slate-700 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-navy-950 font-bold py-3 text-sm shadow-lg transition-all"
            >
              {submitting
                ? 'Communicating with Amazon Cognito...'
                : mode === 'signin'
                ? 'Sign In to DoseGuard AI'
                : mode === 'signup'
                ? 'Register Cognito Account'
                : mode === 'verify'
                ? 'Verify Email Code'
                : mode === 'forgot'
                ? 'Send Password Reset Code'
                : 'Confirm Password Reset'}
            </button>
          </form>

          {/* Auxiliary Mode Links */}
          <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <button
              type="button"
              onClick={() => setMode('verify')}
              className="hover:text-teal-300 underline"
            >
              Have a verification code?
            </button>
            <button
              type="button"
              onClick={() => setMode('forgot')}
              className="hover:text-teal-300 underline"
            >
              Forgot password?
            </button>
          </div>
        </div>

        {/* AWS CDK Endpoint Configurator Panel */}
        <div className="bg-navy-900/80 border border-slate-800 rounded-2xl p-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300 font-semibold">
              <ServerCog className="h-4 w-4 text-teal-400" />
              <span>AWS CDK Stack Connection</span>
            </div>
            <button
              type="button"
              onClick={() => setShowConfigModal(!showConfigModal)}
              className="text-teal-400 hover:underline font-medium"
            >
              {showConfigModal ? 'Hide Settings' : 'Configure Endpoints'}
            </button>
          </div>

          {showConfigModal && (
            <form onSubmit={handleSaveRuntimeConfig} className="mt-4 space-y-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Enter the CDK deployment outputs from <code className="text-teal-300">DoseGuardAIStack</code> (or configure via <code className="text-teal-300">.env</code> before building):
              </p>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">AWS Region</label>
                <input
                  type="text"
                  value={cfgRegion}
                  onChange={(e) => setCfgRegion(e.target.value)}
                  placeholder="ap-south-1"
                  className="w-full rounded-lg bg-navy-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">
                  API Gateway URL (ApiGatewayUrl)
                </label>
                <input
                  type="url"
                  required
                  value={cfgApiUrl}
                  onChange={(e) => setCfgApiUrl(e.target.value)}
                  placeholder="https://xxxxxx.execute-api.ap-south-1.amazonaws.com"
                  className="w-full rounded-lg bg-navy-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">
                  Cognito User Pool ID (CognitoUserPoolId)
                </label>
                <input
                  type="text"
                  required
                  value={cfgPoolId}
                  onChange={(e) => setCfgPoolId(e.target.value)}
                  placeholder="ap-south-1_xxxxxxxxx"
                  className="w-full rounded-lg bg-navy-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">
                  Cognito App Client ID (CognitoUserPoolClientId)
                </label>
                <input
                  type="text"
                  required
                  value={cfgClientId}
                  onChange={(e) => setCfgClientId(e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded-lg bg-navy-950 border border-slate-700 px-3 py-1.5 text-xs text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-800 hover:bg-teal-500 hover:text-navy-950 text-white font-semibold py-2 transition-colors"
              >
                Save AWS CDK Runtime Endpoints
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

