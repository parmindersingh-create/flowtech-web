import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

// Shop-floor restricted roles — limited dashboard (Start Work + Breakdown only)
export const RESTRICTED_ROLES = [
  'operator_vmc', 'operator_cnc', 'operator_moulding',
  'programmer_vmc', 'programmer_cnc',
  'fitter', 'general_fitter', 'polisher', 'die_maker', 'turner',
];
// Roles considered "no role assigned yet" — treat as restricted operator
export const NEEDS_ROLE = (role) => {
  if (!role) return true;
  const r = String(role).toLowerCase().trim();
  return r === 'pending' || r === '' || r === 'none' || r === 'new';
};
const isAdminRole = (user) => {
  const r = (user?.role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'manager' || r === 'hr' || user?.is_admin === true;
};

const ProtectedRoute = ({ children, adminOnly = false, roles = [] }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (location.state?.user && !user) {
    return children;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const userRole = (user.role || '').toLowerCase();
  const isAdmin = isAdminRole(user);

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (roles.length > 0 && !isAdmin) {
    const allowed = roles.map(r => r.toLowerCase());
    if (!allowed.includes(userRole)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
