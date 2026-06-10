import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Search, Loader2, ChevronLeft, ChevronRight, Download, ClipboardList,
  Pencil, Trash2, X, Image as ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { exportToPDF } from '../utils/exportPDF';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const PER_PAGE = 20;

const exportToCSV = (data, filename) => {
  if (!data.length) { toast.error('No data'); return; }
  const h = Object.keys(data[0]);
  const rows = [h.join(','), ...data.map(r => h.map(k => `"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], {type:'text/csv'})); a.download = filename; a.click();
  toast.success(`Exported ${data.length} rows`);
};

const fmtDate = (d) => { if (!d) return '-'; try { return format(new Date(d), 'dd MMM yy, hh:mm a'); } catch { return d; } };

// Cycle time stored as seconds — render as "Hh Mm Ss"
const fmtCycle = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' && v.includes(':')) return v;
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return '0s';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};
const isCnc = (e) => {
  const c = (e?.category || '').toLowerCase();
  return c === 'cnc' || c.includes('cnc');
};

const DetailRow = ({ label, value }) => {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%] break-words">{value}</span>
    </div>
  );
};

const Production = () => {
  const [entries, setEntries] = useState([]);
  const [machinesList, setMachinesList] = useState([]);
  const [operatorsList, setOperatorsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState('all');
  const [operatorFilter, setOperatorFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { fetch_(); }, []);

  const fetch_ = async () => {
    try {
      const [entriesRes, machinesRes, operatorsRes] = await Promise.all([
        axios.get(`${API_URL}/api/production-entries`),
        axios.get(`${API_URL}/api/machines`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/operators`).catch(() => axios.get(`${API_URL}/api/users/assignable`).catch(() => ({ data: [] }))),
      ]);
      setEntries(Array.isArray(entriesRes.data) ? entriesRes.data : entriesRes.data.entries || []);
      setMachinesList(Array.isArray(machinesRes.data) ? machinesRes.data : []);
      setOperatorsList(Array.isArray(operatorsRes.data) ? operatorsRes.data : []);
    } catch { setEntries([]); } finally { setLoading(false); }
  };

  const machines = [...new Set(entries.map(e => e.machine_name || e.machine_id).filter(Boolean))].sort();

  const filtered = entries.filter(entry => {
    const s = search.toLowerCase();
    const matchS = !s || [entry.job_name, entry.job_id, entry.machine_name, entry.machine_id, entry.operator_name, entry.operator, entry.part_name, entry.job_details].some(v => (v||'').toLowerCase().includes(s));
    const matchM = machineFilter === 'all' || (entry.machine_name || entry.machine_id) === machineFilter;
    const matchOp = operatorFilter === 'all' || (entry.operator_name || entry.operator) === operatorFilter;
    let matchD = true;
    const entryDate = new Date(entry.created_at || entry.timestamp || entry.date);
    if (dateFilter !== 'all') {
      const now = new Date();
      if (dateFilter === 'today') matchD = entryDate.toDateString() === now.toDateString();
      else if (dateFilter === 'week') matchD = (now - entryDate) < 7 * 86400000;
      else if (dateFilter === 'month') matchD = entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
    }
    // Custom date range overrides preset when provided
    if (dateFrom) matchD = matchD && entryDate >= new Date(dateFrom + 'T00:00:00');
    if (dateTo) matchD = matchD && entryDate <= new Date(dateTo + 'T23:59:59');
    return matchS && matchM && matchOp && matchD;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const start = (page - 1) * PER_PAGE;
  const paginated = filtered.slice(start, start + PER_PAGE);

  const openDetail = (entry) => { setSelected(entry); setIsDetailOpen(true); };
  const openEdit = () => {
    const shiftVal = (typeof selected.shift === 'object' && selected.shift !== null) ? (selected.shift.name || '') : selected.shift;
    const rawShift = String(shiftVal || '').toLowerCase();
    const normalizedShift = rawShift.includes('morning') || rawShift === 'day' ? 'day'
      : rawShift.includes('night') ? 'night'
      : rawShift;
    // Convert seconds → HH:MM:SS for the input
    const ct = Number(selected.cycle_time) || 0;
    const ctStr = ct > 0
      ? `${String(Math.floor(ct/3600)).padStart(2,'0')}:${String(Math.floor((ct%3600)/60)).padStart(2,'0')}:${String(Math.floor(ct%60)).padStart(2,'0')}`
      : '';
    setEditForm({
      machine_name: selected.machine_name || selected.machine_id || '',
      operator_name: selected.operator_name || selected.operator || '',
      job_details: selected.job_details || selected.job_name || '',
      production_qty: selected.quantity || selected.produced_quantity || selected.production_qty || 0,
      cycle_time: ctStr,
      spindle_rpm: selected.spindle_rpm || '',
      feed_rate: selected.feed_rate || '',
      setting_time: selected.setting_time || 0,
      shift: normalizedShift,
      remarks: selected.remarks || '',
    });
    setIsDetailOpen(false);
    setIsEditOpen(true);
  };

  const handleEdit = async (e) => {
    e.preventDefault(); setSubmitting(true);
    const id = selected.entry_id || selected.id || selected._id;
    try {
      const payload = { ...editForm };
      // Convert HH:MM:SS (or MM:SS or SS) → seconds
      if (typeof payload.cycle_time === 'string') {
        const parts = payload.cycle_time.split(':').map(p => parseInt(p, 10) || 0);
        let secs = 0;
        if (parts.length === 3) secs = parts[0]*3600 + parts[1]*60 + parts[2];
        else if (parts.length === 2) secs = parts[0]*60 + parts[1];
        else secs = parts[0] || 0;
        payload.cycle_time = secs;
      }
      if (payload.spindle_rpm === '' || payload.spindle_rpm === null) delete payload.spindle_rpm;
      else payload.spindle_rpm = parseInt(payload.spindle_rpm, 10);
      if (payload.feed_rate === '' || payload.feed_rate === null) delete payload.feed_rate;
      else payload.feed_rate = parseFloat(payload.feed_rate);
      await axios.put(`${API_URL}/api/production-entries/${id}`, payload);
      toast.success('Entry updated'); setIsEditOpen(false); fetch_();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update'); } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    const id = selected.entry_id || selected.id || selected._id;
    try {
      await axios.delete(`${API_URL}/api/production/delete/${id}`).catch(() => axios.delete(`${API_URL}/api/production-entries/${id}`));
      toast.success('Entry deleted'); setIsDeleteOpen(false); setIsDetailOpen(false); fetch_();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete'); } finally { setSubmitting(false); }
  };

  // Build filter params for backend export endpoints
  const buildExportParams = (format) => {
    const params = { format };
    if (machineFilter !== 'all') params.machine = machineFilter;
    if (operatorFilter !== 'all') params.operator = operatorFilter;
    if (search) params.job_details = search;
    // Resolve date range
    let from = null, to = null;
    const now = new Date();
    if (dateFilter === 'today') {
      from = new Date(now.toDateString());
      to = new Date(from.getTime() + 86400000 - 1000);
    } else if (dateFilter === 'week') {
      from = new Date(now.getTime() - 7 * 86400000);
      to = now;
    } else if (dateFilter === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }
    if (dateFrom) from = new Date(dateFrom + 'T00:00:00');
    if (dateTo) to = new Date(dateTo + 'T23:59:59');
    if (from) params.date_from = from.toISOString();
    if (to) params.date_to = to.toISOString();
    return params;
  };

  const downloadFromBackend = async (format, filename) => {
    setExporting(true);
    try {
      const res = await axios.get(`${API_URL}/api/export/production-entries`, {
        params: buildExportParams(format),
        responseType: 'arraybuffer',
      });
      const mime = format === 'pdf' ? 'application/pdf' : 'text/csv';
      const blob = new Blob([res.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      try { const w = window.open(url, '_blank'); if (w) setTimeout(() => { try { w.close(); } catch {} }, 8000); } catch {}
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast.success(`Exported as ${format.toUpperCase()} — check Downloads or new tab`);
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to export ${format.toUpperCase()}`);
    } finally { setExporting(false); }
  };

  const getExportData = () => filtered.map(e => ({
    Date: fmtDate(e.created_at || e.timestamp || e.date), Machine: e.machine_name || '', Job: e.job_name || e.job_details || '', Operator: e.operator_name || '', Quantity: e.quantity || e.produced_quantity || 0, OK: e.ok_quantity || 0, Rejected: e.reject_quantity || 0, Shift: e.shift || 'Morning', Ended_By: e.ended_by || e.ended_by_name || (e.auto_ended ? 'System' : e.operator_name || ''),
  }));
  const handleExport = () => {
    const stamp = new Date().toISOString().slice(0,10);
    // Try backend export (uses all filters) first; fallback to client-side CSV
    downloadFromBackend('csv', `production_${stamp}.csv`).catch(() => exportToCSV(getExportData(), `production_${stamp}.csv`));
  };
  const handleExportPDF = () => {
    const stamp = new Date().toISOString().slice(0,10);
    downloadFromBackend('pdf', `production_${stamp}.pdf`).catch(() => {
      const data = getExportData();
      const cols = ['Date', 'Machine', 'Job', 'Operator', 'Quantity', 'OK', 'Rejected', 'Shift', 'Ended_By'];
      exportToPDF(cols, data.map(r => cols.map(c => String(r[c] ?? ''))), 'Production Entries', `production_${stamp}.pdf`);
    });
  };

  const getImage = (e) => e.image || e.image_url || e.photo || null;

  return (
    <div className="space-y-4" data-testid="production-page">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Production Entries</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0 || exporting} data-testid="export-csv-btn">
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} CSV
          </Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={filtered.length === 0 || exporting} data-testid="export-pdf-btn">
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} PDF
          </Button>
        </div>
      </div>

      <Card className="border border-border"><CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search job, machine, operator..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" data-testid="search-input" /></div>
              <Select value={machineFilter} onValueChange={(v) => { setMachineFilter(v); setPage(1); }}><SelectTrigger className="w-[160px]" data-testid="machine-filter"><SelectValue placeholder="Machine" /></SelectTrigger><SelectContent><SelectItem value="all">All Machines</SelectItem>{machines.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
              <Select value={operatorFilter} onValueChange={(v) => { setOperatorFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[160px]" data-testid="operator-filter"><SelectValue placeholder="Operator" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Operators</SelectItem>
                  {(operatorsList.length > 0
                    ? [...new Set(operatorsList.map(op => op.name || op.full_name || op.username).filter(Boolean))]
                    : [...new Set(entries.map(e => e.operator_name || e.operator).filter(Boolean))]
                  ).sort().map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); setPage(1); }}><SelectTrigger className="w-[130px]" data-testid="date-filter"><SelectValue placeholder="Date" /></SelectTrigger><SelectContent><SelectItem value="all">All Time</SelectItem><SelectItem value="today">Today</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem></SelectContent></Select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{start+1}-{Math.min(start+PER_PAGE, filtered.length)} of {filtered.length}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} data-testid="prev-page-btn"><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm font-medium">{page}/{totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} data-testid="next-page-btn"><ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Custom Range:</span>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-[150px]" data-testid="date-from-picker" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-[150px]" data-testid="date-to-picker" />
            </div>
            {(dateFrom || dateTo || machineFilter !== 'all' || operatorFilter !== 'all' || dateFilter !== 'all' || search) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setMachineFilter('all'); setOperatorFilter('all'); setDateFilter('all'); setSearch(''); setPage(1); }} data-testid="clear-filters-btn">
                <X className="w-3 h-3 mr-1" /> Clear All
              </Button>
            )}
            <Badge variant="outline" className="text-xs ml-auto">{filtered.length} of {entries.length} entries</Badge>
          </div>
        </div>
      </CardContent></Card>

      <Card className="border border-border overflow-hidden"><Table>
        <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
          <TableHead className="text-xs font-semibold uppercase tracking-wider">Date/Time</TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider">Machine</TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Job</TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Operator</TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider">Quantity</TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">OK/Reject</TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Shift</TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Ended By</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
          : paginated.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8"><ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No entries found</p></TableCell></TableRow>
          : paginated.map((entry, i) => (
            <TableRow key={entry.entry_id||entry.id||entry._id||i} className="table-row-hover cursor-pointer" onClick={() => openDetail(entry)} data-testid={`production-row-${i}`}>
              <TableCell className="text-sm">{fmtDate(entry.created_at || entry.timestamp || entry.date)}</TableCell>
              <TableCell className="font-medium">{entry.machine_name || entry.machine_id || '-'}</TableCell>
              <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[150px]">{entry.job_name || entry.job_details || entry.job_id || '-'}</TableCell>
              <TableCell className="hidden lg:table-cell text-muted-foreground">{entry.operator_name || entry.operator || '-'}</TableCell>
              <TableCell className="font-medium">{entry.quantity || entry.produced_quantity || 0}</TableCell>
              <TableCell className="hidden md:table-cell"><span className="text-emerald-600">{entry.ok_quantity || entry.good || 0}</span> / <span className="text-red-600">{entry.reject_quantity || entry.rejected || 0}</span></TableCell>
              <TableCell className="hidden lg:table-cell"><Badge variant="outline" className="text-xs border-none">{(typeof entry.shift === 'object' && entry.shift !== null ? entry.shift.name : entry.shift) || (new Date(entry.created_at || entry.timestamp).getHours() >= 8 && new Date(entry.created_at || entry.timestamp).getHours() < 20 ? 'Morning' : 'Night')}</Badge></TableCell>
              <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">{entry.ended_by || entry.ended_by_name || (entry.auto_ended ? 'System' : entry.operator_name || '-')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></Card>

      {/* DETAIL DIALOG */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Production Entry Details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              {getImage(selected) && (
                <div className="rounded-lg overflow-hidden border border-border">
                  <img src={getImage(selected)} alt="Production" className="w-full max-h-[200px] object-cover" />
                </div>
              )}
              <div className="space-y-1">
                <DetailRow label="Date" value={fmtDate(selected.created_at || selected.timestamp || selected.date)} />
                <DetailRow label="Machine" value={selected.machine_name || selected.machine_id} />
                <DetailRow label="Category" value={selected.category} />
                <DetailRow label="Operator" value={selected.operator_name || selected.operator} />
                <DetailRow label="Job" value={selected.job_name || selected.job_details || selected.job_id} />
                <DetailRow label="Quantity" value={selected.quantity || selected.produced_quantity || selected.production_qty} />
                <DetailRow label="OK Quantity" value={selected.ok_quantity || selected.good} />
                <DetailRow label="Rejected" value={selected.reject_quantity || selected.rejected} />
                <DetailRow label="Cycle Time" value={fmtCycle(selected.cycle_time)} />
                {isCnc(selected) && <DetailRow label="🔄 Spindle RPM" value={selected.spindle_rpm ? `${selected.spindle_rpm} RPM` : null} />}
                {isCnc(selected) && <DetailRow label="📏 Feed Rate" value={selected.feed_rate ? `${selected.feed_rate} mm/min` : null} />}
                <DetailRow label="Setting Time" value={selected.setting_time ? `${selected.setting_time} min` : null} />
                <DetailRow label="Shift" value={(typeof selected.shift === 'object' && selected.shift !== null ? selected.shift.name : selected.shift) || (new Date(selected.created_at || selected.timestamp).getHours() >= 8 && new Date(selected.created_at || selected.timestamp).getHours() < 20 ? 'Morning' : 'Night')} />
                <DetailRow label="Ended By" value={selected.ended_by || selected.ended_by_name || (selected.auto_ended ? 'System' : null)} />
                <DetailRow label="Remarks" value={selected.remarks} />
                <DetailRow label="Start Time" value={fmtDate(selected.start_time)} />
                <DetailRow label="End Time" value={fmtDate(selected.end_time)} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={openEdit} data-testid="edit-entry-btn"><Pencil className="w-4 h-4 mr-2" /> Edit</Button>
                <Button variant="destructive" className="flex-1" onClick={() => { setIsDetailOpen(false); setIsDeleteOpen(true); }} data-testid="delete-entry-btn"><Trash2 className="w-4 h-4 mr-2" /> Delete</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Production Entry</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Machine</Label>
                <Select value={editForm.machine_name || ''} onValueChange={(v) => setEditForm({ ...editForm, machine_name: v })}>
                  <SelectTrigger data-testid="edit-machine-select"><SelectValue placeholder="Select machine" /></SelectTrigger>
                  <SelectContent>
                    {(machinesList.length > 0
                      ? [...new Set(machinesList.map(m => m.name || m.machine_name).filter(Boolean))]
                      : machines
                    ).sort().map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                    {/* Preserve current machine if it isn't in the lists */}
                    {editForm.machine_name &&
                      !(machinesList.length > 0
                        ? machinesList.some(m => (m.name || m.machine_name) === editForm.machine_name)
                        : machines.includes(editForm.machine_name)) && (
                      <SelectItem value={editForm.machine_name}>{editForm.machine_name} (current)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operator</Label>
                <Select value={editForm.operator_name || ''} onValueChange={(v) => setEditForm({ ...editForm, operator_name: v })}>
                  <SelectTrigger data-testid="edit-operator-select"><SelectValue placeholder="Select operator" /></SelectTrigger>
                  <SelectContent>
                    {operatorsList.map(op => {
                      const name = op.name || op.full_name || op.username;
                      if (!name) return null;
                      return <SelectItem key={op.user_id || name} value={name}>{name}</SelectItem>;
                    })}
                    {editForm.operator_name &&
                      !operatorsList.some(op => (op.name || op.full_name || op.username) === editForm.operator_name) && (
                      <SelectItem value={editForm.operator_name}>{editForm.operator_name} (current)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Job Details</Label><Input value={editForm.job_details||''} onChange={e => setEditForm({...editForm, job_details: e.target.value})} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Quantity</Label><Input type="number" value={editForm.production_qty||0} onChange={e => setEditForm({...editForm, production_qty: parseInt(e.target.value)||0})} /></div>
              <div className="space-y-2"><Label>Cycle Time (HH:MM:SS)</Label><Input value={editForm.cycle_time||''} onChange={e => setEditForm({...editForm, cycle_time: e.target.value})} placeholder="00:00:00" data-testid="edit-cycle-time-input" /></div>
              <div className="space-y-2"><Label>Setting Time</Label><Input type="number" step="0.1" value={editForm.setting_time||0} onChange={e => setEditForm({...editForm, setting_time: parseFloat(e.target.value)||0})} /></div>
            </div>
            {isCnc(selected) && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>🔄 Spindle RPM</Label><Input type="number" min="0" value={editForm.spindle_rpm||''} onChange={e => setEditForm({...editForm, spindle_rpm: e.target.value})} placeholder="e.g., 2500" /></div>
                <div className="space-y-2"><Label>📏 Feed Rate (mm/min)</Label><Input type="number" min="0" value={editForm.feed_rate||''} onChange={e => setEditForm({...editForm, feed_rate: e.target.value})} placeholder="e.g., 150" /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Shift</Label>
                <Select value={editForm.shift || ''} onValueChange={(v) => setEditForm({ ...editForm, shift: v })}>
                  <SelectTrigger data-testid="edit-shift-select"><SelectValue placeholder="Select shift" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day (8 AM – 8 PM)</SelectItem>
                    <SelectItem value="night">Night (8 PM – 6 AM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Remarks</Label><Input value={editForm.remarks||''} onChange={e => setEditForm({...editForm, remarks: e.target.value})} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE DIALOG */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Entry?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete this production entry. This action cannot be undone.</p>
          <DialogFooter><Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleDelete} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Production;
