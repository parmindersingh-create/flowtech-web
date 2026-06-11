import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '../components/ui/tabs';
import {
  Search, Plus, MoreVertical, Minus, PlusCircle, Loader2,
  ChevronLeft, ChevronRight, Package, History, Send, RotateCcw,
  Ruler, Layers, Download, Pencil, Trash2, BookOpen, CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { exportToPDF } from '../utils/exportPDF';
import SignaturePad from '../components/SignaturePad';
import ErrorBoundary from '../components/ErrorBoundary';
import { parseApiError } from '../utils/parseApiError';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const PER_PAGE = 20;

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
      <span className="text-xs text-muted-foreground whitespace-nowrap">{start}-{end} of {total}</span>
      <Button variant="outline" size="sm" onClick={() => onChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} data-testid="prev-page-btn"><ChevronLeft className="w-4 h-4" /></Button>
      <span className="text-sm font-medium">{currentPage}/{totalPages}</span>
      <Button variant="outline" size="sm" onClick={() => onChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} data-testid="next-page-btn"><ChevronRight className="w-4 h-4" /></Button>
    </div>
  );
};

// ─── PARTS TAB ───────────────────────────────────────────
const PartsTab = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeductOpen, setIsDeductOpen] = useState(false);
  const [isAddQtyOpen, setIsAddQtyOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [logs, setLogs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ assembly_name: '', part_no: '', product_details: '', quantity: 1, storage_place: '', crate_no: '', stored_by: '' });
  const [deductQty, setDeductQty] = useState(1);
  const [deductReason, setDeductReason] = useState('');
  const [deductSignature, setDeductSignature] = useState(null);
  const [addQty, setAddQty] = useState(1);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editData, setEditData] = useState({});

  // Parts Library state for searchable dropdown
  const [partsCatalog, setPartsCatalog] = useState([]);
  const [partSearch, setPartSearch] = useState('');
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [editPartSearch, setEditPartSearch] = useState('');
  const [showEditPartDropdown, setShowEditPartDropdown] = useState(false);

  const fetch_ = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/storage`); setItems(Array.isArray(data) ? data : []); }
    catch { toast.error('Failed to fetch parts'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetch_(); }, [fetch_]);

  // Fetch parts library for dropdown
  const fetchPartsCatalog = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/parts-library`); setPartsCatalog(Array.isArray(data) ? data : data.parts || []); }
    catch { setPartsCatalog([]); }
  }, []);
  useEffect(() => { fetchPartsCatalog(); }, [fetchPartsCatalog]);

  const filteredCatalog = partsCatalog.filter(p => {
    const s = partSearch.toLowerCase();
    return !s || (p.name || '').toLowerCase().includes(s) || (p.part_id || '').toLowerCase().includes(s) || (p.part_type || '').toLowerCase().includes(s);
  });

  const filteredEditCatalog = partsCatalog.filter(p => {
    const s = editPartSearch.toLowerCase();
    return !s || (p.name || '').toLowerCase().includes(s) || (p.part_id || '').toLowerCase().includes(s) || (p.part_type || '').toLowerCase().includes(s);
  });

  const selectPartFromLibrary = (part) => {
    setForm({ ...form, part_no: part.part_id || part.name, product_details: `${part.name}${part.part_type ? ' - ' + part.part_type : ''}${part.size ? ' (' + part.size + ')' : ''}`, assembly_name: form.assembly_name });
    setPartSearch('');
    setShowPartDropdown(false);
  };

  const selectPartForEdit = (part) => {
    setEditData({ ...editData, part_no: part.part_id || part.name, product_details: `${part.name}${part.part_type ? ' - ' + part.part_type : ''}${part.size ? ' (' + part.size + ')' : ''}` });
    setEditPartSearch('');
    setShowEditPartDropdown(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault(); setSubmitting(true);
    try { await axios.post(`${API_URL}/api/storage`, form); toast.success('Part added'); setIsAddOpen(false); setForm({ assembly_name: '', part_no: '', product_details: '', quantity: 1, storage_place: '', crate_no: '', stored_by: '' }); fetch_(); }
    catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); }
  };
  const handleDeduct = async () => {
    if (!selected) return; setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/storage/${selected.entry_id}/deduct`, { quantity: deductQty, reason: deductReason, signature: deductSignature });
      toast.success('Deducted'); setIsDeductOpen(false); setDeductQty(1); setDeductReason(''); setDeductSignature(null); fetch_();
    }
    catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); }
  };
  const handleAddQty = async () => {
    if (!selected) return; setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/storage/${selected.entry_id}/add-qty`, { quantity: addQty });
      toast.success('Quantity added'); setIsAddQtyOpen(false); setAddQty(1); fetch_();
    }
    catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); }
  };
  const fetchLogs = async (id) => { try { const { data } = await axios.get(`${API_URL}/api/storage/${id}/full-history`); setLogs(Array.isArray(data) ? data : data.transactions || []); } catch { try { const { data } = await axios.get(`${API_URL}/api/storage/${id}/deduction-logs`); setLogs(Array.isArray(data) ? data : []); } catch { setLogs([]); } } };
  const openDetail = (item) => { setSelected(item); setIsDetailOpen(true); };
  const openEdit = () => {
    setEditData({ assembly_name: selected.assembly_name, part_no: selected.part_no, product_details: selected.product_details, quantity: selected.quantity, storage_place: selected.storage_place, crate_no: selected.crate_no });
    setIsDetailOpen(false); setIsEditOpen(true);
  };
  const handleEdit = async (e) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await axios.put(`${API_URL}/api/storage/${selected.entry_id}`, editData);
      toast.success('Updated'); setIsEditOpen(false); fetch_();
    }
    catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); }
  };
  const handleDeletePart = async () => {
    setSubmitting(true);
    try { await axios.delete(`${API_URL}/api/storage/${selected.entry_id}`); toast.success('Deleted'); setIsDeleteOpen(false); setIsDetailOpen(false); fetch_(); }
    catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); }
  };
  const getImage = (item) => item.image || item.image_url || item.photo || null;

  const filtered = items.filter(i => { const s = search.toLowerCase(); return (i.assembly_name||'').toLowerCase().includes(s)||(i.part_no||'').toLowerCase().includes(s)||(i.product_details||'').toLowerCase().includes(s)||(i.storage_place||'').toLowerCase().includes(s); });
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const handleExport = () => exportCSV(filtered.map(i => ({ Assembly: i.assembly_name, Part_No: i.part_no, Details: i.product_details, Qty: i.quantity, Location: i.storage_place, Crate: i.crate_no, Stored_By: i.stored_by })), `parts_${new Date().toISOString().slice(0,10)}.csv`);
  const handleExportPDF = () => {
    const cols = ['Assembly','Part No','Details','Qty','Location','Crate','Stored By'];
    const rows = filtered.map(i => [i.assembly_name, i.part_no, i.product_details, i.quantity, i.storage_place, i.crate_no, i.stored_by].map(v => String(v??'')));
    exportToPDF(cols, rows, 'Storage - Parts', `parts_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Top bar: Search + Export + Pagination */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search parts..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" data-testid="parts-search" />
          </div>
          <Button onClick={() => setIsAddOpen(true)} data-testid="add-part-btn"><Plus className="w-4 h-4 mr-2" /> Add Part</Button>
          <Button variant="outline" onClick={handleExport} disabled={filtered.length===0} data-testid="export-parts-btn"><Download className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={filtered.length===0} data-testid="export-parts-pdf-btn"><Download className="w-4 h-4 mr-2" /> PDF</Button>
        </div>
        <Paginator currentPage={page} totalPages={totalPages} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>

      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Assembly</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Part No</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Details</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Qty</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Location</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Crate</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            : paginated.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8"><Package className="w-10 h-10 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No parts found</p></TableCell></TableRow>
            : paginated.map((item, i) => (
              <TableRow key={item.entry_id||i} className="table-row-hover cursor-pointer" onClick={() => openDetail(item)} data-testid={`parts-row-${i}`}>
                <TableCell className="font-medium">{item.assembly_name}</TableCell>
                <TableCell className="font-mono text-sm">{item.part_no}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">{item.product_details}</TableCell>
                <TableCell className="font-semibold">{item.quantity}</TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">{item.storage_place}</TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">{item.crate_no}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelected(item); setIsDeductOpen(true); }}><Minus className="w-4 h-4 mr-2" /> Deduct</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelected(item); setIsAddQtyOpen(true); }}><PlusCircle className="w-4 h-4 mr-2" /> Add Qty</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelected(item); fetchLogs(item.entry_id); setIsLogsOpen(true); }}><History className="w-4 h-4 mr-2" /> Logs</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Add Part Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(v) => { setIsAddOpen(v); if (!v) { setPartSearch(''); setShowPartDropdown(false); } }}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Add Part Entry</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Assembly Name *</Label><Input value={form.assembly_name} onChange={(e) => setForm({...form, assembly_name: e.target.value})} required /></div>
              <div className="space-y-2 relative">
                <Label>Part No *</Label>
                <div className="flex gap-1">
                  <Input value={form.part_no} onChange={(e) => setForm({...form, part_no: e.target.value})} required className="flex-1" />
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowPartDropdown(!showPartDropdown)} title="Choose from Parts Library" data-testid="pick-part-btn"><BookOpen className="w-4 h-4" /></Button>
                </div>
                {showPartDropdown && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-[240px] overflow-hidden" data-testid="part-library-dropdown">
                    <div className="p-2 border-b border-border">
                      <Input placeholder="Search parts library..." value={partSearch} onChange={e => setPartSearch(e.target.value)} className="h-8 text-sm" autoFocus data-testid="part-library-search" />
                    </div>
                    <div className="max-h-[180px] overflow-y-auto">
                      {filteredCatalog.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">No parts found</p>
                      ) : filteredCatalog.slice(0, 50).map(p => (
                        <div key={p.part_id} className="px-3 py-2 hover:bg-muted cursor-pointer text-sm flex justify-between items-center" onClick={() => selectPartFromLibrary(p)} data-testid={`pick-part-${p.part_id}`}>
                          <div>
                            <span className="font-medium">{p.name}</span>
                            {p.part_type && <span className="text-muted-foreground ml-2">{p.part_type}</span>}
                            {p.size && <span className="text-muted-foreground ml-1">({p.size})</span>}
                          </div>
                          <span className="text-xs font-mono text-primary">{p.part_id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2"><Label>Product Details *</Label><Textarea value={form.product_details} onChange={(e) => setForm({...form, product_details: e.target.value})} required rows={2} /></div>
            <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Quantity</Label><Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({...form, quantity: parseInt(e.target.value)||1})} /></div><div className="space-y-2"><Label>Crate No *</Label><Input value={form.crate_no} onChange={(e) => setForm({...form, crate_no: e.target.value})} required /></div></div>
            <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Storage Place *</Label><Input value={form.storage_place} onChange={(e) => setForm({...form, storage_place: e.target.value})} required /></div><div className="space-y-2"><Label>Stored By *</Label><Input value={form.stored_by} onChange={(e) => setForm({...form, stored_by: e.target.value})} required /></div></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add Part</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={isDeductOpen} onOpenChange={setIsDeductOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Deduct Quantity</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">From: <span className="font-medium text-foreground">{selected?.assembly_name}</span> (Qty: {selected?.quantity})</p><div className="space-y-2"><Label>Deduct</Label><Input type="number" min="1" max={selected?.quantity} value={deductQty} onChange={(e) => setDeductQty(parseInt(e.target.value)||1)} /></div><div className="space-y-2"><Label>Reason</Label><Input value={deductReason} onChange={(e) => setDeductReason(e.target.value)} /></div><SignaturePad onSignature={setDeductSignature} label="Digital Signature" /></div><DialogFooter><Button variant="outline" onClick={() => setIsDeductOpen(false)}>Cancel</Button><Button onClick={handleDeduct} disabled={submitting} variant="destructive">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Deduct</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isAddQtyOpen} onOpenChange={setIsAddQtyOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Add Quantity</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">To: <span className="font-medium text-foreground">{selected?.assembly_name}</span> (Qty: {selected?.quantity})</p><div className="space-y-2"><Label>Add</Label><Input type="number" min="1" value={addQty} onChange={(e) => setAddQty(parseInt(e.target.value)||1)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setIsAddQtyOpen(false)}>Cancel</Button><Button onClick={handleAddQty} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isLogsOpen} onOpenChange={setIsLogsOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Transaction History - {selected?.assembly_name || selected?.part_no}</DialogTitle></DialogHeader><div className="max-h-[400px] overflow-auto">{logs.length===0?<p className="text-center text-muted-foreground py-4">No transaction history</p>:<div className="space-y-3">{logs.map((l,i)=><div key={i} className="border rounded-lg p-3 space-y-2"><div className="flex justify-between items-start"><div><Badge className={`border-none text-xs ${l.type==='deduct'||l.action==='deduct'?'bg-red-100 text-red-700':l.type==='add'||l.action==='add'?'bg-emerald-100 text-emerald-700':'bg-blue-100 text-blue-700'}`}>{l.type||l.action||'issue'}</Badge><span className="text-xs text-muted-foreground ml-2">{l.deducted_at||l.timestamp||l.date?new Date(l.deducted_at||l.timestamp||l.date).toLocaleString():'-'}</span></div><span className={`font-bold ${l.type==='deduct'||l.action==='deduct'?'text-red-600':'text-emerald-600'}`}>{l.type==='deduct'||l.action==='deduct'?'-':'+'}{l.quantity||0}</span></div>{(l.from_user||l.to_user||l.deducted_by||l.done_by)&&<div className="text-xs text-muted-foreground">{l.from_user&&<span>From: <span className="text-foreground font-medium">{l.from_user}</span></span>}{l.to_user&&<span className="ml-3">To: <span className="text-foreground font-medium">{l.to_user}</span></span>}{!l.from_user&&!l.to_user&&(l.deducted_by||l.done_by)&&<span>By: <span className="text-foreground font-medium">{l.deducted_by||l.done_by}</span></span>}</div>}{l.reason&&<p className="text-xs text-muted-foreground">Reason: {l.reason}</p>}{l.signature&&<div className="mt-1"><p className="text-xs text-muted-foreground mb-1">Signature:</p><img src={l.signature} alt="Signature" className="h-16 border rounded" style={{backgroundColor:'#1E293B'}} /></div>}</div>)}</div>}</div><DialogFooter><Button variant="outline" onClick={() => setIsLogsOpen(false)}>Close</Button></DialogFooter></DialogContent></Dialog>

      {/* DETAIL DIALOG */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Part Details</DialogTitle></DialogHeader>
          {selected && (<div className="space-y-4">
            {getImage(selected) && <div className="rounded-lg overflow-hidden border border-border"><img src={getImage(selected)} alt="Part" className="w-full max-h-[200px] object-cover" /></div>}
            <div className="space-y-1">
              <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Assembly</span><span className="text-sm font-medium">{selected.assembly_name}</span></div>
              <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Part No</span><span className="text-sm font-medium font-mono">{selected.part_no}</span></div>
              <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Details</span><span className="text-sm font-medium text-right max-w-[60%]">{selected.product_details}</span></div>
              <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Quantity</span><span className="text-sm font-bold">{selected.quantity}</span></div>
              <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Storage Place</span><span className="text-sm font-medium">{selected.storage_place}</span></div>
              <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Crate No</span><span className="text-sm font-medium">{selected.crate_no}</span></div>
              {selected.stored_by && <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Stored By</span><span className="text-sm font-medium">{selected.stored_by}</span></div>}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={openEdit} data-testid="edit-part-btn"><Pencil className="w-4 h-4 mr-2" /> Edit</Button>
              <Button variant="destructive" className="flex-1" onClick={() => { setIsDetailOpen(false); setIsDeleteOpen(true); }} data-testid="delete-part-btn"><Trash2 className="w-4 h-4 mr-2" /> Delete</Button>
            </div>
          </div>)}
        </DialogContent>
      </Dialog>
      <Dialog open={isEditOpen} onOpenChange={(v) => { setIsEditOpen(v); if (!v) { setEditPartSearch(''); setShowEditPartDropdown(false); } }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Edit Part</DialogTitle></DialogHeader>
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Assembly</Label><Input value={editData.assembly_name||''} onChange={e=>setEditData({...editData, assembly_name:e.target.value})} /></div>
            <div className="space-y-2 relative">
              <Label>Part No</Label>
              <div className="flex gap-1">
                <Input value={editData.part_no||''} onChange={e=>setEditData({...editData, part_no:e.target.value})} className="flex-1" />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowEditPartDropdown(!showEditPartDropdown)} title="Choose from Parts Library" data-testid="edit-pick-part-btn"><BookOpen className="w-4 h-4" /></Button>
              </div>
              {showEditPartDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-[240px] overflow-hidden" data-testid="edit-part-library-dropdown">
                  <div className="p-2 border-b border-border">
                    <Input placeholder="Search parts library..." value={editPartSearch} onChange={e => setEditPartSearch(e.target.value)} className="h-8 text-sm" autoFocus data-testid="edit-part-library-search" />
                  </div>
                  <div className="max-h-[180px] overflow-y-auto">
                    {filteredEditCatalog.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">No parts found</p>
                    ) : filteredEditCatalog.slice(0, 50).map(p => (
                      <div key={p.part_id} className="px-3 py-2 hover:bg-muted cursor-pointer text-sm flex justify-between items-center" onClick={() => selectPartForEdit(p)} data-testid={`edit-pick-part-${p.part_id}`}>
                        <div>
                          <span className="font-medium">{p.name}</span>
                          {p.part_type && <span className="text-muted-foreground ml-2">{p.part_type}</span>}
                          {p.size && <span className="text-muted-foreground ml-1">({p.size})</span>}
                        </div>
                        <span className="text-xs font-mono text-primary">{p.part_id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2"><Label>Details</Label><Textarea value={editData.product_details||''} onChange={e=>setEditData({...editData, product_details:e.target.value})} rows={2} /></div>
          <div className="grid grid-cols-3 gap-4"><div className="space-y-2"><Label>Qty</Label><Input type="number" value={editData.quantity||0} onChange={e=>setEditData({...editData, quantity:parseInt(e.target.value)||0})} /></div><div className="space-y-2"><Label>Location</Label><Input value={editData.storage_place||''} onChange={e=>setEditData({...editData, storage_place:e.target.value})} /></div><div className="space-y-2"><Label>Crate</Label><Input value={editData.crate_no||''} onChange={e=>setEditData({...editData, crate_no:e.target.value})} /></div></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save</Button></DialogFooter>
        </form>
      </DialogContent></Dialog>
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Delete Part?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Permanently delete <span className="font-medium text-foreground">{selected?.assembly_name} ({selected?.part_no})</span>?</p><DialogFooter><Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleDeletePart} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Delete</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};

// ─── RAW MATERIAL TAB ────────────────────────────────────
const RawMaterialTab = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeductOpen, setIsDeductOpen] = useState(false);
  const [isAddQtyOpen, setIsAddQtyOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ material_name: '', grade: '', color: '', quantity: '', unit: 'kg', supplier: '', remarks: '' });
  const [deductQty, setDeductQty] = useState('');
  const [deductReason, setDeductReason] = useState('');
  const [deductSignature, setDeductSignature] = useState(null);
  const [addQty, setAddQty] = useState('');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editData, setEditData] = useState({});

  const fetch_ = useCallback(async () => { try { const { data } = await axios.get(`${API_URL}/api/plastic-raw-material`); setItems(Array.isArray(data)?data:[]); } catch (e) { console.error('Failed to fetch raw materials', e); } finally { setLoading(false); } }, []);
  useEffect(() => { fetch_(); }, [fetch_]);

  const handleAdd = async (e) => { e.preventDefault(); setSubmitting(true); try { await axios.post(`${API_URL}/api/plastic-raw-material`, {...form, quantity: parseFloat(form.quantity)||0}); toast.success('Added'); setIsAddOpen(false); setForm({ material_name: '', grade: '', color: '', quantity: '', unit: 'kg', supplier: '', remarks: '' }); fetch_(); } catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); } };
  const handleDeduct = async () => { if (!selected) return; setSubmitting(true); try { await axios.post(`${API_URL}/api/plastic-raw-materials/${selected.entry_id||selected._id}/deduct`, { quantity: parseFloat(deductQty)||0, reason: deductReason, signature: deductSignature }); toast.success('Deducted'); setIsDeductOpen(false); setDeductQty(''); setDeductReason(''); setDeductSignature(null); fetch_(); } catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); } };
  const handleAddQty = async () => { if (!selected) return; setSubmitting(true); try { await axios.post(`${API_URL}/api/plastic-raw-materials/${selected.entry_id||selected._id}/add`, { quantity: parseFloat(addQty)||0 }); toast.success('Added'); setIsAddQtyOpen(false); setAddQty(''); fetch_(); } catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); } };
  const fetchTx = async (id) => { try { const { data } = await axios.get(`${API_URL}/api/plastic-raw-materials/${id}/transactions`); setTransactions(Array.isArray(data)?data:[]); } catch { setTransactions([]); } };
  const openDetail = (item) => { setSelected(item); setIsDetailOpen(true); };
  const openEdit = () => { setEditData({ material_name: selected.material_name, grade: selected.grade, color: selected.color, quantity: selected.quantity, unit: selected.unit||'kg', supplier: selected.supplier, remarks: selected.remarks }); setIsDetailOpen(false); setIsEditOpen(true); };
  const handleEdit = async (e) => { e.preventDefault(); setSubmitting(true); try { await axios.put(`${API_URL}/api/plastic-raw-materials/${selected.entry_id||selected._id}`, {...editData, quantity: parseFloat(editData.quantity)||0}); toast.success('Updated'); setIsEditOpen(false); fetch_(); } catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); } };
  const handleDeleteRaw = async () => { setSubmitting(true); try { await axios.delete(`${API_URL}/api/plastic-raw-materials/${selected.entry_id||selected._id}`); toast.success('Deleted'); setIsDeleteOpen(false); setIsDetailOpen(false); fetch_(); } catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); } };
  const getImage = (item) => item.image || item.image_url || null;

  const filtered = items.filter(i => { const s = search.toLowerCase(); return (i.material_name||'').toLowerCase().includes(s)||(i.grade||'').toLowerCase().includes(s)||(i.color||'').toLowerCase().includes(s)||(i.supplier||'').toLowerCase().includes(s); });
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const handleExport = () => exportCSV(filtered.map(i => ({ Material: i.material_name, Grade: i.grade, Color: i.color, Qty: i.quantity, Unit: i.unit||'kg', Supplier: i.supplier })), `raw_material_${new Date().toISOString().slice(0,10)}.csv`);
  const handleExportPDF = () => {
    const cols = ['Material','Grade','Color','Qty','Unit','Supplier'];
    const rows = filtered.map(i => [i.material_name, i.grade, i.color, i.quantity, i.unit||'kg', i.supplier].map(v => String(v??'')));
    exportToPDF(cols, rows, 'Storage - Raw Material', `raw_material_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
          <div className="relative max-w-xs flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search materials..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" data-testid="raw-material-search" /></div>
          <Button onClick={() => setIsAddOpen(true)} data-testid="add-raw-material-btn"><Plus className="w-4 h-4 mr-2" /> Add Material</Button>
          <Button variant="outline" onClick={handleExport} disabled={filtered.length===0} data-testid="export-raw-btn"><Download className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={filtered.length===0} data-testid="export-raw-pdf-btn"><Download className="w-4 h-4 mr-2" /> PDF</Button>
        </div>
        <Paginator currentPage={page} totalPages={totalPages} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>
      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead className="text-xs font-semibold uppercase tracking-wider">Material</TableHead><TableHead className="text-xs font-semibold uppercase tracking-wider">Grade</TableHead><TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Color</TableHead><TableHead className="text-xs font-semibold uppercase tracking-wider">Qty</TableHead><TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Supplier</TableHead><TableHead className="text-xs font-semibold uppercase tracking-wider w-[50px]"></TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            : paginated.length===0 ? <TableRow><TableCell colSpan={6} className="text-center py-8"><Layers className="w-10 h-10 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No raw materials found</p></TableCell></TableRow>
            : paginated.map((item, i) => (
              <TableRow key={item.entry_id||item._id||i} className="table-row-hover cursor-pointer" onClick={() => openDetail(item)} data-testid={`raw-material-row-${i}`}>
                <TableCell className="font-medium">{item.material_name}</TableCell>
                <TableCell className="text-sm">{item.grade}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{item.color}</TableCell>
                <TableCell className="font-semibold">{item.quantity} {item.unit||'kg'}</TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">{item.supplier}</TableCell>
                <TableCell>
                  <DropdownMenu><DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelected(item); setIsDeductOpen(true); }}><Minus className="w-4 h-4 mr-2" /> Deduct</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelected(item); setIsAddQtyOpen(true); }}><PlusCircle className="w-4 h-4 mr-2" /> Add Qty</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelected(item); fetchTx(item.entry_id||item._id); setIsLogsOpen(true); }}><History className="w-4 h-4 mr-2" /> Transactions</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Add Raw Material</DialogTitle></DialogHeader>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="space-y-2"><Label>Material Name *</Label><Input value={form.material_name} onChange={(e) => setForm({...form, material_name: e.target.value})} required placeholder="e.g., ABS, PP" /></div>
          <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Grade</Label><Input value={form.grade} onChange={(e) => setForm({...form, grade: e.target.value})} /></div><div className="space-y-2"><Label>Color</Label><Input value={form.color} onChange={(e) => setForm({...form, color: e.target.value})} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Quantity *</Label><Input type="number" step="0.01" min="0" value={form.quantity} onChange={(e) => setForm({...form, quantity: e.target.value})} required /></div><div className="space-y-2"><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({...form, unit: e.target.value})} placeholder="kg" /></div></div>
          <div className="space-y-2"><Label>Supplier</Label><Input value={form.supplier} onChange={(e) => setForm({...form, supplier: e.target.value})} /></div>
          <div className="space-y-2"><Label>Remarks</Label><Textarea value={form.remarks} onChange={(e) => setForm({...form, remarks: e.target.value})} rows={2} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add</Button></DialogFooter>
        </form>
      </DialogContent></Dialog>
      <Dialog open={isDeductOpen} onOpenChange={setIsDeductOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Deduct</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">{selected?.material_name} (Qty: {selected?.quantity})</p><div className="space-y-2"><Label>Deduct</Label><Input type="number" step="0.01" value={deductQty} onChange={(e) => setDeductQty(e.target.value)} /></div><div className="space-y-2"><Label>Reason</Label><Input value={deductReason} onChange={(e) => setDeductReason(e.target.value)} /></div><SignaturePad onSignature={setDeductSignature} label="Digital Signature" /></div><DialogFooter><Button variant="outline" onClick={() => setIsDeductOpen(false)}>Cancel</Button><Button onClick={handleDeduct} disabled={submitting} variant="destructive">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Deduct</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isAddQtyOpen} onOpenChange={setIsAddQtyOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Add Qty</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">{selected?.material_name} (Qty: {selected?.quantity})</p><div className="space-y-2"><Label>Add</Label><Input type="number" step="0.01" value={addQty} onChange={(e) => setAddQty(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setIsAddQtyOpen(false)}>Cancel</Button><Button onClick={handleAddQty} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isLogsOpen} onOpenChange={setIsLogsOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Transactions - {selected?.material_name}</DialogTitle></DialogHeader><div className="max-h-[300px] overflow-auto">{transactions.length===0?<p className="text-center text-muted-foreground py-4">No transactions</p>:<Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Qty</TableHead><TableHead>By</TableHead></TableRow></TableHeader><TableBody>{transactions.map((t,i)=><TableRow key={i}><TableCell className="text-sm">{t.timestamp?new Date(t.timestamp).toLocaleDateString():t.date||'-'}</TableCell><TableCell><Badge className={t.type==='deduct'?'bg-red-100 text-red-700':'bg-emerald-100 text-emerald-700'}>{t.type||t.action}</Badge></TableCell><TableCell className={`font-medium ${t.type==='deduct'?'text-red-600':'text-emerald-600'}`}>{t.type==='deduct'?'-':'+'}{t.quantity}</TableCell><TableCell className="text-sm">{t.done_by||t.user_name||'-'}</TableCell></TableRow>)}</TableBody></Table>}</div><DialogFooter><Button variant="outline" onClick={() => setIsLogsOpen(false)}>Close</Button></DialogFooter></DialogContent></Dialog>

      {/* DETAIL */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Raw Material Details</DialogTitle></DialogHeader>
        {selected && (<div className="space-y-4">
          {getImage(selected) && <div className="rounded-lg overflow-hidden border border-border"><img src={getImage(selected)} alt="Material" className="w-full max-h-[200px] object-cover" /></div>}
          <div className="space-y-1">
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Material</span><span className="text-sm font-medium">{selected.material_name}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Grade</span><span className="text-sm font-medium">{selected.grade||'-'}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Color</span><span className="text-sm font-medium">{selected.color||'-'}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Quantity</span><span className="text-sm font-bold">{selected.quantity} {selected.unit||'kg'}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Supplier</span><span className="text-sm font-medium">{selected.supplier||'-'}</span></div>
            {selected.remarks && <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Remarks</span><span className="text-sm font-medium text-right max-w-[60%]">{selected.remarks}</span></div>}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={openEdit} data-testid="edit-raw-btn"><Pencil className="w-4 h-4 mr-2" /> Edit</Button>
            <Button variant="destructive" className="flex-1" onClick={() => { setIsDetailOpen(false); setIsDeleteOpen(true); }} data-testid="delete-raw-btn"><Trash2 className="w-4 h-4 mr-2" /> Delete</Button>
          </div>
        </div>)}
      </DialogContent></Dialog>
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Edit Raw Material</DialogTitle></DialogHeader>
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="space-y-2"><Label>Material</Label><Input value={editData.material_name||''} onChange={e=>setEditData({...editData,material_name:e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Grade</Label><Input value={editData.grade||''} onChange={e=>setEditData({...editData,grade:e.target.value})} /></div><div className="space-y-2"><Label>Color</Label><Input value={editData.color||''} onChange={e=>setEditData({...editData,color:e.target.value})} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Quantity</Label><Input type="number" step="0.01" value={editData.quantity||''} onChange={e=>setEditData({...editData,quantity:e.target.value})} /></div><div className="space-y-2"><Label>Supplier</Label><Input value={editData.supplier||''} onChange={e=>setEditData({...editData,supplier:e.target.value})} /></div></div>
          <div className="space-y-2"><Label>Remarks</Label><Input value={editData.remarks||''} onChange={e=>setEditData({...editData,remarks:e.target.value})} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save</Button></DialogFooter>
        </form>
      </DialogContent></Dialog>
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Delete Material?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Permanently delete <span className="font-medium text-foreground">{selected?.material_name}</span>?</p><DialogFooter><Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleDeleteRaw} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Delete</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};

// ─── GAUGES TAB ──────────────────────────────────────────
const GaugesTab = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ gauge_type: '', sub_type: '', gauge_details: '', make: '', stored_at: '' });
  const [issueData, setIssueData] = useState({ issued_to: '', machine_name: '' });
  const [issueSignature, setIssueSignature] = useState(null);
  const [issueMode, setIssueMode] = useState('select'); // 'select' | 'manual'
  const [issueUserId, setIssueUserId] = useState('');
  const [issueUserSearch, setIssueUserSearch] = useState('');
  const [operators, setOperators] = useState([]);
  const [returnSignature, setReturnSignature] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editData, setEditData] = useState({});

  const fetch_ = useCallback(async () => { try { const { data } = await axios.get(`${API_URL}/api/gauges`); setItems(Array.isArray(data)?data:[]); } catch (e) { console.error('Failed to fetch gauges', e); } finally { setLoading(false); } }, []);
  useEffect(() => { fetch_(); }, [fetch_]);
  useEffect(() => {
    axios.get(`${API_URL}/api/operators`)
      .then(r => setOperators(Array.isArray(r.data) ? r.data : []))
      .catch(() => setOperators([]));
  }, []);

  const handleAdd = async (e) => { e.preventDefault(); setSubmitting(true); try { await axios.post(`${API_URL}/api/gauges`, form); toast.success('Added'); setIsAddOpen(false); setForm({ gauge_type: '', sub_type: '', gauge_details: '', make: '', stored_at: '' }); fetch_(); } catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); } };
  const handleIssue = async () => {
    if (!selected) return;
    const name = String(issueData.issued_to || '').trim();
    if (!name) { toast.error('Select a user or enter a name'); return; }
    setSubmitting(true);
    try {
      // Backend requires: issued_to_id, issued_to_name, machine_name, signature
      const payload = {
        issued_to: name,
        issued_to_id: issueMode === 'select' ? String(issueUserId || '') : '',
        issued_to_name: name,
        machine_name: issueData.machine_name || '',
      };
      if (issueSignature) payload.signature = issueSignature;
      await axios.post(`${API_URL}/api/gauges/${selected.gauge_id}/issue`, payload);
      toast.success('Issued');
      setIsIssueOpen(false);
      setIssueData({ issued_to: '', machine_name: '' });
      setIssueUserId('');
      setIssueUserSearch('');
      setIssueMode('select');
      setIssueSignature(null);
      fetch_();
    } catch (err) {
      toast.error(parseApiError(err, 'Failed to issue gauge'));
    } finally { setSubmitting(false); }
  };
  const handleReturn = async () => { if (!selected) return; setSubmitting(true); try { await axios.post(`${API_URL}/api/gauges/${selected.gauge_id}/return`, { signature: returnSignature }); toast.success('Returned'); setIsReturnOpen(false); setReturnSignature(null); fetch_(); } catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); } };
  const fetchTx = async (id) => { try { const { data } = await axios.get(`${API_URL}/api/gauges/${id}/transactions`); setTransactions(Array.isArray(data)?data:data.transactions||[]); } catch { setTransactions([]); } };
  const openDetail = (item) => { setSelected(item); setIsDetailOpen(true); };
  const openEdit = () => { setEditData({ gauge_type: selected.gauge_type, sub_type: selected.sub_type, gauge_details: selected.gauge_details, make: selected.make, stored_at: selected.stored_at }); setIsDetailOpen(false); setIsEditOpen(true); };
  const handleEdit = async (e) => { e.preventDefault(); setSubmitting(true); try { await axios.put(`${API_URL}/api/gauges/${selected.gauge_id}`, editData); toast.success('Updated'); setIsEditOpen(false); fetch_(); } catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); } };
  const handleDeleteGauge = async () => { setSubmitting(true); try { await axios.delete(`${API_URL}/api/gauges/${selected.gauge_id}`); toast.success('Deleted'); setIsDeleteOpen(false); setIsDetailOpen(false); fetch_(); } catch (err) { toast.error(parseApiError(err)); } finally { setSubmitting(false); } };
  const getImage = (item) => item.image || item.image_url || item.photo || null;

  const filtered = items.filter(i => { const s = search.toLowerCase(); return (i.gauge_type||'').toLowerCase().includes(s)||(i.sub_type||'').toLowerCase().includes(s)||(i.gauge_details||'').toLowerCase().includes(s)||(i.make||'').toLowerCase().includes(s); });
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const handleExport = () => exportCSV(filtered.map(i => ({ Type: i.gauge_type, SubType: i.sub_type, Details: i.gauge_details, Make: i.make, Status: i.status||'available', Location: i.status==='issued'?i.issued_to:i.stored_at })), `gauges_${new Date().toISOString().slice(0,10)}.csv`);
  const handleExportPDF = () => {
    const cols = ['Type','Sub Type','Details','Make','Status','Location'];
    const rows = filtered.map(i => [i.gauge_type, i.sub_type, i.gauge_details, i.make, i.status||'available', i.status==='issued'?i.issued_to:i.stored_at].map(v => String(v??'')));
    exportToPDF(cols, rows, 'Storage - Gauges', `gauges_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
          <div className="relative max-w-xs flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search gauges..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" data-testid="gauges-search" /></div>
          <Button onClick={() => setIsAddOpen(true)} data-testid="add-gauge-btn"><Plus className="w-4 h-4 mr-2" /> Add Gauge</Button>
          <Button variant="outline" onClick={handleExport} disabled={filtered.length===0} data-testid="export-gauges-btn"><Download className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={filtered.length===0} data-testid="export-gauges-pdf-btn"><Download className="w-4 h-4 mr-2" /> PDF</Button>
        </div>
        <Paginator currentPage={page} totalPages={totalPages} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>
      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead className="text-xs font-semibold uppercase tracking-wider">Type</TableHead><TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Sub Type</TableHead><TableHead className="text-xs font-semibold uppercase tracking-wider">Details</TableHead><TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Make</TableHead><TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead><TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Location</TableHead><TableHead className="text-xs font-semibold uppercase tracking-wider w-[50px]"></TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            : paginated.length===0 ? <TableRow><TableCell colSpan={7} className="text-center py-8"><Ruler className="w-10 h-10 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No gauges found</p></TableCell></TableRow>
            : paginated.map((item, i) => (
              <TableRow key={item.gauge_id||i} className="table-row-hover cursor-pointer" onClick={() => openDetail(item)} data-testid={`gauge-row-${i}`}>
                <TableCell className="font-medium">{item.gauge_type}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{item.sub_type}</TableCell>
                <TableCell className="truncate max-w-[200px]">{item.gauge_details}</TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">{item.make}</TableCell>
                <TableCell><Badge className={`border-none ${item.status==='issued'?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}`}>{item.status||'available'}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{item.status==='issued' ? (String(item.issued_to_name||item.issued_to||'-')) : (item.stored_at||'Office')}</TableCell>
                <TableCell>
                  <DropdownMenu><DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {item.status!=='issued' ? <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelected(item); setIsIssueOpen(true); }}><Send className="w-4 h-4 mr-2" /> Issue</DropdownMenuItem> : <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelected(item); setIsReturnOpen(true); }}><RotateCcw className="w-4 h-4 mr-2" /> Return</DropdownMenuItem>}
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelected(item); fetchTx(item.gauge_id); setIsLogsOpen(true); }}><History className="w-4 h-4 mr-2" /> History</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Add Gauge</DialogTitle></DialogHeader>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Type *</Label><Input value={form.gauge_type} onChange={(e) => setForm({...form, gauge_type: e.target.value})} required /></div><div className="space-y-2"><Label>Sub Type *</Label><Input value={form.sub_type} onChange={(e) => setForm({...form, sub_type: e.target.value})} required /></div></div>
          <div className="space-y-2"><Label>Details *</Label><Input value={form.gauge_details} onChange={(e) => setForm({...form, gauge_details: e.target.value})} required /></div>
          <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Make *</Label><Input value={form.make} onChange={(e) => setForm({...form, make: e.target.value})} required /></div><div className="space-y-2"><Label>Stored At *</Label><Input value={form.stored_at} onChange={(e) => setForm({...form, stored_at: e.target.value})} required /></div></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add</Button></DialogFooter>
        </form>
      </DialogContent></Dialog>
      <Dialog open={isIssueOpen} onOpenChange={(o) => { setIsIssueOpen(o); if (!o) { setIssueUserId(''); setIssueUserSearch(''); setIssueMode('select'); setIssueData({ issued_to: '', machine_name: '' }); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Issue Gauge</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{selected?.gauge_type} - {selected?.gauge_details}</p>

            <div className="flex gap-1 border-b">
              <button type="button" onClick={() => setIssueMode('select')} className={`px-3 py-1.5 text-xs font-medium border-b-2 ${issueMode === 'select' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`} data-testid="gauge-issue-mode-select">Select User</button>
              <button type="button" onClick={() => setIssueMode('manual')} className={`px-3 py-1.5 text-xs font-medium border-b-2 ${issueMode === 'manual' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`} data-testid="gauge-issue-mode-manual">Enter Name</button>
            </div>

            {issueMode === 'select' ? (
              <div className="border rounded p-2 space-y-2 max-h-56 overflow-y-auto" data-testid="gauge-user-picker">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search users by name or role…"
                    value={issueUserSearch}
                    onChange={(e) => setIssueUserSearch(e.target.value)}
                    className="pl-7 h-8"
                    data-testid="gauge-user-search"
                  />
                </div>
                {operators.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">No users found.</p>
                ) : (
                  operators
                    .filter(u => String(u?.name || '').toLowerCase().includes(issueUserSearch.toLowerCase()) || String(u?.role || '').toLowerCase().includes(issueUserSearch.toLowerCase()))
                    .map(u => (
                      <button
                        key={String(u?.user_id || u?.name || Math.random())}
                        type="button"
                        onClick={() => { setIssueUserId(String(u?.user_id || '')); setIssueData(prev => ({ ...prev, issued_to: String(u?.name || '') })); }}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between hover:bg-muted ${issueUserId === String(u?.user_id || '') ? 'bg-primary/10' : ''}`}
                        data-testid={`gauge-user-${u?.user_id || ''}`}
                      >
                        <span className="truncate">{String(u?.name || '')} {u?.role === 'Admin' && <Badge className="ml-2 text-[10px]">Admin</Badge>}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0 ml-2">
                          {String(u?.role || '')}
                          {issueUserId === String(u?.user_id || '') && <CheckCircle className="w-3.5 h-3.5 text-primary ml-1" />}
                        </span>
                      </button>
                    ))
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Issued To *</Label>
                <Input
                  value={issueData.issued_to}
                  onChange={(e) => { setIssueData({ ...issueData, issued_to: e.target.value }); setIssueUserId(''); }}
                  placeholder="Enter name"
                  data-testid="gauge-issued-to-manual"
                />
              </div>
            )}

            {issueData.issued_to && <p className="text-xs text-muted-foreground">→ Will issue to: <span className="font-medium">{issueData.issued_to}</span></p>}

            <div className="space-y-1.5">
              <Label>Machine</Label>
              <Input value={issueData.machine_name} onChange={(e) => setIssueData({ ...issueData, machine_name: e.target.value })} placeholder="VMC-01" />
            </div>

            <SignaturePad onSignature={setIssueSignature} label="Receiver Signature" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsIssueOpen(false)}>Cancel</Button>
            <Button onClick={handleIssue} disabled={submitting || !issueData.issued_to} data-testid="gauge-submit-issue">
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isReturnOpen} onOpenChange={setIsReturnOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Return Gauge</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">{selected?.gauge_type} - {selected?.gauge_details}<br/>Issued to: {String(selected?.issued_to_name || selected?.issued_to || '-')}</p><SignaturePad onSignature={setReturnSignature} label="Return Signature" /></div><DialogFooter><Button variant="outline" onClick={() => setIsReturnOpen(false)}>Cancel</Button><Button onClick={handleReturn} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Return</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isLogsOpen} onOpenChange={setIsLogsOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Gauge History - {selected?.gauge_type} {selected?.gauge_details}</DialogTitle></DialogHeader><div className="max-h-[400px] overflow-auto">{transactions.length===0?<p className="text-center text-muted-foreground py-4">No history</p>:<div className="space-y-3">{transactions.map((t,i)=><div key={i} className="border rounded-lg p-3 space-y-2"><div className="flex justify-between items-start"><div><Badge className={t.action==='issued'||t.action==='issue'?'bg-amber-100 text-amber-700 border-none':'bg-emerald-100 text-emerald-700 border-none'}>{t.action||'issued'}</Badge><span className="text-xs text-muted-foreground ml-2">{t.timestamp_ist||(t.timestamp?new Date(t.timestamp).toLocaleString():'-')}</span></div></div><div className="text-xs text-muted-foreground space-y-0.5">{t.issued_by_name&&<p>Issued By: <span className="text-foreground font-medium">{t.issued_by_name}</span></p>}{t.issued_to_name&&<p>Issued To: <span className="text-foreground font-medium">{t.issued_to_name}</span></p>}{t.returned_by_name&&<p>Returned By: <span className="text-foreground font-medium">{t.returned_by_name}</span></p>}{t.received_by_name&&<p>Received By: <span className="text-foreground font-medium">{t.received_by_name}</span></p>}{t.machine_name&&<p>Machine: {t.machine_name}</p>}{t.remarks&&<p>Remarks: {t.remarks}</p>}</div>{t.signature&&<div className="mt-1"><p className="text-xs text-muted-foreground mb-1">Signature:</p><img src={t.signature} alt="Signature" className="h-16 border rounded cursor-pointer hover:opacity-80" style={{backgroundColor:'#1E293B'}} onClick={()=>window.open(t.signature,'_blank')} /></div>}</div>)}</div>}</div><DialogFooter><Button variant="outline" onClick={() => setIsLogsOpen(false)}>Close</Button></DialogFooter></DialogContent></Dialog>

      {/* DETAIL */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Gauge Details</DialogTitle></DialogHeader>
        {selected && (<div className="space-y-4">
          {getImage(selected) && <div className="rounded-lg overflow-hidden border border-border bg-muted/30 flex items-center justify-center"><img src={getImage(selected)} alt="Gauge" className="w-full max-h-[280px] object-contain" /></div>}
          <div className="space-y-1">
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Type</span><span className="text-sm font-medium">{selected.gauge_type}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Sub Type</span><span className="text-sm font-medium">{selected.sub_type}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Details</span><span className="text-sm font-medium text-right max-w-[60%]">{selected.gauge_details}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Make</span><span className="text-sm font-medium">{selected.make}</span></div>
            <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Status</span><Badge className={`border-none ${selected.status==='issued'?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}`}>{selected.status||'available'}</Badge></div>
            {selected.status==='issued' && <>
              <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Issued To</span><span className="text-sm font-bold text-primary">{String(selected.issued_to_name||selected.issued_to||'-')}</span></div>
              {selected.stored_by_name&&<div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Issued By</span><span className="text-sm font-medium">{selected.stored_by_name}</span></div>}
              {(selected.issued_at||selected.issued_at_ist)&&<div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Issued Date</span><span className="text-sm font-medium">{selected.issued_at_ist||new Date(selected.issued_at).toLocaleString()}</span></div>}
              {selected.machine_name&&<div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Machine</span><span className="text-sm font-medium">{selected.machine_name}</span></div>}
              {selected.signature&&<div className="py-2 border-b border-border"><p className="text-sm text-muted-foreground mb-1">Signature</p><img src={selected.signature} alt="Signature" className="h-20 border rounded cursor-pointer hover:opacity-80" style={{backgroundColor:'#1E293B'}} onClick={()=>window.open(selected.signature,'_blank')} /></div>}
            </>}
            {selected.status!=='issued' && <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Location</span><span className="text-sm font-medium">{selected.stored_at||selected.location||'Office'}</span></div>}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setIsDetailOpen(false); fetchTx(selected.gauge_id); setIsLogsOpen(true); }}><History className="w-4 h-4 mr-2" /> History</Button>
            <Button variant="outline" onClick={openEdit} data-testid="edit-gauge-btn"><Pencil className="w-4 h-4 mr-2" /> Edit</Button>
            <Button variant="destructive" onClick={() => { setIsDetailOpen(false); setIsDeleteOpen(true); }} data-testid="delete-gauge-btn"><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>)}
      </DialogContent></Dialog>
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Edit Gauge</DialogTitle></DialogHeader>
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Type</Label><Input value={editData.gauge_type||''} onChange={e=>setEditData({...editData,gauge_type:e.target.value})} /></div><div className="space-y-2"><Label>Sub Type</Label><Input value={editData.sub_type||''} onChange={e=>setEditData({...editData,sub_type:e.target.value})} /></div></div>
          <div className="space-y-2"><Label>Details</Label><Input value={editData.gauge_details||''} onChange={e=>setEditData({...editData,gauge_details:e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Make</Label><Input value={editData.make||''} onChange={e=>setEditData({...editData,make:e.target.value})} /></div><div className="space-y-2"><Label>Stored At</Label><Input value={editData.stored_at||''} onChange={e=>setEditData({...editData,stored_at:e.target.value})} /></div></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save</Button></DialogFooter>
        </form>
      </DialogContent></Dialog>
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Delete Gauge?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Permanently delete <span className="font-medium text-foreground">{selected?.gauge_type} - {selected?.gauge_details}</span>?</p><DialogFooter><Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleDeleteGauge} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Delete</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};

// ─── MAIN STORAGE PAGE ───────────────────────────────────
const Storage = () => (
  <div className="space-y-4" data-testid="storage-page">
    <h1 className="text-3xl font-extrabold tracking-tight">Storage</h1>
    <Tabs defaultValue="parts" className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-3">
        <TabsTrigger value="parts" data-testid="parts-tab">Parts</TabsTrigger>
        <TabsTrigger value="raw-material" data-testid="raw-material-tab">Raw Material</TabsTrigger>
        <TabsTrigger value="gauges" data-testid="gauges-tab">Gauges</TabsTrigger>
      </TabsList>
      <TabsContent value="parts"><PartsTab /></TabsContent>
      <TabsContent value="raw-material"><RawMaterialTab /></TabsContent>
      <TabsContent value="gauges"><ErrorBoundary><GaugesTab /></ErrorBoundary></TabsContent>
    </Tabs>
  </div>
);

export default Storage;
