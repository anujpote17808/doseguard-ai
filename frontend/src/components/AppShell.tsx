import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  CheckSquare,
  FileSpreadsheet,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  Pill,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Patient Dashboard', icon: LayoutDashboard },
  { to: '/medications', label: 'Medications', icon: Pill },
  { to: '/doses', label: 'Dose Confirmation', icon: CheckSquare },
  { to: '/caregivers', label: 'Caregiver Access', icon: Users },
  { to: '/caregiver-portal', label: 'Caregiver Dashboard', icon: HeartHandshake },
  { to: '/analytics', label: 'Adherence Analytics', icon: BarChart3 },
  { to: '/reports', label: 'S3 Reports', icon: FileSpreadsheet },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-72 lg:flex-col lg:fixed lg:inset-y-0 bg-navy-950 text-white border-r border-slate-800">
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-800/80">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center shadow-md">
              <ShieldCheck className="h-5 w-5 text-navy-950" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white">
                DoseGuard <span className="text-teal-400">AI</span>
              </span>
              <span className="block text-[10px] uppercase tracking-widest text-slate-400">
                AWS Serverless Safety
              </span>
            </div>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-5 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30 shadow-sm'
                      : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-800 bg-navy-900/60">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {profile?.fullName || 'Authenticated User'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{profile?.email}</p>
            </div>
            <span className="inline-flex items-center rounded-md bg-teal-500/20 px-2 py-0.5 text-[10px] font-semibold text-teal-300 border border-teal-500/30">
              {profile?.timezone || 'Asia/Kolkata'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800/90 hover:bg-rose-950/80 hover:text-rose-200 hover:border-rose-700/50 border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-72 flex flex-col min-w-0">
        {/* Top Mobile / Status Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/90 backdrop-blur border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              <span>Cognito JWT Verified</span>
              <span className="hidden sm:inline text-slate-300">|</span>
              <span className="hidden sm:inline text-slate-500">
                Organizational & Reminder Platform (Non-Diagnostic)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/doses"
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors"
            >
              <Activity className="h-3.5 w-3.5" />
              Confirm Dose
            </Link>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-navy-950 text-white border-b border-slate-800 px-4 py-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                      isActive ? 'bg-teal-500/20 text-teal-300' : 'text-slate-300'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
            <button
              onClick={handleLogout}
              className="w-full mt-2 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-300 hover:bg-rose-950/50"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};

