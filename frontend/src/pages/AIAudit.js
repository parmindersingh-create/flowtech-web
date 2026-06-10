import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Loader2, Calendar, ChevronLeft, ChevronRight, Brain, AlertTriangle, Shield, CheckCircle, Package, Users, Briefcase, Clock, RefreshCw, Wrench, Trash2, PackageOpen } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const AIAudit = () => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [showDetailed, setShowDetailed] = useState(false);
  const [drillOpen, setDrillOpen] = useState(null); // 'jobs' | 'system_ended' | 'issues' | 'alerts' | 'production' | 'quality' | 'efficiency'
  const [jobsList, setJobsList] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [fullReport, setFullReport] = useState(null);

  useEffect(() => {
    axios.get(`${API}/api/ai-audit/full-report?date=${date}`)
      .then(r => setFullReport(r.data))
      .catch(() => setFullReport(null));
  }, [date]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      // Use /latest to avoid re-generating on every load
      const { data } = await axios.get(`${API}/api/ai/audit-report/latest?date=${date}`);
      setReport(data);
    } catch {
      // Fallback to live generation if latest not available
      try {
        const { data } = await axios.get(`${API}/api/ai/audit-report?date=${date}`);
        setReport(data);
      } catch { setReport(null); }
    }
    finally { setLoading(false); }
  }, [date]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const { data } = await axios.get(`${API}/api/ai/audit-report?date=${date}`);
      setReport(data);
    } catch { /* ignore */ }
    finally { setRegenerating(false); }
  };

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Fetch job list lazily when user clicks Jobs / System-Ended cards
  useEffect(() => {
    if (drillOpen !== 'jobs' && drillOpen !== 'system_ended') return;
    let cancelled = false;
    (async () => {
      setJobsLoading(true);
      try {
        const urls = [
          `${API}/api/production/daily-summary?date=${date}`,
          `${API}/api/daily-production-summary?date=${date}`,
        ];
        for (const url of urls) {
          try {
            const { data } = await axios.get(url);
            const entries = data?.entries;
            const list = entries && !Array.isArray(entries)
              ? [...(entries.cnc || []), ...(entries.vmc || []), ...(entries.moulding || []), ...(entries.other || [])]
              : Array.isArray(entries) ? entries : [];
            if (!cancelled) { setJobsList(list); break; }
          } catch { /* try next */ }
        }
      } finally { if (!cancelled) setJobsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [drillOpen, date]);

  // Reset cached jobs when date changes
  useEffect(() => { setJobsList([]); }, [date]);

  const changeDate = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  };

  // Build a simple, plain-language summary from the numbers
  const buildSimpleSummary = (r) => {
    const s = r.summary || {};
    const total = s.total_jobs || 0;
    const produced = s.total_produced || 0;
    const ended = s.system_ended_jobs || 0;
    const issues = s.entry_issues_count || 0;
    const alerts = s.tool_alerts_count || 0;
    const lines = [];
    if (total === 0) {
      lines.push('No jobs were scheduled today.');
    } else {
      lines.push(`Today had ${total} job${total === 1 ? '' : 's'}.`);
      if (produced === 0) lines.push('Nothing was produced yet.');
      else lines.push(`${produced} part${produced === 1 ? '' : 's'} produced so far.`);
    }
    if (ended > 0) lines.push(`${ended} job${ended === 1 ? ' was' : 's were'} auto-ended by the system — please review.`);
    if (issues > 0) lines.push(`${issues} entr${issues === 1 ? 'y has' : 'ies have'} missing data or signatures.`);
    if (alerts > 0) lines.push(`${alerts} tool${alerts === 1 ? '' : 's'} / item${alerts === 1 ? '' : 's'} need${alerts === 1 ? 's' : ''} restocking.`);
    if (ended === 0 && issues === 0 && alerts === 0 && total > 0) lines.push('Everything looks healthy — no issues detected.');
    return lines;
  };

  const drillTitle = {
    jobs: 'All Jobs',
    system_ended: 'System-Ended Jobs',
    issues: 'Entry Issues',
    alerts: 'Tool Alerts',
    production: 'Production Insights',
    quality: 'Quality Insights',
    efficiency: 'Efficiency Insights',
  };

  const severityColor = (s) => {
    if (s === 'error') return 'bg-red-100 text-red-700';
    if (s === 'warning') return 'bg-amber-100 text-amber-700';
    return 'bg-blue-100 text-blue-700';
  };

  const getDrillItems = () => {
    if (!report) return [];
    if (drillOpen === 'issues') return report.entry_issues || [];
    if (drillOpen === 'alerts') return report.tool_alerts || [];
    if (drillOpen === 'system_ended') {
      // Filter from fetched jobsList — items marked as auto-ended
      return jobsList.filter(j =>
        j.system_ended === true || j.auto_ended === true ||
        j.ended_by === 'system' || j.end_reason === 'system' ||
        (typeof j.end_reason === 'string' && j.end_reason.toLowerCase().includes('system'))
      );
    }
    if (drillOpen === 'jobs') return jobsList;
    if (drillOpen === 'production') return fullReport?.categories?.production || [];
    if (drillOpen === 'quality') return fullReport?.categories?.quality || [];
    if (drillOpen === 'efficiency') return fullReport?.categories?.efficiency || [];
    return [];
  };

  return (
    <div className="space-y-4" data-testid="ai-audit-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
          <Brain className="w-8 h-8" /> AI Audit Report
        </h1>
        <Button variant="outline" size="sm" onClick={regenerate} disabled={regenerating || loading} data-testid="regenerate-btn">
          {regenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Regenerate
        </Button>
      </div>

      {report?.generated_at && <p className="text-xs text-muted-foreground">Last generated: {report.generated_at}</p>}

      {/* Date Picker */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => changeDate(-1)}><ChevronLeft className="w-4 h-4" /></Button>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-auto" />
        </div>
        <Button variant="outline" size="icon" onClick={() => changeDate(1)}><ChevronRight className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setDate(new Date().toISOString().slice(0, 10))}>Today</Button>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
      ) : !report ? (
        <div className="py-12 text-center text-muted-foreground">No audit report available for this date</div>
      ) : (
        <>
          {/* Summary Cards — all clickable */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDrillOpen('jobs')} data-testid="card-total-jobs">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Briefcase className="w-4 h-4 text-muted-foreground" /><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Jobs</p></div>
                <p className="text-2xl font-extrabold">{report.summary?.total_jobs || 0}</p>
                <p className="text-xs text-muted-foreground">Qty: {report.summary?.total_produced || 0}</p>
              </CardContent>
            </Card>
            <Card className="border border-red-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDrillOpen('system_ended')} data-testid="card-system-ended">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-red-600" /><p className="text-xs font-bold uppercase tracking-wider text-red-600">System Ended</p></div>
                <p className="text-2xl font-extrabold text-red-600">{report.summary?.system_ended_jobs || 0}</p>
                <p className="text-xs text-muted-foreground">Auto-ended by system</p>
              </CardContent>
            </Card>
            <Card className="border border-amber-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDrillOpen('issues')} data-testid="card-issues">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-amber-600" /><p className="text-xs font-bold uppercase tracking-wider text-amber-600">Entry Issues</p></div>
                <p className="text-2xl font-extrabold text-amber-600">{report.summary?.entry_issues_count || 0}</p>
                <p className="text-xs text-muted-foreground">Missing data / signatures</p>
              </CardContent>
            </Card>
            <Card className="border border-blue-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDrillOpen('alerts')} data-testid="card-alerts">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Shield className="w-4 h-4 text-blue-600" /><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Tool Alerts</p></div>
                <p className="text-2xl font-extrabold text-blue-600">{report.summary?.tool_alerts_count || 0}</p>
                <p className="text-xs text-muted-foreground">Low stock / issues</p>
              </CardContent>
            </Card>
          </div>

          {/* Secondary Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border"><CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1"><Wrench className="w-3.5 h-3.5 text-muted-foreground" /><p className="text-xs font-bold uppercase text-muted-foreground">Tools Issued</p></div>
              <p className="text-xl font-extrabold">{report.summary?.tools_issued_today || 0}</p>
            </CardContent></Card>
            <Card className="border"><CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1"><Trash2 className="w-3.5 h-3.5 text-muted-foreground" /><p className="text-xs font-bold uppercase text-muted-foreground">Tools Scrapped</p></div>
              <p className="text-xl font-extrabold">{report.summary?.tools_scrapped_today || 0}</p>
            </CardContent></Card>
            <Card className="border"><CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1"><PackageOpen className="w-3.5 h-3.5 text-muted-foreground" /><p className="text-xs font-bold uppercase text-muted-foreground">Parts Taken</p></div>
              <p className="text-xl font-extrabold">{report.summary?.parts_taken_today || 0}</p>
            </CardContent></Card>
            <Card className="border"><CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-3.5 h-3.5 text-red-600" /><p className="text-xs font-bold uppercase text-red-600">Low Stock Parts</p></div>
              <p className="text-xl font-extrabold text-red-600">{report.summary?.low_stock_parts || 0}</p>
            </CardContent></Card>
          </div>

          {/* AI Analysis — simple language by default */}
          <Card className="border border-primary/20 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Brain className="w-5 h-5 text-primary" /><span className="font-semibold text-sm">AI Summary</span></div>
                {report.ai_analysis?.insights && (
                  <Button variant="ghost" size="sm" onClick={() => setShowDetailed(!showDetailed)} data-testid="toggle-detailed-btn">
                    {showDetailed ? 'Simple view' : 'Detailed view'}
                  </Button>
                )}
              </div>

              {!showDetailed && (
                <div className="space-y-1.5">
                  {buildSimpleSummary(report).map((line, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              )}

              {showDetailed && report.ai_analysis?.insights && (
                <p className="text-sm text-muted-foreground whitespace-pre-line">{report.ai_analysis.insights}</p>
              )}

              {report.ai_analysis?.recommendations?.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-primary/10">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What to do next</p>
                  {report.ai_analysis.recommendations.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm"><CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" /><span>{r}</span></div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Entry Issues preview */}
          {report.entry_issues?.length > 0 ? (
            <Card className="border">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-600" /><span className="font-semibold text-sm">Entry Issues</span></div>
                  <Button variant="ghost" size="sm" onClick={() => setDrillOpen('issues')}>View All</Button>
                </div>
                {report.entry_issues.slice(0, 3).map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded bg-muted/50 text-sm">
                    <Badge className={`${severityColor(issue.severity)} border-none text-xs`}>{issue.type}</Badge>
                    <div className="flex-1">
                      <p>{issue.message}</p>
                      {issue.operator && <p className="text-xs text-muted-foreground">Operator: {issue.operator}</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-emerald-200 bg-emerald-50/40">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <p className="text-sm">No entry issues — all entries are complete and signed.</p>
              </CardContent>
            </Card>
          )}

          {/* Tool Alerts preview */}
          {report.tool_alerts?.length > 0 ? (
            <Card className="border">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-red-600" /><span className="font-semibold text-sm">Tool Alerts</span></div>
                  <Button variant="ghost" size="sm" onClick={() => setDrillOpen('alerts')}>View All</Button>
                </div>
                {report.tool_alerts.slice(0, 3).map((alert, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded bg-muted/50 text-sm">
                    <Badge className={`${severityColor(alert.severity)} border-none text-xs`}>{alert.type}</Badge>
                    <div className="flex-1">
                      <p>{alert.message}</p>
                      {alert.item && <p className="text-xs text-muted-foreground">{alert.item}{alert.quantity !== undefined ? ` • Qty: ${alert.quantity}` : ''}</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-emerald-200 bg-emerald-50/40">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <p className="text-sm">No tool alerts — inventory looks healthy.</p>
              </CardContent>
            </Card>
          )}

          {/* Storage Status */}
          {report.storage_status && (
            <Card className="border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2"><Package className="w-5 h-5" /><span className="font-semibold text-sm">Storage Status</span></div>
                <div className="flex gap-6 text-sm">
                  <span>Total Parts: <span className="font-bold">{report.storage_status.total_parts || 0}</span></span>
                  <span className="text-red-600">Low Stock: <span className="font-bold">{report.storage_status.low_stock_count || 0}</span></span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Insight Categories (from /ai-audit/full-report) */}
          {fullReport?.categories && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detailed AI Insights by Category</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="border cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDrillOpen('production')} data-testid="cat-production">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1"><Briefcase className="w-4 h-4 text-emerald-600" /><p className="text-xs font-bold uppercase text-emerald-700">Production</p></div>
                    <p className="text-2xl font-extrabold">{(fullReport.categories.production || []).length}</p>
                    <p className="text-xs text-muted-foreground">insights</p>
                  </CardContent>
                </Card>
                <Card className="border cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDrillOpen('quality')} data-testid="cat-quality">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1"><Shield className="w-4 h-4 text-amber-600" /><p className="text-xs font-bold uppercase text-amber-700">Quality</p></div>
                    <p className="text-2xl font-extrabold">{(fullReport.categories.quality || []).length}</p>
                    <p className="text-xs text-muted-foreground">insights</p>
                  </CardContent>
                </Card>
                <Card className="border cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDrillOpen('efficiency')} data-testid="cat-efficiency">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-blue-600" /><p className="text-xs font-bold uppercase text-blue-700">Efficiency</p></div>
                    <p className="text-2xl font-extrabold">{(fullReport.categories.efficiency || []).length}</p>
                    <p className="text-xs text-muted-foreground">insights</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Operator Scores */}
          {report.operator_scores?.length > 0 && (
            <Card className="border overflow-hidden">
              <CardContent className="p-4 pb-0">
                <div className="flex items-center gap-2 mb-2"><Users className="w-5 h-5" /><span className="font-semibold text-sm">Operator Scores</span></div>
              </CardContent>
              <Table>
                <TableHeader><TableRow className="bg-muted/50">
                  <TableHead className="text-xs">#</TableHead>
                  <TableHead className="text-xs">Operator</TableHead>
                  <TableHead className="text-xs">Score</TableHead>
                  <TableHead className="text-xs">Jobs</TableHead>
                  <TableHead className="text-xs">Issues</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {report.operator_scores.map((op, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{op.name}</TableCell>
                      <TableCell><Badge className={`border-none text-xs ${op.score >= 80 ? 'bg-emerald-100 text-emerald-700' : op.score >= 50 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{op.score}</Badge></TableCell>
                      <TableCell>{op.jobs_completed || 0}</TableCell>
                      <TableCell className={op.issues > 0 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>{op.issues || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Drill-down Modal */}
      <Dialog open={!!drillOpen} onOpenChange={(o) => !o && setDrillOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="drill-modal">
          <DialogHeader><DialogTitle>{drillTitle[drillOpen] || ''}</DialogTitle></DialogHeader>
          {(() => {
            if ((drillOpen === 'jobs' || drillOpen === 'system_ended') && jobsLoading) {
              return <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
            }
            const items = getDrillItems();
            if (items.length === 0) {
              return <p className="text-sm text-muted-foreground py-6 text-center">
                {drillOpen === 'jobs' ? 'No jobs for this date.'
                  : drillOpen === 'system_ended' ? 'No system-ended jobs for this date.'
                  : 'No items to display.'}
              </p>;
            }
            if (drillOpen === 'issues' || drillOpen === 'alerts' || drillOpen === 'production' || drillOpen === 'quality' || drillOpen === 'efficiency') {
              return (
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded border text-sm">
                      <Badge className={`${severityColor(item.severity)} border-none text-xs flex-shrink-0`}>{item.type || item.severity || drillOpen}</Badge>
                      <div className="flex-1">
                        <p className="font-medium">{item.message || item.title || item.description || item.text || '-'}</p>
                        {item.operator && <p className="text-xs text-muted-foreground mt-0.5">Operator: {item.operator}</p>}
                        {item.item && <p className="text-xs text-muted-foreground">Item: {item.item}</p>}
                        {item.entry_id && <p className="text-xs text-muted-foreground">Entry ID: {item.entry_id}</p>}
                        {item.machine_name && <p className="text-xs text-muted-foreground">Machine: {item.machine_name}</p>}
                        {item.value !== undefined && <p className="text-xs text-muted-foreground">Value: {item.value}</p>}
                        {item.recommendation && <p className="text-xs text-emerald-700 mt-1">→ {item.recommendation}</p>}
                      </div>
                      {item.quantity !== undefined && <span className="text-sm font-bold">Qty: {item.quantity}</span>}
                    </div>
                  ))}
                </div>
              );
            }
            // jobs / system_ended → tabular
            return (
              <Table>
                <TableHeader><TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Machine</TableHead>
                  <TableHead className="text-xs">Job</TableHead>
                  <TableHead className="text-xs">Operator</TableHead>
                  <TableHead className="text-xs">Qty</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {items.map((j, i) => (
                    <TableRow key={j.entry_id || i}>
                      <TableCell className="font-medium">{j.machine_name || '-'}</TableCell>
                      <TableCell>{j.job_details || j.part_name || '-'}</TableCell>
                      <TableCell>{j.operator_name || '-'}</TableCell>
                      <TableCell>{j.produced_qty || j.quantity || 0}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{j.status || '-'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AIAudit;
