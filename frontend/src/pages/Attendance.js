import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '../components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import {
  Loader2, Calendar, Users, CheckCircle, Clock, XCircle, Search, Pencil, Save,
  Download, FileText, Wifi, WifiOff, ChevronRight, ChevronDown, ClockIcon, Settings2, Link2, Unlink, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const COLOR = { present: '#10B981', late: '#F59E0B', absent: '#EF4444' };

// Default shift-id → label fallback (used until backend `/api/attendance/shift-types` resolves)
const DEFAULT_SHIFTS = [
  { id: 'day_8_8',   label: 'Day (8AM-8PM)',     start: '08:00' },
  { id: 'day_9_7',   label: 'Day (9AM-7PM)',     start: '09:00' },
  { id: 'night_8_6', label: 'Night (8PM-6AM)',   start: '20:00' },
  { id: 'rotating',  label: 'Rotating',          start: 'auto'  },
  { id: 'double',    label: 'Double Shift',      start: 'auto'  },
];

const shiftIdToLabel = (id, shiftTypes) => {
  const list = shiftTypes?.length ? shiftTypes : DEFAULT_SHIFTS;
  const found = list.find(s => s.id === id);
  return found?.label || id || '-';
};

const fmtTime = (t) => {
  if (!t) return '-';
  // Accept "HH:MM" or "HH:MM:SS" or full ISO
  if (typeof t === 'string' && /^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  try { return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return '-'; }
};

const pad2 = (n) => String(n).padStart(2, '0');
// Use LOCAL time, not UTC — otherwise IST users near midnight roll back a day/month
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const monthISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
const monthValueFromDate = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`;

const StatusBadge = ({ status }) => {
  const s = (status || '').toLowerCase();
  if (s === 'present') return <Badge style={{ backgroundColor: COLOR.present, color: 'white' }} className="border-none">Present</Badge>;
  if (s === 'late') return <Badge style={{ backgroundColor: COLOR.late, color: 'white' }} className="border-none">Late</Badge>;
  if (s === 'absent') return <Badge style={{ backgroundColor: COLOR.absent, color: 'white' }} className="border-none">Absent</Badge>;
  return <Badge variant="outline" className="text-xs">{status || '-'}</Badge>;
};

const SummaryCards = ({ summary }) => (
  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
    <Card className="border-l-4" style={{ borderLeftColor: '#3B82F6' }}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="text-3xl font-bold mt-1">{summary?.total || 0}</p>
        </div>
        <Users className="w-7 h-7 text-blue-500" />
      </CardContent>
    </Card>
    <Card className="border-l-4" style={{ borderLeftColor: COLOR.present }}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Present</p>
          <p className="text-3xl font-bold mt-1 text-emerald-600">{summary?.present || 0}</p>
        </div>
        <CheckCircle className="w-7 h-7 text-emerald-500" />
      </CardContent>
    </Card>
    <Card className="border-l-4" style={{ borderLeftColor: COLOR.late }}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Late</p>
          <p className="text-3xl font-bold mt-1 text-amber-600">{summary?.late || 0}</p>
        </div>
        <Clock className="w-7 h-7 text-amber-500" />
      </CardContent>
    </Card>
    <Card className="border-l-4" style={{ borderLeftColor: COLOR.absent }}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Absent</p>
          <p className="text-3xl font-bold mt-1 text-red-600">{summary?.absent || 0}</p>
        </div>
        <XCircle className="w-7 h-7 text-red-500" />
      </CardContent>
    </Card>
  </div>
);

const DeviceStatusBadge = ({ status, onRefresh, refreshing }) => {
  if (!status) return null;
  // Format last_sync in IST (Asia/Kolkata) — used as the primary indicator now.
  const fmtIST = (iso) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (isNaN(d)) return null;
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
    } catch { return null; }
  };
  const relTime = (iso) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (isNaN(d)) return null;
      const diffMs = Date.now() - d.getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins} min ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
      const days = Math.floor(hrs / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    } catch { return null; }
  };
  const lastSync = fmtIST(status.last_sync);
  const rel = relTime(status.last_sync);
  // Color by staleness: <30min green, <6h amber, else red
  const ageMs = status.last_sync ? (Date.now() - new Date(status.last_sync).getTime()) : 0;
  const tone = ageMs < 30 * 60_000 ? 'emerald' : ageMs < 6 * 60 * 60_000 ? 'amber' : 'red';
  const palette = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    red:     'bg-red-50 text-red-700 border-red-200',
  }[tone];
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${palette}`} data-testid="device-status-badge" title={status.ip ? `Biometric device ${status.ip}:${status.port}\n${status.message || ''}` : ''}>
      <Wifi className="w-3.5 h-3.5" />
      <span>Last Sync: <span className="font-semibold">{lastSync || '—'}</span> IST{rel ? <span className="opacity-75"> · {rel}</span> : null}</span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="ml-1 p-0.5 rounded hover:bg-black/5 disabled:opacity-40"
        title="Refresh sync status"
        data-testid="refresh-sync-btn"
      >
        {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="text-base leading-none">↻</span>}
      </button>
    </div>
  );
};

