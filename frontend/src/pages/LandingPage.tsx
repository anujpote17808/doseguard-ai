import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock,
  Cloud,
  FileSpreadsheet,
  HeartHandshake,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { WorkflowPipelineBanner } from '../components/WorkflowPipelineBanner';
import { useAuth } from '../context/AuthContext';

export const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-navy-950/95 backdrop-blur border-b border-slate-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center shadow-lg">
              <ShieldCheck className="h-6 w-6 text-navy-950" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight">
                DoseGuard <span className="text-teal-400">AI</span>
              </span>
              <span className="block text-[10px] uppercase tracking-widest text-slate-400">
                Serverless Medication Safety Platform
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#workflow" className="hover:text-teal-300 transition-colors">
              Workflow
            </a>
            <a href="#features" className="hover:text-teal-300 transition-colors">
              Features
            </a>
            <a href="#security" className="hover:text-teal-300 transition-colors">
              Security Architecture
            </a>
            <a href="#how-it-works" className="hover:text-teal-300 transition-colors">
              How It Works
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-navy-950 font-bold px-5 py-2.5 text-sm shadow-md transition-all"
              >
                Open Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  to="/auth"
                  className="text-sm font-semibold text-slate-200 hover:text-white px-3 py-2"
                >
                  Sign In
                </Link>
                <Link
                  to="/auth?mode=signup"
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-navy-950 font-bold px-5 py-2.5 text-sm shadow-md transition-all"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-900 to-navy-800 text-white py-20 sm:py-28 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="lg:col-span-7 space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/15 border border-teal-400/30 px-4 py-1.5 text-xs font-semibold text-teal-300">
                <Cloud className="h-3.5 w-3.5" />
                Built 100% on AWS Serverless • EventBridge Scheduler + Step Functions
              </div>

              <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1]">
                Never let a medication dose go{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-sky-400">
                  unnoticed.
                </span>
              </h1>

              <p className="text-lg sm:text-xl text-slate-300 leading-relaxed max-w-2xl">
                Most medication trackers merely record schedules. DoseGuard AI orchestrates the entire safety loop: timezone-aware reminders, patient confirmation windows, deterministic status checks, and automatic caregiver escalation when a dose is missed.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  to={isAuthenticated ? '/dashboard' : '/auth?mode=signup'}
                  className="inline-flex items-center gap-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-navy-950 font-bold px-7 py-4 text-base shadow-lg shadow-teal-500/20 transition-all"
                >
                  Launch Patient & Caregiver Portal
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <a
                  href="#workflow"
                  className="inline-flex items-center gap-2 rounded-xl bg-navy-800/90 hover:bg-navy-700 text-slate-200 border border-slate-700 font-semibold px-6 py-4 text-base transition-colors"
                >
                  Explore AWS Workflow
                </a>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-800/80 max-w-lg">
                <div>
                  <div className="text-2xl font-extrabold text-teal-400">100%</div>
                  <div className="text-xs text-slate-400">Scale-to-Zero Serverless</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-sky-400">SHA-256</div>
                  <div className="text-xs text-slate-400">Single-Use Caregiver Tokens</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-emerald-400">15m / 60s</div>
                  <div className="text-xs text-slate-400">Configurable Escalation Window</div>
                </div>
              </div>
            </motion.div>

            {/* Hero Interactive Preview Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="lg:col-span-5"
            >
              <div className="rounded-2xl bg-navy-900/90 border border-slate-700/80 p-6 shadow-2xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-teal-400 font-bold">
                      Live Escalation Loop Preview
                    </span>
                    <h3 className="text-base font-bold text-white mt-0.5">
                      Morning Cardiac Schedule • 08:00 IST
                    </h3>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 text-xs font-semibold">
                    Step Functions Active
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl bg-navy-950/90 border border-slate-800 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">Atorvastatin • 20mg</div>
                        <div className="text-xs text-slate-400">
                          Confirmed by Patient at 08:04 AM
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-950 px-2.5 py-1 rounded-md border border-emerald-800">
                      TAKEN (No Escalation)
                    </span>
                  </div>

                  <div className="rounded-xl bg-navy-950/90 border border-rose-500/40 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400">
                        <BellRing className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">Metoprolol • 50mg</div>
                        <div className="text-xs text-rose-300">
                          Unconfirmed after 15m response window
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-rose-300 bg-rose-950 px-2.5 py-1 rounded-md border border-rose-800">
                      CAREGIVER ALERTED
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-teal-950/40 border border-teal-500/30 p-3.5 text-xs text-teal-200 flex items-start gap-2.5">
                  <Sparkles className="h-4 w-4 text-teal-400 shrink-0 mt-0.5" />
                  <span>
                    Idempotent DynamoDB conditional writes ensure that even if Step Functions retries on transient network errors, caregivers never receive duplicate alerts.
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Product Workflow Illustration */}
          <div id="workflow" className="mt-16 pt-8">
            <WorkflowPipelineBanner activeStage="REMINDER_SENT" />
          </div>
        </div>
      </section>

      {/* Feature Cards Section */}
      <section id="features" className="py-20 max-w-7xl mx-auto px-4 sm:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-xs font-bold uppercase tracking-widest text-teal-600">
            End-to-End Capabilities
          </span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900">
            Engineered for Patient Reliability & Family Peace of Mind
          </h2>
          <p className="mt-3 text-slate-600 text-base">
            Every feature is backed by real AWS serverless primitives—Amazon EventBridge Scheduler, AWS Step Functions, DynamoDB, S3, and Cognito.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: Clock,
              title: 'IANA Timezone-Aware Scheduling',
              desc: 'Synchronizes every active medication directly with Amazon EventBridge Scheduler using deterministic identifiers and FlexibleTimeWindow OFF.',
            },
            {
              icon: Activity,
              title: 'Step Functions Escalation Engine',
              desc: 'Waits for a configurable patient response window (15m standard / 60s demo) and checks DynamoDB before escalating missed doses.',
            },
            {
              icon: Users,
              title: 'Cryptographic Caregiver Invitations',
              desc: 'Generates high-entropy single-use passcodes hashed with SHA-256 and redeemed atomically via DynamoDB conditional expressions.',
            },
            {
              icon: HeartHandshake,
              title: 'Controlled Caregiver Portal',
              desc: 'Caregivers view only patients who explicitly granted access, with granular VIEW_ONLY or MANAGE_MEDICATIONS permission enforcement.',
            },
            {
              icon: FileSpreadsheet,
              title: 'Private S3 Reports & Presigned URLs',
              desc: 'Generates downloadable CSV and JSON adherence reports stored in a private encrypted S3 bucket accessed exclusively via 5-minute presigned URLs.',
            },
            {
              icon: ShieldCheck,
              title: 'Idempotent Dose Confirmation',
              desc: 'Prevents duplicate dose records and race conditions using deterministic composite sort keys and conditional updates.',
            },
          ].map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="rounded-2xl bg-white p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="h-11 w-11 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">{feat.title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-16 bg-slate-100/80 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-600">
              Closed-Loop Protocol
            </span>
            <h2 className="mt-2 text-3xl font-extrabold text-slate-900">How DoseGuard AI Works</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                step: '01',
                title: 'Configure Schedule',
                body: 'Patient adds their medication, dosage description, and IANA timezone. Lambda provisions an EventBridge schedule.',
              },
              {
                step: '02',
                title: 'Connect Caregivers',
                body: 'Patient generates a one-time invitation passcode and shares it with family or a visiting nurse to establish authorized access.',
              },
              {
                step: '03',
                title: 'Reminder & Window',
                body: 'At dose time, Step Functions checks if the dose is already confirmed; if pending, it sends a patient reminder and waits.',
              },
              {
                step: '04',
                title: 'Confirm or Escalate',
                body: 'If confirmed in time, escalation is prevented. If unconfirmed after the window, caregivers receive an immediate missed-dose alert.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm relative"
              >
                <span className="text-3xl font-black text-teal-600/25">{item.step}</span>
                <h3 className="mt-2 text-base font-bold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Architecture Section */}
      <section id="security" className="py-20 max-w-7xl mx-auto px-4 sm:px-8">
        <div className="rounded-3xl bg-navy-950 text-white p-8 sm:p-12 border border-slate-800 shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3.5 py-1 text-xs font-semibold text-teal-300">
                <Lock className="h-3.5 w-3.5" />
                Defense-in-Depth Security Posture
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold">
                Zero Trust Tenant Isolation & Least-Privilege AWS IAM
              </h2>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                DoseGuard AI derives every user identity exclusively from verified Amazon Cognito JWT claims at the API Gateway authorizer layer. No user can access another patient&apos;s records by tampering with URL parameters or request payloads.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs sm:text-sm text-slate-200">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" />
                  Cognito JWT Authorizer on all `/api/v1/*` routes
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" />
                  CloudFront Origin Access Control (OAC) over private S3
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" />
                  SHA-256 hashed single-use caregiver invitation tokens
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" />
                  DynamoDB encryption at rest & TTL expiration
                </li>
              </ul>
            </div>

            <div className="lg:col-span-5 bg-navy-900 rounded-2xl p-6 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-teal-400">
                Clinical Honesty & Safety Notice
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                DoseGuard AI is an organizational scheduling, reminder, and caregiver escalation platform. It does not fabricate AI clinical predictions, medical diagnoses, or dosage recommendations. All demonstration profiles use clearly labeled synthetic records.
              </p>
              <div className="pt-2">
                <Link
                  to={isAuthenticated ? '/dashboard' : '/auth'}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-navy-950 font-bold px-5 py-3 text-sm transition-colors"
                >
                  Access Secure Portal
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto bg-navy-950 text-slate-400 border-t border-slate-800 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-400" />
            <span className="font-bold text-white">DoseGuard AI</span>
            <span>— AWS Serverless Challenge Implementation</span>
          </div>
          <div>
            Powered by AWS Lambda, API Gateway, DynamoDB, S3, Step Functions, EventBridge Scheduler, Cognito & CloudFront.
          </div>
        </div>
      </footer>
    </div>
  );
};

