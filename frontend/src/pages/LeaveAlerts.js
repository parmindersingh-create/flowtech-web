import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Loader2, Check, X, RefreshCw, AlertTriangle, Clock,
  ChevronLeft, ChevronRight, Calendar, FileText, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseApiError } from '../utils/parseApiError';

const API = process.env.REACT_APP_BACKEND_URL;
const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const fmtDate = (d) => {
  if (!d) return '-';
  try { return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return String(d); }
};

const typeBadge = (t) => {
  const m = {
    leave: { c: 'bg-blue-100 text-blue-700', l: 'Leave' },
    late_coming: { c: 'bg-amber-100 text-amber-700', l: 'Late' },
    early_going: { c: 'bg-orange-100 text-orange-700', l: 'Early' },
    encash: { c: 'bg-purple-100 text-purple-700', l: 'Encash' },
  };
  const x = m[t] || { c: 'bg-slate-100 text-slate-700', l: t || '-' };
  return <Badge className={`border-none text-[11px] ${x.c}`}>{x.l}</Badge>;
};

const statusBadge = (s) => {
  if (s === 'approved') return <Badge className="bg-emerald-100 text-emerald-700 border-none text-[11px]">Approved</Badge>;
  if (s === 'rejected') return <Badge className="bg-red-100 text-red-700 border-none text-[11px]">Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-none text-[11px]">Pending</Badge>;
};