const Attendance = () => {
  const [tab, setTab] = useState('daily');
  const [date, setDate] = useState(todayISO());
  const [month, setMonth] = useState(monthISO());
  const [daily, setDaily] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [refreshingDevice, setRefreshingDevice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  // Edit punch
  const [editPunch, setEditPunch] = useState(null);
  const [punchIn, setPunchIn] = useState('');
  const [punchOut, setPunchOut] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Edit name (inline)
  const [editingName, setEditingName] = useState(null);
  const [newName, setNewName] = useState('');
  // Monthly drilldown
  const [drillEmployee, setDrillEmployee] = useState(null);
  // Yearly export
  const [yearlyOpen, setYearlyOpen] = useState(false);
  const [yearlyMode, setYearlyMode] = useState('year'); // 'year' | 'range'
  const [yearlyYear, setYearlyYear] = useState(new Date().getFullYear().toString());
  const [yearlyFrom, setYearlyFrom] = useState('');
  const [yearlyTo, setYearlyTo] = useState('');
  const [yearlyTargetEmp, setYearlyTargetEmp] = useState(null); // null = All Users
  const [exporting, setExporting] = useState(false);
  // Shift management
  const [shiftTypes, setShiftTypes] = useState([]);
  const [shiftEmployee, setShiftEmployee] = useState(null);
  const [selectedShifts, setSelectedShifts] = useState([]);
  const [savingShifts, setSavingShifts] = useState(false);
  // User-Biometric linking (admin)
  const [systemUsers, setSystemUsers] = useState([]);
  const [biometricEmployees, setBiometricEmployees] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [pendingLinks, setPendingLinks] = useState({}); // userId → biometric_id selection
  const [linkSaving, setLinkSaving] = useState({}); // userId → boolean

  const fetchShiftTypes = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/attendance/shift-types`);
      // Accept several shapes:
      //   { shifts: [{id,name,start,end}] }   <-- production
      //   [{id,label,start}]
      //   { id1: {name,start}, id2: {...} }   <-- legacy map
      let raw = null;
      if (Array.isArray(data)) raw = data;
      else if (Array.isArray(data?.shifts)) raw = data.shifts;
      else if (Array.isArray(data?.shift_types)) raw = data.shift_types;
      let list = [];
      if (raw) {
        list = raw.map(s => ({
          id: s.id || s.shift_id,
          label: s.label || s.name || s.id,
          start: s.start || s.start_time || null,
        }));
      } else if (data && typeof data === 'object') {
        list = Object.entries(data).map(([id, v]) => ({
          id,
          label: v.name || v.label || id,
          start: v.start || v.start_time,
        }));
      }
      if (list.length) setShiftTypes(list);
    } catch { /* fallback to DEFAULT_SHIFTS */ }
  }, []);

  const openShiftDialog = (emp) => {
    setShiftEmployee(emp);
    setSelectedShifts(Array.isArray(emp?.shifts) ? emp.shifts : []);
  };

  const toggleShift = (id) => {
    setSelectedShifts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSaveShifts = async () => {
    if (!shiftEmployee) return;
    setSavingShifts(true);
    try {
      await axios.put(`${API}/api/attendance/employees/update-shift`, {
        biometric_id: shiftEmployee.biometric_id,
        shifts: selectedShifts,
      });
      toast.success(`Shifts updated for ${shiftEmployee.name}`);
      setShiftEmployee(null);
      if (tab === 'daily') fetchDaily(date); else if (tab === 'monthly') fetchMonthly(month);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update shifts');
    } finally { setSavingShifts(false); }
  };

  // ---- User-Biometric linking (admin) ----
  const fetchMappings = useCallback(async () => {
    setMappingsLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/attendance/users-biometric-mapping`);
      // New canonical shape: { users: [{user_id, name, email, role, biometric_id}], biometric_employees: [{biometric_id, name, linked_user_id}] }
      // Older fallback shapes also supported.
      let usersList = [];
      let empsList = [];
      let mappingPairs = [];
      if (data && Array.isArray(data.users)) {
        usersList = data.users;
        empsList = Array.isArray(data.biometric_employees) ? data.biometric_employees : [];
        // Build pairs from either side
        mappingPairs = usersList
          .filter(u => u.biometric_id)
          .map(u => ({ user_id: u.user_id, email: u.email, biometric_id: String(u.biometric_id) }));
      } else if (Array.isArray(data)) {
        mappingPairs = data;
      } else if (data && typeof data === 'object') {
        // flat dict shape
        mappingPairs = Object.entries(data).map(([uid, v]) =>
          v && typeof v === 'object' ? { user_id: uid, ...v } : { user_id: uid, biometric_id: String(v) }
        );
      }
      setMappings(mappingPairs);
      // Prefer the spec's payload — fall back to separate calls if absent
      if (usersList.length) {
        setSystemUsers(usersList);
      } else {
        try {
          const r = await axios.get(`${API}/api/users`);
          setSystemUsers(Array.isArray(r.data) ? r.data : r.data?.users || []);
        } catch { setSystemUsers([]); }
      }
      if (empsList.length) {
        setBiometricEmployees(empsList);
      } else {
        try {
          const r = await axios.get(`${API}/api/attendance/employees`);
          setBiometricEmployees(Array.isArray(r.data) ? r.data : r.data?.employees || []);
        } catch { setBiometricEmployees([]); }
      }
      // eslint-disable-next-line no-console
      console.debug('[Attendance] mappings response:', data, '→ pairs:', mappingPairs);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load mappings');
    } finally { setMappingsLoading(false); }
  }, []);

  // Set of biometric_ids that are linked to a user — used to badge attendance rows
  const linkedBiometricIds = useMemo(() => {
    const s = new Set();
    mappings.forEach(m => { if (m.biometric_id) s.add(String(m.biometric_id)); });
    // Also pull from systemUsers (new shape carries biometric_id on the user object)
    systemUsers.forEach(u => { if (u.biometric_id) s.add(String(u.biometric_id)); });
    // And from biometric_employees that have linked_user_id
    biometricEmployees.forEach(e => { if (e.linked_user_id) s.add(String(e.biometric_id)); });
    return s;
  }, [mappings, systemUsers, biometricEmployees]);

  const findLinkedUserForBiometric = (bid) => {
    if (!bid) return null;
    const sid = String(bid);
    // First check biometric_employees list for cross-ref
    const emp = biometricEmployees.find(e => String(e.biometric_id) === sid && e.linked_user_id);
    if (emp) {
      const u = systemUsers.find(x => String(x.user_id || x.id) === String(emp.linked_user_id));
      if (u) return u;
    }
    // Fallback via mappings/users
    const m = mappings.find(x => String(x.biometric_id) === sid);
    if (m) return systemUsers.find(x => String(x.user_id || x.id) === String(m.user_id) || (x.email && m.email && x.email.toLowerCase() === m.email.toLowerCase())) || null;
    const u2 = systemUsers.find(x => String(x.biometric_id) === sid);
    return u2 || null;
  };

  const getMappingForUser = (user) => {
    if (!user || !mappings.length) return null;
    const uid = String(user.user_id || user.id || user._id || '');
    const email = String(user.email || '').toLowerCase();
    return mappings.find(m => {
      const mid = String(m.user_id || m.userId || m.id || m._id || '');
      const mEmail = String(m.email || m.user_email || '').toLowerCase();
      return (uid && mid && uid === mid) || (email && mEmail && email === mEmail);
    });
  };

  const handleLinkUser = async (user) => {
    const bid = pendingLinks[user.user_id || user.id];
    if (!bid) { toast.error('Select a biometric employee first'); return; }
    const key = user.user_id || user.id;
    setLinkSaving(prev => ({ ...prev, [key]: true }));
    try {
      await axios.post(`${API}/api/attendance/link-user-biometric`, {
        user_id: key,
        biometric_id: String(bid),
      });
      toast.success(`Linked ${user.name || user.email} to biometric #${bid}`);
      setPendingLinks(prev => { const c = { ...prev }; delete c[key]; return c; });
      fetchMappings();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to link');
    } finally {
      setLinkSaving(prev => { const c = { ...prev }; delete c[key]; return c; });
    }
  };

  const handleUnlinkUser = async (userId, label) => {
    if (!window.confirm(`Unlink ${label} from their biometric ID?`)) return;
    setLinkSaving(prev => ({ ...prev, [userId]: true }));
    try {
      await axios.delete(`${API}/api/attendance/unlink-user-biometric/${userId}`);
      toast.success('Unlinked');
      fetchMappings();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to unlink');
    } finally {
      setLinkSaving(prev => { const c = { ...prev }; delete c[userId]; return c; });
    }
  };

  const fetchDevice = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshingDevice(true);
    try {
      const { data } = await axios.get(`${API}/api/attendance/device-status`);
      setDeviceStatus(data);
    } catch { /* non-fatal */ }
    finally { if (showSpinner) setRefreshingDevice(false); }
  }, []);

  const fetchDaily = useCallback(async (d) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/attendance/daily`, { params: { date: d } });
      setDaily(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load daily attendance');
      setDaily(null);
    } finally { setLoading(false); }
  }, []);

  const fetchMonthly = useCallback(async (m) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/attendance/monthly`, { params: { month: m } });
      setMonthly(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load monthly attendance');
      setMonthly(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchDevice();
    fetchShiftTypes();
    fetchMappings(); // pre-load so 🔗 badges render on Daily/Monthly tables
    const id = setInterval(() => fetchDevice(), 60_000);
    return () => clearInterval(id);
  }, [fetchDevice, fetchShiftTypes, fetchMappings]);
  useEffect(() => { if (tab === 'daily') fetchDaily(date); }, [tab, date, fetchDaily]);
  useEffect(() => { if (tab === 'monthly') fetchMonthly(month); }, [tab, month, fetchMonthly]);
  useEffect(() => { if (tab === 'links') fetchMappings(); }, [tab, fetchMappings]);

  // Filter & search daily list
  const filteredDaily = useMemo(() => {
    const list = daily?.attendance || [];
    return list.filter(emp => {
      const matchStatus = statusFilter === 'all' || (emp.status || '').toLowerCase() === statusFilter;
      const s = search.toLowerCase();
      const matchSearch = !s || (emp.name || '').toLowerCase().includes(s) || (emp.biometric_id || '').toLowerCase().includes(s);
      return matchStatus && matchSearch;
    });
  }, [daily, statusFilter, search]);

  const openEditPunch = (emp) => {
    setEditPunch(emp);
    setPunchIn(emp.in_time ? emp.in_time.slice(0, 5) : '');
    setPunchOut(emp.out_time ? emp.out_time.slice(0, 5) : '');
  };

  const handleSavePunch = async () => {
    if (!editPunch) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/attendance/edit-punch`, {
        biometric_id: editPunch.biometric_id,
        date,
        in_time: punchIn || null,
        out_time: punchOut || null,
      });
      toast.success(`Punch updated for ${editPunch.name}. Status will recalculate.`);
      setEditPunch(null);
      fetchDaily(date);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update punch');
    } finally { setSubmitting(false); }
  };

  const handleSaveName = async (emp) => {
    if (!newName.trim() || newName === emp.name) { setEditingName(null); return; }
    try {
      await axios.put(`${API}/api/attendance/employees/update-name`, {
        biometric_id: emp.biometric_id,
        name: newName.trim(),
      });
      toast.success('Name updated');
      setEditingName(null);
      if (tab === 'daily') fetchDaily(date); else fetchMonthly(month);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update name');
    }
  };

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    try { const w = window.open(url, '_blank'); if (w) setTimeout(() => { try { w.close(); } catch {} }, 8000); } catch {}
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const exportPDF = async (params, filename) => {
    setExporting(true);
    try {
      const res = await axios.get(`${API}/api/attendance/export-pdf`, { params, responseType: 'arraybuffer' });
      triggerDownload(new Blob([res.data], { type: 'application/pdf' }), filename);
      toast.success('PDF exported — check Downloads or new tab');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to export PDF');
    } finally { setExporting(false); }
  };

  const exportMonthlyPDF = (emp) => {
    const params = { period: 'monthly', month };
    let filename = `Attendance_${month}.pdf`;
    if (emp?.biometric_id) {
      params.biometric_id = emp.biometric_id;
      const safeName = (emp.name || 'employee').replace(/[^a-zA-Z0-9_-]+/g, '_');
      filename = `Attendance_${safeName}_${month}.pdf`;
    }
    return exportPDF(params, filename);
  };
  const exportYearlyPDFRun = () => {
    const baseParams = {};
    let baseName = '';
    if (yearlyMode === 'year') {
      baseParams.period = 'yearly';
      baseParams.year = yearlyYear;
      baseName = String(yearlyYear);
    } else {
      if (!yearlyFrom || !yearlyTo) { toast.error('Please pick both From and To dates'); return; }
      baseParams.period = 'range';
      baseParams.date_from = yearlyFrom;
      baseParams.date_to = yearlyTo;
      baseName = `${yearlyFrom}_to_${yearlyTo}`;
    }
    let filename = `Attendance_${baseName}.pdf`;
    if (yearlyTargetEmp?.biometric_id) {
      baseParams.biometric_id = yearlyTargetEmp.biometric_id;
      const safeName = (yearlyTargetEmp.name || 'employee').replace(/[^a-zA-Z0-9_-]+/g, '_');
      filename = `Attendance_${safeName}_${baseName}.pdf`;
    }
    exportPDF(baseParams, filename);
    setYearlyOpen(false);
  };

  // Date picker constraints: last 30 days for daily, last 12 months for monthly
  const maxDate = todayISO();
  const minDate = (() => {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  })();
  const monthOptions = useMemo(() => {
    const opts = []; const d = new Date();
    for (let i = 0; i < 12; i++) {
      const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
      opts.push({
        value: monthValueFromDate(dt),
        label: dt.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
      });
    }
    return opts;
  }, []);
  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2].map(v => v.toString());
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">Biometric attendance tracking & reports</p>
        </div>
        <DeviceStatusBadge status={deviceStatus} onRefresh={() => fetchDevice(true)} refreshing={refreshingDevice} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="attendance-tabs">
          <TabsTrigger value="daily" data-testid="tab-daily"><Calendar className="w-4 h-4 mr-2" /> Daily View</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-monthly"><Users className="w-4 h-4 mr-2" /> Monthly View</TabsTrigger>
          <TabsTrigger value="links" data-testid="tab-links"><Link2 className="w-4 h-4 mr-2" /> User Links</TabsTrigger>
        </TabsList>

        {/* DAILY VIEW */}
        <TabsContent value="daily" className="space-y-4 mt-4">
          <Card className="border"><CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3 justify-between">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} className="w-[160px]" data-testid="daily-date-picker" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status Filter</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]" data-testid="status-filter"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="late">Late</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <Label className="text-xs">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Name or biometric ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" data-testid="daily-search" />
                  </div>
                </div>
              </div>
              {daily?.date_display && <div className="text-sm text-muted-foreground">{daily.date_display}</div>}
            </div>
          </CardContent></Card>

          <SummaryCards summary={daily?.summary} />

          <Card className="border overflow-hidden">
            {loading ? (
              <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
            ) : filteredDaily.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>No employees match the current filter</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-semibold uppercase w-20">ID</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Name</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">IN Time</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">OUT Time</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Shift</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Expected Start</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDaily.map((emp) => (
                    <TableRow key={emp.biometric_id} data-testid={`emp-${emp.biometric_id}`}>
                      <TableCell className="font-mono text-xs">{emp.biometric_id}</TableCell>
                      <TableCell>
                        {editingName === emp.biometric_id ? (
                          <div className="flex items-center gap-1">
                            <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-7 text-sm w-40" autoFocus data-testid={`name-input-${emp.biometric_id}`} />
                            <Button size="sm" variant="ghost" onClick={() => handleSaveName(emp)} data-testid={`save-name-${emp.biometric_id}`}><Save className="w-3.5 h-3.5 text-emerald-600" /></Button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 group">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{emp.name}</span>
                              {linkedBiometricIds.has(String(emp.biometric_id)) && (
                                <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px] px-1 py-0" title="Linked to app user account" data-testid={`linked-badge-${emp.biometric_id}`}>
                                  <Link2 className="w-2.5 h-2.5 mr-0.5" /> Linked
                                </Badge>
                              )}
                              <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer" onClick={() => { setEditingName(emp.biometric_id); setNewName(emp.name); }} data-testid={`edit-name-${emp.biometric_id}`} />
                            </div>
                            {Array.isArray(emp.shifts) && emp.shifts.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {emp.shifts.map(sid => (
                                  <Badge key={sid} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{shiftIdToLabel(sid, shiftTypes)}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={emp.status} />{emp.is_late && emp.status === 'present' && <Badge className="ml-1 text-[10px] border-none" style={{ backgroundColor: COLOR.late, color: 'white' }}>LATE</Badge>}</TableCell>
                      <TableCell className="font-mono text-sm">{fmtTime(emp.in_time)}</TableCell>
                      <TableCell className="font-mono text-sm">{fmtTime(emp.out_time)}{emp.out_next_day && <Badge variant="outline" className="ml-1 text-[10px]">+1d</Badge>}</TableCell>
                      <TableCell><span className="text-xs">{emp.shift_id ? shiftIdToLabel(emp.shift_id, shiftTypes) : (emp.shift || '-')}</span></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{emp.expected_start ? fmtTime(emp.expected_start) : '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => openShiftDialog(emp)} title="Manage Shifts" data-testid={`manage-shifts-${emp.biometric_id}`}>
                            <Settings2 className="w-3 h-3 mr-1" /> Shifts
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEditPunch(emp)} data-testid={`edit-punch-${emp.biometric_id}`}>
                            <Pencil className="w-3 h-3 mr-1" /> Edit Punch
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* MONTHLY VIEW */}
        <TabsContent value="monthly" className="space-y-4 mt-4">
          <Card className="border"><CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3 justify-between">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Month</Label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger className="w-[200px]" data-testid="month-picker"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <Label className="text-xs">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Name or biometric ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" data-testid="monthly-search" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={exporting} data-testid="export-monthly-pdf">
                      {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                      Export Monthly PDF
                      <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="text-xs">Choose target</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => exportMonthlyPDF(null)} data-testid="export-monthly-all">
                      <Download className="w-4 h-4 mr-2" /> All Employees
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Single Employee</DropdownMenuLabel>
                    <div className="max-h-[240px] overflow-y-auto">
                      {(monthly?.employees || []).length === 0 ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground">Load monthly data first</div>
                      ) : (monthly.employees).filter(emp => {
                        const s = search.toLowerCase();
                        return !s || (emp.name || '').toLowerCase().includes(s) || (emp.biometric_id || '').toLowerCase().includes(s);
                      }).map(emp => (
                        <DropdownMenuItem
                          key={emp.biometric_id}
                          onClick={() => exportMonthlyPDF(emp)}
                          data-testid={`export-monthly-emp-${emp.biometric_id}`}
                        >
                          <Download className="w-3.5 h-3.5 mr-2 opacity-70" />
                          <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
                            <span className="truncate">{emp.name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{emp.biometric_id}</span>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" onClick={() => { setYearlyTargetEmp(null); setYearlyOpen(true); }} data-testid="export-yearly-pdf">
                  <Download className="w-4 h-4 mr-2" /> Export Yearly PDF
                </Button>
              </div>
            </div>
          </CardContent></Card>

          <Card className="border overflow-hidden">
            {loading ? (
              <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
            ) : !monthly?.employees?.length ? (
              <div className="p-12 text-center text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>No attendance data for this month</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-semibold uppercase w-20">ID</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Name</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Shift Type</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-center">Present</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-center">Late</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-center">Absent</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Attendance %</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(monthly.employees || []).filter(emp => {
                    const s = search.toLowerCase();
                    return !s || (emp.name || '').toLowerCase().includes(s) || (emp.biometric_id || '').toLowerCase().includes(s);
                  }).map((emp) => {
                    const pct = emp.attendance_percentage ?? 0;
                    return (
                      <TableRow key={emp.biometric_id} data-testid={`monthly-emp-${emp.biometric_id}`} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs cursor-pointer" onClick={() => setDrillEmployee(emp)}>{emp.biometric_id}</TableCell>
                        <TableCell className="font-medium cursor-pointer" onClick={() => setDrillEmployee(emp)}>
                          <div className="flex items-center gap-2">
                            <span>{emp.name}</span>
                            {linkedBiometricIds.has(String(emp.biometric_id)) && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px] px-1 py-0" title="Linked to app user" data-testid={`monthly-linked-badge-${emp.biometric_id}`}>
                                <Link2 className="w-2.5 h-2.5 mr-0.5" /> Linked
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {Array.isArray(emp.shifts) && emp.shifts.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {emp.shifts.map(sid => (
                                <Badge key={sid} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{shiftIdToLabel(sid, shiftTypes)}</Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-bold text-emerald-600 cursor-pointer" onClick={() => setDrillEmployee(emp)}>{emp.total_present || 0}</TableCell>
                        <TableCell className="text-center font-bold text-amber-600 cursor-pointer" onClick={() => setDrillEmployee(emp)}>{emp.total_late || 0}</TableCell>
                        <TableCell className="text-center font-bold text-red-600 cursor-pointer" onClick={() => setDrillEmployee(emp)}>{emp.total_absent || 0}</TableCell>
                        <TableCell className="cursor-pointer" onClick={() => setDrillEmployee(emp)}>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 max-w-[120px] h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: pct >= 90 ? COLOR.present : pct >= 75 ? COLOR.late : COLOR.absent }} />
                            </div>
                            <span className="text-xs font-semibold w-10 text-right">{pct}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="outline" onClick={() => exportMonthlyPDF(emp)} title="Download monthly PDF" data-testid={`row-export-pdf-${emp.biometric_id}`} disabled={exporting}>
                              <Download className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openShiftDialog(emp)} title="Manage Shifts" data-testid={`monthly-shifts-${emp.biometric_id}`}>
                              <Settings2 className="w-3 h-3 mr-1" /> Shifts
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDrillEmployee(emp)} data-testid={`view-monthly-${emp.biometric_id}`}>
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* USER LINKS — admin only */}
        <TabsContent value="links" className="space-y-4 mt-4">
          <Card className="border"><CardContent className="p-4">
            <div className="flex items-end gap-3 justify-between flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs">Search Users</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="By name or email..." value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} className="pl-10" data-testid="link-search" />
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={fetchMappings} disabled={mappingsLoading} data-testid="refresh-mappings-btn">
                {mappingsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Refresh
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Link each system user account to a biometric employee. Linked users can view their own attendance from the "My Attendance" page.</p>
          </CardContent></Card>

          <Card className="border overflow-hidden">
            {mappingsLoading ? (
              <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-semibold uppercase">User Account</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Role</TableHead>
                    <TableHead className="text-xs font-semibold uppercase">Biometric Employee</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemUsers
                    .filter(u => {
                      const s = linkSearch.toLowerCase();
                      return !s || (u.name || u.full_name || '').toLowerCase().includes(s) || (u.email || u.username || '').toLowerCase().includes(s);
                    })
                    .map((u) => {
                      const uid = u.user_id || u.id;
                      const linked = getMappingForUser(u);
                      const linkedEmp = linked ? biometricEmployees.find(e => String(e.biometric_id) === String(linked.biometric_id)) : null;
                      const pending = pendingLinks[uid] || '';
                      const saving = !!linkSaving[uid];
                      return (
                        <TableRow key={uid} data-testid={`link-row-${uid}`} className={linked ? 'bg-emerald-50/40 hover:bg-emerald-50/60' : ''}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="font-medium">{u.name || u.full_name || u.username || u.email}</div>
                                {u.email && u.email !== (u.name || u.full_name) && <div className="text-xs text-muted-foreground">{u.email}</div>}
                              </div>
                              {linked && (
                                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-none text-[10px] px-1.5 py-0.5" data-testid={`synced-badge-${uid}`}>
                                  <CheckCircle className="w-3 h-3 mr-1" /> User Synced
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{u.role || '-'}</Badge></TableCell>
                          <TableCell>
                            {linked ? (
                              <div className="flex items-center gap-2">
                                <span className="text-sm">
                                  <span className="font-mono font-semibold text-emerald-700">#{linked.biometric_id}</span>
                                  {linkedEmp?.name && <span className="ml-2 text-muted-foreground">{linkedEmp.name}</span>}
                                </span>
                              </div>
                            ) : (
                              <Select value={pending} onValueChange={(v) => setPendingLinks(prev => ({ ...prev, [uid]: v }))}>
                                <SelectTrigger className="w-[260px] h-8" data-testid={`link-select-${uid}`}><SelectValue placeholder="Select biometric employee..." /></SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                  {biometricEmployees.map(e => (
                                    <SelectItem key={e.biometric_id} value={String(e.biometric_id)}>
                                      #{e.biometric_id} — {e.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {linked ? (
                              <Button size="sm" variant="outline" onClick={() => handleUnlinkUser(uid, u.name || u.email)} disabled={saving} className="border-red-300 text-red-700 hover:bg-red-50" data-testid={`unlink-btn-${uid}`}>
                                {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Unlink className="w-3 h-3 mr-1" />} Unlink
                              </Button>
                            ) : (
                              <Button size="sm" onClick={() => handleLinkUser(u)} disabled={!pending || saving} data-testid={`link-btn-${uid}`}>
                                {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Link2 className="w-3 h-3 mr-1" />} Link
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  {systemUsers.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="p-8 text-center text-muted-foreground">No users found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Punch Modal */}
      <Dialog open={!!editPunch} onOpenChange={(o) => !o && setEditPunch(null)}>
        <DialogContent className="max-w-md" data-testid="edit-punch-dialog">
          <DialogHeader><DialogTitle>Edit Punch — {editPunch?.name}</DialogTitle></DialogHeader>
          {editPunch && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded text-sm">
                <p><span className="text-muted-foreground">Date:</span> <span className="font-medium">{date}</span></p>
                <p><span className="text-muted-foreground">Biometric ID:</span> <span className="font-mono">{editPunch.biometric_id}</span></p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">IN Time (HH:MM)</Label>
                  <Input type="time" value={punchIn} onChange={(e) => setPunchIn(e.target.value)} data-testid="punch-in-input" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">OUT Time (HH:MM)</Label>
                  <Input type="time" value={punchOut} onChange={(e) => setPunchOut(e.target.value)} data-testid="punch-out-input" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Status (Present / Late / Absent) is auto-calculated by the system based on these times. Leave both empty to mark as Absent.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPunch(null)}>Cancel</Button>
            <Button onClick={handleSavePunch} disabled={submitting} data-testid="save-punch-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Monthly drilldown drawer */}
      <Dialog open={!!drillEmployee} onOpenChange={(o) => !o && setDrillEmployee(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="drilldown-dialog">
          <DialogHeader><DialogTitle>{drillEmployee?.name} — {month} Daily Breakdown</DialogTitle></DialogHeader>
          {drillEmployee && (
            <div className="space-y-3">
              {(() => {
                const linkedU = findLinkedUserForBiometric(drillEmployee.biometric_id);
                return linkedU ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded flex items-center gap-3" data-testid="linked-user-info">
                    <Link2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold text-emerald-800">🔗 Linked to App User</p>
                      <p className="text-emerald-700">{linkedU.name || linkedU.full_name || linkedU.username || linkedU.email}{linkedU.role ? <span className="text-emerald-600 ml-2">({linkedU.role})</span> : ''}</p>
                      {linkedU.email && <p className="text-xs text-emerald-600">{linkedU.email}</p>}
                    </div>
                  </div>
                ) : null;
              })()}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded bg-emerald-50"><p className="text-xs text-muted-foreground">Present</p><p className="text-xl font-bold text-emerald-600">{drillEmployee.total_present || 0}</p></div>
                <div className="p-2 rounded bg-amber-50"><p className="text-xs text-muted-foreground">Late</p><p className="text-xl font-bold text-amber-600">{drillEmployee.total_late || 0}</p></div>
                <div className="p-2 rounded bg-red-50"><p className="text-xs text-muted-foreground">Absent</p><p className="text-xl font-bold text-red-600">{drillEmployee.total_absent || 0}</p></div>
                <div className="p-2 rounded bg-blue-50"><p className="text-xs text-muted-foreground">Attendance</p><p className="text-xl font-bold text-blue-600">{drillEmployee.attendance_percentage ?? 0}%</p></div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Object.entries(drillEmployee.days || {}).sort(([a], [b]) => a.localeCompare(b)).map(([d, info]) => {
                  const day = d.slice(-2);
                  const st = (typeof info === 'string' ? info : info?.status || '').toLowerCase();
                  const bg = st === 'present' ? COLOR.present : st === 'late' ? COLOR.late : st === 'absent' ? COLOR.absent : '#E5E7EB';
                  const tt = typeof info === 'object' ? `${d} • ${st || '-'}${info.in_time ? ` • IN ${fmtTime(info.in_time)}` : ''}${info.out_time ? ` • OUT ${fmtTime(info.out_time)}` : ''}` : `${d} • ${st || '-'}`;
                  return (
                    <div key={d} title={tt} className="aspect-square rounded flex items-center justify-center text-xs font-semibold text-white" style={{ backgroundColor: bg }}>
                      {day}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground justify-center pt-2 border-t">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLOR.present }} /> Present</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLOR.late }} /> Late</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLOR.absent }} /> Absent</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Yearly export dialog */}
      <Dialog open={yearlyOpen} onOpenChange={setYearlyOpen}>
        <DialogContent className="max-w-md" data-testid="yearly-export-dialog">
          <DialogHeader><DialogTitle>Export Attendance Report</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Target</Label>
              <Select
                value={yearlyTargetEmp ? `bio:${yearlyTargetEmp.biometric_id}` : 'all'}
                onValueChange={(v) => {
                  if (v === 'all') { setYearlyTargetEmp(null); return; }
                  const bid = v.replace('bio:', '');
                  const emp = (monthly?.employees || []).find(e => String(e.biometric_id) === bid);
                  setYearlyTargetEmp(emp || null);
                }}
              >
                <SelectTrigger data-testid="yearly-target-select"><SelectValue placeholder="All Employees" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {(monthly?.employees || []).map(emp => (
                    <SelectItem key={emp.biometric_id} value={`bio:${emp.biometric_id}`}>
                      {emp.name} <span className="text-muted-foreground text-xs">({emp.biometric_id})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(!monthly?.employees || monthly.employees.length === 0) && (
                <p className="text-[11px] text-amber-700">Tip: open Monthly View first to populate the employee list.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant={yearlyMode === 'year' ? 'default' : 'outline'} size="sm" onClick={() => setYearlyMode('year')} data-testid="export-mode-year" className="flex-1">By Year</Button>
              <Button variant={yearlyMode === 'range' ? 'default' : 'outline'} size="sm" onClick={() => setYearlyMode('range')} data-testid="export-mode-range" className="flex-1">By Date Range</Button>
            </div>
            {yearlyMode === 'year' ? (
              <div className="space-y-1">
                <Label className="text-xs">Year</Label>
                <Select value={yearlyYear} onValueChange={setYearlyYear}>
                  <SelectTrigger data-testid="yearly-year-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={yearlyFrom} onChange={(e) => setYearlyFrom(e.target.value)} data-testid="yearly-date-from" /></div>
                <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={yearlyTo} onChange={(e) => setYearlyTo(e.target.value)} data-testid="yearly-date-to" /></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYearlyOpen(false)}>Cancel</Button>
            <Button onClick={exportYearlyPDFRun} disabled={exporting} data-testid="confirm-yearly-export">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />} Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Manage Shifts Modal */}
      <Dialog open={!!shiftEmployee} onOpenChange={(o) => !o && setShiftEmployee(null)}>
        <DialogContent className="max-w-md" data-testid="shifts-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-primary" /> Assign Shifts — {shiftEmployee?.name}
            </DialogTitle>
          </DialogHeader>
          {shiftEmployee && (
            <div className="space-y-3">
              <div className="p-3 bg-muted/50 rounded text-sm">
                <p><span className="text-muted-foreground">Biometric ID:</span> <span className="font-mono">{shiftEmployee.biometric_id}</span></p>
                <p className="text-xs text-muted-foreground mt-1">Multiple shifts allowed. Status (Present / Late) will be calculated against any matching shift.</p>
              </div>
              <div className="space-y-2">
                {(shiftTypes.length ? shiftTypes : DEFAULT_SHIFTS).map(s => (
                  <label key={s.id} className="flex items-center gap-3 p-2.5 rounded border border-border hover:bg-muted/30 cursor-pointer" data-testid={`shift-option-${s.id}`}>
                    <Checkbox
                      checked={selectedShifts.includes(s.id)}
                      onCheckedChange={() => toggleShift(s.id)}
                      data-testid={`shift-checkbox-${s.id}`}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{s.label}</div>
                      {s.start && <div className="text-[11px] text-muted-foreground">Starts {s.start}{s.start !== 'auto' && ' • Late after 15 min'}</div>}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShiftEmployee(null)}>Cancel</Button>
            <Button onClick={handleSaveShifts} disabled={savingShifts} data-testid="save-shifts-btn">
              {savingShifts ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Save Shifts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Attendance;
