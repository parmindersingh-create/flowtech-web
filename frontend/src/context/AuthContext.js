import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);
const API_URL = process.env.REACT_APP_BACKEND_URL;
const TOKEN_KEY = 'session_token';

// Apply token to every axios request (works for both same-origin + REACT_APP_BACKEND_URL)
const applyAuthHeader = (token) => {
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }
};

// Initialize on module load if token already in storage
const initialToken = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
if (initialToken) applyAuthHeader(initialToken);

// Request interceptor — always inject latest token from storage so that no
// API call ever goes out without auth (handles cases where another script
// or hot-reload wiped axios defaults).
axios.interceptors.request.use((config) => {
  const t = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  if (t) {
    config.headers = config.headers || {};
    if (!config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${t}`;
    }
  }
  return config;
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);  // null = checking, false = not authenticated, object = authenticated
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setUser(false); setLoading(false); return; }
    applyAuthHeader(token);
    try {
      const { data } = await axios.get(`${API_URL}/api/auth/me`);
      setUser(data);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      applyAuthHeader(null);
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  // username/password login. Returns { ok: bool, error?: str }
  const login = useCallback(async (username, password) => {
    try {
      const { data } = await axios.post(`${API_URL}/api/auth/login`, { username, password });
      const token = data?.session_token;
      if (!token) return { ok: false, error: 'No session token returned' };
      localStorage.setItem(TOKEN_KEY, token);
      applyAuthHeader(token);
      setUser(data.user || null);
      // Refresh from /me to get the canonical user object the legacy code expects
      try {
        const me = await axios.get(`${API_URL}/api/auth/me`);
        setUser(me.data);
      } catch { /* keep what login returned */ }
      return { ok: true };
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Invalid username or password';
      return { ok: false, error: msg };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await axios.post(`${API_URL}/api/auth/logout`); } catch { /* ignore */ }
    localStorage.removeItem(TOKEN_KEY);
    applyAuthHeader(null);
    setUser(false);
  }, []);

  const setUserData = useCallback((u) => setUser(u), []);

  const authValue = useMemo(
    () => ({ user, loading, login, logout, checkAuth, setUserData }),
    [user, loading, login, logout, checkAuth, setUserData]
  );

  return (
    <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
