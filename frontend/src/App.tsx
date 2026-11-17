import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { PatientDashboardPage } from './pages/PatientDashboardPage';
import { MedicationManagementPage } from './pages/MedicationManagementPage';
import { DoseConfirmationPage } from './pages/DoseConfirmationPage';
import { CaregiverManagementPage } from './pages/CaregiverManagementPage';
import { CaregiverDashboardPage } from './pages/CaregiverDashboardPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-navy-950 text-white flex items-center justify-center text-sm font-semibold">
        Verifying Amazon Cognito JWT Session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <AppShell>{children}</AppShell>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <PatientDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/medications"
            element={
              <ProtectedRoute>
                <MedicationManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doses"
            element={
              <ProtectedRoute>
                <DoseConfirmationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/caregivers"
            element={
              <ProtectedRoute>
                <CaregiverManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/caregiver-portal"
            element={
              <ProtectedRoute>
                <CaregiverDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <AnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};
export default App;

