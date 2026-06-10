import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Loader2,
  BarChart3,
  Download,
  Cpu,
  ClipboardList,
  Package,
  Wrench,
  TrendingUp,
  Users,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Reports = () => {
  const [reportSummary, setReportSummary] = useState(null);
  const [stats, setStats] = useState(null);
  const [dailyStatus, setDailyStatus] = useState([]);
  const [machineSummary, setMachineSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingType, setExportingType] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [reportRes, statsRes, dailyRes, machineRes] = await Promise.all([
        axios.get(`${API_URL}/api/reports/summary`).catch(() => ({ data: {} })),
        axios.get(`${API_URL}/api/stats`).catch(() => ({ data: {} })),
        axios.get(`${API_URL}/api/daily-status`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/machine-status/summary-public`, { withCredentials: false }).catch(() => ({ data: {} })),
      ]);
      setReportSummary(reportRes.data || {});
      setStats(statsRes.data || {});
      setDailyStatus(Array.isArray(dailyRes.data) ? dailyRes.data : []);
      setMachineSummary(machineRes.data || {});
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (type) => {
    setExportingType(type);
    try {
      const endpoints = {
        production: '/api/export/production-entries',
        storage: '/api/export/storage',
        tools: '/api/export/tools-inserts',
      };
      const res = await axios.get(`${API_URL}${endpoints[type]}`, { responseType: 'arraybuffer' });
      const contentType = res.headers['content-type'] || '';
      const ext = contentType.includes('csv') ? 'csv' : contentType.includes('excel') || contentType.includes('spreadsheet') ? 'xlsx' : 'csv';
      const blob = new Blob([res.data], { type: contentType || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}_export.${ext}`);
      link.target = '_blank';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      try { const w = window.open(url, '_blank'); if (w) setTimeout(() => { try { w.close(); } catch {} }, 8000); } catch {}
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
      toast.success(`${type} data exported — check Downloads or new tab`);
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to export ${type}`);
    } finally {
      setExportingType(null);
    }
  };

  const summary = machineSummary?.summary || {};
  const machines = machineSummary?.machines || [];
  const utilization = summary.total > 0 ? Math.round((summary.running / summary.total) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Reports</h1>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-border" data-testid="metric-utilization">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Machine Utilization</CardTitle>
            <TrendingUp className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold">{utilization}%</div>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${utilization}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{summary.running || 0} of {summary.total || 0} running</p>
          </CardContent>
        </Card>

        <Card className="border border-border" data-testid="metric-production">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Production</CardTitle>
            <ClipboardList className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold">{stats?.today_production || reportSummary?.today_production || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Pieces produced today</p>
          </CardContent>
        </Card>

        <Card className="border border-border" data-testid="metric-operators">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Operators</CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold">
              {machines.filter(m => m.status === 'running' && m.operator_name).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Currently working</p>
          </CardContent>
        </Card>

        <Card className="border border-border" data-testid="metric-breakdowns">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Breakdowns</CardTitle>
            <Cpu className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className={`text-3xl font-extrabold ${(summary.breakdown || 0) > 0 ? 'text-red-500' : ''}`}>
              {summary.breakdown || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Machines down</p>
          </CardContent>
        </Card>
      </div>

      {/* Machine Status Breakdown */}
      <Card className="border border-border" data-testid="machine-utilization-chart">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Machine Status Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Running */}
            <div className="text-center p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="text-4xl font-extrabold text-emerald-600">{summary.running || 0}</div>
              <p className="text-sm font-semibold text-emerald-700 mt-1">Running</p>
              <div className="mt-3 space-y-1">
                {machines.filter(m => m.status === 'running').map(m => (
                  <div key={m.machine_id} className="text-xs text-emerald-600 flex justify-between px-2">
                    <span className="truncate">{m.machine_name}</span>
                    <span className="font-medium ml-2">{m.operator_name}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Idle */}
            <div className="text-center p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="text-4xl font-extrabold text-amber-600">{summary.idle || 0}</div>
              <p className="text-sm font-semibold text-amber-700 mt-1">Idle</p>
              <div className="mt-3 space-y-1">
                {machines.filter(m => m.status === 'idle').map(m => (
                  <div key={m.machine_id} className="text-xs text-amber-600 px-2 truncate">{m.machine_name}</div>
                ))}
              </div>
            </div>
            {/* Breakdown */}
            <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="text-4xl font-extrabold text-red-600">{summary.breakdown || 0}</div>
              <p className="text-sm font-semibold text-red-700 mt-1">Breakdown</p>
              <div className="mt-3 space-y-1">
                {machines.filter(m => m.status === 'breakdown').map(m => (
                  <div key={m.machine_id} className="text-xs text-red-600 px-2 truncate">{m.machine_name}</div>
                ))}
                {(summary.breakdown || 0) === 0 && (
                  <p className="text-xs text-muted-foreground">No breakdowns</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Operator Performance */}
      <Card className="border border-border" data-testid="operator-performance">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Active Operator Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {machines.filter(m => m.status === 'running' && m.operator_name).length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No active operators currently</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Operator</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Machine</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Category</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Job Details</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {machines.filter(m => m.status === 'running' && m.operator_name).map((m) => (
                  <TableRow key={m.machine_id} className="table-row-hover">
                    <TableCell className="font-semibold">{m.operator_name}</TableCell>
                    <TableCell>{m.machine_name}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{(m.category || '').replace('_', ' ')}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">{m.job_details || '-'}</TableCell>
                    <TableCell><Badge className="bg-emerald-100 text-emerald-700 border-none">Running</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Daily Status */}
      {dailyStatus.length > 0 && (
        <Card className="border border-border" data-testid="daily-status">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Daily Status Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Date</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Machine</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Operator</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Details</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyStatus.slice(0, 20).map((entry, i) => (
                    <TableRow key={i} className="table-row-hover">
                      <TableCell className="text-sm">{entry.date || entry.created_at ? new Date(entry.date || entry.created_at).toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="font-medium">{entry.machine_name || '-'}</TableCell>
                      <TableCell>{entry.operator_name || '-'}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">{entry.job_details || entry.details || '-'}</TableCell>
                      <TableCell>
                        <Badge className={
                          entry.status === 'running' ? 'bg-emerald-100 text-emerald-700 border-none' :
                          entry.status === 'breakdown' ? 'bg-red-100 text-red-700 border-none' :
                          'bg-amber-100 text-amber-700 border-none'
                        }>{entry.status || 'idle'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export Section */}
      <Card className="border border-border" data-testid="export-section">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Export Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => handleExport('production')}
              disabled={!!exportingType}
              data-testid="export-production-btn"
            >
              {exportingType === 'production' ? <Loader2 className="w-6 h-6 animate-spin" /> : <ClipboardList className="w-6 h-6 text-primary" />}
              <span className="font-semibold">Production Entries</span>
              <span className="text-xs text-muted-foreground">Download CSV/Excel</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => handleExport('storage')}
              disabled={!!exportingType}
              data-testid="export-storage-btn"
            >
              {exportingType === 'storage' ? <Loader2 className="w-6 h-6 animate-spin" /> : <Package className="w-6 h-6 text-primary" />}
              <span className="font-semibold">Storage Data</span>
              <span className="text-xs text-muted-foreground">Download CSV/Excel</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => handleExport('tools')}
              disabled={!!exportingType}
              data-testid="export-tools-btn"
            >
              {exportingType === 'tools' ? <Loader2 className="w-6 h-6 animate-spin" /> : <Wrench className="w-6 h-6 text-primary" />}
              <span className="font-semibold">Tools & Inserts</span>
              <span className="text-xs text-muted-foreground">Download CSV/Excel</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
