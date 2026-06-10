import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import PrintQRModal, { PUBLIC_QR_HOST } from '../components/PrintQRModal';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Search, Plus, Loader2, ChevronLeft, ChevronRight, Package, Edit, Trash2, QrCode, Printer, MoreVertical, Upload, FileSpreadsheet, Check, Eye, Download, PlusCircle, MinusCircle, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { exportToPDF } from '../utils/exportPDF';
import { printPDFDrawing } from '../utils/safePrint';
import * as XLSX from 'xlsx';

const API = process.env.REACT_APP_BACKEND_URL;
const PER_PAGE = 20;
const CATEGORIES = ['RAW', 'FINISHED', 'BOUGHT OUT', 'CONSUMABLE'];
const TYPES = ['ROD', 'PLATE', 'SHEET', 'BEARING', 'BOLT', 'NUT', 'WASHER', 'SEAL', 'GEAR', 'SHAFT', 'BUSHING', 'PIN', 'SPRING', 'SCREW', 'BRACKET', 'HOUSING', 'COVER', 'FLANGE'];
const UNITS = ['PCS', 'KG', 'MTR', 'SET', 'LTR', 'BOX', 'NOS', 'PAIR'];

const exportCSV = (data, filename) => {
  if (!data.length) { toast.error('No data to export'); return; }
  const headers = Object.keys(data[0]);
  const rows = [headers.join(','), ...data.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  toast.success(`Exported ${data.length} rows`);
};

const Paginator = ({ currentPage, totalPages, total, perPage, onChange }) => {
  if (totalPages <= 1) return null;
  const start = (currentPage - 1) * perPage + 1;
  const end = Math.min(currentPage * perPage, total);
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <span className="text-xs text-muted-foreground whitespace-nowrap">Showing {start}-{end} of {total}</span>
      <Button variant="outline" size="sm" onClick={() => onChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
      <span className="text-sm font-medium">{currentPage}/{totalPages}</span>
      <Button variant="outline" size="sm" onClick={() => onChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}><ChevronRight className="w-4 h-4" /></Button>
    </div>
  );
};

const PartsLibrary = () => {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Dialog states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isQROpen, setIsQROpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [form, setForm] = useState({ part_no: '', name: '', category: 'RAW', part_type: '', material: '', size: '', length: '', variant: 'A1', unit: 'PCS', remarks: '', image: null, drawing: null });
  const [customType, setCustomType] = useState('');

  // Excel import
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importPreview, setImportPreview] = useState(null); // parsed rows for preview
  const [originalPreview, setOriginalPreview] = useState(null); // snapshot for edit-detection
  // Material conflicts (parts with same name+size but different materials)
  const [materialConflicts, setMaterialConflicts] = useState([]); // [{ key, name, size, parts, message, materials? }]
  const [conflictResolutions, setConflictResolutions] = useState({}); // { [key]: 'keep_separate' | 'merge' }
  // Holds the parsed preview payload until conflicts are resolved
  const [pendingPreview, setPendingPreview] = useState(null);

  // Stock add/deduct
  const [isStockOpen, setIsStockOpen] = useState(false);
  const [stockMode, setStockMode] = useState('add'); // 'add' or 'deduct'
  const [stockQty, setStockQty] = useState(1);
  const [stockReason, setStockReason] = useState('');
  const [stockSubmitting, setStockSubmitting] = useState(false);

  const fetchParts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/parts-library`);
      setParts(Array.isArray(data) ? data : data.parts || []);
    } catch (e) { console.error(e); setParts([]); }
    finally { setLoading(false); }
  }, []);

  // part_id -> [{assembly_id, name}, ...] — used to render a "Linked × N" badge
  const [usageMap, setUsageMap] = useState({});
  const fetchUsageMap = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/parts-library/usage-map`);
      setUsageMap(data?.usage || {});
    } catch { setUsageMap({}); }
  }, []);

  useEffect(() => { fetchParts(); fetchUsageMap(); }, [fetchParts, fetchUsageMap]);

  // Client-side search and filter
  const filtered = parts.filter(p => {
    const s = search.toLowerCase();
    const matchSearch = !s || (p.name || '').toLowerCase().includes(s) || (p.part_id || '').toLowerCase().includes(s) || (p.part_no || '').toLowerCase().includes(s) || (p.part_type || '').toLowerCase().includes(s) || (p.material || '').toLowerCase().includes(s) || (p.size || '').toLowerCase().includes(s);
    const matchCat = catFilter === 'all' || (p.category || '').toUpperCase() === catFilter;
    const matchType = typeFilter === 'all' || (p.part_type || '').toUpperCase() === typeFilter;
    return matchSearch && matchCat && matchType;
  });
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const resetForm = () => { setForm({ part_no: '', name: '', category: 'RAW', part_type: '', material: '', size: '', length: '', variant: 'A1', unit: 'PCS', remarks: '', image: null, drawing: null }); setCustomType(''); };

  const handleSave = async (isEdit = false) => {
    if (!form.name) { toast.error('Part name is required'); return; }
    setSubmitting(true);
    try {
      const payload = { ...form, part_type: form.part_type || customType };
      if (payload.image && typeof payload.image !== 'string') {
        const reader = new FileReader();
        payload.image = await new Promise(r => { reader.onload = () => r(reader.result); reader.readAsDataURL(payload.image); });
      }
      if (payload.drawing && typeof payload.drawing !== 'string') {
        const reader = new FileReader();
        payload.drawing = await new Promise(r => { reader.onload = () => r(reader.result); reader.readAsDataURL(payload.drawing); });
      }
      if (isEdit && selected) {
        await axios.put(`${API}/api/parts-library/${selected.part_id}`, payload);
        toast.success('Part updated');
      } else {
        await axios.post(`${API}/api/parts-library`, payload);
        toast.success('Part created');
      }
      setIsAddOpen(false); setIsEditOpen(false); resetForm(); fetchParts();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await axios.delete(`${API}/api/parts-library/${selected.part_id}`);
      toast.success('Part deleted');
      setIsDeleteOpen(false); setIsDetailOpen(false); fetchParts();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const openEdit = (part) => {
    setForm({
      part_no: part.part_no || '',
      name: part.name,
      category: part.category,
      part_type: part.part_type,
      material: part.material || '',
      size: part.size || '',
      length: part.length || '',
      variant: part.variant || 'A1',
      unit: part.unit || 'PCS',
      remarks: part.remarks || '',
      image: null,
      drawing: null,
    });
    setCustomType(part.part_type || '');
    setSelected(part);
    setIsEditOpen(true);
  };

  const openDetail = (part) => { setSelected(part); setIsDetailOpen(true); };
  const openQR = (part) => { setSelected(part); setIsQROpen(true); };

  const openStockDialog = (mode) => {
    setStockMode(mode);
    setStockQty(1);
    setStockReason('');
    setIsDetailOpen(false);
    setIsStockOpen(true);
  };

  const handleStockChange = async () => {
    if (!selected) return;
    setStockSubmitting(true);
    try {
      const qty = stockMode === 'add' ? stockQty : -stockQty;
      // Use the parts-library stock endpoint directly
      await axios.post(`${API}/api/parts-library/${selected.part_id}/stock`, {
        quantity: qty,
        reason: stockReason || (stockMode === 'add' ? 'Added from Parts Library' : 'Deducted from Parts Library'),
      });
      toast.success(`${stockMode === 'add' ? 'Added' : 'Deducted'} ${stockQty} ${stockMode === 'add' ? 'to' : 'from'} stock`);
      setIsStockOpen(false);
      fetchParts();
    } catch (e) {
      // Fallback: try PUT to update stock directly
      try {
        const newStock = stockMode === 'add' ? (selected.stock ?? 0) + stockQty : Math.max(0, (selected.stock ?? 0) - stockQty);
        await axios.put(`${API}/api/parts-library/${selected.part_id}`, { stock: newStock });
        toast.success(`${stockMode === 'add' ? 'Added' : 'Deducted'} ${stockQty} ${stockMode === 'add' ? 'to' : 'from'} stock`);
        setIsStockOpen(false);
        fetchParts();
      } catch (e2) {
        toast.error(e2.response?.data?.detail || 'Failed to update stock');
      }
    } finally { setStockSubmitting(false); }
  };

  const getCatColor = (cat) => {
    if (cat === 'RAW') return 'bg-blue-100 text-blue-700';
    if (cat === 'FINISHED') return 'bg-emerald-100 text-emerald-700';
    if (cat === 'BOUGHT OUT') return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  };

  // Build a client-side BOM template that exactly matches the backend's expected format (9 columns)
  const buildLocalTemplate = () => {
    const wb = XLSX.utils.book_new();
    const aoa = [
      ['Assembly Name:', 'WS04 SPRAY'],
      ['Description:', 'Spray Gun Assembly'],
      ['Part No', 'Part Name', 'Material', 'Category', 'Dia/ID/WxB', 'Length/Thickness', 'Qty', 'Unit', 'Remarks'],
      ['PART NO - 01', 'Main Body',        'SS 316',  'Machined Part', '',      '',    1, 'PCS', ''],
      ['PART NO - 06', 'Needle Rod',       'SS 316',  'Shaft / Rod',   '6',     '50',  1, 'PCS', ''],
      ['PART NO - 10', 'Washer',           'SS 316',  'Fastener',      'M4',    '',    2, 'PCS', ''],
      ['PART NO - 11', 'Hex Screw',        'SS 316',  'Fastener',      'M4',    '10',  4, 'PCS', ''],
      ['PART NO - 15', 'Connector Nipple', 'SS 316',  'Fitting',       '1/4',   '',    1, 'PCS', ''],
      ['PART NO - 21', 'O-Ring Small',     'Nitrile', 'O-Ring',        '10',    '1.5', 2, 'PCS', 'ID x Thickness'],
      ['PART NO - 30', 'Square Block',     'SS 316',  'Machined Part', '20x15', '30',  1, 'PCS', 'WxB x Length'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 6 }, { wch: 6 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'BOM');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  const triggerBlobDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    // Open in new tab too — preview iframe is sandboxed without allow-downloads,
    // but a top-level new tab is not, so the browser will save the file there.
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Fallback: if the click in a sandboxed frame got blocked, also try window.open
    try {
      const w = window.open(url, '_blank');
      if (w) setTimeout(() => { try { w.close(); } catch {} }, 8000);
    } catch {}
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  // Download the unified BOM template (backend first, client-side fallback if missing)
  const handleDownloadTemplate = async () => {
    try {
      // arraybuffer (not blob) avoids the platform RUM "responseText" InvalidStateError
      const res = await axios.get(`${API}/api/templates/bom-excel`, { responseType: 'arraybuffer' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      triggerBlobDownload(blob, 'BOM_Template.xlsx');
      toast.success('Template downloaded — check your Downloads folder or the new tab');
    } catch (err) {
      // Fallback: generate the same template locally (works even without backend)
      triggerBlobDownload(buildLocalTemplate(), 'BOM_Template.xlsx');
      toast.success('Template downloaded (offline copy) — check your Downloads folder');
    }
  };

  // Excel import — Step 1: send to backend for parsing
  const handleImportParse = async () => {
    if (!importFile) { toast.error('Select an Excel file'); return; }
    setImportLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const { data } = await axios.post(`${API}/api/parse-bom-excel`, fd);
      if (!data?.success) {
        toast.error(data?.detail || 'Failed to parse Excel');
        setImportLoading(false);
        return;
      }
      // Map backend response fields to UI-friendly shape (size1/size2 + status badges preserved)
      const parts = (data.parts || []).map(p => ({
        row: p.row,
        part_no: p.part_no || '',
        name: p.part_name || '',
        material: p.material || '',
        category: p.category || '',
        part_type: p.part_type || '',
        size1: p.size1 || '',
        size2: p.size2 || '',
        size: p.size || '',
        is_oring: !!p.is_oring,
        quantity: Number(p.qty) || 1,
        unit: p.unit || 'PCS',
        remarks: p.remarks || '',
        status: p.status || 'new',
        existing_id: p.existing_id || null,
        generated_id: p.generated_id || '',
      }));
      const previewPayload = {
        assembly_name: data.assembly_name || '',
        assembly_code: data.assembly_code || '',
        description: data.assembly_description || '',
        parts,
        new_parts: data.new_parts ?? parts.filter(p => p.status === 'new').length,
        existing_parts: data.existing_parts ?? parts.filter(p => p.status !== 'new').length,
        total_parts: data.total_parts ?? parts.length,
      };

      // Check for material conflicts (same name+size, different materials).
      const conflicts = Array.isArray(data.material_conflicts) ? data.material_conflicts : [];
      if (conflicts.length > 0) {
        // Default every conflict to "keep_separate" (safe non-destructive choice)
        const defaults = {};
        conflicts.forEach(c => { defaults[c.key] = 'keep_separate'; });
        setMaterialConflicts(conflicts);
        setConflictResolutions(defaults);
        setPendingPreview(previewPayload);
        toast.warning(`Found ${conflicts.length} material conflict${conflicts.length > 1 ? 's' : ''} — please resolve before importing`);
        return;
      }

      // No conflicts — go straight to preview
      setMaterialConflicts([]);
      setConflictResolutions({});
      setPendingPreview(null);
      setImportPreview(previewPayload);
      // Snapshot for edit-detection on confirm step
      setOriginalPreview(JSON.parse(JSON.stringify({
        assembly_name: previewPayload.assembly_name,
        description: previewPayload.description,
        parts,
      })));
      toast.success(`Parsed ${parts.length} parts from "${data.assembly_name || 'BOM'}"`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to parse Excel');
    } finally {
      setImportLoading(false);
    }
  };

  // After user resolves all material conflicts, move on to the preview step.
  const handleResolveConflicts = () => {
    if (!pendingPreview) return;
    setImportPreview(pendingPreview);
    setOriginalPreview(JSON.parse(JSON.stringify({
      assembly_name: pendingPreview.assembly_name,
      description: pendingPreview.description,
      parts: pendingPreview.parts,
    })));
    setPendingPreview(null);
    toast.success('Conflicts resolved — review parts and confirm import');
  };

  // Preview is read-only: backend re-parses the original Excel file as-is.
  // Editing client-side would mislead users since changes would be discarded.

  // Step 2: confirm — the legacy importer expects the SAME original file the user uploaded.
  // Per APK spec: "Web uploads the same Excel file again as multipart form data" — backend re-parses + creates assembly + parts.
  const handleImportConfirm = async () => {
    if (!importPreview || !importFile) return;
    setImportLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile, importFile.name || 'bom.xlsx');
      // Attach material conflict resolutions if user resolved any
      const hasResolutions = Object.keys(conflictResolutions || {}).length > 0;
      if (hasResolutions) {
        fd.append('conflict_resolutions', JSON.stringify(conflictResolutions));
      }
      // Try the unified BOM importer first (same parser as parse-bom-excel).
      // Fall back to the legacy pump/spray importer if it 404s.
      let data;
      try {
        const res = await axios.post(`${API}/api/import-bom-excel`, fd);
        data = res.data;
      } catch (e1) {
        if (e1.response?.status === 404) {
          // Build a fresh FormData (the previous one's file stream was consumed)
          const fd2 = new FormData();
          fd2.append('file', importFile, importFile.name || 'bom.xlsx');
          if (hasResolutions) fd2.append('conflict_resolutions', JSON.stringify(conflictResolutions));
          const res = await axios.post(`${API}/api/import-pump-spray-excel`, fd2);
          data = res.data;
        } else {
          throw e1;
        }
      }
      if (data?.success === false) { toast.error(data.detail || 'Import failed'); setImportLoading(false); return; }
      setImportResult(data);
      setImportPreview(null);
      setOriginalPreview(null);
      toast.success(`Assembly "${data?.assembly?.name || importPreview.assembly_name}" imported with ${data?.summary?.total_processed ?? importPreview.parts.length} parts`);
      fetchParts();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportResult(null);
    setImportPreview(null);
    setOriginalPreview(null);
    setMaterialConflicts([]);
    setConflictResolutions({});
    setPendingPreview(null);
  };

  const handleExportCSV = () => exportCSV(filtered.map(p => ({
    Part_ID: p.part_id, Name: p.name, Category: p.category, Type: p.part_type || '', Size: p.size || '', Length: p.length || '', Unit: p.unit || 'PCS', Stock: p.stock ?? 0
  })), `parts_library_${new Date().toISOString().slice(0, 10)}.csv`);

  const handleExportPDF = () => {
    const cols = ['Part ID', 'Name', 'Category', 'Type', 'Size', 'Stock', 'Unit'];
    const rows = filtered.map(p => [p.part_id, p.name, p.category, p.part_type || '-', p.size || '-', String(p.stock ?? 0), p.unit || 'PCS']);
    exportToPDF(cols, rows, 'Parts Library', `parts_library_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-4" data-testid="parts-library-page">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Parts Library</h1>
      </div>

      {/* Top bar: Search + Filters + Actions */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1 flex-wrap">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search parts..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-10" data-testid="search-parts" />
          </div>
          <Select value={catFilter} onValueChange={v => { setCatFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]" data-testid="filter-category"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Categories</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[130px]" data-testid="filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Types</SelectItem>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={() => { resetForm(); setIsAddOpen(true); }} data-testid="add-part-btn"><Plus className="w-4 h-4 mr-2" /> Add Part</Button>
          <Button variant="outline" onClick={() => { resetImport(); setIsImportOpen(true); }} data-testid="import-excel-btn"><FileSpreadsheet className="w-4 h-4 mr-2" /> Import Excel</Button>
          <Button variant="outline" onClick={handleExportCSV} disabled={filtered.length === 0} data-testid="export-csv-btn"><Download className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={filtered.length === 0} data-testid="export-pdf-btn"><Download className="w-4 h-4 mr-2" /> PDF</Button>
        </div>
        <Paginator currentPage={page} totalPages={totalPages} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>

      {/* Parts Table */}
      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Name</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Category</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Type</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Size</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Stock</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Unit</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Package className="w-10 h-10 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No parts found</p></TableCell></TableRow>
            ) : paginated.map((part, i) => (
              <TableRow key={part.part_id || i} className="table-row-hover cursor-pointer" onClick={() => openDetail(part)} data-testid={`part-row-${i}`}>
                <TableCell className="font-medium">
                  <div className="flex flex-col gap-0.5">
                    {part.part_no && <span className="text-xs font-mono text-primary font-semibold">{part.part_no}</span>}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{part.name}</span>
                      {(() => {
                        const links = usageMap[part.part_id] || [];
                        if (links.length === 0) return null;
                        const title = `Used in:\n${links.map(l => `• ${l.name} (${l.assembly_id})`).join('\n')}`;
                        return (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px] py-0 px-1.5" title={title} data-testid={`pl-linked-${part.part_id}`}>
                            <Link2 className="w-3 h-3 mr-1" /> {links.length}
                          </Badge>
                        );
                      })()}
                    </div>
                    {part.part_id && <span className="text-[10px] text-muted-foreground font-mono">{part.part_id}</span>}
                  </div>
                </TableCell>
                <TableCell><Badge className={`border-none text-xs ${getCatColor(part.category)}`}>{part.category}</Badge>{part.material && <div className="text-[10px] text-muted-foreground mt-0.5">{part.material}</div>}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{part.part_type || '-'}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{part.size ? `${part.size}${part.length ? ' x ' + part.length : ''}` : '-'}</TableCell>
                <TableCell className="font-semibold">{part.stock ?? 0}</TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">{part.unit || 'PCS'}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}><Button variant="ghost" size="icon" data-testid={`part-menu-${i}`}><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDetail(part); }}><Eye className="w-4 h-4 mr-2" /> View</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(part); }}><Edit className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openQR(part); }}><QrCode className="w-4 h-4 mr-2" /> QR Code</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelected(part); setIsDeleteOpen(true); }} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination bottom */}
      {totalPages > 1 && (
        <div className="flex justify-end">
          <Paginator currentPage={page} totalPages={totalPages} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
        </div>
      )}

      {/* Add Part Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add New Part</DialogTitle></DialogHeader>
          <PartForm form={form} setForm={setForm} customType={customType} setCustomType={setCustomType} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={() => handleSave(false)} disabled={submitting} data-testid="save-part-btn">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save Part</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Part Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Part</DialogTitle></DialogHeader>
          <PartForm form={form} setForm={setForm} customType={customType} setCustomType={setCustomType} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={() => handleSave(true)} disabled={submitting} data-testid="update-part-btn">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Update Part</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Part Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Part Details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 overflow-y-auto pr-1 flex-1 min-h-0">
              {selected.image && <div className="rounded-lg overflow-hidden border border-border bg-muted/30 flex items-center justify-center"><img src={selected.image} alt={selected.name} className="w-full max-h-[240px] object-contain" /></div>}
              <div className="space-y-1">
                <DetailRow label="Part ID" value={<span className="font-mono text-primary">{selected.part_id}</span>} />
                {selected.part_no && <DetailRow label="Part No" value={<span className="font-mono">{selected.part_no}</span>} />}
                <DetailRow label="Name" value={selected.name} />
                {selected.material && <DetailRow label="Material" value={selected.material} />}
                <DetailRow label="Category" value={<Badge className={`border-none ${getCatColor(selected.category)}`}>{selected.category}</Badge>} />
                <DetailRow label="Type" value={selected.part_type || '-'} />
                <DetailRow label="Dia / ID / WxB" value={selected.size || '-'} />
                <DetailRow label="Length / Thickness" value={selected.length || '-'} />
                <DetailRow label="Variant" value={selected.variant || '-'} />
                <DetailRow label="Unit" value={selected.unit || 'PCS'} />
                <DetailRow label="Stock" value={<span className="font-bold">{selected.stock ?? 0}</span>} />
                <DetailRow label="Reserved" value={selected.reserved_stock ?? 0} />
                {selected.remarks && <DetailRow label="Remarks" value={selected.remarks} />}
                {selected.source_assembly && <DetailRow label="Source Assembly" value={selected.source_assembly} />}
              </div>
              {selected.drawing && (
                <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                  <span className="text-sm">Drawing attached</span>
                  <Button variant="ghost" size="sm" onClick={() => printPDFDrawing(selected.drawing)}>View PDF</Button>
                </div>
              )}
            </div>
          )}
          {selected && (
            <div className="flex gap-2 pt-3 mt-2 border-t flex-wrap flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => openStockDialog('add')} data-testid="add-stock-btn"><PlusCircle className="w-4 h-4 mr-1" />Add Stock</Button>
              <Button variant="outline" size="sm" onClick={() => openStockDialog('deduct')} data-testid="deduct-stock-btn"><MinusCircle className="w-4 h-4 mr-1" />Deduct</Button>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => { setIsDetailOpen(false); openEdit(selected); }} data-testid="edit-detail-btn"><Edit className="w-4 h-4 mr-1" />Edit</Button>
              <Button variant="outline" size="sm" onClick={() => { setIsDetailOpen(false); openQR(selected); }}><QrCode className="w-4 h-4 mr-1" />QR</Button>
              <Button variant="destructive" size="sm" onClick={() => { setIsDetailOpen(false); setIsDeleteOpen(true); }}><Trash2 className="w-4 h-4" /></Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Part?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Permanently delete <span className="font-medium text-foreground">{selected?.name} ({selected?.part_id})</span>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting} data-testid="confirm-delete-btn">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Modal */}
      <PrintQRModal
        open={isQROpen}
        onClose={setIsQROpen}
        value={selected?.part_id}
        qrValue={selected?.part_id ? `${PUBLIC_QR_HOST}/part/${selected.part_id}` : ''}
        title="Part QR Code"
        subtitle={selected?.name}
      />

      {/* Add/Deduct Stock Dialog */}
      <Dialog open={isStockOpen} onOpenChange={setIsStockOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{stockMode === 'add' ? 'Add Stock' : 'Deduct Stock'} — {selected?.name}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p>Part: <span className="font-mono text-primary">{selected.part_id}</span></p>
                <p>Current Stock: <span className="font-bold">{selected.stock ?? 0}</span> {selected.unit || 'PCS'}</p>
              </div>
              <div className="space-y-2">
                <Label>Quantity to {stockMode}</Label>
                <Input type="number" min="1" max={stockMode === 'deduct' ? (selected.stock ?? 0) : undefined} value={stockQty} onChange={e => setStockQty(Math.max(1, parseInt(e.target.value) || 1))} data-testid="stock-qty-input" />
              </div>
              {stockMode === 'deduct' && (
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Input value={stockReason} onChange={e => setStockReason(e.target.value)} placeholder="e.g. Used in production" data-testid="stock-reason-input" />
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                New stock will be: <span className="font-bold">{stockMode === 'add' ? (selected.stock ?? 0) + stockQty : Math.max(0, (selected.stock ?? 0) - stockQty)}</span> {selected.unit || 'PCS'}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsStockOpen(false)}>Cancel</Button>
                <Button onClick={handleStockChange} disabled={stockSubmitting || (stockMode === 'deduct' && stockQty > (selected.stock ?? 0))} data-testid="confirm-stock-btn">
                  {stockSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {stockMode === 'add' ? 'Add Stock' : 'Deduct Stock'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Excel Import Dialog — 4 steps: Upload → (Conflicts) → Preview/Edit → Confirm */}
      <Dialog open={isImportOpen} onOpenChange={(v) => { setIsImportOpen(v); if (!v) resetImport(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>{
            importResult
              ? 'Import Complete'
              : importPreview
                ? 'Preview & Edit Parts'
                : (materialConflicts.length > 0 && pendingPreview)
                  ? 'Resolve Material Conflicts'
                  : 'Import BOM from Excel'
          }</DialogTitle></DialogHeader>
          <div className="space-y-4 flex-1 overflow-auto">

            {/* Step 1: Upload */}
            {!importPreview && !importResult && !(materialConflicts.length > 0 && pendingPreview) && (
              <>
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 flex items-start gap-3" data-testid="download-template-block">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-blue-900">Need a starting point?</p>
                    <p className="text-xs text-blue-800 mt-0.5">Download the unified BOM template (10 columns) with sample rows for O-Ring, Round, Square, and Fastener parts.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="border-blue-300 text-blue-700 hover:bg-blue-100" data-testid="download-template-btn">
                    <Download className="w-4 h-4 mr-2" /> Template
                  </Button>
                </div>

                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <FileSpreadsheet className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-1">Upload Excel (.xlsx) in BOM format</p>
                  <p className="text-xs text-muted-foreground mb-3">Row 1: Assembly Name • Row 2: Description • Row 3: Headers (9 cols) • Row 4+: Parts</p>
                  <p className="text-[11px] text-muted-foreground mb-4">Columns: Part No • Part Name • Material • Category • <span className="font-semibold">Dia/ID/WxB</span> • <span className="font-semibold">Length/Thickness</span> • Qty • Unit • Remarks</p>
                  <Input type="file" accept=".xlsx,.xls" onChange={e => setImportFile(e.target.files[0] || null)} className="max-w-xs mx-auto" data-testid="import-file-input" />
                  {importFile && <p className="text-sm text-primary mt-2">{importFile.name}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button>
                  <Button onClick={handleImportParse} disabled={!importFile || importLoading} data-testid="upload-excel-btn">
                    {importLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                    Upload & Preview
                  </Button>
                </DialogFooter>
              </>
            )}

            {/* Step 1.5: Material Conflict Resolution */}
            {!importPreview && !importResult && materialConflicts.length > 0 && pendingPreview && (
              <>
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-3" data-testid="conflict-banner">
                  <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold flex-shrink-0">!</div>
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-amber-900">
                      {materialConflicts.length} part{materialConflicts.length > 1 ? 's' : ''} share the same name & size but use different materials.
                    </p>
                    <p className="text-xs text-amber-800 mt-0.5">
                      For each conflict, decide whether the materials should be kept as <b>separate</b> parts (different Part IDs) or <b>merged</b> into a single part (last material wins).
                    </p>
                  </div>
                </div>

                <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                  {materialConflicts.map((c, idx) => {
                    const choice = conflictResolutions[c.key] || 'keep_separate';
                    const partsList = Array.isArray(c.parts) ? c.parts : [];
                    return (
                      <div key={c.key || idx} className="border border-amber-200 rounded-lg p-3 bg-white" data-testid={`conflict-row-${idx}`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm">{c.name || '—'}</div>
                            <div className="text-xs text-muted-foreground">Size: <span className="font-mono">{c.size || '—'}</span></div>
                            {c.message && <div className="text-[11px] text-amber-700 mt-1">{c.message}</div>}
                          </div>
                          <Badge variant="outline" className="text-[10px]">key: {c.key}</Badge>
                        </div>

                        {partsList.length > 0 && (
                          <div className="bg-muted/40 rounded p-2 mb-2 space-y-1">
                            {partsList.map((p, j) => (
                              <div key={j} className="flex items-center gap-2 text-xs">
                                <Badge className="bg-slate-200 text-slate-800 border-none text-[10px] font-mono">
                                  {p.material || p.Material || '—'}
                                </Badge>
                                {(p.part_no || p.PartNo) && <span className="font-mono text-[10px] text-muted-foreground">{p.part_no || p.PartNo}</span>}
                                {(p.row || p.Row) && <span className="text-[10px] text-muted-foreground">row {p.row || p.Row}</span>}
                                {(p.qty || p.Qty) && <span className="text-[10px] text-muted-foreground">× {p.qty || p.Qty}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2 flex-wrap">
                          <button
                            type="button"
                            data-testid={`conflict-keep-${idx}`}
                            onClick={() => setConflictResolutions(r => ({ ...r, [c.key]: 'keep_separate' }))}
                            className={`flex-1 min-w-[160px] text-left rounded-md border p-2 transition-colors ${choice === 'keep_separate' ? 'border-emerald-500 bg-emerald-50' : 'border-border hover:bg-muted/30'}`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${choice === 'keep_separate' ? 'border-emerald-600' : 'border-muted-foreground'}`}>
                                {choice === 'keep_separate' && <div className="w-2 h-2 rounded-full bg-emerald-600" />}
                              </div>
                              <span className="text-sm font-semibold">Keep Separate</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 pl-6">Create distinct Part IDs per material (recommended).</p>
                          </button>
                          <button
                            type="button"
                            data-testid={`conflict-merge-${idx}`}
                            onClick={() => setConflictResolutions(r => ({ ...r, [c.key]: 'merge' }))}
                            className={`flex-1 min-w-[160px] text-left rounded-md border p-2 transition-colors ${choice === 'merge' ? 'border-blue-500 bg-blue-50' : 'border-border hover:bg-muted/30'}`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${choice === 'merge' ? 'border-blue-600' : 'border-muted-foreground'}`}>
                                {choice === 'merge' && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                              </div>
                              <span className="text-sm font-semibold">Merge</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 pl-6">Combine into one part. Last material in the file wins.</p>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMaterialConflicts([]);
                      setConflictResolutions({});
                      setPendingPreview(null);
                    }}
                    data-testid="conflict-back-btn"
                  >Back</Button>
                  <Button onClick={handleResolveConflicts} data-testid="conflict-continue-btn">
                    <Check className="w-4 h-4 mr-2" />
                    Apply & Continue to Preview
                  </Button>
                </DialogFooter>
              </>
            )}

            {/* Step 2: Preview (Read-only) */}
            {importPreview && !importResult && (
              <>
                <div className="rounded-md border border-blue-200 bg-blue-50/70 p-2.5 text-xs text-blue-900" data-testid="preview-readonly-banner">
                  <span className="font-semibold">Read-only preview.</span> The backend re-parses the original Excel file on import. If anything looks wrong, click <span className="font-semibold">Back</span>, fix your Excel, and re-upload.
                </div>

                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Assembly Name</div>
                      <div className="font-semibold" data-testid="preview-asm-name">{importPreview.assembly_name || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Description</div>
                      <div className="font-medium">{importPreview.description || '—'}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap text-xs">
                    <Badge className="bg-emerald-100 text-emerald-700 border-none">✨ {importPreview.new_parts} new</Badge>
                    <Badge className="bg-blue-100 text-blue-700 border-none">🔄 {importPreview.existing_parts} existing</Badge>
                    <Badge variant="outline">Total {importPreview.total_parts} parts</Badge>
                    {Object.keys(conflictResolutions).length > 0 && (
                      <Badge className="bg-amber-100 text-amber-800 border-none" data-testid="resolutions-applied-badge">
                        ⚠ {Object.keys(conflictResolutions).length} material conflict{Object.keys(conflictResolutions).length > 1 ? 's' : ''} resolved
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {importPreview.parts.map((p, i) => (
                    <div key={i} className={`border rounded-lg p-3 ${p.status === 'existing' ? 'border-blue-200 bg-blue-50/30' : 'border-emerald-200 bg-emerald-50/20'}`} data-testid={`preview-part-${i}`}>
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Badge className={`text-[10px] border-none ${p.status === 'existing' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {p.status === 'existing' ? '🔄 Existing' : '✨ New'}
                        </Badge>
                        {p.is_oring && <Badge className="bg-purple-100 text-purple-700 border-none text-[10px]">⚪ O-Ring</Badge>}
                        {p.part_no && <span className="text-[11px] font-mono font-semibold text-primary">{p.part_no}</span>}
                        {p.generated_id && <span className="text-[10px] font-mono text-muted-foreground">{p.generated_id}</span>}
                      </div>

                      <div className="text-sm font-semibold leading-tight">{p.name || '—'}</div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        {p.material && <span><span className="text-foreground/70">Material:</span> <span className="font-medium text-foreground">{p.material}</span></span>}
                        {p.category && <span><span className="text-foreground/70">Category:</span> <span className="font-medium text-foreground">{p.category}</span></span>}
                        {(p.size1 || p.size) && <span><span className="text-foreground/70">Dia/ID/WxB:</span> <span className="font-medium text-foreground font-mono">{p.size1 || p.size}</span></span>}
                        {p.size2 && <span><span className="text-foreground/70">Length/Thk:</span> <span className="font-medium text-foreground font-mono">{p.size2}</span></span>}
                        <span><span className="text-foreground/70">Qty:</span> <span className="font-semibold text-foreground">{p.quantity}</span> {p.unit || 'PCS'}</span>
                        {p.remarks && <span><span className="text-foreground/70">Remarks:</span> <span className="text-foreground">{p.remarks}</span></span>}
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setImportPreview(null); setOriginalPreview(null); }}>Back</Button>
                  <Button onClick={handleImportConfirm} disabled={importLoading} data-testid="confirm-import-btn">
                    {importLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                    Confirm & Import
                  </Button>
                </DialogFooter>
              </>
            )}

            {/* Step 3: Result */}
            {importResult && (() => {
              const resolutionEntries = Object.entries(conflictResolutions || {});
              const keepCount = resolutionEntries.filter(([, v]) => v === 'keep_separate').length;
              const mergeCount = resolutionEntries.filter(([, v]) => v === 'merge').length;
              return (
              <div className="py-4 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto"><Check className="w-7 h-7 text-emerald-600" /></div>
                <p className="text-lg font-semibold">Import Complete!</p>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {importResult.assembly && <p>Assembly: <span className="font-medium text-foreground">{importResult.assembly.name}</span> <span className="font-mono text-primary">({importResult.assembly.assembly_id})</span></p>}
                  {importResult.summary && <p>{importResult.summary.parts_created} created, {importResult.summary.parts_linked} linked — {importResult.summary.total_processed} total</p>}
                </div>

                {resolutionEntries.length > 0 && (
                  <div className="text-left border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2" data-testid="result-conflict-summary">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-amber-900">Material conflicts resolved:</span>
                      {keepCount > 0 && <Badge className="bg-emerald-100 text-emerald-700 border-none text-[11px]">{keepCount} kept separate</Badge>}
                      {mergeCount > 0 && <Badge className="bg-blue-100 text-blue-700 border-none text-[11px]">{mergeCount} merged</Badge>}
                    </div>
                    <div className="max-h-[140px] overflow-y-auto space-y-1">
                      {resolutionEntries.map(([key, choice]) => {
                        const meta = materialConflicts.find(c => c.key === key);
                        return (
                          <div key={key} className="flex items-center gap-2 text-xs">
                            <Badge className={`${choice === 'merge' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'} border-none text-[10px] uppercase`}>
                              {choice === 'merge' ? 'Merge' : 'Keep Separate'}
                            </Badge>
                            <span className="font-medium truncate">{meta?.name || key}</span>
                            {meta?.size && <span className="text-muted-foreground font-mono">[{meta.size}]</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {importResult.parts_created?.length > 0 && (
                  <div className="text-left max-h-[200px] overflow-y-auto border rounded p-2">
                    {importResult.parts_created.map((p, i) => (
                      <div key={p.part_id || i} className="flex items-center gap-2 py-1 text-xs border-b border-border last:border-0">
                        <span className="font-mono text-primary font-bold">{p.part_id}</span>
                        <span>{p.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Button onClick={() => { setIsImportOpen(false); resetImport(); }} className="w-full">Done</Button>
              </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const DetailRow = ({ label, value }) => (
  <div className="flex justify-between py-2 border-b border-border">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium">{value}</span>
  </div>
);

const PartForm = ({ form, setForm, customType, setCustomType }) => (
  <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
    <div className="grid grid-cols-3 gap-3">
      <div className="space-y-2"><Label>Part No</Label><Input value={form.part_no} onChange={e => setForm({ ...form, part_no: e.target.value })} placeholder="e.g. PART NO - 01" data-testid="part-no-input" /></div>
      <div className="col-span-2 space-y-2"><Label>Part Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Shaft Pin Rod" data-testid="part-name-input" /></div>
    </div>
    <div className="grid grid-cols-3 gap-3">
      <div className="space-y-2"><Label>Material</Label><Input value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} placeholder="e.g. SS 316, Nitrile" data-testid="material-input" /></div>
      <div className="space-y-2"><Label>Category *</Label>
        <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="space-y-2"><Label>Type</Label>
        <Select value={form.part_type || '_custom'} onValueChange={v => { if (v === '_custom') { setForm({ ...form, part_type: '' }); } else { setForm({ ...form, part_type: v }); setCustomType(v); } }}>
          <SelectTrigger><SelectValue placeholder="Select or type..." /></SelectTrigger>
          <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}<SelectItem value="_custom">Custom...</SelectItem></SelectContent>
        </Select>
        {(!form.part_type || !TYPES.includes(form.part_type)) && <Input value={customType} onChange={e => { setCustomType(e.target.value); setForm({ ...form, part_type: e.target.value }); }} placeholder="Enter custom type" className="mt-1" />}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2"><Label>Dia / ID / WxB</Label><Input value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} placeholder='e.g. Ø8 / 20x15 / M4 / 1/4"' data-testid="size-input" /></div>
      <div className="space-y-2"><Label>Length / Thickness</Label><Input value={form.length} onChange={e => setForm({ ...form, length: e.target.value })} placeholder="e.g. 50mm, 1.5" data-testid="length-input" /></div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2"><Label>Variant</Label><Input value={form.variant} onChange={e => setForm({ ...form, variant: e.target.value })} placeholder="A1" /></div>
      <div className="space-y-2"><Label>Unit</Label>
        <Select value={form.unit} onValueChange={v => setForm({ ...form, unit: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>
      </div>
    </div>
    <div className="space-y-2"><Label>Remarks</Label><Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} placeholder="Additional notes (optional)" data-testid="remarks-input" /></div>
    <div className="space-y-2"><Label>Part Image (JPG/PNG)</Label><Input type="file" accept="image/*" onChange={e => setForm({ ...form, image: e.target.files[0] || null })} /></div>
    <div className="space-y-2"><Label>PDF Drawing</Label><Input type="file" accept=".pdf" onChange={e => setForm({ ...form, drawing: e.target.files[0] || null })} /></div>
  </div>
);

export default PartsLibrary;
