import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  ChevronLeft, ChevronRight, Lock, Search, Loader2, FileText, Download,
  Save, Edit2, IndianRupee, ArrowLeft, CalendarDays, Utensils, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const PIN_LENGTH = 6;
const WORKING_DAYS_PER_MONTH = 26;
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;

// Defensive normalization — backend has been returning different field names
// across mobile/web. Accept all common variants and compute hours when missing.
const pickFirst = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
};
const toHHMM = (t) => {
  if (!t) return null;
  const s = String(t).trim();
  // Accept "HH:MM", "HH:MM:SS", ISO strings, or numbers (epoch ms)
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return s;
};
const diffHours = (inStr, outStr) => {
  if (!inStr || !outStr) return 0;
  const [ih, im] = inStr.split(':').map(Number);
  const [oh, om] = outStr.split(':').map(Number);
  if (Number.isNaN(ih) || Number.isNaN(oh)) return 0;
  let diff = (oh * 60 + (om || 0)) - (ih * 60 + (im || 0));
  if (diff < 0) diff += 24 * 60; // overnight shift
  return Math.round((diff / 60) * 100) / 100;
};
const normalizeAttendanceRow = (r) => {
  const punchIn = toHHMM(pickFirst(r, ['punch_in', 'in_time', 'time_in', 'punch_in_time', 'first_punch', 'check_in']));
  const punchOut = toHHMM(pickFirst(r, ['punch_out', 'out_time', 'time_out', 'punch_out_time', 'last_punch', 'check_out']));
  let totalHours = Number(r?.total_hours || r?.hours || 0);
  // If backend gave 0 but both punches exist, derive it ourselves
  if ((!totalHours || totalHours === 0) && punchIn && punchOut) {
    totalHours = diffHours(punchIn, punchOut);
  }
  const isPresent = r?.is_present !== undefined
    ? !!r.is_present
    : !!(punchIn || punchOut);
  return {
    ...r,
    punch_in: punchIn,
    punch_out: punchOut,
    total_hours: totalHours,
    is_present: isPresent,
    is_edited: !!r?.is_edited,
  };
};

