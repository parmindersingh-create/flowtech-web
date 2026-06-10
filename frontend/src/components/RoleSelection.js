import React, { useState } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Loader2, Cog, Code, Hammer, Wrench, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

const ROLE_OPTIONS = [
  { value: 'Operator (VMC)', label: 'Operator', sub: 'VMC', icon: Cog, color: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
  { value: 'Operator (CNC)', label: 'Operator', sub: 'CNC', icon: Cog, color: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
  { value: 'Programmer (VMC)', label: 'Programmer', sub: 'VMC', icon: Code, color: 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100' },
  { value: 'Programmer (CNC)', label: 'Programmer', sub: 'CNC', icon: Code, color: 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100' },
  { value: 'Fitter', label: 'Fitter', sub: '', icon: Wrench, color: 'bg-amber-50 border-amber-200 hover:bg-amber-100' },
  { value: 'Die Maker', label: 'Die Maker', sub: '', icon: Hammer, color: 'bg-purple-50 border-purple-200 hover:bg-purple-100' },
];

const RoleSelection = () => {
  const { user, checkAuth, logout } = useAuth();
  const [selecting, setSelecting] = useState('');

  const handleSelect = async (role) => {
    setSelecting(role);
    const uid = user?.user_id || user?.id || user?._id || user?.email;
    const safeMsg = (err) => {
      const status = err?.response?.status;
      if (status === 401 || status === 403) return 'Admin access required. Please ask your Admin to assign your role.';
      const d = err?.response?.data?.detail;
      if (typeof d === 'string') return d;
      if (Array.isArray(d) && d.length) return d[0]?.msg || 'Validation error';
      return err?.message || 'Failed to set role. Please try again.';
    };
    if (!uid) { toast.error('User ID missing — please logout and login again.'); setSelecting(''); return; }
    try {
      // Try the known payload shapes used across the backend
      try {
        await axios.put(`${API}/api/users/${uid}/role`, { role });
      } catch (e1) {
        try {
          await axios.put(`${API}/api/users/role`, { user_id: uid, role });
        } catch (e2) {
          await axios.put(`${API}/api/users/${uid}/role?role=${encodeURIComponent(role)}`);
        }
      }
      toast.success(`Role set to ${role}`);
      await checkAuth();
    } catch (err) {
      toast.error(safeMsg(err));
      setSelecting('');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full border">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Select Your Role</h1>
            <p className="text-sm text-muted-foreground">Hi {user?.name || user?.email}, please choose your role to continue.</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 text-center">
            ⚠️ Role assignment is admin-only. If clicking a role shows an error, please ask your Admin to set your role from the <span className="font-semibold">Users</span> page. Once set, you'll be redirected automatically.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ROLE_OPTIONS.map(r => {
              const Icon = r.icon;
              const isSelecting = selecting === r.value;
              return (
                <button
                  key={r.value}
                  onClick={() => handleSelect(r.value)}
                  disabled={!!selecting}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left disabled:opacity-50 ${r.color}`}
                  data-testid={`role-${r.value.replace(/\s|\(|\)/g, '-').toLowerCase()}`}
                >
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                    {isSelecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{r.label}</p>
                    {r.sub && <p className="text-xs text-muted-foreground">{r.sub}</p>}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t pt-4 flex justify-center">
            <Button variant="ghost" size="sm" onClick={logout} data-testid="logout-btn" disabled={!!selecting}>
              <LogOut className="w-4 h-4 mr-2" /> Logout & Exit
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RoleSelection;
