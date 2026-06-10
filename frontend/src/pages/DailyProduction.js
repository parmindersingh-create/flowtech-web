import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Loader2, Calendar, ChevronLeft, ChevronRight, Activity, Wrench, RotateCcw, Package, Download, FileText, RotateCw, Image as ImageIcon, BarChart3, Square } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

// Extract only the time portion from strings like "23/04/2026 06:00 AM" or ISO datetimes.
const timeOnly = (v) => {
  if (!v) return '-';
  if (typeof v !== 'string') return String(v);
  // Pattern: "dd/mm/yyyy hh:mm AM/PM" → keep only "hh:mm AM/PM"
  const m = v.match(/(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm))/);
  if (m) return m[1].toUpperCase();
  // ISO / Date-parseable
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return v;
};

const isSystemEnded = (e) => !!e && (e.system_ended === true || e.ended_by === 'System');

// Convert a stored cycle_time (assumed seconds) to "Hh Mm Ss" or fall back to raw string.
const formatCycleTimeFromSeconds = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' && v.includes(':')) return v; // already HH:MM:SS
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return '0s';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const DailyProduction = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = !!(user && (user.role === 'Admin' || user.role === 'admin' || user.is_admin));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [prodData, setProdData] = useState(null);
  const [toolData, setToolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [toolTab, setToolTab] = useState('issued');
  const [selectedTool, setSelectedTool] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [entryLoading, setEntryLoading] = useState(false);
  const [enlargedSig, setEnlargedSig] = useState(null);
  const [undoLoading, setUndoLoading] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [isPostQtyOpen, setIsPostQtyOpen] = useState(false);
  const [postQty, setPostQty] = useState('');
  const [postQtySubmitting, setPostQtySubmitting] = useState(false);

  const isRunning = (e) => {
    if (!e) return false;
    const s = String(e.status || '').toLowerCase();
    return s === 'active' || s === 'in_progress' || s === 'running';
  };

  const handlePostQtyDP = async () => {
    if (!selectedEntry || !postQty || parseInt(postQty, 10) <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    const id = selectedEntry.entry_id || selectedEntry._id || selectedEntry.id;
    if (!id) return;
    setPostQtySubmitting(true);
    try {
      const { data } = await axios.post(`${API}/api/production/${id}/post-qty`, {
        qty: parseInt(postQty, 10),
      });
      toast.success(data?.message || `Posted ${postQty} pcs`);
      setIsPostQtyOpen(false);
      setPostQty('');
      // Refresh data + the open entry
      fetchData();
      setSelectedEntry(prev => prev ? { ...prev, total_posted_qty: data?.total_posted_qty ?? prev.total_posted_qty } : prev);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to post quantity');
    } finally {
      setPostQtySubmitting(false);
    }
  };

  const openEntry = async (e) => {
    setSelectedEntry(e);
    const id = e.entry_id || e._id || e.id;
    if (!id) return;
    setEntryLoading(true);
    // Try a few common detail endpoints to enrich with images/signatures
    const urls = [
      `${API}/api/production/${id}`,
      `${API}/api/production-entries/${id}`,
      `${API}/api/entries/${id}`,
    ];
    for (const url of urls) {
      try {
        const { data } = await axios.get(url);
        if (data && typeof data === 'object') { setSelectedEntry({ ...e, ...data }); break; }
      } catch { /* try next */ }
    }
    setEntryLoading(false);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Try new endpoint first, fall back to legacy path
      const prodReq = axios.get(`${API}/api/production/daily-summary?date=${date}`)
        .catch(() => axios.get(`${API}/api/daily-production-summary?date=${date}`))
        .catch(() => ({ data: null }));
      const toolReq = axios.get(`${API}/api/tools-daily-summary?date=${date}`).catch(() => ({ data: null }));
      const [prodRes, toolRes] = await Promise.all([prodReq, toolReq]);
      setProdData(prodRes.data);
      setToolData(toolRes.data);
    } catch { setProdData(null); setToolData(null); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const changeDate = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  };

  // Production data — supports both new grouped shape and legacy flat shape
  const rawEntries = prodData?.entries;
  const groupedEntries = rawEntries && !Array.isArray(rawEntries) ? rawEntries : null;
  const flatEntries = Array.isArray(rawEntries) ? rawEntries : [];
  const allEntries = groupedEntries
    ? [...(groupedEntries.cnc || []), ...(groupedEntries.vmc || []), ...(groupedEntries.moulding || []), ...(groupedEntries.other || [])]
    : flatEntries;

  const summaryGroups = prodData?.summary || {};
  const machineBreakdown = prodData?.machine_breakdown || [];
  const operatorBreakdown = prodData?.operator_breakdown || [];
  const shiftBreakdown = prodData?.shift_breakdown || {};

  const totalProduced = prodData?.total_produced ?? summaryGroups.total?.total_qty ?? 0;
  const totalEntries = prodData?.total_entries ?? summaryGroups.total?.count ?? allEntries.length;
  const totalRejected = prodData?.total_rejected ?? allEntries.reduce((s, e) => s + (Number(e.rejection_qty) || 0), 0);

  // Get count per tab
  const tabCount = (tab) => {
    if (tab === 'all') return allEntries.length;
    if (groupedEntries) return (groupedEntries[tab] || []).length;
    return allEntries.filter(e => {
      const c = (e.category || e.machine_name || '').toLowerCase();
      if (tab === 'vmc') return c.includes('vmc');
      if (tab === 'cnc') return c.includes('cnc');
      if (tab === 'moulding') return c.includes('mould');
      return false;
    }).length;
  };

  const filteredEntries = activeTab === 'all' ? allEntries
    : groupedEntries ? (groupedEntries[activeTab] || [])
    : allEntries.filter(e => {
        const c = (e.category || e.machine_name || '').toLowerCase();
        if (activeTab === 'vmc') return c.includes('vmc');
        if (activeTab === 'cnc') return c.includes('cnc');
        if (activeTab === 'moulding') return c.includes('mould');
        return true;
      });

  const isToday = date === new Date().toISOString().slice(0, 10);

  const toolItemName = (t) => {
    const d = t.item_details || t.item || t;
    if (!d) return '-';
    // Per APK spec: item_details only contains category/material/diameter/insert_type
    if (d.category === 'endmill') {
      return [d.diameter ? `Ø${d.diameter}` : '', d.material].filter(Boolean).join(' ') || 'End Mill';
    }
    if (d.category === 'insert') {
      return d.insert_type || 'Insert';
    }
    // Fallback for richer shapes (e.g. full item doc)
    if (d.endmill_type) return [d.endmill_type, d.material, d.diameter ? `Ø${d.diameter}` : '', d.length ? `L${d.length}` : '', d.grade ? `(${d.grade})` : ''].filter(Boolean).join(' ').trim() || '-';
    if (d.insert_type) return [d.insert_type, d.insert_size, d.insert_grade, d.tip_radius ? `R${d.tip_radius}` : ''].filter(Boolean).join(' ').trim() || '-';
    return '-';
  };

  const exportCSV = () => {
    const wb = XLSX.utils.book_new();
    // Summary
    const summary = [
      ['Daily Production Report', date],
      [],
      ['Total Entries', totalEntries],
      ['Total Produced', totalProduced],
      ['Total Rejected', totalRejected],
    ];
    if (summaryGroups.cnc) summary.push(['CNC Count/Qty', summaryGroups.cnc.count, summaryGroups.cnc.total_qty]);
    if (summaryGroups.vmc) summary.push(['VMC Count/Qty', summaryGroups.vmc.count, summaryGroups.vmc.total_qty]);
    if (summaryGroups.moulding) summary.push(['Moulding Count/Qty', summaryGroups.moulding.count, summaryGroups.moulding.total_qty]);
    if (shiftBreakdown.morning) summary.push(['Morning Shift', shiftBreakdown.morning.entries || 0, shiftBreakdown.morning.produced || 0]);
    if (shiftBreakdown.night) summary.push(['Night Shift', shiftBreakdown.night.entries || 0, shiftBreakdown.night.produced || 0]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

    // Entries
    if (allEntries.length > 0) {
      const ws = XLSX.utils.json_to_sheet(allEntries.map(e => ({
        Machine: e.machine_name || '', Job: e.job_details || '', Operator: e.operator_name || '',
        Start: e.start_time_ist || e.start_time || '', End: e.end_time_ist || e.end_time || '',
        Produced: e.produced_qty || e.quantity || 0, Rejected: e.rejection_qty || 0,
        Duration: e.duration || '', Shift: e.shift || '', Category: e.category || '', Status: e.status || '',
      })));
      XLSX.utils.book_append_sheet(wb, ws, 'Entries');
    }
    // Machine breakdown
    if (machineBreakdown.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(machineBreakdown), 'Machine Breakdown');
    }
    if (operatorBreakdown.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(operatorBreakdown), 'Operator Breakdown');
    }
    // Tools
    if (toolData?.issued?.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toolData.issued.map(t => ({
        Item: toolItemName(t), 'Issued To': t.issued_to_name || '', 'Issued By': t.issued_by_name || '',
        Quantity: t.quantity || 1, Time: t.issued_at ? new Date(t.issued_at).toLocaleString() : '',
      }))), 'Tools Issued');
    }
    if (toolData?.scrapped?.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toolData.scrapped.map(t => ({
        Item: toolItemName(t), 'Returned By': t.returned_by_name || '', 'Collected By': t.collected_by_name || '',
        Quantity: t.quantity || 1, Time: (t.collected_at || t.returned_at) ? new Date(t.collected_at || t.returned_at).toLocaleString() : '',
      }))), 'Tools Scrapped');
    }
    if (toolData?.new_items?.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toolData.new_items.map(t => ({
        Item: toolItemName(t), 'Initial Qty': t.quantity || 0, 'Added By': t.created_by_name || '',
        Time: t.created_at ? new Date(t.created_at).toLocaleString() : '',
      }))), 'New Items');
    }
    if (toolData?.qty_additions?.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toolData.qty_additions.map(t => ({
        Item: toolItemName(t), 'Qty Added': t.quantity || 0, 'Added By': t.added_by_name || '',
        Remarks: t.remarks || '',
        Time: t.added_at ? new Date(t.added_at).toLocaleString() : '',
      }))), 'Stock Additions');
    }
    XLSX.writeFile(wb, `Daily_Production_${date}.xlsx`);
  };

  const exportPDF = async () => {
    setPdfExporting(true);
    try {
      const res = await axios.get(`${API}/api/export/production-entries`, {
        params: { format: 'pdf', date },
        responseType: 'arraybuffer',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Daily_Production_${date}.pdf`;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      try { const w = window.open(url, '_blank'); if (w) setTimeout(() => { try { w.close(); } catch {} }, 8000); } catch {}
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast.success('PDF exported — check Downloads or new tab');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to export PDF');
    } finally {
      setPdfExporting(false);
    }
  };

  // Detect if any system-ended entries exist for the selected date
  const hasSystemEnded = allEntries.some(isSystemEnded);

  // Undo a single auto-ended entry (admin only)
  const undoAutoEndOne = async (entryId) => {
    if (!entryId) return;
    setUndoLoading(true);
    try {
      await axios.post(`${API}/api/admin/undo-auto-end/${entryId}`);
      toast.success('Entry restored to active work');
      setSelectedEntry(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to undo auto-end');
    } finally {
      setUndoLoading(false);
    }
  };

  // Undo all auto-ended entries (admin only)
  const undoAutoEndAll = async () => {
    if (!window.confirm('Restore ALL auto-ended entries on this date back to active work?')) return;
    setUndoLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/admin/undo-auto-end`, { date });
      toast.success(`Restored ${data?.restored ?? data?.count ?? 'auto-ended'} entries`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to undo auto-end (all)');
    } finally {
      setUndoLoading(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="daily-production-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Daily Production</h1>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && hasSystemEnded && (
            <Button variant="outline" size="sm" onClick={undoAutoEndAll} disabled={undoLoading || loading} className="border-orange-300 text-orange-700 hover:bg-orange-50" data-testid="undo-auto-end-all-btn">
              {undoLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCw className="w-4 h-4 mr-2" />}
              Undo Auto-End (All)
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={loading || !prodData} data-testid="export-csv-btn">
            <Download className="w-4 h-4 mr-2" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={loading || !prodData || pdfExporting} data-testid="export-pdf-btn">
            {pdfExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Export PDF
          </Button>
        </div>
      </div>

      {/* Date Picker */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => changeDate(-1)} data-testid="prev-date"><ChevronLeft className="w-4 h-4" /></Button>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-auto" data-testid="date-picker" />
        </div>
        <Button variant="outline" size="icon" onClick={() => changeDate(1)} data-testid="next-date"><ChevronRight className="w-4 h-4" /></Button>
        {!isToday && <Button variant="ghost" size="sm" onClick={() => setDate(new Date().toISOString().slice(0, 10))}>Today</Button>}
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
      ) : (
        <>
          {/* Production Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border"><CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Total Entries</p>
              <p className="text-2xl font-extrabold">{totalEntries}</p>
              {summaryGroups.total?.running > 0 && <p className="text-xs text-amber-600 mt-0.5">{summaryGroups.total.running} running</p>}
            </CardContent></Card>
            <Card className="border"><CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">Produced</p>
              <p className="text-2xl font-extrabold text-emerald-600">{totalProduced}</p>
            </CardContent></Card>
            <Card className="border"><CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-red-600 mb-1">Rejected</p>
              <p className="text-2xl font-extrabold text-red-600">{totalRejected}</p>
            </CardContent></Card>
            <Card className="border"><CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Shifts</p>
              <div className="text-xs space-y-0.5">
                {shiftBreakdown.morning && <p>Morning: {shiftBreakdown.morning.entries} entries, {shiftBreakdown.morning.produced} qty</p>}
                {shiftBreakdown.night && <p>Night: {shiftBreakdown.night.entries} entries, {shiftBreakdown.night.produced} qty</p>}
                {!shiftBreakdown.morning && !shiftBreakdown.night && <p className="text-muted-foreground">—</p>}
              </div>
            </CardContent></Card>
          </div>

          {/* Category Summary (new backend shape) */}
          {summaryGroups.cnc && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {['cnc', 'vmc', 'moulding', 'other'].map(cat => summaryGroups[cat] && (
                <Card key={cat} className="border"><CardContent className="p-3">
                  <p className="text-xs font-bold uppercase tracking-wider mb-1">{cat.toUpperCase()}</p>
                  <p className="text-xl font-extrabold">{summaryGroups[cat].total_qty || 0} <span className="text-xs font-normal text-muted-foreground">qty</span></p>
                  <p className="text-xs text-muted-foreground">{summaryGroups[cat].count} entries • {summaryGroups[cat].running} running • {summaryGroups[cat].ended} ended</p>
                </CardContent></Card>
              ))}
            </div>
          )}

          {/* Machine & Operator Breakdown */}
          {(machineBreakdown.length > 0 || operatorBreakdown.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {machineBreakdown.length > 0 && (
                <Card className="border"><CardContent className="p-4">
                  <p className="text-sm font-semibold mb-2">Machine Breakdown</p>
                  <div className="space-y-1">{machineBreakdown.map((m, i) => (
                    <div key={i} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
                      <span>{m.machine_name}</span>
                      <span><span className="font-bold">{m.produced}</span> qty ({m.entries} jobs)</span>
                    </div>
                  ))}</div>
                </CardContent></Card>
              )}
              {operatorBreakdown.length > 0 && (
                <Card className="border"><CardContent className="p-4">
                  <p className="text-sm font-semibold mb-2">Operator Breakdown</p>
                  <div className="space-y-1">{operatorBreakdown.map((o, i) => (
                    <div key={i} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
                      <span>{o.operator_name}</span>
                      <span><span className="font-bold">{o.produced}</span> qty ({o.entries} jobs){o.rejected > 0 && <span className="text-red-600 ml-1">R:{o.rejected}</span>}</span>
                    </div>
                  ))}</div>
                </CardContent></Card>
              )}
            </div>
          )}

          {/* Category Tabs */}
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {['all', 'vmc', 'cnc', 'moulding'].map(t => (
              <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} data-testid={`tab-${t}`}>
                {t === 'all' ? `All (${tabCount('all')})` : `${t.toUpperCase()} (${tabCount(t)})`}
              </button>
            ))}
          </div>

          {/* Entries Table */}
          <Card className="border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold uppercase">Date</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Machine</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Shift</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Job Details</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Qty</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-center w-12">📷</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><Activity className="w-8 h-8 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No entries for this date</p></TableCell></TableRow>
                ) : filteredEntries.map((e, i) => {
                  const sysEnded = isSystemEnded(e);
                  const hasImg = !!(e.image || e.image_url || e.photo || e.images?.length);
                  return (
                  <TableRow
                    key={e.entry_id || e._id || i}
                    data-testid={`entry-${i}`}
                    className="cursor-pointer hover:bg-muted/40"
                    style={sysEnded ? { backgroundColor: '#FFF7ED', borderLeft: '3px solid #F97316' } : undefined}
                    onClick={() => openEntry(e)}
                  >
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{date}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{e.machine_name || '-'}</span>
                        {sysEnded && (
                          <Badge style={{ backgroundColor: '#DC2626', color: '#fff' }} className="text-[10px] px-1.5 py-0">⚠️ AUTO-ENDED</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {sysEnded
                        ? <span title="Auto-ended by system">⚠️ {e.shift || '-'}</span>
                        : <Badge variant="outline" className="text-xs">{e.shift || '-'}</Badge>}
                    </TableCell>
                    <TableCell className="text-sm max-w-[280px] truncate" title={e.job_details || ''}>{e.job_details || '-'}</TableCell>
                    <TableCell className="font-bold">{e.produced_qty || e.quantity || '-'}</TableCell>
                    <TableCell className="text-center">{hasImg ? <ImageIcon className="w-4 h-4 inline-block text-emerald-600" /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Tool Summary Section */}
          <div className="pt-4" data-testid="tool-summary-section">
            <h2 className="text-xl font-bold tracking-tight mb-3">Tool Summary</h2>

            {/* Tool Summary Cards */}
            {toolData?.summary && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <Card className="border"><CardContent className="p-3">
                  <p className="text-xs font-bold uppercase text-amber-600">Issued</p>
                  <p className="text-xl font-extrabold">{toolData.summary.total_issued || 0}</p>
                </CardContent></Card>
                <Card className="border"><CardContent className="p-3">
                  <p className="text-xs font-bold uppercase text-red-600">Scrapped</p>
                  <p className="text-xl font-extrabold">{toolData.summary.total_scrapped || 0}</p>
                </CardContent></Card>
                <Card className="border"><CardContent className="p-3">
                  <p className="text-xs font-bold uppercase text-emerald-600">New Items</p>
                  <p className="text-xl font-extrabold">{toolData.summary.new_items_added || 0}</p>
                </CardContent></Card>
                <Card className="border"><CardContent className="p-3">
                  <p className="text-xs font-bold uppercase text-blue-600">Qty Added</p>
                  <p className="text-xl font-extrabold">{toolData.summary.qty_added_to_existing || 0}</p>
                </CardContent></Card>
              </div>
            )}

            {/* Tool Tabs */}
            <div className="flex gap-1 border-b border-border mb-3 overflow-x-auto">
              <button onClick={() => setToolTab('issued')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${toolTab === 'issued' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} data-testid="tool-tab-issued">
                <Wrench className="w-3.5 h-3.5" /> Issued ({(toolData?.issued || []).length})
              </button>
              <button onClick={() => setToolTab('scrap')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${toolTab === 'scrap' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} data-testid="tool-tab-scrap">
                <RotateCcw className="w-3.5 h-3.5" /> Scrap Returns ({(toolData?.scrapped || []).length})
              </button>
              <button onClick={() => setToolTab('new')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${toolTab === 'new' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} data-testid="tool-tab-new">
                <Package className="w-3.5 h-3.5" /> New Items ({(toolData?.new_items || []).length})
              </button>
              <button onClick={() => setToolTab('qty')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${toolTab === 'qty' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} data-testid="tool-tab-qty">
                <Activity className="w-3.5 h-3.5" /> Stock Additions ({(toolData?.qty_additions || []).length})
              </button>
            </div>

            {/* Tool Entries Table */}
            <Card className="border overflow-hidden">
              {(toolTab === 'issued' || toolTab === 'scrap') ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs font-semibold uppercase">Tool / Insert</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">{toolTab === 'issued' ? 'Issued To' : 'Returned By'}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">{toolTab === 'issued' ? 'Issued By' : 'Collected By'}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">Qty</TableHead>
                      <TableHead className="text-xs font-semibold uppercase hidden md:table-cell">Time</TableHead>
                      <TableHead className="text-xs font-semibold uppercase hidden lg:table-cell">Signature</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const items = toolTab === 'issued' ? (toolData?.issued || []) : (toolData?.scrapped || []);
                      if (items.length === 0) return (
                        <TableRow><TableCell colSpan={6} className="text-center py-6"><Package className="w-7 h-7 mx-auto text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">No {toolTab === 'issued' ? 'tools issued' : 'scrap returns'} on this date</p></TableCell></TableRow>
                      );
                      return items.map((t, i) => (
                        <TableRow key={i} data-testid={`tool-${toolTab}-${i}`} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedTool({ ...t, _type: toolTab })}>
                          <TableCell className="font-medium">{toolItemName(t)}</TableCell>
                          <TableCell className="text-sm">{toolTab === 'issued' ? (t.issued_to_name || '-') : (t.returned_by_name || '-')}</TableCell>
                          <TableCell className="text-sm">{toolTab === 'issued' ? (t.issued_by_name || '-') : (t.collected_by_name || '-')}</TableCell>
                          <TableCell className="font-bold">{t.quantity || 1}</TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{(t.issued_at || t.collected_at || t.returned_at) ? new Date(t.issued_at || t.collected_at || t.returned_at).toLocaleTimeString() : '-'}</TableCell>
                          <TableCell className="hidden lg:table-cell">{t.signature ? <img src={t.signature} alt="Sign" className="h-10 rounded cursor-pointer hover:opacity-80" style={{backgroundColor:'#1E293B'}} onClick={(e) => { e.stopPropagation(); setEnlargedSig(t.signature); }} /> : '-'}</TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              ) : toolTab === 'new' ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs font-semibold uppercase">Tool / Insert</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">Initial Qty</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">Added By</TableHead>
                      <TableHead className="text-xs font-semibold uppercase hidden md:table-cell">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(toolData?.new_items || []).length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-6"><Package className="w-7 h-7 mx-auto text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">No new items added on this date</p></TableCell></TableRow>
                    ) : (toolData?.new_items || []).map((t, i) => (
                      <TableRow key={i} data-testid={`tool-new-${i}`}>
                        <TableCell className="font-medium">{toolItemName(t)}</TableCell>
                        <TableCell className="font-bold text-emerald-600">+{t.quantity || 0}</TableCell>
                        <TableCell className="text-sm">{t.created_by_name || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{t.created_at ? new Date(t.created_at).toLocaleTimeString() : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs font-semibold uppercase">Tool / Insert</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">Qty Added</TableHead>
                      <TableHead className="text-xs font-semibold uppercase">Added By</TableHead>
                      <TableHead className="text-xs font-semibold uppercase hidden md:table-cell">Remarks</TableHead>
                      <TableHead className="text-xs font-semibold uppercase hidden md:table-cell">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(toolData?.qty_additions || []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6"><Activity className="w-7 h-7 mx-auto text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">No stock additions on this date</p></TableCell></TableRow>
                    ) : (toolData?.qty_additions || []).map((t, i) => (
                      <TableRow key={t.log_id || i} data-testid={`tool-qty-${i}`}>
                        <TableCell className="font-medium">{toolItemName(t)}</TableCell>
                        <TableCell className="font-bold text-blue-600">+{t.quantity || 0}</TableCell>
                        <TableCell className="text-sm">{t.added_by_name || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{t.remarks || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{t.added_at ? new Date(t.added_at).toLocaleTimeString() : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        </>
      )}

      {/* Entry Detail Modal */}
      <Dialog open={!!selectedEntry} onOpenChange={(o) => !o && setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="entry-detail-modal" style={selectedEntry && isSystemEnded(selectedEntry) ? { borderLeft: '4px solid #F97316', backgroundColor: '#FFF7ED' } : undefined}>
          <DialogHeader>
            <DialogTitle>Production Entry Details {entryLoading && <Loader2 className="inline w-4 h-4 animate-spin ml-2" />}</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{selectedEntry.machine_name || '-'}</p>
                  <p className="text-sm text-muted-foreground">{selectedEntry.job_details || '-'}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {selectedEntry.shift && <Badge variant="outline">{selectedEntry.shift}</Badge>}
                  {isSystemEnded(selectedEntry)
                    ? <Badge style={{ backgroundColor: '#DC2626', color: '#fff' }}>⚠️ AUTO-ENDED</Badge>
                    : (selectedEntry.status === 'active' || selectedEntry.status === 'in_progress' || selectedEntry.status === 'running')
                    ? <Badge className="bg-emerald-500 hover:bg-emerald-500">Running</Badge>
                    : (selectedEntry.status === 'completed' || selectedEntry.status === 'ended')
                    ? <Badge variant="secondary">Ended</Badge>
                    : selectedEntry.status && <Badge variant="outline">{selectedEntry.status}</Badge>}
                </div>
              </div>

              {isAdmin && isSystemEnded(selectedEntry) && (
                <Button
                  onClick={() => undoAutoEndOne(selectedEntry.entry_id || selectedEntry._id || selectedEntry.id)}
                  disabled={undoLoading}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                  data-testid="undo-auto-end-btn"
                >
                  {undoLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCw className="w-4 h-4 mr-2" />}
                  ⏪ Restore to Active Work
                </Button>
              )}

              {/* Running-entry actions: Post Qty + End Work */}
              {isRunning(selectedEntry) && (
                <>
                  {(selectedEntry.total_posted_qty || 0) > 0 && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                      <p className="text-blue-800 font-semibold flex items-center gap-1">
                        <BarChart3 className="w-4 h-4" /> Posted so far: <span className="font-bold">{selectedEntry.total_posted_qty}</span> pcs
                      </p>
                      {selectedEntry.last_post_time && (
                        <p className="text-xs text-blue-700">Last: {new Date(selectedEntry.last_post_time).toLocaleString()}</p>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => { setPostQty(''); setIsPostQtyOpen(true); }}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      data-testid="open-post-qty-btn"
                    >
                      <BarChart3 className="w-4 h-4 mr-2" /> Post Qty
                    </Button>
                    <Button
                      onClick={() => navigate('/dashboard/end-work')}
                      className="bg-red-600 hover:bg-red-700 text-white"
                      data-testid="goto-end-work-btn"
                    >
                      <Square className="w-4 h-4 mr-2" /> End Work
                    </Button>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground uppercase">Operator</p><p className="font-medium">{selectedEntry.operator_name || '-'}</p></div>
                {selectedEntry.setter_name && <div><p className="text-xs text-muted-foreground uppercase">Setter</p><p className="font-medium">{selectedEntry.setter_name}</p></div>}
                {selectedEntry.helper_name && <div><p className="text-xs text-muted-foreground uppercase">Helper</p><p className="font-medium">{selectedEntry.helper_name}</p></div>}
                <div><p className="text-xs text-muted-foreground uppercase">Part Name</p><p className="font-medium">{selectedEntry.part_name || selectedEntry.part_id || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Category</p><p className="font-medium capitalize">{selectedEntry.category || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Produced Qty</p><p className="font-bold text-lg text-emerald-600">{selectedEntry.produced_qty || selectedEntry.quantity || 0}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Rejected</p><p className="font-bold text-lg text-red-600">{selectedEntry.rejection_qty || 0}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Start Time</p><p className="font-medium">{timeOnly(selectedEntry.start_time_ist || selectedEntry.start_time)}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">End Time</p><p className="font-medium">{timeOnly(selectedEntry.end_time_ist || selectedEntry.end_time)}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Duration</p><p className="font-medium">{selectedEntry.duration || '-'}</p></div>
                {selectedEntry.target_qty && <div><p className="text-xs text-muted-foreground uppercase">Target Qty</p><p className="font-medium">{selectedEntry.target_qty}</p></div>}
                {selectedEntry.cycle_time && <div><p className="text-xs text-muted-foreground uppercase">Cycle Time</p><p className="font-medium">{formatCycleTimeFromSeconds(selectedEntry.cycle_time)}</p></div>}
                {selectedEntry.spindle_rpm && <div><p className="text-xs text-muted-foreground uppercase">🔄 Spindle RPM</p><p className="font-medium">{selectedEntry.spindle_rpm} RPM</p></div>}
                {selectedEntry.feed_rate && <div><p className="text-xs text-muted-foreground uppercase">📏 Feed Rate</p><p className="font-medium">{selectedEntry.feed_rate} mm/min</p></div>}
                {selectedEntry.rejection_reason && <div className="col-span-2"><p className="text-xs text-muted-foreground uppercase">Rejection Reason</p><p className="font-medium">{selectedEntry.rejection_reason}</p></div>}
                {selectedEntry.remarks && <div className="col-span-2"><p className="text-xs text-muted-foreground uppercase">Remarks</p><p className="font-medium">{selectedEntry.remarks}</p></div>}
                {selectedEntry.notes && <div className="col-span-2"><p className="text-xs text-muted-foreground uppercase">Notes</p><p className="font-medium">{selectedEntry.notes}</p></div>}
              </div>

              {/* Images - auto-detect any image-like field (recursive) */}
              {(() => {
                const isImg = (v) => typeof v === 'string' && (v.startsWith('data:image') || /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(v) || (v.startsWith('http') && v.length > 20));
                const prettify = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const sigKeys = ['signature', 'sign', 'sig'];
                const found = [];
                const walk = (obj, prefix = '') => {
                  if (!obj || typeof obj !== 'object') return;
                  Object.entries(obj).forEach(([k, v]) => {
                    const key = prefix ? `${prefix}.${k}` : k;
                    if (isImg(v)) found.push([key, v]);
                    else if (v && typeof v === 'object') walk(v, key);
                  });
                };
                walk(selectedEntry);
                const sigs = found.filter(([k]) => sigKeys.some(s => k.toLowerCase().includes(s)));
                const imgs = found.filter(([k]) => !sigKeys.some(s => k.toLowerCase().includes(s)));
                if (imgs.length === 0 && sigs.length === 0) return (
                  <p className="text-xs text-muted-foreground italic">No images or signatures attached to this entry.</p>
                );
                return (
                  <div className="space-y-3">
                    {imgs.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase mb-2">Images ({imgs.length})</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {imgs.map(([k, src]) => (
                            <div key={k} className="space-y-1">
                              <p className="text-xs text-muted-foreground truncate" title={k}>{prettify(k.split('.').pop())}</p>
                              <img src={src} alt={k} className="w-full h-32 object-cover rounded border cursor-pointer hover:opacity-80" onClick={() => setEnlargedSig(src)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {sigs.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase mb-2">Signatures ({sigs.length})</p>
                        <div className="grid grid-cols-2 gap-2">
                          {sigs.map(([k, src]) => (
                            <div key={k} className="space-y-1">
                              <p className="text-xs text-muted-foreground truncate" title={k}>{prettify(k.split('.').pop())}</p>
                              <img src={src} alt={k} className="w-full h-24 object-contain rounded cursor-pointer" style={{backgroundColor:'#1E293B'}} onClick={() => setEnlargedSig(src)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Debug raw data toggle */}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View raw entry data (debug)</summary>
                <pre className="mt-2 p-2 bg-muted rounded overflow-auto max-h-60 text-[10px]">{JSON.stringify(selectedEntry, (k, v) => typeof v === 'string' && v.length > 200 ? v.slice(0, 80) + `… [${v.length} chars]` : v, 2)}</pre>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Tool Detail Modal */}
      <Dialog open={!!selectedTool} onOpenChange={(o) => !o && setSelectedTool(null)}>
        <DialogContent className="max-w-lg" data-testid="tool-detail-modal">
          <DialogHeader>
            <DialogTitle>{selectedTool?._type === 'issued' ? 'Tool Issue Details' : 'Tool Return Details'}</DialogTitle>
          </DialogHeader>
          {selectedTool && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground uppercase">Item</p><p className="font-medium">{toolItemName(selectedTool)}</p></div>
                {(selectedTool.item_details?.category || selectedTool.category) && <div><p className="text-xs text-muted-foreground uppercase">Category</p><p className="font-medium capitalize">{selectedTool.item_details?.category || selectedTool.category}</p></div>}
                <div><p className="text-xs text-muted-foreground uppercase">Quantity</p><p className="font-medium">{selectedTool.quantity || 1}</p></div>
                {(selectedTool.item_details?.endmill_type || selectedTool.endmill_type) && <div><p className="text-xs text-muted-foreground uppercase">Type</p><p className="font-medium">{selectedTool.item_details?.endmill_type || selectedTool.endmill_type}</p></div>}
                {(selectedTool.item_details?.material || selectedTool.material) && <div><p className="text-xs text-muted-foreground uppercase">Material</p><p className="font-medium">{selectedTool.item_details?.material || selectedTool.material}</p></div>}
                {(selectedTool.item_details?.diameter ?? selectedTool.diameter) !== undefined && (selectedTool.item_details?.diameter ?? selectedTool.diameter) !== null && <div><p className="text-xs text-muted-foreground uppercase">Diameter</p><p className="font-medium">Ø{selectedTool.item_details?.diameter ?? selectedTool.diameter}</p></div>}
                {(selectedTool.item_details?.length || selectedTool.length) && <div><p className="text-xs text-muted-foreground uppercase">Length</p><p className="font-medium">{selectedTool.item_details?.length || selectedTool.length}</p></div>}
                {(selectedTool.item_details?.insert_type || selectedTool.insert_type) && <div><p className="text-xs text-muted-foreground uppercase">Insert Type</p><p className="font-medium">{selectedTool.item_details?.insert_type || selectedTool.insert_type}</p></div>}
                {(selectedTool.item_details?.insert_size || selectedTool.insert_size) && <div><p className="text-xs text-muted-foreground uppercase">Size</p><p className="font-medium">{selectedTool.item_details?.insert_size || selectedTool.insert_size}</p></div>}
                {(selectedTool.item_details?.insert_grade || selectedTool.insert_grade) && <div><p className="text-xs text-muted-foreground uppercase">Grade</p><p className="font-medium">{selectedTool.item_details?.insert_grade || selectedTool.insert_grade}</p></div>}
                {(selectedTool.item_details?.tip_radius || selectedTool.tip_radius) && <div><p className="text-xs text-muted-foreground uppercase">Tip Radius</p><p className="font-medium">{selectedTool.item_details?.tip_radius || selectedTool.tip_radius}</p></div>}
                {(selectedTool.item_details?.grade || selectedTool.grade) && <div><p className="text-xs text-muted-foreground uppercase">Tool Grade</p><p className="font-medium">{selectedTool.item_details?.grade || selectedTool.grade}</p></div>}
                <div><p className="text-xs text-muted-foreground uppercase">{selectedTool._type === 'issued' ? 'Issued To' : 'Returned By'}</p><p className="font-medium">{selectedTool._type === 'issued' ? (selectedTool.issued_to_name || '-') : (selectedTool.returned_by_name || '-')}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">{selectedTool._type === 'issued' ? 'Issued By' : 'Collected By'}</p><p className="font-medium">{selectedTool._type === 'issued' ? (selectedTool.issued_by_name || '-') : (selectedTool.collected_by_name || '-')}</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground uppercase">Time</p><p className="font-medium">{(selectedTool.issued_at || selectedTool.collected_at || selectedTool.returned_at) ? new Date(selectedTool.issued_at || selectedTool.collected_at || selectedTool.returned_at).toLocaleString() : '-'}</p></div>
                {selectedTool.remarks && <div className="col-span-2"><p className="text-xs text-muted-foreground uppercase">Remarks</p><p className="font-medium">{selectedTool.remarks}</p></div>}
              </div>
              {selectedTool.signature && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Signature</p>
                  <img src={selectedTool.signature} alt="Signature" className="w-full max-h-48 object-contain rounded cursor-pointer" style={{backgroundColor:'#1E293B'}} onClick={() => setEnlargedSig(selectedTool.signature)} data-testid="detail-signature" />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Signature Enlarge Modal */}
      <Dialog open={!!enlargedSig} onOpenChange={(o) => !o && setEnlargedSig(null)}>
        <DialogContent className="max-w-2xl" data-testid="signature-modal">
          <DialogHeader><DialogTitle>Signature</DialogTitle></DialogHeader>
          {enlargedSig && <img src={enlargedSig} alt="Signature" className="w-full max-h-[70vh] object-contain rounded" style={{backgroundColor:'#1E293B'}} />}
        </DialogContent>
      </Dialog>

      {/* Post Qty Dialog */}
      <Dialog open={isPostQtyOpen} onOpenChange={(o) => { if (!o) { setIsPostQtyOpen(false); setPostQty(''); } }}>
        <DialogContent className="max-w-md" data-testid="dp-post-qty-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-600" /> Post Production Quantity</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded">
                <p className="text-sm"><span className="text-muted-foreground">Machine:</span> <span className="font-medium">{selectedEntry.machine_name}</span></p>
                <p className="text-sm"><span className="text-muted-foreground">Job:</span> {selectedEntry.job_details}</p>
                {(selectedEntry.total_posted_qty || 0) > 0 && (
                  <p className="text-sm mt-1"><span className="text-muted-foreground">Already posted:</span> <span className="font-bold text-blue-700">{selectedEntry.total_posted_qty} pcs</span></p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Quantity Produced Since Last Post *</Label>
                <Input
                  type="number" min="1"
                  value={postQty}
                  onChange={(e) => setPostQty(e.target.value)}
                  placeholder="Enter pieces produced"
                  autoFocus
                  data-testid="dp-post-qty-input"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setIsPostQtyOpen(false); setPostQty(''); }}>Cancel</Button>
                <Button onClick={handlePostQtyDP} disabled={postQtySubmitting || !postQty} className="bg-blue-600 hover:bg-blue-700" data-testid="dp-confirm-post-qty">
                  {postQtySubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BarChart3 className="w-4 h-4 mr-2" />}
                  Post Qty
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DailyProduction;