// ───────────── PENDING REQUESTS TAB ─────────────
const PendingTab = () => {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actDialog, setActDialog] = useState(null); // {req, action}
  const [remarks, setRemarks] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/leave/requests`, { params: { status } });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(parseApiError(e, 'Failed to load requests'));
      setRows([]);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!actDialog) return;
    setActing(true);
    try {
      await axios.post(`${API}/api/leave/approve`, {
        request_id: actDialog.req._id,
        action: actDialog.action,
        remarks: remarks || undefined,
      });
      toast.success(`Request ${actDialog.action}d`);
      setActDialog(null); setRemarks('');
      load();
    } catch (e) {
      toast.error(parseApiError(e, 'Action failed'));
    } finally { setActing(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Filter:</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px] h-9" data-testid="req-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="req-refresh-btn">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card className="border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Details</TableHead>
              <TableHead className="text-xs">Reason</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No {status} requests</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r._id} data-testid={`req-row-${r._id}`}>
                <TableCell className="font-medium">{r.user_name || r.user_id}</TableCell>
                <TableCell>{typeBadge(r.type)}</TableCell>
                <TableCell className="font-mono text-xs">{r.date || '-'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.expected_time && <>Expected: <span className="font-mono">{r.expected_time}</span></>}
                  {r.pl_days && <>PL: {r.pl_days} day(s)</>}
                  {!r.expected_time && !r.pl_days && '-'}
                </TableCell>
                <TableCell className="text-xs max-w-[200px] truncate" title={r.reason}>{r.reason || '-'}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
                <TableCell className="text-right">
                  {r.status === 'pending' ? (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" className="h-7 text-emerald-700 hover:bg-emerald-50" onClick={() => setActDialog({ req: r, action: 'approve' })} data-testid={`approve-${r._id}`}>
                        <Check className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-red-700 hover:bg-red-50" onClick={() => setActDialog({ req: r, action: 'reject' })} data-testid={`reject-${r._id}`}>
                        <X className="w-3.5 h-3.5 mr-1" /> Reject
                      </Button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      {r.approved_by_name && <>by {r.approved_by_name}</>}
                      {r.remarks && <div className="italic">"{r.remarks}"</div>}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!actDialog} onOpenChange={(o) => { if (!o) { setActDialog(null); setRemarks(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="capitalize">{actDialog?.action} request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {actDialog?.req?.user_name} — {actDialog?.req?.type} {actDialog?.req?.date ? `(${actDialog.req.date})` : ''}
            </div>
            <div>
              <Label className="text-xs">Remarks (optional)</Label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add a note..." data-testid="action-remarks" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActDialog(null)}>Cancel</Button>
            <Button onClick={submit} disabled={acting} data-testid="action-confirm-btn">
              {acting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : (actDialog?.action === 'approve' ? <Check className="w-4 h-4 mr-2" /> : <X className="w-4 h-4 mr-2" />)}
              Confirm {actDialog?.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ───────────── PL BALANCES TAB ─────────────
const BalancesTab = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resetDialog, setResetDialog] = useState(null);
  const [resetType, setResetType] = useState('full');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/leave/balance-all`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(parseApiError(e, 'Failed to load balances'));
      setRows([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      (r.name || '').toLowerCase().includes(s) ||
      String(r.biometric_id || '').includes(s) ||
      (r.user_id || '').toLowerCase().includes(s)
    );
  }, [rows, search]);

  const submitReset = async () => {
    if (!resetDialog) return;
    setResetting(true);
    try {
      await axios.post(`${API}/api/leave/reset-pl`, {
        user_id: resetDialog.user_id,
        year: resetDialog.year,
        reset_type: resetType,
      });
      toast.success('PL balance reset');
      setResetDialog(null);
      load();
    } catch (e) {
      toast.error(parseApiError(e, 'Reset failed'));
    } finally { setResetting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Input placeholder="Search by name or biometric id..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" data-testid="bal-search" />
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card className="border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs">Biometric ID</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs text-center">Year</TableHead>
              <TableHead className="text-xs text-right">Total PL</TableHead>
              <TableHead className="text-xs text-right">Used</TableHead>
              <TableHead className="text-xs text-right">Encashed</TableHead>
              <TableHead className="text-xs text-right">Available</TableHead>
              <TableHead className="text-xs text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No balances found</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={`${r.user_id}-${r.year}`} data-testid={`bal-row-${r.biometric_id}`}>
                <TableCell className="font-mono text-xs">{r.biometric_id || '-'}</TableCell>
                <TableCell className="font-medium">{r.name || '-'}</TableCell>
                <TableCell className="text-center text-xs">{r.year}</TableCell>
                <TableCell className="text-right font-mono">{r.total_pl}</TableCell>
                <TableCell className="text-right font-mono text-rose-700">{r.used_pl}</TableCell>
                <TableCell className="text-right font-mono text-purple-700">{r.encashed_pl}</TableCell>
                <TableCell className="text-right font-bold text-emerald-700">{r.available_pl}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => { setResetDialog(r); setResetType('full'); }} data-testid={`reset-${r.biometric_id}`}>
                    <RotateCcw className="w-3 h-3 mr-1" /> Reset
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!resetDialog} onOpenChange={(o) => !o && setResetDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset PL Balance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{resetDialog?.name} — {resetDialog?.year}</p>
            <div>
              <Label className="text-xs">Reset Type</Label>
              <Select value={resetType} onValueChange={setResetType}>
                <SelectTrigger data-testid="reset-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Reset (clear used + encashed)</SelectItem>
                  <SelectItem value="used_only">Reset Used Only</SelectItem>
                  <SelectItem value="encashed_only">Reset Encashed Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialog(null)}>Cancel</Button>
            <Button onClick={submitReset} disabled={resetting} data-testid="reset-confirm-btn">
              {resetting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ───────────── ALERTS TAB ─────────────
const AlertsTab = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState([]);
  const [details, setDetails] = useState({}); // user_id -> alert[]
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/attendance/alerts-summary`, { params: { month, year } });
      setSummary(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(parseApiError(e, 'Failed to load alerts'));
      setSummary([]);
    } finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const process = async () => {
    setProcessing(true);
    try {
      const { data } = await axios.post(`${API}/api/attendance/process-alerts`, { month, year });
      toast.success(`Processed: ${data?.alerts_created ?? 0} alerts created`);
      load();
    } catch (e) {
      toast.error(parseApiError(e, 'Process failed'));
    } finally { setProcessing(false); }
  };

  const loadDetail = async (userId) => {
    if (details[userId]) { setExpanded(expanded === userId ? null : userId); return; }
    try {
      const { data } = await axios.get(`${API}/api/attendance/alerts`, { params: { month, year, user_id: userId } });
      setDetails(d => ({ ...d, [userId]: Array.isArray(data) ? data : [] }));
      setExpanded(userId);
    } catch (e) {
      toast.error(parseApiError(e, 'Failed to load detail'));
    }
  };

  const shiftMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="px-2 min-w-[140px] text-center text-sm font-semibold">{MONTH_LABELS[month - 1]} {year}</div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={process} disabled={processing} data-testid="process-alerts-btn">
            {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
            Process Alerts
          </Button>
        </div>
      </div>

      <Card className="border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs text-right">Late</TableHead>
              <TableHead className="text-xs text-right">Early</TableHead>
              <TableHead className="text-xs text-right">Total Late mins</TableHead>
              <TableHead className="text-xs text-right">Total Early mins</TableHead>
              <TableHead className="text-xs text-right">Grace Used</TableHead>
              <TableHead className="text-xs text-right">Deductions</TableHead>
              <TableHead className="text-xs text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : summary.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No alerts for {MONTH_LABELS[month - 1]} {year}. Click "Process Alerts" to generate.</TableCell></TableRow>
            ) : summary.map((row) => (
              <React.Fragment key={row._id}>
                <TableRow data-testid={`alert-summary-${row._id}`}>
                  <TableCell className="font-medium">{row.user_name || row._id}</TableCell>
                  <TableCell className="text-right font-mono">{row.late_count || 0}</TableCell>
                  <TableCell className="text-right font-mono">{row.early_count || 0}</TableCell>
                  <TableCell className="text-right font-mono text-amber-700">{row.total_late_minutes || 0}</TableCell>
                  <TableCell className="text-right font-mono text-orange-700">{row.total_early_minutes || 0}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-700">{row.grace_used || 0}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-red-700">{row.deduction_count || 0}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => loadDetail(row._id)} data-testid={`expand-${row._id}`}>
                      {expanded === row._id ? 'Hide' : 'Details'}
                    </Button>
                  </TableCell>
                </TableRow>
                {expanded === row._id && details[row._id] && (
                  <TableRow>
                    <TableCell colSpan={8} className="bg-muted/30 p-3">
                      {details[row._id].length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-2">No details</div>
                      ) : (
                        <div className="space-y-1 max-h-[260px] overflow-y-auto">
                          {details[row._id].map((a, i) => (
                            <div key={a._id || i} className="flex flex-wrap items-center gap-2 text-xs py-1 border-b last:border-0">
                              <span className="font-mono">{a.date}</span>
                              <Badge className={`border-none text-[10px] ${a.type === 'late' ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>{a.type}</Badge>
                              <span>Expected: <span className="font-mono">{a.expected_time}</span></span>
                              <span>Actual: <span className="font-mono">{a.actual_time}</span></span>
                              <span className="text-amber-700">{a.duration_minutes} mins</span>
                              {a.is_grace && <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px]">Grace</Badge>}
                              {a.is_deducted && <Badge className="bg-red-100 text-red-700 border-none text-[10px]">Deducted</Badge>}
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

// ───────────── MAIN PAGE ─────────────
const LeaveAlerts = () => {
  return (
    <div className="space-y-4" data-testid="leave-alerts-page">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Leave & Alerts</h1>
        <p className="text-sm text-muted-foreground mt-1">Review leave requests, manage PL balances, and process attendance alerts</p>
      </div>

      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3" data-testid="leave-alerts-tabs">
          <TabsTrigger value="requests" data-testid="tab-requests"><FileText className="w-4 h-4 mr-2" /> Requests</TabsTrigger>
          <TabsTrigger value="balances" data-testid="tab-balances"><Calendar className="w-4 h-4 mr-2" /> PL Balances</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts"><Clock className="w-4 h-4 mr-2" /> Attendance Alerts</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-4"><PendingTab /></TabsContent>
        <TabsContent value="balances" className="mt-4"><BalancesTab /></TabsContent>
        <TabsContent value="alerts" className="mt-4"><AlertsTab /></TabsContent>
      </Tabs>
    </div>
  );
};

export default LeaveAlerts;
