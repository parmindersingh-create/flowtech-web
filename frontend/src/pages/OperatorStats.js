import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  ArrowLeft, Loader2, Search, ChevronLeft, ChevronRight,
  Star, TrendingDown, Users, BarChart3, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { exportToPDF } from '../utils/exportPDF';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const PER_PAGE = 20;

const OperatorStats = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState([]);
  const [topStats, setTopStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      const [allRes, topRes] = await Promise.all([
        axios.get(`${API_URL}/api/operator-stats`),
        axios.get(`${API_URL}/api/operator-stats/top`).catch(() => ({ data: null })),
      ]);
      // Use all_stats from top endpoint if available, else fallback
      const topData = topRes.data;
      const allStats = topData?.all_stats || (Array.isArray(allRes.data) ? allRes.data : []);
      setStats(allStats);
      setTopStats(topData);
    } catch (err) {
      console.error('Error:', err);
      setStats([]);
    } finally { setLoading(false); }
  };

  const filtered = stats.filter(s => {
    const q = search.toLowerCase();
    return !q || (s.name || s.operator_name || '').toLowerCase().includes(q);
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const start = (page - 1) * PER_PAGE;
  const paginated = filtered.slice(start, start + PER_PAGE);

  const handleExportCSV = () => {
    if (!filtered.length) { toast.error('No data'); return; }
    const h = ['Operator', 'Total Entries', 'Proper Entries', 'Auto-Ended', 'Handovers Given', 'Handovers Received', 'Score'];
    const rows = [h.join(','), ...filtered.map(s => [
      s.name || s.operator_name, s.total_entries || 0, s.proper_entries || 0,
      s.auto_ended_count || s.system_ended || 0, s.handovers_given || 0,
      s.handovers_received || 0, s.active_score || s.score || 0
    ].map(v => `"${v}"`).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = `operator_stats_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success(`Exported ${filtered.length} rows`);
  };

  const handleExportPDF = () => {
    const cols = ['Operator', 'Total', 'Proper', 'Auto-Ended', 'HO Given', 'HO Received', 'Score'];
    const rows = filtered.map(s => [
      s.name || s.operator_name, s.total_entries || 0, s.proper_entries || 0,
      s.auto_ended_count || s.system_ended || 0, s.handovers_given || 0,
      s.handovers_received || 0, s.active_score || s.score || 0
    ].map(v => String(v)));
    exportToPDF(cols, rows, 'Operator Stats', `operator_stats_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const getScoreBadge = (score) => {
    const s = score || 0;
    if (s >= 80) return <Badge className="bg-emerald-100 text-emerald-700 border-none">{s}</Badge>;
    if (s >= 50) return <Badge className="bg-amber-100 text-amber-700 border-none">{s}</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-none">{s}</Badge>;
  };

  return (
    <div className="space-y-6" data-testid="operator-stats-page">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-3xl font-extrabold tracking-tight">Operator Stats</h1>
      </div>

      {/* Top Performers */}
      {topStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topStats.star_operator && (
            <Card className="border border-emerald-200 bg-emerald-50/30" data-testid="star-operator-card">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-100 flex items-center justify-center rounded-full">
                  <Star className="w-7 h-7 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Star Operator</p>
                  <p className="font-bold text-xl">{topStats.star_operator.name}</p>
                  <div className="flex gap-3 text-sm text-muted-foreground">
                    <span>Score: {topStats.star_operator.score ?? topStats.star_operator.active_score ?? '-'}</span>
                    <span>Entries: {topStats.star_operator.entries ?? topStats.star_operator.total_entries ?? 0}</span>
                    <span>Accuracy: {topStats.star_operator.accuracy ?? '-'}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {(topStats.lazy_operator || topStats.needs_improvement) && (() => {
            const op = topStats.lazy_operator || topStats.needs_improvement;
            return (
              <Card className="border border-red-200 bg-red-50/30" data-testid="needs-improvement-card">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-14 h-14 bg-red-100 flex items-center justify-center rounded-full">
                    <TrendingDown className="w-7 h-7 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Needs Improvement</p>
                    <p className="font-bold text-xl">{op.name}</p>
                    <div className="flex gap-3 text-sm text-muted-foreground">
                      <span>Score: {op.score ?? op.active_score ?? '-'}</span>
                      <span>System Ended: {op.system_ended ?? op.auto_ended_count ?? 0}</span>
                      <span>Accuracy: {op.accuracy ?? '-'}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}

      {/* Search + Export + Pagination */}
      <Card className="border border-border">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search operators..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" data-testid="stats-search" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filtered.length} data-testid="export-stats-csv">
                  <Download className="w-4 h-4 mr-1" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!filtered.length} data-testid="export-stats-pdf">
                  <Download className="w-4 h-4 mr-1" /> PDF
                </Button>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{start + 1}-{Math.min(start + PER_PAGE, filtered.length)} of {filtered.length}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm font-medium">{page}/{totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Table */}
      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">#</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Operator</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Entries</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Accuracy</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">System Ended</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Score</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Users className="w-10 h-10 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No operator stats available</p></TableCell></TableRow>
            ) : (
              paginated.map((s, i) => {
                const score = s.active_score ?? s.score ?? 0;
                const accuracy = s.accuracy ?? (s.total_entries ? Math.round((s.proper_entries || 0) / s.total_entries * 100) : 0);
                const status = score >= 80 ? { label: 'Star', cls: 'bg-emerald-100 text-emerald-700' } : score >= 50 ? { label: 'Good', cls: 'bg-blue-100 text-blue-700' } : score >= 25 ? { label: 'Average', cls: 'bg-amber-100 text-amber-700' } : { label: 'Low', cls: 'bg-red-100 text-red-700' };
                return (
                  <TableRow key={s.operator_id || s.user_id || i} className="table-row-hover" data-testid={`stats-row-${i}`}>
                    <TableCell className="text-muted-foreground text-sm">{start + i + 1}</TableCell>
                    <TableCell className="font-medium">{s.name || s.operator_name}</TableCell>
                    <TableCell className="font-bold">{s.total_entries || s.entries || 0}</TableCell>
                    <TableCell className="hidden md:table-cell">{accuracy}%</TableCell>
                    <TableCell className="hidden md:table-cell text-red-600 font-medium">{s.system_ended ?? s.auto_ended_count ?? 0}</TableCell>
                    <TableCell>{getScoreBadge(score)}</TableCell>
                    <TableCell className="hidden lg:table-cell"><Badge className={`border-none text-xs ${status.cls}`}>{status.label}</Badge></TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default OperatorStats;