// ============ PIN ENTRY ============
const PinEntry = ({ onSuccess }) => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (value) => {
    if (value.length !== PIN_LENGTH) return;
    setLoading(true); setError('');
    try {
      const { data } = await axios.post(`${API}/api/salary/verify-pin`, { pin: value });
      if (data?.valid) {
        toast.success('PIN verified');
        onSuccess(data.session_token || '');
      } else {
        setError('Invalid PIN');
        setPin('');
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Invalid PIN');
      setPin('');
    } finally { setLoading(false); }
  };

  const handleChange = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, PIN_LENGTH);
    setPin(digits); setError('');
    if (digits.length === PIN_LENGTH) submit(digits);
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center" data-testid="salary-pin-screen">
      <Card className="border-2 max-w-sm w-full">
        <CardContent className="p-8 space-y-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Salary Module</h2>
            <p className="text-sm text-muted-foreground mt-1">Enter 6-digit Admin PIN to continue</p>
          </div>
          <div>
            <Input
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={PIN_LENGTH}
              value={pin}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="••••••"
              className="text-center text-2xl font-mono tracking-[0.8em] h-14"
              disabled={loading}
              data-testid="salary-pin-input"
            />
            <div className="flex justify-center gap-2 mt-3">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-6 rounded-full transition-colors ${i < pin.length ? 'bg-primary' : 'bg-muted'}`}
                />
              ))}
            </div>
          </div>
          {loading && <p className="text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</p>}
          {error && <p className="text-sm text-destructive" data-testid="salary-pin-error">{error}</p>}
          <p className="text-[11px] text-muted-foreground">For security, PIN is required each time you access this section.</p>
        </CardContent>
      </Card>
    </div>
  );
};

// ============ MONTH PICKER ============
const MonthPicker = ({ month, year, onChange }) => {
  const prev = () => {
    let m = month - 1, y = year;
    if (m < 0) { m = 11; y -= 1; }
    onChange(m, y);
  };
  const next = () => {
    const now = new Date();
    if (year === now.getFullYear() && month >= now.getMonth()) return;
    let m = month + 1, y = year;
    if (m > 11) { m = 0; y += 1; }
    onChange(m, y);
  };
  const isCurrent = (() => {
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth();
  })();
  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-1">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prev} data-testid="salary-month-prev">
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <div className="px-2 min-w-[120px] text-center text-sm font-semibold" data-testid="salary-month-label">
        {MONTH_LABELS[month]} {year}
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={next} disabled={isCurrent} data-testid="salary-month-next">
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
};

// ============ STAFF LIST ============
const StaffListScreen = ({ month, year, onMonthChange, onOpenStaff, onDownloadAll }) => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/salary/staff-list`);
      setStaff(Array.isArray(data?.staff) ? data.staff : []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load staff');
      setStaff([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return staff;
    return staff.filter(x =>
      (x.name || '').toLowerCase().includes(s) ||
      String(x.biometric_id || '').toLowerCase().includes(s) ||
      (x.email || '').toLowerCase().includes(s)
    );
  }, [staff, search]);

  const startEdit = (s) => { setEditingId(s.user_id); setEditValue(String(s.monthly_salary || '')); };
  const cancelEdit = () => { setEditingId(null); setEditValue(''); };

  const saveSalary = async (userId) => {
    const value = Number(editValue);
    if (!Number.isFinite(value) || value <= 0) { toast.error('Enter a valid salary'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/api/salary/set-staff-salary`, {
        user_id: userId,
        monthly_salary: value,
      });
      toast.success('Salary updated');
      setStaff(prev => prev.map(s => s.user_id === userId ? { ...s, monthly_salary: value } : s));
      cancelEdit();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save salary');
    } finally { setSaving(false); }
  };

  const downloadAll = async (format) => {
    setDownloading(true);
    try {
      await onDownloadAll(format);
    } finally { setDownloading(false); }
  };

  return (
    <div className="space-y-4" data-testid="salary-staff-list">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Salary</h1>
          <p className="text-sm text-muted-foreground mt-1">Calculate and download monthly salary slips</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MonthPicker month={month} year={year} onChange={onMonthChange} />
          <Button variant="outline" onClick={() => downloadAll('excel')} disabled={downloading} data-testid="download-all-excel-btn">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
            All — Excel
          </Button>
          <Button variant="outline" onClick={() => downloadAll('pdf')} disabled={downloading} data-testid="download-all-pdf-btn">
            <FileText className="w-4 h-4 mr-2" /> All — PDF
          </Button>
        </div>
      </div>

      <Card className="border">
        <CardContent className="p-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, biometric ID, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="salary-staff-search"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold uppercase">Biometric ID</TableHead>
              <TableHead className="text-xs font-semibold uppercase">Name</TableHead>
              <TableHead className="text-xs font-semibold uppercase hidden md:table-cell">Role</TableHead>
              <TableHead className="text-xs font-semibold uppercase">Monthly Salary</TableHead>
              <TableHead className="text-xs font-semibold uppercase text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No staff found</TableCell></TableRow>
            ) : filtered.map((s) => (
              <TableRow key={s.user_id} data-testid={`salary-staff-row-${s.biometric_id}`}>
                <TableCell className="font-mono text-xs">{s.biometric_id || '-'}</TableCell>
                <TableCell className="font-medium">
                  <div>{s.name || '-'}</div>
                  {s.email && <div className="text-[11px] text-muted-foreground">{s.email}</div>}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{s.role || '-'}</TableCell>
                <TableCell>
                  {editingId === s.user_id ? (
                    <div className="flex items-center gap-1.5">
                      <IndianRupee className="w-3 h-3 text-muted-foreground" />
                      <Input
                        type="number"
                        min="0"
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveSalary(s.user_id); if (e.key === 'Escape') cancelEdit(); }}
                        className="h-8 w-28"
                        data-testid={`salary-edit-input-${s.biometric_id}`}
                      />
                      <Button size="sm" className="h-8" onClick={() => saveSalary(s.user_id)} disabled={saving} data-testid={`salary-save-btn-${s.biometric_id}`}>
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={cancelEdit}>×</Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(s)}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/50 transition-colors"
                      data-testid={`salary-edit-btn-${s.biometric_id}`}
                    >
                      {s.monthly_salary ? (
                        <span className="font-semibold">{fmtInt(s.monthly_salary)}</span>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-300">Not set</Badge>
                      )}
                      <Edit2 className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenStaff(s)}
                    disabled={!s.monthly_salary}
                    data-testid={`salary-open-btn-${s.biometric_id}`}
                  >
                    <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
                    View Attendance
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

// ============ ATTENDANCE & CALCULATION ============
const CalculationScreen = ({ staff, month, year, onBack }) => {
  const [attendance, setAttendance] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [savedRecord, setSavedRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shiftHours, setShiftHours] = useState(12);
  const [foodExpense, setFoodExpense] = useState(0);
  const [loanDeduction, setLoanDeduction] = useState(0);
  const [saving, setSaving] = useState(false);
  const [downloadingFmt, setDownloadingFmt] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Edit punch dialog
  const [editRow, setEditRow] = useState(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const monthlySalary = Number(staff.monthly_salary || 0);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/salary/staff-attendance`, {
        params: { user_id: staff.user_id, month, year },
      });
      const rawRows = Array.isArray(data?.attendance) ? data.attendance : [];
      setAttendance(rawRows.map(normalizeAttendanceRow));
      const sr = data?.saved_record || null;
      setSavedRecord(sr);
      if (sr) {
        setFoodExpense(Number(sr.food_expense || 0));
        setLoanDeduction(Number(sr.loan_deduction || 0));
        setShiftHours(Number(sr.standard_hours_per_day || 12));
      } else {
        setFoodExpense(0); setLoanDeduction(0); setShiftHours(12);
      }
      setHasUnsavedChanges(false);

      // Fetch late/early alerts for this user/month (1-indexed for backend)
      try {
        const alertsRes = await axios.get(`${API}/api/attendance/alerts`, {
          params: { user_id: staff.user_id, month: month + 1, year },
        });
        setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : []);
      } catch { setAlerts([]); }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load attendance');
      setAttendance([]); setSavedRecord(null); setAlerts([]);
    } finally { setLoading(false); }
  }, [staff.user_id, month, year]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  // Derived calculations
  const calc = useMemo(() => {
    const presentDays = attendance.filter(a => a.is_present).length;
    const totalHours = attendance.reduce((sum, a) => sum + Number(a.total_hours || 0), 0);
    const perDay = monthlySalary / WORKING_DAYS_PER_MONTH;
    const perHour = perDay / Math.max(1, shiftHours);
    const hoursPay = totalHours * perHour;
    // Late/Early deduction: sum minutes from alerts where is_deducted=true
    const lateEarlyMinutes = (alerts || []).reduce(
      (s, a) => s + (a?.is_deducted ? Number(a?.duration_minutes || 0) : 0),
      0
    );
    const lateEarlyDeduction = (lateEarlyMinutes / 60) * perHour;
    const finalSalary = hoursPay + Number(foodExpense || 0) - Number(loanDeduction || 0) - lateEarlyDeduction;
    return {
      monthly_salary: monthlySalary,
      working_days_in_month: WORKING_DAYS_PER_MONTH,
      per_day_salary: Number(perDay.toFixed(2)),
      per_hour_salary: Number(perHour.toFixed(2)),
      present_days: presentDays,
      total_hours_worked: Number(totalHours.toFixed(2)),
      hours_pay: Number(hoursPay.toFixed(2)),
      food_expense: Number(foodExpense || 0),
      loan_deduction: Number(loanDeduction || 0),
      late_early_minutes: lateEarlyMinutes,
      late_early_deduction: Number(lateEarlyDeduction.toFixed(2)),
      final_salary: Number(finalSalary.toFixed(2)),
    };
  }, [attendance, alerts, monthlySalary, shiftHours, foodExpense, loanDeduction]);

  const openEdit = (row) => {
    setEditRow(row);
    setEditIn(row.punch_in || '');
    setEditOut(row.punch_out || '');
  };

  const closeEdit = () => { setEditRow(null); setEditIn(''); setEditOut(''); };

  const saveEdit = async () => {
    if (!editRow) return;
    setEditSaving(true);
    try {
      await axios.post(`${API}/api/salary/edit-attendance`, {
        user_id: staff.user_id,
        date: editRow.date,
        punch_in: editIn || null,
        punch_out: editOut || null,
      });
      toast.success('Attendance updated');
      closeEdit();
      fetchAttendance();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update');
    } finally { setEditSaving(false); }
  };

  const saveRecord = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/api/salary/save-record`, {
        user_id: staff.user_id,
        name: staff.name,
        biometric_id: staff.biometric_id,
        month, year,
        attendance_data: attendance,
        calculation: calc,
        food_expense: Number(foodExpense || 0),
        loan_deduction: Number(loanDeduction || 0),
        standard_hours_per_day: shiftHours,
      });
      toast.success('Salary record saved');
      setHasUnsavedChanges(false);
      fetchAttendance();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const downloadSlip = async (format) => {
    if (hasUnsavedChanges || !savedRecord) {
      toast.error('Please save the record first');
      return;
    }
    setDownloadingFmt(format);
    try {
      const url = `${API}/api/salary/download-slip?user_id=${encodeURIComponent(staff.user_id)}&month=${month}&year=${year}&format=${format}`;
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      toast.success(`${format.toUpperCase()} download started`);
    } catch (e) {
      toast.error('Failed to download');
    } finally { setDownloadingFmt(null); }
  };

  // Track unsaved changes
  useEffect(() => {
    if (!savedRecord) {
      setHasUnsavedChanges(Number(foodExpense || 0) !== 0 || Number(loanDeduction || 0) !== 0 || shiftHours !== 12);
      return;
    }
    const changed =
      Number(foodExpense || 0) !== Number(savedRecord.food_expense || 0) ||
      Number(loanDeduction || 0) !== Number(savedRecord.loan_deduction || 0) ||
      Number(shiftHours) !== Number(savedRecord.standard_hours_per_day || 12);
    setHasUnsavedChanges(changed);
  }, [foodExpense, loanDeduction, shiftHours, savedRecord]);

  return (
    <div className="space-y-4" data-testid="salary-calc-screen">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="salary-back-btn"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{staff.name}</h1>
            <p className="text-sm text-muted-foreground">
              Biometric ID: <span className="font-mono">{staff.biometric_id}</span>
              {' • '}{MONTH_LABELS[month]} {year}
              {' • '}Salary: <span className="font-semibold">{fmtInt(monthlySalary)}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Shift selector */}
          <div className="inline-flex rounded-md border overflow-hidden" data-testid="shift-selector">
            {[8, 10, 12].map(h => (
              <button
                key={h}
                onClick={() => setShiftHours(h)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${shiftHours === h ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/50'}`}
                data-testid={`shift-${h}h`}
              >
                {h} Hr
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Attendance Table */}
        <Card className="border overflow-hidden lg:col-span-2">
          <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Daily Attendance</h3>
            <span className="text-xs text-muted-foreground">{calc.present_days} present • {calc.total_hours_worked.toFixed(1)} hrs</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Day</TableHead>
                  <TableHead className="text-xs">In</TableHead>
                  <TableHead className="text-xs">Out</TableHead>
                  <TableHead className="text-xs text-right">Hrs</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                ) : attendance.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No attendance data for this month</TableCell></TableRow>
                ) : attendance.map((row) => (
                  <TableRow key={row.date} data-testid={`attendance-row-${row.date}`}>
                    <TableCell className="font-mono text-xs">{row.date?.slice(8) || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.day_name || ''}</TableCell>
                    <TableCell className="text-xs font-mono">{row.punch_in || '—'}</TableCell>
                    <TableCell className="text-xs font-mono">{row.punch_out || '—'}</TableCell>
                    <TableCell className="text-xs font-mono text-right">{Number(row.total_hours || 0).toFixed(1)}</TableCell>
                    <TableCell className="text-center">
                      {row.is_present ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px]">Present</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 border-none text-[10px]">Absent</Badge>
                      )}
                      {row.is_edited && <Badge className="ml-1 bg-blue-100 text-blue-700 border-none text-[9px]">edited</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(row)} data-testid={`edit-attendance-${row.date}`}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Calculation Summary */}
        <div className="space-y-3">
          {/* Adjustments */}
          <Card className="border">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm">Adjustments</h3>
              <div>
                <Label className="text-xs flex items-center gap-1.5"><Utensils className="w-3.5 h-3.5 text-amber-600" /> Food Expense (+)</Label>
                <div className="flex items-center mt-1">
                  <span className="px-2 text-muted-foreground"><IndianRupee className="w-3.5 h-3.5" /></span>
                  <Input
                    type="number"
                    min="0"
                    value={foodExpense}
                    onChange={(e) => setFoodExpense(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="h-9"
                    data-testid="food-expense-input"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-rose-600" /> Loan Deduction (−)</Label>
                <div className="flex items-center mt-1">
                  <span className="px-2 text-muted-foreground"><IndianRupee className="w-3.5 h-3.5" /></span>
                  <Input
                    type="number"
                    min="0"
                    value={loanDeduction}
                    onChange={(e) => setLoanDeduction(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="h-9"
                    data-testid="loan-deduction-input"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-2 border-primary/20">
            <CardContent className="p-4 space-y-2 text-sm" data-testid="salary-summary">
              <h3 className="font-semibold mb-2">Calculation</h3>
              <SummaryRow label="Monthly Salary" value={fmtInt(calc.monthly_salary)} />
              <SummaryRow label="Working Days (fixed)" value={String(calc.working_days_in_month)} />
              <SummaryRow label="Per Day" value={fmt(calc.per_day_salary)} muted />
              <SummaryRow label={`Per Hour (${shiftHours}hr)`} value={fmt(calc.per_hour_salary)} muted />
              <div className="border-t my-2" />
              <SummaryRow label="Present Days" value={String(calc.present_days)} />
              <SummaryRow label="Total Hours" value={`${calc.total_hours_worked.toFixed(2)} hrs`} />
              <SummaryRow label="Hours Pay" value={fmt(calc.hours_pay)} bold />
              <div className="border-t my-2" />
              <SummaryRow label="Food Expense" value={`+ ${fmt(calc.food_expense)}`} className="text-emerald-700" />
              <SummaryRow label="Loan Deduction" value={`− ${fmt(calc.loan_deduction)}`} className="text-rose-700" />
              {calc.late_early_minutes > 0 && (
                <SummaryRow
                  label={`Late/Early Deduction (${calc.late_early_minutes} mins)`}
                  value={`− ${fmt(calc.late_early_deduction)}`}
                  className="text-rose-700"
                />
              )}
              <div className="border-t-2 my-2" />
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-sm font-bold">NET SALARY</span>
                <span className="text-2xl font-extrabold text-primary" data-testid="net-salary-value">{fmt(calc.final_salary)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="grid grid-cols-1 gap-2">
            <Button onClick={saveRecord} disabled={saving} data-testid="save-record-btn">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {savedRecord ? 'Update Record' : 'Save Record'}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => downloadSlip('pdf')}
                disabled={downloadingFmt === 'pdf' || !savedRecord || hasUnsavedChanges}
                data-testid="download-pdf-btn"
              >
                {downloadingFmt === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => downloadSlip('excel')}
                disabled={downloadingFmt === 'excel' || !savedRecord || hasUnsavedChanges}
                data-testid="download-excel-btn"
              >
                {downloadingFmt === 'excel' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Excel
              </Button>
            </div>
            {(!savedRecord || hasUnsavedChanges) && (
              <p className="text-[11px] text-amber-700 text-center">Save the record first to enable downloads</p>
            )}
          </div>
        </div>
      </div>

      {/* Edit Attendance Dialog */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="max-w-sm" data-testid="edit-attendance-dialog">
          <DialogHeader>
            <DialogTitle>Edit Attendance — {editRow?.date}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Punch In (HH:MM)</Label>
              <Input
                type="time"
                value={editIn}
                onChange={(e) => setEditIn(e.target.value)}
                data-testid="edit-punch-in"
              />
            </div>
            <div>
              <Label className="text-xs">Punch Out (HH:MM)</Label>
              <Input
                type="time"
                value={editOut}
                onChange={(e) => setEditOut(e.target.value)}
                data-testid="edit-punch-out"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Leave both empty to mark as Absent.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving} data-testid="edit-attendance-save">
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SummaryRow = ({ label, value, muted, bold, className = '' }) => (
  <div className={`flex items-center justify-between ${className}`}>
    <span className={`text-xs ${muted ? 'text-muted-foreground' : ''}`}>{label}</span>
    <span className={`font-mono ${bold ? 'font-bold' : muted ? 'text-muted-foreground' : 'font-medium'}`}>{value}</span>
  </div>
);

// ============ MAIN PAGE ============
const Salary = () => {
  const [unlocked, setUnlocked] = useState(false);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [openStaff, setOpenStaff] = useState(null);

  const handleDownloadAll = async (format) => {
    try {
      const url = `${API}/api/salary/download-all?month=${month}&year=${year}&format=${format}`;
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      toast.success(`${format.toUpperCase()} download started`);
    } catch (e) {
      toast.error('Failed to download');
    }
  };

  if (!unlocked) return <PinEntry onSuccess={() => setUnlocked(true)} />;

  if (openStaff) {
    return (
      <CalculationScreen
        staff={openStaff}
        month={month}
        year={year}
        onBack={() => setOpenStaff(null)}
      />
    );
  }

  return (
    <StaffListScreen
      month={month}
      year={year}
      onMonthChange={(m, y) => { setMonth(m); setYear(y); }}
      onOpenStaff={setOpenStaff}
      onDownloadAll={handleDownloadAll}
    />
  );
};

export default Salary;
