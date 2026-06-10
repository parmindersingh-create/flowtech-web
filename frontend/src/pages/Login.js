import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Loader2, Lock, User } from 'lucide-react';

// localStorage keys for "remember me"
const REMEMBER_KEY = 'vmc_remember_username';
const REMEMBER_FLAG_KEY = 'vmc_remember_me';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Pre-fill username from last successful login (if user had "remember me" checked).
  useEffect(() => {
    try {
      const flag = localStorage.getItem(REMEMBER_FLAG_KEY);
      const savedUser = localStorage.getItem(REMEMBER_KEY) || '';
      if (flag === '0') {
        // User explicitly opted out previously
        setRemember(false);
      } else if (savedUser) {
        // First visit, or user has remember enabled — pre-fill username
        setUsername(savedUser);
        setRemember(true);
      }
      // Else: first visit ever, keep default checkbox=true so it's enabled by default
    } catch { /* ignore storage errors */ }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    const cleanUser = username.trim().toLowerCase();
    const res = await login(cleanUser, password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || 'Login failed');
      return;
    }
    // Persist or clear the remembered username based on the checkbox
    try {
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, cleanUser);
        localStorage.setItem(REMEMBER_FLAG_KEY, '1');
      } else {
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.setItem(REMEMBER_FLAG_KEY, '0');
      }
    } catch { /* ignore */ }
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">VMC Job Shop</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to continue</p>
        </div>
        <Card className="shadow-lg">
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4" data-testid="login-form">
              <div>
                <Label htmlFor="username" className="text-xs">Username</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    autoFocus
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-9"
                    placeholder=""
                    data-testid="login-username"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="password" className="text-xs">Password</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                    placeholder="••••••••"
                    data-testid="login-password"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-me"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(!!v)}
                  data-testid="remember-me-checkbox"
                />
                <Label htmlFor="remember-me" className="text-xs text-muted-foreground cursor-pointer select-none">
                  Remember me on this device
                </Label>
              </div>

              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2" data-testid="login-error">{error}</div>
              )}
              <Button type="submit" disabled={busy || !username || !password} className="w-full" data-testid="login-submit">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-[11px] text-muted-foreground text-center mt-3">
          Forgot password? Contact your administrator.
        </p>
      </div>
    </div>
  );
};

export default Login;
