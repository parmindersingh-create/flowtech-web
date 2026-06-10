import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';
import ProtectedRoute, { RESTRICTED_ROLES, NEEDS_ROLE } from './components/ProtectedRoute';
import DashboardLayout from './components/Layout/DashboardLayout';
import ErrorBoundary from './components/ErrorBoundary';
import GlobalErrorOverlay from './components/GlobalErrorOverlay';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import Machines from './pages/Machines';
import Storage from './pages/Storage';
import ToolsInserts from './pages/ToolsInserts';

import Production from './pages/Production';
import Users from './pages/Users';
import TVDisplay from './pages/TVDisplay';
import StartWork from './pages/StartWork';
import EndWork from './pages/EndWork';
import Breakdown from './pages/Breakdown';
import ActiveWork from './pages/ActiveWork';
import Notifications from './pages/Notifications';
import Reports from './pages/Reports';
import LowStockAlerts from './pages/LowStockAlerts';
import Settings from './pages/Settings';
import OperatorStats from './pages/OperatorStats';
import PartsLibrary from './pages/PartsLibrary';
import Assemblies from './pages/Assemblies';
import DailyProduction from './pages/DailyProduction';
import AIAudit from './pages/AIAudit';
import SchedulerStatus from './pages/SchedulerStatus';
import MachineSpares from './pages/MachineSpares';
import Moulds from './pages/Moulds';
import Attendance from './pages/Attendance';
import MyAttendance from './pages/MyAttendance';
import Salary from './pages/Salary';
import LeaveAlerts from './pages/LeaveAlerts';
import ManageUsers from './pages/ManageUsers';
import './App.css';

// Redirect authenticated users away from auth pages
const AuthRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

// Dashboard gate — restricted roles (Operator/Programmer/Fitter/Diemaker) and users
// without a role yet land on Start Work as their operator dashboard.
const DashboardGate = () => {
  const { user } = useAuth();
  const isAdmin = user?.is_admin === true || ['super_admin', 'admin', 'manager', 'hr', 'tl', 'team_lead', 'team lead', 'supervisor'].includes((user?.role || '').toLowerCase());
  if (!isAdmin && (RESTRICTED_ROLES.includes(user?.role) || NEEDS_ROLE(user?.role))) {
    return <Navigate to="/dashboard/start-work" replace />;
  }
  return <Dashboard />;
};

function AppRouter() {
  // Google OAuth callback removed — using username/password login now.
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={
        <AuthRoute>
          <Login />
        </AuthRoute>
      } />

      {/* TV Display - Public, no auth required */}
      <Route path="/tv" element={<TVDisplay />} />

      {/* Protected routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route index element={<DashboardGate />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="machines" element={<Machines />} />
        <Route path="machines/:machineId/spares" element={<MachineSpares />} />
        <Route path="moulds" element={<Moulds />} />
        <Route path="storage" element={<Storage />} />
        <Route path="tools" element={<ToolsInserts />} />
        <Route path="gauges" element={<Navigate to="/dashboard/storage" replace />} />
        <Route path="production" element={<Production />} />
        <Route path="start-work" element={<StartWork />} />
        <Route path="end-work" element={<EndWork />} />
        <Route path="breakdown" element={<Breakdown />} />
        <Route path="active-work" element={<ActiveWork />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="reports" element={<Reports />} />
        <Route path="low-stock" element={<LowStockAlerts />} />
        <Route path="settings" element={<Settings />} />
        <Route path="parts-library" element={<PartsLibrary />} />
        <Route path="assemblies" element={<Assemblies />} />
        <Route path="daily-production" element={<DailyProduction />} />
        <Route path="attendance" element={
          <ProtectedRoute adminOnly><Attendance /></ProtectedRoute>
        } />
        <Route path="salary" element={
          <ProtectedRoute adminOnly><Salary /></ProtectedRoute>
        } />
        <Route path="leave-alerts" element={
          <ProtectedRoute adminOnly><LeaveAlerts /></ProtectedRoute>
        } />
        <Route path="my-attendance" element={<MyAttendance />} />
        <Route path="ai-audit" element={
          <ProtectedRoute adminOnly><AIAudit /></ProtectedRoute>
        } />
        <Route path="scheduler" element={
          <ProtectedRoute adminOnly><SchedulerStatus /></ProtectedRoute>
        } />
        <Route path="operator-stats" element={
          <ProtectedRoute adminOnly><OperatorStats /></ProtectedRoute>
        } />
        <Route path="users" element={
          <ProtectedRoute adminOnly><Users /></ProtectedRoute>
        } />
        <Route path="manage-users" element={
          <ProtectedRoute adminOnly><ManageUsers /></ProtectedRoute>
        } />
      </Route>

      {/* Redirect root to dashboard or login */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      {/* Catch all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-right" richColors />
          <GlobalErrorOverlay />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
