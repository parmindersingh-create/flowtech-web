import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Activity, Cpu, AlertTriangle, Briefcase, Package, ArrowRight, Loader2,
  Clock, Play, Square, Tv, Bell, ClipboardList, Sun, Moon,
  Star, TrendingDown, ArrowRightLeft, UserCheck, CheckCircle, Brain, Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Dashboard = () => {
  const { user } = useAuth();
  const [machineSummary, setMachineSummary] = useState(null);
  const [pendingBreakdowns, setPendingBreakdowns] = useState(0);
  const [pendingRoles, setPendingRoles] = useState(0);
  const [stats, setStats] = useState(null);
  const [activeWork, setActiveWork] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [shiftInfo, setShiftInfo] = useState(null);
  const [operatorStats, setOperatorStats] = useState(null);
  const [dailyProduction, setDailyProduction] = useState(null);
  const [pendingHandovers, setPendingHandovers] = useState([]);
  const [aiInsights, setAiInsights] = useState(null);
  const [takeoverJobs, setTakeoverJobs] = useState([]);
  const [isTakeoverOpen, setIsTakeoverOpen] = useState(false);
  const [takeoverRemarks, setTakeoverRemarks] = useState('');
  const [selectedTakeover, setSelectedTakeover] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Auto-end expired work on page load
    axios.post(`${API_URL}/api/shift/check-and-auto-end`).catch(() => {});
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseStartTime = (str) => {
    if (!str) return null;
    try {
      const [datePart, timePart, ampm] = str.split(' ');
      const [day, month, year] = datePart.split('/');
      let [hours, minutes] = timePart.split(':').map(Number);
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      return new Date(year, month - 1, day, hours, minutes);
    } catch { return null; }
  };

  const fetchData = async () => {
    try {
      const [summaryRes, statsRes, activeRes, lowStockRes, notifRes, shiftRes, opStatsRes, handoverRes, dailyProdRes, activeJobsRes, aiRes, breakdownsRes] = await Promise.all([
        axios.get(`${API_URL}/api/machine-status/summary-public`, { withCredentials: false }),
        axios.get(`${API_URL}/api/stats`).catch(() => ({ data: {} })),
        axios.get(`${API_URL}/api/production/active`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/inventory/low-stock`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/notifications`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/shift/current`).catch(() => ({ data: null })),
        axios.get(`${API_URL}/api/operator-stats/top`).catch(() => ({ data: null })),
        axios.get(`${API_URL}/api/production/pending-handovers`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/daily-production-summary`).catch(() => ({ data: null })),
        axios.get(`${API_URL}/api/jobs/active`).catch(() => ({ data: null })),
        axios.get(`${API_URL}/api/ai/quick-insights`).catch(() => ({ data: null })),
        axios.get(`${API_URL}/api/breakdowns`).catch(() => ({ data: [] })),
      ]);
      setMachineSummary(summaryRes.data);
      // Count only truly pending (unresolved) breakdowns for the red alert
      const bdList = Array.isArray(breakdownsRes.data) ? breakdownsRes.data : (breakdownsRes.data?.breakdowns || []);
      setPendingBreakdowns(bdList.filter(b => (b.status || 'pending') !== 'resolved').length);

      // Pending role assignments (admin only — silently ignored on 403 by the .catch)
      if (user?.role === 'Admin' || user?.role === 'admin' || user?.is_admin) {
        axios.get(`${API_URL}/api/users`).then(r => {
          const users = Array.isArray(r.data) ? r.data : (r.data?.users || []);
          setPendingRoles(users.filter(u => !u.role || String(u.role).toLowerCase() === 'pending').length);
        }).catch(() => setPendingRoles(0));
      }
      setStats(statsRes.data || {});

      // Active work: Use /api/jobs/active if available (backend already filters to running machines)
      let work = [];
      if (activeJobsRes.data && Array.isArray(activeJobsRes.data) && activeJobsRes.data.length > 0) {
        work = activeJobsRes.data;
      } else {
        // Fallback: filter production/active against running machines
        const runningMachineNames = new Set(
          (summaryRes.data?.machines || []).filter(m => m.status === 'running').map(m => (m.machine_name || '').toLowerCase())
        );
        const runningMachineIds = new Set(
          (summaryRes.data?.machines || []).filter(m => m.status === 'running').map(m => m.machine_id)
        );
        work = Array.isArray(activeRes.data) ? activeRes.data : [];
        if (work.length > 0 && runningMachineNames.size > 0) {
          work = work.filter(w => runningMachineNames.has((w.machine_name || '').toLowerCase()) || runningMachineIds.has(w.machine_id));
        }
        if (work.length === 0 && summaryRes.data?.machines) {
          work = summaryRes.data.machines.filter(m => m.status === 'running').map(m => ({
            entry_id: m.entry_id || m.machine_id, machine_id: m.machine_id, machine_name: m.machine_name,
            category: m.category, operator_name: m.operator_name, job_details: m.job_details,
            start_time: m.start_time, started_at: parseStartTime(m.start_time)?.toISOString(),
          }));
        }
      }
      setActiveWork(work);

      setLowStock(Array.isArray(lowStockRes.data) ? lowStockRes.data : []);
      setNotifications(Array.isArray(notifRes.data) ? notifRes.data.filter(n => !n.read).slice(0, 5) : []);
      setShiftInfo(shiftRes.data);
      setOperatorStats(opStatsRes.data);
      setPendingHandovers(Array.isArray(handoverRes.data) ? handoverRes.data : []);
      setDailyProduction(dailyProdRes.data);
      setAiInsights(aiRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openTakeoverModal = async () => {
    // Use running machines from machineSummary directly as takeover source
    const runningMachines = (machineSummary?.machines || []).filter(m => m.status === 'running');
    
    // Try the authenticated endpoint first
    try {
      const { data } = await axios.get(`${API_URL}/api/production/available-for-takeover`);
      const jobs = Array.isArray(data) ? data : [];
      if (jobs.length > 0) {
        setTakeoverJobs(jobs);
        setIsTakeoverOpen(true);
        return;
      }
    } catch { /* fallback below */ }

    // Fallback: build takeover list from public machine status data
    const jobs = runningMachines.map(m => ({
      entry_id: m.entry_id || m.machine_id,
      machine_id: m.machine_id,
      machine_name: m.machine_name,
      category: m.category,
      operator_name: m.operator_name,
      job_details: m.job_details,
      start_time: m.start_time,
      started_at: parseStartTime(m.start_time)?.toISOString(),
      is_own_work: (m.operator_name || '').toLowerCase() === (user?.name || '').toLowerCase(),
    }));
    setTakeoverJobs(jobs);
    setIsTakeoverOpen(true);
  };

  const handleTakeover = async (job) => {
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/production/takeover/${job.entry_id}`, { remarks: takeoverRemarks });
      toast.success(`Took over ${job.machine_name} from ${job.operator_name}`);
      setIsTakeoverOpen(false);
      setTakeoverRemarks('');
      setSelectedTakeover(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to take over');
    } finally { setSubmitting(false); }
  };

  const handleAcceptHandover = async (handover) => {
    try {
      await axios.post(`${API_URL}/api/production/handover/accept/${handover.handover_id || handover._id}`);
      toast.success('Handover accepted');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to accept handover');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const summary = machineSummary?.summary || { total: 0, running: 0, idle: 0, breakdown: 0 };

  // Shift helpers
  const getShiftTimeRemaining = () => {
    if (!shiftInfo?.shift_end) return null;
    try {
      const end = new Date(shiftInfo.shift_end);
      const now = new Date();
      const diff = end - now;
      if (diff <= 0) return 'Shift ended';
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      return `${h}h ${m}m left`;
    } catch { return null; }
  };

  const isMorningShift = () => {
    if (shiftInfo?.shift_type) return shiftInfo.shift_type.toLowerCase().includes('morning') || shiftInfo.shift_type.toLowerCase().includes('day');
    const hour = new Date().getHours();
    return hour >= 8 && hour < 20;
  };

  const getCategoryColor = (category) => {
    const c = (category || '').toLowerCase();
    if (c.includes('vmc')) return 'bg-emerald-100 text-emerald-700';
    if (c.includes('cnc')) return 'bg-blue-100 text-blue-700';
    if (c.includes('moulding') || c.includes('molding')) return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Link to="/dashboard/notifications">
            <Button variant="ghost" size="icon" className="relative" data-testid="notifications-btn">
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </div>

      {/* Pending Role Assignments (admin only) */}
      {pendingRoles > 0 && (
        <Link to="/dashboard/users" data-testid="pending-roles-link">
          <Card className="border-2 border-amber-400 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors">
            <CardContent className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center text-amber-800 font-bold">{pendingRoles}</div>
                <div>
                  <p className="font-semibold text-sm text-amber-900">Pending Role Assignment{pendingRoles > 1 ? 's' : ''}</p>
                  <p className="text-xs text-amber-800">{pendingRoles} user{pendingRoles > 1 ? 's are' : ' is'} waiting for you to set their role.</p>
                </div>
              </div>
              <span className="text-xs text-amber-700 font-semibold">Assign →</span>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Shift Info Card */}
      <Card className="border border-border bg-gradient-to-r from-card to-muted/30" data-testid="shift-info-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isMorningShift() ? (
                <div className="w-10 h-10 bg-amber-100 flex items-center justify-center rounded-full">
                  <Sun className="w-5 h-5 text-amber-600" />
                </div>
              ) : (
                <div className="w-10 h-10 bg-indigo-100 flex items-center justify-center rounded-full">
                  <Moon className="w-5 h-5 text-indigo-600" />
                </div>
              )}
              <div>
                <p className="font-semibold text-sm">
                  {isMorningShift() ? 'Morning Shift' : 'Night Shift'}
                  <Badge className="ml-2 border-none text-xs" variant="outline">
                    {isMorningShift() ? '8:00 AM - 8:00 PM' : '8:00 PM - 6:00 AM'}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {shiftInfo?.shift_name || (isMorningShift() ? 'Day Operations' : 'Night Operations')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium flex items-center gap-1 justify-end">
                <Clock className="w-3.5 h-3.5" />
                {getShiftTimeRemaining() || (isMorningShift() ? 'Ends at 8:00 PM' : 'Ends at 6:00 AM')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Insights Card */}
      {aiInsights && aiInsights.total_issues > 0 && (
        <Card className="border border-amber-200 bg-amber-50/20" data-testid="ai-insights-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-amber-600" />
                <span className="font-semibold text-sm">AI Insights</span>
                <Badge className="bg-amber-100 text-amber-700 border-none text-xs">{aiInsights.total_issues} issues</Badge>
              </div>
              <Link to="/dashboard/ai-audit"><Button variant="ghost" size="sm" className="text-xs">View Full Report <ArrowRight className="w-3 h-3 ml-1" /></Button></Link>
            </div>
            <div className="space-y-1.5">
              {(aiInsights.entry_issues || []).map((issue, i) => (
                <div key={`e${i}`} className="flex items-center gap-2 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <span className="text-muted-foreground">{issue.message}</span>
                </div>
              ))}
              {(aiInsights.tool_alerts || []).map((alert, i) => (
                <div key={`t${i}`} className="flex items-center gap-2 text-xs">
                  <Shield className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                  <span className="text-muted-foreground">{alert.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operator Stats Card */}
      {operatorStats && (operatorStats.star_operator || operatorStats.lazy_operator || operatorStats.needs_improvement) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="operator-stats-card">
          {operatorStats.star_operator && (
            <Card className="border border-emerald-200 bg-emerald-50/30">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-100 flex items-center justify-center rounded-full flex-shrink-0">
                  <Star className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Star Operator</p>
                  <p className="font-bold text-lg">{operatorStats.star_operator.name}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>Score: {operatorStats.star_operator.score ?? operatorStats.star_operator.active_score ?? '-'}</span>
                    <span>Entries: {operatorStats.star_operator.entries ?? operatorStats.star_operator.total_entries ?? 0}</span>
                    <span>Accuracy: {operatorStats.star_operator.accuracy ?? '-'}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {(operatorStats.lazy_operator || operatorStats.needs_improvement) && (
            <Card className="border border-amber-200 bg-amber-50/30">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-100 flex items-center justify-center rounded-full flex-shrink-0">
                  <TrendingDown className="w-6 h-6 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Needs Improvement</p>
                  <p className="font-bold text-lg">{(operatorStats.lazy_operator || operatorStats.needs_improvement).name}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>Score: {(operatorStats.lazy_operator || operatorStats.needs_improvement).score ?? (operatorStats.lazy_operator || operatorStats.needs_improvement).active_score ?? '-'}</span>
                    <span>System Ended: {(operatorStats.lazy_operator || operatorStats.needs_improvement).system_ended ?? (operatorStats.lazy_operator || operatorStats.needs_improvement).auto_ended_count ?? 0}</span>
                    <span>Accuracy: {(operatorStats.lazy_operator || operatorStats.needs_improvement).accuracy ?? '-'}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to={pendingBreakdowns > 0 ? '/dashboard/breakdown' : '/dashboard/machines'} data-testid="stat-total-machines-link">
        <Card className={`border ${pendingBreakdowns > 0 ? 'border-red-500 border-2 bg-red-50/50 cursor-pointer' : 'border-border'}`} data-testid="stat-total-machines">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className={`text-xs font-semibold uppercase tracking-wider ${pendingBreakdowns > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>{pendingBreakdowns > 0 ? `⚠ ${pendingBreakdowns} Pending Breakdown${pendingBreakdowns > 1 ? 's' : ''}` : 'Total Machines'}</CardTitle>
            <Cpu className={`w-4 h-4 ${pendingBreakdowns > 0 ? 'text-red-600' : 'text-primary'}`} />
          </CardHeader>
          <CardContent className="pt-0">
            <div className={`text-3xl font-extrabold ${pendingBreakdowns > 0 ? 'text-red-700' : ''}`}>{summary.total}</div>
            <div className="flex gap-2 mt-1 text-xs flex-wrap">
              <span className="text-emerald-600">{summary.running} run</span>
              <span className="text-amber-600">{summary.idle} idle</span>
              {pendingBreakdowns > 0 && <span className="text-red-600 font-bold">{pendingBreakdowns} pending — click to view</span>}
            </div>
          </CardContent>
        </Card>
        </Link>

        <Card className="border border-border" data-testid="stat-active-jobs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Jobs</CardTitle>
            <Briefcase className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold">{summary.running || activeWork.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">On running machines</p>
          </CardContent>
        </Card>

        <Card className="border border-border" data-testid="stat-production">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Production</CardTitle>
            <ClipboardList className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold">{stats.today_production || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Pieces produced</p>
          </CardContent>
        </Card>

        <Card className={`border ${lowStock.length > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-border'}`} data-testid="stat-low-stock">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Low Stock</CardTitle>
            <AlertTriangle className={`w-4 h-4 ${lowStock.length > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent className="pt-0">
            <div className={`text-3xl font-extrabold ${lowStock.length > 0 ? 'text-amber-600' : ''}`}>{lowStock.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Items need restock</p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Production Summary */}
      {dailyProduction?.summary && (
        <div data-testid="daily-production-summary">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Today's Production</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {['cnc', 'vmc', 'moulding'].map(cat => {
              const d = dailyProduction.summary[cat];
              if (!d) return null;
              const colors = { cnc: 'blue', vmc: 'emerald', moulding: 'purple' };
              const c = colors[cat] || 'gray';
              return (
                <Card key={cat} className="border border-border" data-testid={`prod-${cat}`}>
                  <CardContent className="p-4">
                    <p className={`text-xs font-bold uppercase tracking-wider text-${c}-600 mb-2`}>{cat.toUpperCase()}</p>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-extrabold text-${c}-600`}>{d.running || 0}</span>
                      <span className="text-sm text-muted-foreground">/ {d.count || 0} running</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Ended: {d.ended || 0}</span>
                      <span>Qty: <span className="font-bold text-foreground">{d.total_qty || 0}</span></span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {dailyProduction.summary.total && (
              <Card className="border border-border bg-muted/30" data-testid="prod-total">
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground mb-2">TOTAL</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold">{dailyProduction.summary.total.running || 0}</span>
                    <span className="text-sm text-muted-foreground">/ {dailyProduction.summary.total.count || 0} running</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Ended: {dailyProduction.summary.total.ended || 0}</span>
                    <span>Qty: <span className="font-bold text-foreground">{dailyProduction.summary.total.total_qty || 0}</span></span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Link to="/dashboard/start-work">
          <Button className="w-full h-auto py-4 flex flex-col gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="start-work-btn">
            <Play className="w-6 h-6" />
            <span className="font-semibold">Start Work</span>
          </Button>
        </Link>
        <Link to="/dashboard/end-work">
          <Button className="w-full h-auto py-4 flex flex-col gap-2 bg-blue-600 hover:bg-blue-700" data-testid="end-work-btn">
            <Square className="w-6 h-6" />
            <span className="font-semibold">End Work</span>
          </Button>
        </Link>
        <Button onClick={openTakeoverModal} className="w-full h-auto py-4 flex flex-col gap-2 bg-purple-600 hover:bg-purple-700" data-testid="takeover-btn">
          <ArrowRightLeft className="w-6 h-6" />
          <span className="font-semibold">Take Over</span>
        </Button>
        <Link to="/dashboard/breakdown">
          <Button className="w-full h-auto py-4 flex flex-col gap-2 bg-red-600 hover:bg-red-700" data-testid="breakdown-btn">
            <AlertTriangle className="w-6 h-6" />
            <span className="font-semibold">Breakdown</span>
          </Button>
        </Link>
        <Link to="/tv" target="_blank">
          <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2" data-testid="tv-btn">
            <Tv className="w-6 h-6" />
            <span className="font-semibold">TV Display</span>
          </Button>
        </Link>
      </div>

      {/* Pending Handovers */}
      {pendingHandovers.length > 0 && (
        <Card className="border border-purple-200 bg-purple-50/30" data-testid="pending-handovers-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-purple-600" />
              Pending Handovers ({pendingHandovers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingHandovers.map((h, i) => (
                <div key={h.handover_id || h._id || i} className="flex items-center justify-between p-3 bg-background rounded border border-border">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-purple-600" />
                      <span className="font-medium">{h.from_operator || h.operator_name}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">You</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {h.machine_name} - {h.job_details}
                    </p>
                    {h.remarks && <p className="text-xs text-muted-foreground italic mt-0.5">{h.remarks}</p>}
                  </div>
                  <Button size="sm" onClick={() => handleAcceptHandover(h)} className="bg-purple-600 hover:bg-purple-700" data-testid={`accept-handover-${i}`}>
                    <CheckCircle className="w-4 h-4 mr-1" /> Accept
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Work - Clickable Category Tabs */}
      {activeWork.length > 0 && (
        <ActiveWorkTabs activeWork={activeWork} />
      )}

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <Card className="border border-amber-300 bg-amber-50/50" data-testid="low-stock-alert">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Low Stock Alerts
            </CardTitle>
            <Link to="/dashboard/storage">
              <Button variant="ghost" size="sm" className="text-amber-600">View All <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStock.slice(0, 8).map((item, i) => (
                <Badge key={i} variant="outline" className="border-amber-300 text-amber-700">
                  {item.name || item.item_name} ({item.quantity || 0})
                </Badge>
              ))}
              {lowStock.length > 8 && <Badge variant="outline" className="border-amber-300 text-amber-700">+{lowStock.length - 8} more</Badge>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Machine Status Grid */}
      <Card className="border border-border" data-testid="machine-status-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Machine Status</CardTitle>
          <Link to="/dashboard/machines">
            <Button variant="ghost" size="sm">View All <ArrowRight className="w-4 h-4 ml-1" /></Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {(machineSummary?.machines || []).slice(0, 8).map((machine) => {
              const cat = machine.category || '';
              const url = `/dashboard/start-work?machine_id=${encodeURIComponent(machine.machine_id || '')}&machine_name=${encodeURIComponent(machine.machine_name || '')}&category=${encodeURIComponent(cat)}`;
              const clickable = machine.status === 'idle';
              const card = (
                <div
                  key={machine.machine_id}
                  className={`p-3 border transition-colors ${
                    machine.status === 'running' ? 'border-emerald-300 bg-emerald-50/50' :
                    machine.status === 'breakdown' ? 'border-red-300 bg-red-50/50' : 'border-border'
                  } ${clickable ? 'cursor-pointer hover:border-primary hover:bg-primary/5' : ''}`}
                  data-testid={`machine-card-${machine.machine_id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{machine.machine_name}</span>
                    <span className={`w-2 h-2 rounded-full ${
                      machine.status === 'running' ? 'bg-emerald-500 animate-pulse' :
                      machine.status === 'breakdown' ? 'bg-red-500' : 'bg-amber-500'
                    }`} />
                  </div>
                  <Badge className={`mt-2 border-none text-xs ${
                    machine.status === 'running' ? 'status-running' :
                    machine.status === 'breakdown' ? 'status-breakdown' : 'status-idle'
                  }`}>{machine.status}</Badge>
                  {machine.status === 'running' && machine.operator_name && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{machine.operator_name}</p>
                  )}
                  {clickable && (
                    <p className="text-[10px] text-primary mt-1 font-semibold">▶ Click to start work</p>
                  )}
                </div>
              );
              return clickable ? (
                <Link key={machine.machine_id} to={url} data-testid={`idle-machine-link-${machine.machine_id}`}>{card}</Link>
              ) : card;
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: '/dashboard/jobs', icon: Briefcase, title: 'Jobs', desc: 'Manage jobs' },
          { to: '/dashboard/machines', icon: Cpu, title: 'Machines', desc: 'View status' },
          { to: '/dashboard/storage', icon: Package, title: 'Storage', desc: 'Inventory' },
          { to: '/dashboard/production', icon: ClipboardList, title: 'Production', desc: 'View entries' },
        ].map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} to={to}>
            <Card className="border border-border hover:bg-muted/50 transition-colors cursor-pointer">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="w-10 h-10 bg-primary/10 flex items-center justify-center rounded">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{title}</h3>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Take Over Dialog */}
      <Dialog open={isTakeoverOpen} onOpenChange={setIsTakeoverOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" /> Take Over Active Job
            </DialogTitle>
          </DialogHeader>
          {takeoverJobs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No jobs available for takeover</p>
          ) : (
            <div className="space-y-3">
              {takeoverJobs.map((job, i) => (
                <div key={job.entry_id || i} className={`p-4 border rounded-lg ${job.is_own_work ? 'opacity-50 border-border' : 'border-border hover:border-primary/50 transition-colors'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`border-none text-xs ${getCategoryColor(job.category)}`}>{job.category || 'Other'}</Badge>
                        <span className="font-bold">{job.machine_name}</span>
                      </div>
                      <p className="text-sm"><span className="text-muted-foreground">Operator:</span> <span className="font-medium">{job.operator_name}</span></p>
                      <p className="text-sm"><span className="text-muted-foreground">Job:</span> {job.job_details}</p>
                      <p className="text-xs text-muted-foreground mt-1">Started: {job.start_time || new Date(job.started_at).toLocaleTimeString()}</p>
                    </div>
                    <div className="ml-4">
                      {job.is_own_work ? (
                        <Badge variant="outline" className="text-xs">Your Work</Badge>
                      ) : selectedTakeover?.entry_id === job.entry_id ? (
                        <div className="space-y-2">
                          <Input
                            placeholder="Remarks (optional)"
                            value={takeoverRemarks}
                            onChange={(e) => setTakeoverRemarks(e.target.value)}
                            className="w-40"
                          />
                          <Button size="sm" onClick={() => handleTakeover(job)} disabled={submitting} className="w-full" data-testid={`confirm-takeover-${i}`}>
                            {submitting && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Confirm
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setSelectedTakeover(job)} data-testid={`takeover-job-${i}`}>
                          Take Over
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ActiveWorkTabs = ({ activeWork }) => {
  const [activeTab, setActiveTab] = useState('all');
  const categories = ['all', ...new Set(activeWork.map(w => w.category || 'Other').filter(Boolean))];
  const filtered = activeTab === 'all' ? activeWork : activeWork.filter(w => (w.category || 'Other') === activeTab);

  const getCatColor = (cat) => {
    const c = (cat || '').toLowerCase();
    if (c.includes('vmc')) return 'bg-emerald-600';
    if (c.includes('cnc')) return 'bg-blue-600';
    if (c.includes('moulding') || c.includes('molding')) return 'bg-purple-600';
    return 'bg-gray-600';
  };

  return (
    <Card className="border border-border" data-testid="active-work-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">Active Work ({activeWork.length})</CardTitle>
        <Link to="/dashboard/active-work">
          <Button variant="ghost" size="sm">View All <ArrowRight className="w-4 h-4 ml-1" /></Button>
        </Link>
      </CardHeader>
      <CardContent>
        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeTab === cat
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              data-testid={`active-tab-${cat}`}
            >
              {cat === 'all' ? `All (${activeWork.length})` : `${cat} (${activeWork.filter(w => (w.category || 'Other') === cat).length})`}
            </button>
          ))}
        </div>
        {/* Active Work Cards */}
        <div className="space-y-3">
          {filtered.map((work, i) => (
            <Link
              key={work.entry_id || i}
              to="/dashboard/active-work"
              className="block"
            >
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded hover:bg-muted/80 transition-colors cursor-pointer" data-testid={`active-work-item-${i}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="font-medium">{work.machine_name}</span>
                    {work.category && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${getCatColor(work.category)}`}>
                        {work.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{work.operator_name} - {work.job_details}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{work.start_time}</p>
                  <Badge className="status-running border-none mt-1">Running</Badge>
                </div>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-4">No active work in this category</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default Dashboard;
