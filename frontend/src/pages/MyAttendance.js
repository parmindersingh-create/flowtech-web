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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Loader2, Calendar, ChevronLeft, ChevronRight, CheckCircle, Clock, XCircle, Timer, AlertTriangle, User, Plus, FileText, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseApiError } from '../utils/parseApiError';

const API = process.env.REACT_APP_BACKEND_URL;
const COLOR = { present: '#10B981', late: '#F59E0B', absent: '#EF4444', hours: '#3B82F6' };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const fmtTime = (t) => {
  if (!t) return '--:--';
  if (typeof t === 'string' && /^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  try { return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return '--:--'; }
};

const StatusBadge = ({ status }) => {
  const s = (status || '').toLowerCase();
  if (s === 'present') return <Badge style={{ backgroundColor: COLOR.present, color: 'white' }} className="border-none">🟢 Present</Badge>;
  if (s === 'late') return <Badge style={{ backgroundColor: COLOR.late, color: 'white' }} className="border-none">🟡 Late</Badge>;
  if (s === 'absent') return <Badge style={{ backgroundColor: COLOR.absent, color: 'white' }} className="border-none">🔴 Absent</Badge>;
  return <Badge variant="outline" className="text-xs">{status || '-'}</Badge>;
};

const StatCard = ({ label, value, color, icon: Icon, suffix }) => (
  <Card className="border-l-4" style={{ borderLeftColor: color }}>
    <CardContent className="p-4 flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold mt-1" style={{ color }}>{value ?? 0}{suffix || ''}</p>
      </div>
      {Icon && <Icon className="w-7 h-7" style={{ color }} />}
    </CardContent>
  </Card>
);

const MyAttendance = () => {
  const [tab, setTab] = useState('monthly');
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const [year, setYear] = useState(today.getFullYear());
  const [monthData, setMonthData] = useState(null);
  const [yearData, setYearData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);

  const fetchMonthly = useCallback(async (m) => {
    setLoading(true);
    setNotLinked(false);
    try {
      const { data } = await axios.get(`${API}/api/attendance/my-attendance`, { params: { month: m } });
      setMonthData(data);
    } catch (e) {
      const code = e.response?.status;
      if (code === 404 || code === 400 || e.response?.data?.detail?.toLowerCase()?.includes('not linked')) {
        setNotLinked(true);
        setMonthData(null);
      } else {
        setMonthData(null);
      }
    } finally { setLoading(false); }
  }, []);

  const fetchYearly = useCallback(async (y) => {
    setLoading(true);
    setNotLinked(false);
    try {
      const { data } = await axios.get(`${API}/api/attendance/my-attendance`, { params: { year: y } });
      setYearData(data);
    } catch (e) {
      const code = e.response?.status;
      if (code === 404 || code === 400 || e.response?.data?.detail?.toLowerCase()?.includes('not linked')) {
        setNotLinked(true);
        setYearData(null);
      } else {
        setYearData(null);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'monthly') fetchMonthly(month); }, [tab, month, fetchMonthly]);
  useEffect(() => { if (tab === 'yearly')  fetchYearly(year);  }, [tab, year,  fetchYearly]);

  // ─── Leave & Alerts (operator self-service) ───
  const [balance, setBalance] = useState(null);
  const [myReqs, setMyReqs] = useState([]);
  const [myAlerts, setMyAlerts] = useState(null); // { alerts, grace_limit, grace_used, grace_remaining, deduction_count }
  const [lvLoading, setLvLoading] = useState(false);
  const [reqDialog, setReqDialog] = useState(false);
  const [reqForm, setReqForm] = useState({ type: 'leave', date: '', expected_time: '', pl_days: 1, reason: '' });
  const [reqSubmitting, setReqSubmitting] = useState(false);

  const loadBalance = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/leave/my-balance`);
      setBalance(data || null);
    } catch { setBalance(null); }
  }, []);

  const loadMyReqs = useCallback(async () => {
    setLvLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/leave/my-requests`);
      setMyReqs(Array.isArray(data) ? data : []);
    } catch { setMyReqs([]); }
    finally { setLvLoading(false); }
  }, []);

  const loadMyAlerts = useCallback(async (m, y) => {
    try {
      const { data } = await axios.get(`${API}/api/attendance/my-alerts`, { params: { month: m, year: y } });
      setMyAlerts(data || null);
    } catch { setMyAlerts(null); }
  }, []);

  useEffect(() => { loadBalance(); loadMyReqs(); }, [loadBalance, loadMyReqs]);
  useEffect(() => {
    const [yy, mm] = month.split('-').map(Number);
    if (tab === 'alerts') loadMyAlerts(mm, yy);
  }, [tab, month, loadMyAlerts]);

  const openNewRequest = () => {
    setReqForm({ type: 'leave', date: '', expected_time: '', pl_days: 1, reason: '' });
    setReqDialog(true);
  };

  const submitRequest = async () => {
    // basic client-side validation
    if (!reqForm.type) { toast.error('Pick a request type'); return; }
    if (['leave', 'late_coming', 'early_going'].includes(reqForm.type) && !reqForm.date) {
      toast.error('Date is required'); return;
    }
    if (['late_coming', 'early_going'].includes(reqForm.type) && !reqForm.expected_time) {
      toast.error('Expected time is required'); return;
    }
    if (reqForm.type === 'encash' && (!reqForm.pl_days || Number(reqForm.pl_days) <= 0)) {
      toast.error('PL days must be > 0'); return;
    }
    setReqSubmitting(true);
    try {
      const payload = { type: reqForm.type, reason: reqForm.reason || '' };
      if (['leave', 'late_coming', 'early_going'].includes(reqForm.type)) payload.date = reqForm.date;
      if (['late_coming', 'early_going'].includes(reqForm.type)) payload.expected_time = reqForm.expected_time;
      if (reqForm.type === 'encash') payload.pl_days = Number(reqForm.pl_days);
      await axios.post(`${API}/api/leave/request`, payload);
      toast.success('Request submitted');
      setReqDialog(false);
      loadMyReqs();
      loadBalance();
    } catch (e) {
      toast.error(parseApiError(e, 'Failed to submit'));
    } finally { setReqSubmitting(false); }
  };

  const typeLabel = (t) => ({ leave: 'Leave', late_coming: 'Late', early_going: 'Early', encash: 'Encash' }[t] || t);
  const reqStatusBadge = (s) => {
    if (s === 'approved') return <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px]">Approved</Badge>;
    if (s === 'rejected') return <Badge className="bg-red-100 text-red-700 border-none text-[10px]">Rejected</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 border-none text-[10px]">Pending</Badge>;
  };

  const shiftMonth = (delta) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }, [month]);

  if (notLinked) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight">My Attendance</h1>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-8 text-center space-y-3">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-bold">Account Not Linked</h2>
            <p className="text-muted-foreground">Your account is not linked to a biometric ID.<br />Please contact your administrator to link your account.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">My Attendance</h1>
          {monthData?.employee?.name && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <User className="w-4 h-4" /> {monthData.employee.name}
              {monthData.employee.biometric_id && <span className="font-mono text-xs">#{monthData.employee.biometric_id}</span>}
              {Array.isArray(monthData.employee.shifts) && monthData.employee.shifts.length > 0 && (
                <span className="flex gap-1">
                  {monthData.employee.shifts.map(s => <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{s}</Badge>)}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* PL Balance card */}
      {balance && (
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">PL Balance ({balance.year})</p>
                <p className="text-3xl font-bold text-purple-700 mt-0.5">{balance.available_pl ?? 0} <span className="text-sm font-normal text-muted-foreground">/ {balance.total_pl ?? 0} days</span></p>
              </div>
              <div className="flex gap-2 text-xs">
                <Badge variant="outline" className="text-rose-700 border-rose-200">Used: {balance.used_pl ?? 0}</Badge>
                <Badge variant="outline" className="text-purple-700 border-purple-200">Encashed: {balance.encashed_pl ?? 0}</Badge>
              </div>
            </div>
            <Button onClick={openNewRequest} data-testid="new-request-btn">
              <Plus className="w-4 h-4 mr-2" /> New Request
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="my-attendance-tabs">
          <TabsTrigger value="monthly" data-testid="tab-monthly"><Calendar className="w-4 h-4 mr-2" /> Monthly</TabsTrigger>
          <TabsTrigger value="yearly" data-testid="tab-yearly"><Timer className="w-4 h-4 mr-2" /> Yearly</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests"><FileText className="w-4 h-4 mr-2" /> My Requests</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts"><AlertTriangle className="w-4 h-4 mr-2" /> My Alerts</TabsTrigger>
        </TabsList>

        {/* MONTHLY */}
        <TabsContent value="monthly" className="space-y-4 mt-4">
          <Card className="border"><CardContent className="p-4 flex items-center justify-center gap-4">
            <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} data-testid="prev-month-btn"><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold min-w-[160px] text-center">{monthLabel}</h2>
            <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} disabled={(() => { const [y, m] = month.split('-').map(Number); return y >= today.getFullYear() && m >= today.getMonth() + 1; })()} data-testid="next-month-btn"><ChevronRight className="w-4 h-4" /></Button>
          </CardContent></Card>

          {loading ? (
            <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
          ) : !monthData ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No data for {monthLabel}</CardContent></Card>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Present" value={monthData.summary?.present} color={COLOR.present} icon={CheckCircle} />
                <StatCard label="Late" value={monthData.summary?.late} color={COLOR.late} icon={Clock} />
                <StatCard label="Absent" value={monthData.summary?.absent} color={COLOR.absent} icon={XCircle} />
                <StatCard label="Hours" value={Number(monthData.summary?.total_hours ?? 0).toFixed(1)} suffix="h" color={COLOR.hours} icon={Timer} />
              </div>

              <Card className="border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs font-semibold uppercase">Date</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">Day</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">Status</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">IN</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">OUT</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">Hours</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">Shift</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(monthData.daily || []).map((d) => (
                      <TableRow key={d.date} data-testid={`day-${d.date}`}>
                        <TableCell className="font-mono text-xs">{d.date?.slice(-5) /* MM-DD */ || '-'}</TableCell>
                        <TableCell className="text-sm">{d.weekday || '-'}</TableCell>
                        <TableCell><StatusBadge status={d.status} /></TableCell>
                        <TableCell className="font-mono text-sm">{fmtTime(d.in_time)}</TableCell>
                        <TableCell className="font-mono text-sm">{fmtTime(d.out_time)}</TableCell>
                        <TableCell className="font-mono text-sm">{d.hours ? `${Number(d.hours).toFixed(1)}h` : '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.shift || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>

        {/* YEARLY */}
        <TabsContent value="yearly" className="space-y-4 mt-4">
          <Card className="border"><CardContent className="p-4 flex items-center justify-center gap-4">
            <Button variant="outline" size="sm" onClick={() => setYear(y => y - 1)} data-testid="prev-year-btn"><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold min-w-[100px] text-center">{year}</h2>
            <Button variant="outline" size="sm" onClick={() => setYear(y => y + 1)} disabled={year >= today.getFullYear()} data-testid="next-year-btn"><ChevronRight className="w-4 h-4" /></Button>
          </CardContent></Card>

          {loading ? (
            <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
          ) : !yearData ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No data for {year}</CardContent></Card>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Present" value={yearData.totals?.present} color={COLOR.present} icon={CheckCircle} />
                <StatCard label="Late" value={yearData.totals?.late} color={COLOR.late} icon={Clock} />
                <StatCard label="Absent" value={yearData.totals?.absent} color={COLOR.absent} icon={XCircle} />
                <StatCard label="Hours" value={Number(yearData.totals?.total_hours ?? 0).toFixed(1)} suffix="h" color={COLOR.hours} icon={Timer} />
              </div>

              <Card className="border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs font-semibold uppercase">Month</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-center">Present</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-center">Late</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-center">Absent</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-center">Hours</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-right">View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(yearData.monthly_stats || {}).sort(([a], [b]) => a.localeCompare(b)).map(([m, stats]) => {
                      const [yy, mm] = m.split('-').map(Number);
                      const label = `${MONTHS[mm - 1]} ${yy}`;
                      return (
                        <TableRow key={m} className="cursor-pointer hover:bg-muted/30" onClick={() => { setMonth(m); setTab('monthly'); }} data-testid={`year-row-${m}`}>
                          <TableCell className="font-medium">{label}</TableCell>
                          <TableCell className="text-center font-bold text-emerald-600">{stats.present || 0}</TableCell>
                          <TableCell className="text-center font-bold text-amber-600">{stats.late || 0}</TableCell>
                          <TableCell className="text-center font-bold text-red-600">{stats.absent || 0}</TableCell>
                          <TableCell className="text-center font-bold text-blue-600">{Number(stats.total_hours || 0).toFixed(1)}h</TableCell>
                          <TableCell className="text-right"><ChevronRight className="w-4 h-4 inline text-muted-foreground" /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>
        {/* MY REQUESTS */}
        <TabsContent value="requests" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-sm">My Leave Requests</h3>
            <Button variant="outline" size="sm" onClick={loadMyReqs} disabled={lvLoading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${lvLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
          <Card className="border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Details</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lvLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                ) : myReqs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No requests yet. Click "New Request" to submit one.</TableCell></TableRow>
                ) : myReqs.map((r) => (
                  <TableRow key={r._id} data-testid={`my-req-${r._id}`}>
                    <TableCell><Badge variant="outline" className="text-[10px]">{typeLabel(r.type)}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{r.date || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.expected_time && <>Expected: <span className="font-mono">{r.expected_time}</span></>}
                      {r.pl_days && <>PL: {r.pl_days} day(s)</>}
                      {!r.expected_time && !r.pl_days && '-'}
                    </TableCell>
                    <TableCell className="text-xs max-w-[180px] truncate" title={r.reason}>{r.reason || '-'}</TableCell>
                    <TableCell>{reqStatusBadge(r.status)}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground italic">{r.remarks || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* MY ALERTS */}
        <TabsContent value="alerts" className="space-y-4 mt-4">
          <Card className="border"><CardContent className="p-4 flex items-center justify-center gap-4">
            <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold min-w-[160px] text-center">{monthLabel}</h2>
            <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} disabled={(() => { const [y, m] = month.split('-').map(Number); return y >= today.getFullYear() && m >= today.getMonth() + 1; })()}><ChevronRight className="w-4 h-4" /></Button>
          </CardContent></Card>

          {!myAlerts ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">No alert data for {monthLabel}</CardContent></Card>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4">
                  <p className="text-xs uppercase text-muted-foreground">Grace Used</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{myAlerts.grace_used ?? 0} <span className="text-sm font-normal text-muted-foreground">/ {myAlerts.grace_limit ?? 3}</span></p>
                </CardContent></Card>
                <Card className="border-l-4 border-l-amber-500"><CardContent className="p-4">
                  <p className="text-xs uppercase text-muted-foreground">Grace Remaining</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">{myAlerts.grace_remaining ?? 0}</p>
                </CardContent></Card>
                <Card className="border-l-4 border-l-red-500"><CardContent className="p-4">
                  <p className="text-xs uppercase text-muted-foreground">Deductions</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{myAlerts.deduction_count ?? 0}</p>
                </CardContent></Card>
              </div>

              <Card className="border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Expected</TableHead>
                      <TableHead className="text-xs">Actual</TableHead>
                      <TableHead className="text-xs text-right">Duration</TableHead>
                      <TableHead className="text-xs text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(myAlerts.alerts || []).length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">No late/early alerts this month</TableCell></TableRow>
                    ) : (myAlerts.alerts || []).map((a, i) => (
                      <TableRow key={a._id || i}>
                        <TableCell className="font-mono text-xs">{a.date}</TableCell>
                        <TableCell><Badge className={`border-none text-[10px] ${a.type === 'late' ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>{a.type}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{a.expected_time}</TableCell>
                        <TableCell className="font-mono text-xs">{a.actual_time}</TableCell>
                        <TableCell className="text-right font-mono text-amber-700">{a.duration_minutes} min</TableCell>
                        <TableCell className="text-center">
                          {a.is_grace && <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px]">Grace</Badge>}
                          {a.is_deducted && <Badge className="bg-red-100 text-red-700 border-none text-[10px]">Deducted</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* New Request Dialog */}
      <Dialog open={reqDialog} onOpenChange={setReqDialog}>
        <DialogContent className="max-w-md" data-testid="new-request-dialog">
          <DialogHeader><DialogTitle>New Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Type *</Label>
              <Select value={reqForm.type} onValueChange={(v) => setReqForm(f => ({ ...f, type: v }))}>
                <SelectTrigger data-testid="req-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="leave">Leave (uses 1 PL)</SelectItem>
                  <SelectItem value="late_coming">Late Coming (inform)</SelectItem>
                  <SelectItem value="early_going">Early Going (inform)</SelectItem>
                  <SelectItem value="encash">Encash PL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {['leave', 'late_coming', 'early_going'].includes(reqForm.type) && (
              <div>
                <Label className="text-xs">Date *</Label>
                <Input type="date" value={reqForm.date} onChange={(e) => setReqForm(f => ({ ...f, date: e.target.value }))} data-testid="req-date" />
              </div>
            )}
            {['late_coming', 'early_going'].includes(reqForm.type) && (
              <div>
                <Label className="text-xs">Expected Time *</Label>
                <Input type="time" value={reqForm.expected_time} onChange={(e) => setReqForm(f => ({ ...f, expected_time: e.target.value }))} data-testid="req-expected-time" />
              </div>
            )}
            {reqForm.type === 'encash' && (
              <div>
                <Label className="text-xs">PL Days to Encash *</Label>
                <Input type="number" min="1" max={balance?.available_pl || 1} value={reqForm.pl_days} onChange={(e) => setReqForm(f => ({ ...f, pl_days: e.target.value }))} data-testid="req-pl-days" />
                <p className="text-[11px] text-muted-foreground mt-0.5">Available: {balance?.available_pl ?? 0} PL</p>
              </div>
            )}
            <div>
              <Label className="text-xs">Reason</Label>
              <Input value={reqForm.reason} onChange={(e) => setReqForm(f => ({ ...f, reason: e.target.value }))} placeholder="Optional note..." data-testid="req-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqDialog(false)}>Cancel</Button>
            <Button onClick={submitRequest} disabled={reqSubmitting} data-testid="req-submit-btn">
              {reqSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyAttendance;
