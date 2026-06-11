import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Search, Plus, MoreVertical, Loader2, Wrench, AlertTriangle, Send,
  Trash2, Pencil, Eye, Image as ImageIcon, PackagePlus, History, Filter,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from '../components/SignaturePad';
import { useAuth } from '../context/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

const ENDMILL_TYPES = ['Flat', 'Ball Nose', 'Tip Radius'];
const ENDMILL_MATERIALS = ['SS', 'Aluminium'];
const INSERT_TYPES = ['TNMG', 'CNMG', 'WNMG', 'DNMG', 'VNMG', 'SNMG', 'Other'];

// Normalize base64 images coming without data URL prefix
const normalizeImg = (src) => {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('data:') || src.startsWith('http')) return src;
  return `data:image/png;base64,${src}`;
};

const emptyEndmillForm = {
  category: 'endmill', endmill_type: 'Flat', material: 'SS',
  diameter: '', length: '', grade: '',
  quantity: 1, min_quantity: 5, tool_image: '',
};
const emptyInsertForm = {
  category: 'insert', insert_type: 'TNMG', insert_type_custom: '',
  insert_size: '', insert_grade: '', tip_radius: '',
  quantity: 1, min_quantity: 10, insert_image: '', box_image: '',
};

const ToolsInserts = () => {
  const { user } = useAuth();
  const userName = user?.name || user?.full_name || user?.email || '';

  const [items, setItems] = useState([]);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('endmill');
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [scrapOpen, setScrapOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [enlargedImg, setEnlargedImg] = useState(null);
  const [selected, setSelected] = useState(null);

  // Forms
  const [endmillForm, setEndmillForm] = useState(emptyEndmillForm);
  const [insertForm, setInsertForm] = useState(emptyInsertForm);
  const [editForm, setEditForm] = useState({});
  const [stockForm, setStockForm] = useState({ quantity: 1, added_by: '', remarks: '' });
  const [issueForm, setIssueForm] = useState({ quantity: 1, issued_to: '', machine_name: '', purpose: '', signature: '' });
  const [scrapForm, setScrapForm] = useState({ quantity: 1, reason: '', scrapped_by: '', signature: '' });

  // History
  const [historyTab, setHistoryTab] = useState('issues');
  const [issuesList, setIssuesList] = useState([]);
  const [scrapsList, setScrapsList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('category', tab);
      if (search) params.set('search', search);
      if (lowStockOnly) params.set('low_stock', 'true');
      const { data } = await axios.get(`${API}/api/tools-inserts?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load tools & inserts');
    } finally { setLoading(false); }
  }, [tab, search, lowStockOnly]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    axios.get(`${API}/api/operators`).then(r => setOperators(Array.isArray(r.data) ? r.data : [])).catch(() => setOperators([]));
  }, []);

  const filteredItems = useMemo(() => items.filter(it => (it.category || '').toLowerCase() === tab), [items, tab]);
  const lowStockCount = items.filter(i => i.is_low_stock).length;

  const handleImageUpload = (e, setter, field) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setter(prev => ({ ...prev, [field]: ev.target.result }));
    reader.readAsDataURL(file);
  };

  // ---------- Add ----------
  const handleAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let payload;
      if (tab === 'endmill') {
        payload = {
          category: 'endmill',
          endmill_type: endmillForm.endmill_type,
          material: endmillForm.material,
          diameter: parseFloat(endmillForm.diameter) || 0,
          length: endmillForm.length ? parseFloat(endmillForm.length) : null,
          grade: endmillForm.grade || null,
          quantity: parseInt(endmillForm.quantity, 10) || 0,
          min_quantity: parseInt(endmillForm.min_quantity, 10) || 5,
          tool_image: endmillForm.tool_image || null,
        };
      } else {
        const insert_type = insertForm.insert_type === 'Other' ? insertForm.insert_type_custom.trim() : insertForm.insert_type;
        payload = {
          category: 'insert',
          insert_type,
          insert_size: insertForm.insert_size || null,
          insert_grade: insertForm.insert_grade || null,
          tip_radius: insertForm.tip_radius || null,
          quantity: parseInt(insertForm.quantity, 10) || 0,
          min_quantity: parseInt(insertForm.min_quantity, 10) || 10,
          insert_image: insertForm.insert_image || null,
          box_image: insertForm.box_image || null,
        };
      }
      await axios.post(`${API}/api/tools-inserts`, payload);
      toast.success(tab === 'endmill' ? 'End mill added' : 'Insert added');
      setAddOpen(false);
      setEndmillForm(emptyEndmillForm);
      setInsertForm(emptyInsertForm);
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add item');
    } finally { setSubmitting(false); }
  };

  // ---------- Edit ----------
  const openEdit = (item) => {
    setSelected(item);
    setEditForm({
      endmill_type: item.endmill_type, material: item.material, diameter: item.diameter,
      length: item.length, grade: item.grade,
      insert_type: item.insert_type, insert_size: item.insert_size,
      insert_grade: item.insert_grade, tip_radius: item.tip_radius,
      quantity: item.quantity, min_quantity: item.min_quantity,
    });
    setEditOpen(true);
  };
  const handleEdit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    try {
      await axios.put(`${API}/api/tools-inserts/${selected.item_id}`, editForm);
      toast.success('Updated');
      setEditOpen(false); fetchItems();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update'); }
    finally { setSubmitting(false); }
  };

  // ---------- Delete ----------
  const handleDelete = async (item) => {
    if (!window.confirm(`Delete this ${item.category}?`)) return;
    try {
      await axios.delete(`${API}/api/tools-inserts/${item.item_id}`);
      toast.success('Deleted'); fetchItems();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete'); }
  };

  // ---------- Add Stock ----------
  const openAddStock = (item) => {
    setSelected(item);
    setStockForm({ quantity: 1, added_by: userName, remarks: '' });
    setAddStockOpen(true);
  };
  const handleAddStock = async (e) => {
    e.preventDefault();
    if (!selected) return;
    const q = parseInt(stockForm.quantity, 10);
    if (!q || q <= 0) return toast.error('Enter a valid quantity');
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/tools-inserts/${selected.item_id}/add-qty`, {
        quantity: q, added_by: stockForm.added_by, remarks: stockForm.remarks,
      });
      toast.success('Stock added'); setAddStockOpen(false); fetchItems();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add stock'); }
    finally { setSubmitting(false); }
  };

  // ---------- Issue ----------
  const [issueMode, setIssueMode] = useState('select'); // 'select' | 'manual'
  const [issueUserId, setIssueUserId] = useState('');
  const [issueUserSearch, setIssueUserSearch] = useState('');
  const openIssue = (item) => {
    setSelected(item);
    setIssueForm({ quantity: 1, issued_to: userName, machine_name: '', purpose: '', signature: '' });
    setIssueMode('select'); setIssueUserId(''); setIssueUserSearch('');
    setIssueOpen(true);
  };
  const handleIssue = async (e) => {
    e.preventDefault();
    if (!selected) return;
    const q = parseInt(issueForm.quantity, 10);
    if (!q || q <= 0) return toast.error('Enter a valid quantity');
    if (q > selected.quantity) return toast.error('Quantity exceeds stock');
    if (!issueForm.issued_to.trim()) return toast.error('Issued To is required');
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/tools-inserts/issue`, {
        item_id: selected.item_id,
        quantity: q,
        issued_to: issueMode === 'select' ? (issueUserId || null) : null,
        issued_to_name: issueForm.issued_to,
        machine_name: issueForm.machine_name || null,
        purpose: issueForm.purpose || null,
        signature: issueForm.signature || null,
      });
      toast.success('Tool issued'); setIssueOpen(false); fetchItems();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to issue tool'); }
    finally { setSubmitting(false); }
  };

  // ---------- Scrap ----------
  const [scrapMode, setScrapMode] = useState('self'); // 'self' | 'collect'
  const [scrapUserId, setScrapUserId] = useState('');
  const [scrapUserSearch, setScrapUserSearch] = useState('');
  const openScrap = (item) => {
    setSelected(item);
    setScrapForm({ quantity: 1, reason: '', scrapped_by: userName, signature: '' });
    setScrapMode('self'); setScrapUserId(''); setScrapUserSearch('');
    setScrapOpen(true);
  };
  const handleScrap = async (e) => {
    e.preventDefault();
    if (!selected) return;
    const q = parseInt(scrapForm.quantity, 10);
    if (!q || q <= 0) return toast.error('Enter a valid quantity');
    if (q > selected.quantity) return toast.error('Quantity exceeds stock');
    if (!scrapForm.reason.trim()) return toast.error('Reason is required');
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/tools-inserts/scrap`, {
        item_id: selected.item_id,
        quantity: q,
        reason: scrapForm.reason,
        returned_by: scrapMode === 'collect' ? (scrapUserId || null) : null,
        returned_by_name: scrapForm.scrapped_by,
        scrapped_by: scrapForm.scrapped_by,
        signature: scrapForm.signature || null,
      });
      toast.success('Tool scrapped'); setScrapOpen(false); fetchItems();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to scrap'); }
    finally { setSubmitting(false); }
  };

  // ---------- History ----------
  const [historyError, setHistoryError] = useState('');
  const openHistory = async (item) => {
    setSelected(item);
    setHistoryOpen(true);
    setHistoryTab('issues');
    setHistoryLoading(true);
    setHistoryError('');
    setIssuesList([]); setScrapsList([]);
    try {
      const { data } = await axios.get(`${API}/api/tools-inserts/${item.item_id}/history`);
      // Accept multiple envelope shapes
      let transactions = [];
      if (Array.isArray(data)) transactions = data;
      else if (Array.isArray(data?.transactions)) transactions = data.transactions;
      else if (Array.isArray(data?.history)) transactions = data.history;
      else if (Array.isArray(data?.items)) transactions = data.items;
      else if (Array.isArray(data?.data)) transactions = data.data;
      // eslint-disable-next-line no-console
      console.log('[ToolsInserts] history raw response:', data, 'parsed count:', transactions.length);
      setIssuesList(transactions.filter(t => (t.type || '').toLowerCase() === 'issue'));
      setScrapsList(transactions.filter(t => (t.type || '').toLowerCase() === 'scrap'));
      if (transactions.length === 0) setHistoryError('No history records returned by backend.');
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Unknown error';
      setHistoryError(`Failed to load history: ${msg}`);
      // eslint-disable-next-line no-console
      console.error('[ToolsInserts] history fetch failed:', err.response?.status, err.response?.data || err);
    } finally { setHistoryLoading(false); }
  };

  const openDetail = (item) => { setSelected(item); setDetailOpen(true); };

  const itemTitle = (it) => {
    if (!it) return '';
    if (it.category === 'endmill') return `${it.endmill_type || ''} ${it.material || ''} Ø${it.diameter || '-'}${it.length ? ` L${it.length}` : ''}${it.grade ? ` (${it.grade})` : ''}`.trim();
    return `${it.insert_type || ''}${it.insert_size ? ' ' + it.insert_size : ''}${it.insert_grade ? ' ' + it.insert_grade : ''}${it.tip_radius ? ` R${it.tip_radius}` : ''}`.trim();
  };

  const itemImage = (it) => normalizeImg(it?.tool_image || it?.insert_image || it?.box_image);

  return (
    <div className="space-y-4" data-testid="tools-inserts-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Tools & Inserts</h1>
        <Button onClick={() => setAddOpen(true)} data-testid="add-tool-btn"><Plus className="w-4 h-4 mr-2" />Add {tab === 'endmill' ? 'End Mill' : 'Insert'}</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setTab('endmill')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${tab === 'endmill' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} data-testid="tab-endmill">
          <Wrench className="w-4 h-4" /> End Mills
        </button>
        <button onClick={() => setTab('insert')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${tab === 'insert' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} data-testid="tab-insert">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12,2 22,12 12,22 2,12" /></svg>
          Inserts
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={tab === 'endmill' ? 'Search by diameter, material, type, grade…' : 'Search by type, size, grade, tip radius…'} value={search} onChange={e => setSearch(e.target.value)} className="pl-10" data-testid="search-input" />
        </div>
        <Button variant={lowStockOnly ? 'default' : 'outline'} size="sm" onClick={() => setLowStockOnly(!lowStockOnly)} data-testid="low-stock-filter">
          <Filter className="w-3.5 h-3.5 mr-2" /> Low Stock {lowStockCount > 0 && <Badge variant="destructive" className="ml-2 text-xs">{lowStockCount}</Badge>}
        </Button>
      </div>

      {/* Table */}
      <Card className="border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {tab === 'endmill' ? (
                <>
                  <TableHead className="text-xs font-semibold uppercase">Type</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Material</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Ø Dia</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Length</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Grade</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="text-xs font-semibold uppercase">Type</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Size</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Grade</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Tip R</TableHead>
                </>
              )}
              <TableHead className="text-xs font-semibold uppercase hidden sm:table-cell">Image</TableHead>
              <TableHead className="text-xs font-semibold uppercase">Stock</TableHead>
              <TableHead className="text-xs font-semibold uppercase">Scrap</TableHead>
              <TableHead className="text-xs font-semibold uppercase w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={tab === 'endmill' ? 9 : 8} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow><TableCell colSpan={tab === 'endmill' ? 9 : 8} className="text-center py-10">
                <Wrench className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No {tab === 'endmill' ? 'end mills' : 'inserts'} yet.</p>
              </TableCell></TableRow>
            ) : filteredItems.map((it) => {
              const img = itemImage(it);
              return (
                <TableRow key={it.item_id} className="cursor-pointer hover:bg-muted/40" onClick={() => openDetail(it)} data-testid={`row-${it.item_id}`}>
                  {tab === 'endmill' ? (
                    <>
                      <TableCell className="font-medium">{it.endmill_type || '-'}</TableCell>
                      <TableCell>{it.material || '-'}</TableCell>
                      <TableCell className="font-mono">Ø{it.diameter ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{it.length ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{it.grade || '-'}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-medium">{it.insert_type || '-'}</TableCell>
                      <TableCell className="font-mono">{it.insert_size || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{it.insert_grade || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{it.tip_radius || '-'}</TableCell>
                    </>
                  )}
                  <TableCell className="hidden sm:table-cell">
                    {img ? <img src={img} alt="" className="w-10 h-10 rounded object-cover border" /> : <div className="w-10 h-10 rounded bg-muted flex items-center justify-center"><ImageIcon className="w-4 h-4 text-muted-foreground" /></div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold ${it.is_low_stock ? 'text-red-600' : 'text-emerald-600'}`}>{it.quantity}</span>
                      {it.is_low_stock && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                    </div>
                  </TableCell>
                  <TableCell><span className="text-amber-600 font-medium">{it.scrap_qty || 0}</span></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetail(it)}><Eye className="w-4 h-4 mr-2" />View Details</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(it)}><Pencil className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openAddStock(it)}><PackagePlus className="w-4 h-4 mr-2" />Add Stock</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openIssue(it)}><Send className="w-4 h-4 mr-2" />Issue</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openScrap(it)} className="text-amber-700"><Trash2 className="w-4 h-4 mr-2" />Scrap</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openHistory(it)}><History className="w-4 h-4 mr-2" />History</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(it)} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* ========== Add Dialog ========== */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add {tab === 'endmill' ? 'End Mill' : 'Insert'}</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            {tab === 'endmill' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Type *</Label>
                    <Select value={endmillForm.endmill_type} onValueChange={v => setEndmillForm({ ...endmillForm, endmill_type: v })}>
                      <SelectTrigger data-testid="endmill-type"><SelectValue /></SelectTrigger>
                      <SelectContent>{ENDMILL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Material *</Label>
                    <Select value={endmillForm.material} onValueChange={v => setEndmillForm({ ...endmillForm, material: v })}>
                      <SelectTrigger data-testid="endmill-material"><SelectValue /></SelectTrigger>
                      <SelectContent>{ENDMILL_MATERIALS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Diameter *</Label><Input type="number" step="0.1" value={endmillForm.diameter} onChange={e => setEndmillForm({ ...endmillForm, diameter: e.target.value })} required data-testid="endmill-diameter" /></div>
                  <div className="space-y-1.5"><Label>Length</Label><Input type="number" step="0.1" value={endmillForm.length} onChange={e => setEndmillForm({ ...endmillForm, length: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Grade</Label><Input value={endmillForm.grade} onChange={e => setEndmillForm({ ...endmillForm, grade: e.target.value })} placeholder="H10F" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" min="0" value={endmillForm.quantity} onChange={e => setEndmillForm({ ...endmillForm, quantity: e.target.value })} required data-testid="endmill-qty" /></div>
                  <div className="space-y-1.5"><Label>Min Qty</Label><Input type="number" min="0" value={endmillForm.min_quantity} onChange={e => setEndmillForm({ ...endmillForm, min_quantity: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5">
                  <Label>Tool Image</Label>
                  <Input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setEndmillForm, 'tool_image')} />
                  {endmillForm.tool_image && <img src={endmillForm.tool_image} alt="" className="h-20 rounded border mt-1" />}
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Insert Type *</Label>
                    <Select value={insertForm.insert_type} onValueChange={v => setInsertForm({ ...insertForm, insert_type: v })}>
                      <SelectTrigger data-testid="insert-type"><SelectValue /></SelectTrigger>
                      <SelectContent>{INSERT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    {insertForm.insert_type === 'Other' && <Input placeholder="Custom type" value={insertForm.insert_type_custom} onChange={e => setInsertForm({ ...insertForm, insert_type_custom: e.target.value })} className="mt-1.5" />}
                  </div>
                  <div className="space-y-1.5"><Label>Size</Label><Input value={insertForm.insert_size} onChange={e => setInsertForm({ ...insertForm, insert_size: e.target.value })} placeholder="160404" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Grade</Label><Input value={insertForm.insert_grade} onChange={e => setInsertForm({ ...insertForm, insert_grade: e.target.value })} placeholder="IC907" /></div>
                  <div className="space-y-1.5"><Label>Tip Radius</Label><Input value={insertForm.tip_radius} onChange={e => setInsertForm({ ...insertForm, tip_radius: e.target.value })} placeholder="0.4" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" min="0" value={insertForm.quantity} onChange={e => setInsertForm({ ...insertForm, quantity: e.target.value })} required data-testid="insert-qty" /></div>
                  <div className="space-y-1.5"><Label>Min Qty</Label><Input type="number" min="0" value={insertForm.min_quantity} onChange={e => setInsertForm({ ...insertForm, min_quantity: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Insert Image</Label>
                    <Input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setInsertForm, 'insert_image')} />
                    {insertForm.insert_image && <img src={insertForm.insert_image} alt="" className="h-16 rounded border mt-1" />}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Box Image</Label>
                    <Input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setInsertForm, 'box_image')} />
                    {insertForm.box_image && <img src={insertForm.box_image} alt="" className="h-16 rounded border mt-1" />}
                  </div>
                </div>
              </>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} data-testid="submit-add">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== Edit Dialog ========== */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit {selected?.category === 'endmill' ? 'End Mill' : 'Insert'}</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-3">
            {selected?.category === 'endmill' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Grade</Label><Input value={editForm.grade || ''} onChange={e => setEditForm({ ...editForm, grade: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Length</Label><Input type="number" step="0.1" value={editForm.length || ''} onChange={e => setEditForm({ ...editForm, length: parseFloat(e.target.value) || null })} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Size</Label><Input value={editForm.insert_size || ''} onChange={e => setEditForm({ ...editForm, insert_size: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Grade</Label><Input value={editForm.insert_grade || ''} onChange={e => setEditForm({ ...editForm, insert_grade: e.target.value })} /></div>
                <div className="space-y-1.5 col-span-2"><Label>Tip Radius</Label><Input value={editForm.tip_radius || ''} onChange={e => setEditForm({ ...editForm, tip_radius: e.target.value })} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" min="0" value={editForm.quantity ?? ''} onChange={e => setEditForm({ ...editForm, quantity: parseInt(e.target.value, 10) || 0 })} /></div>
              <div className="space-y-1.5"><Label>Min Qty</Label><Input type="number" min="0" value={editForm.min_quantity ?? ''} onChange={e => setEditForm({ ...editForm, min_quantity: parseInt(e.target.value, 10) || 0 })} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== Detail Dialog ========== */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{itemTitle(selected)}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="w-32 h-32 rounded bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden">
                  {itemImage(selected) ? <img src={itemImage(selected)} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => setEnlargedImg(itemImage(selected))} /> : <ImageIcon className="w-10 h-10 text-muted-foreground" />}
                </div>
                <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-muted-foreground uppercase">Stock</p><p className={`font-bold text-lg ${selected.is_low_stock ? 'text-red-600' : 'text-emerald-600'}`}>{selected.quantity}</p></div>
                  <div><p className="text-xs text-muted-foreground uppercase">Min Qty</p><p className="font-medium">{selected.min_quantity}</p></div>
                  <div><p className="text-xs text-muted-foreground uppercase">Scrapped</p><p className="font-medium text-amber-600">{selected.scrap_qty || 0}</p></div>
                  <div><p className="text-xs text-muted-foreground uppercase">Status</p>{selected.is_low_stock ? <Badge variant="destructive" className="text-xs">Low Stock</Badge> : <Badge className="bg-emerald-100 text-emerald-700 text-xs border-none">OK</Badge>}</div>
                </div>
              </div>

              {/* Full spec grid */}
              <div className="border rounded p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Specifications</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">Category</p><p className="font-medium capitalize">{selected.category || '-'}</p></div>
                  {selected.category === 'endmill' ? (
                    <>
                      <div><p className="text-xs text-muted-foreground">Type</p><p className="font-medium">{selected.endmill_type || '-'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Material</p><p className="font-medium">{selected.material || '-'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Diameter</p><p className="font-medium font-mono">Ø{selected.diameter ?? '-'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Length</p><p className="font-medium">{selected.length ?? '-'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Grade</p><p className="font-medium">{selected.grade || '-'}</p></div>
                    </>
                  ) : (
                    <>
                      <div><p className="text-xs text-muted-foreground">Insert Type</p><p className="font-medium">{selected.insert_type || '-'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Size</p><p className="font-medium font-mono">{selected.insert_size || '-'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Grade</p><p className="font-medium">{selected.insert_grade || '-'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Tip Radius</p><p className="font-medium">{selected.tip_radius || '-'}</p></div>
                    </>
                  )}
                </div>
              </div>

              {/* Extra images for inserts */}
              {selected.category === 'insert' && (selected.insert_image || selected.box_image) && (
                <div className="grid grid-cols-2 gap-2">
                  {selected.insert_image && <div><p className="text-xs text-muted-foreground mb-1">Insert</p><img src={normalizeImg(selected.insert_image)} alt="" className="w-full h-32 object-cover rounded border cursor-pointer" onClick={() => setEnlargedImg(normalizeImg(selected.insert_image))} /></div>}
                  {selected.box_image && <div><p className="text-xs text-muted-foreground mb-1">Box</p><img src={normalizeImg(selected.box_image)} alt="" className="w-full h-32 object-cover rounded border cursor-pointer" onClick={() => setEnlargedImg(normalizeImg(selected.box_image))} /></div>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { setDetailOpen(false); openAddStock(selected); }}><PackagePlus className="w-4 h-4 mr-2" />Add Stock</Button>
                <Button variant="outline" onClick={() => { setDetailOpen(false); openIssue(selected); }}><Send className="w-4 h-4 mr-2" />Issue</Button>
                <Button variant="outline" onClick={() => { setDetailOpen(false); openScrap(selected); }} className="text-amber-700 border-amber-300"><Trash2 className="w-4 h-4 mr-2" />Scrap</Button>
                <Button variant="outline" onClick={() => { setDetailOpen(false); openHistory(selected); }}><History className="w-4 h-4 mr-2" />History</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== Add Stock ========== */}
      <Dialog open={addStockOpen} onOpenChange={setAddStockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Stock — {itemTitle(selected)}</DialogTitle></DialogHeader>
          <form onSubmit={handleAddStock} className="space-y-3">
            <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" min="1" value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })} required data-testid="stock-qty" /></div>
            <div className="space-y-1.5"><Label>Added By</Label><Input value={stockForm.added_by} onChange={e => setStockForm({ ...stockForm, added_by: e.target.value })} placeholder="Name" data-testid="stock-added-by" /></div>
            <div className="space-y-1.5"><Label>Remarks</Label><Textarea value={stockForm.remarks} onChange={e => setStockForm({ ...stockForm, remarks: e.target.value })} rows={2} placeholder="New batch received" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddStockOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} data-testid="submit-stock">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add Stock</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== Issue ========== */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Issue Tool — {itemTitle(selected)}</DialogTitle></DialogHeader>
          <form onSubmit={handleIssue} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" min="1" max={selected?.quantity} value={issueForm.quantity} onChange={e => setIssueForm({ ...issueForm, quantity: e.target.value })} required data-testid="issue-qty" /></div>
              <div className="space-y-1.5"><Label>Machine</Label><Input value={issueForm.machine_name} onChange={e => setIssueForm({ ...issueForm, machine_name: e.target.value })} placeholder="VMC-01" /></div>
            </div>

            <div className="flex gap-1 border-b">
              <button type="button" onClick={() => setIssueMode('select')} className={`px-3 py-1.5 text-xs font-medium border-b-2 ${issueMode === 'select' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Select User</button>
              <button type="button" onClick={() => setIssueMode('manual')} className={`px-3 py-1.5 text-xs font-medium border-b-2 ${issueMode === 'manual' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Enter Name</button>
            </div>

            {issueMode === 'select' ? (
              <div className="border rounded p-2 space-y-2 max-h-56 overflow-y-auto">
                <Input placeholder="Search users…" value={issueUserSearch} onChange={e => setIssueUserSearch(e.target.value)} />
                {operators.filter(u => (u.name || '').toLowerCase().includes(issueUserSearch.toLowerCase()) || (u.role || '').toLowerCase().includes(issueUserSearch.toLowerCase())).map(u => (
                  <button key={u.user_id} type="button" onClick={() => { setIssueUserId(u.user_id); setIssueForm({ ...issueForm, issued_to: u.name }); }} className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between hover:bg-muted ${issueUserId === u.user_id ? 'bg-primary/10' : ''}`}>
                    <span>{u.name} {u.role === 'Admin' && <Badge className="ml-2 text-[10px]">Admin</Badge>}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">{u.role || ''}{issueUserId === u.user_id && <CheckCircle className="w-3.5 h-3.5 text-primary ml-1" />}</span>
                  </button>
                ))}
                {operators.length === 0 && <p className="text-xs text-muted-foreground text-center">No users found.</p>}
              </div>
            ) : (
              <div className="space-y-1.5"><Label>Issued To *</Label><Input value={issueForm.issued_to} onChange={e => { setIssueForm({ ...issueForm, issued_to: e.target.value }); setIssueUserId(''); }} required placeholder="Enter name" data-testid="issue-to" /></div>
            )}

            {issueForm.issued_to && <p className="text-xs text-muted-foreground">→ Will issue to: <span className="font-medium">{issueForm.issued_to}</span></p>}

            <div className="space-y-1.5"><Label>Purpose</Label><Input value={issueForm.purpose} onChange={e => setIssueForm({ ...issueForm, purpose: e.target.value })} placeholder="Production work" /></div>
            <div className="space-y-1.5">
              <Label>Signature (optional)</Label>
              <SignaturePad onSignature={(sig) => setIssueForm(prev => ({ ...prev, signature: sig }))} />
              <p className="text-xs text-muted-foreground">Signature is usually captured via the mobile APK.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting || !issueForm.issued_to} data-testid="submit-issue">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Issue</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== Scrap ========== */}
      <Dialog open={scrapOpen} onOpenChange={setScrapOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Scrap Tool — {itemTitle(selected)}</DialogTitle></DialogHeader>
          <form onSubmit={handleScrap} className="space-y-3">
            <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">Scrap permanently removes stock. Use "Issue" if the tool is being given for use.</div>

            <div className="flex gap-1 border-b">
              <button type="button" onClick={() => { setScrapMode('self'); setScrapForm({ ...scrapForm, scrapped_by: userName }); setScrapUserId(''); }} className={`px-3 py-1.5 text-xs font-medium border-b-2 ${scrapMode === 'self' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Submit My Scrap</button>
              <button type="button" onClick={() => { setScrapMode('collect'); setScrapForm({ ...scrapForm, scrapped_by: '' }); setScrapUserId(''); }} className={`px-3 py-1.5 text-xs font-medium border-b-2 ${scrapMode === 'collect' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Collect from User</button>
            </div>

            {scrapMode === 'collect' && (
              <div className="border rounded p-2 space-y-2 max-h-56 overflow-y-auto">
                <Input placeholder="Search users…" value={scrapUserSearch} onChange={e => setScrapUserSearch(e.target.value)} />
                {operators.filter(u => (u.name || '').toLowerCase().includes(scrapUserSearch.toLowerCase()) || (u.role || '').toLowerCase().includes(scrapUserSearch.toLowerCase())).map(u => (
                  <button key={u.user_id} type="button" onClick={() => { setScrapUserId(u.user_id); setScrapForm({ ...scrapForm, scrapped_by: u.name }); }} className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between hover:bg-muted ${scrapUserId === u.user_id ? 'bg-primary/10' : ''}`}>
                    <span>{u.name}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">{u.role || ''}{scrapUserId === u.user_id && <CheckCircle className="w-3.5 h-3.5 text-primary ml-1" />}</span>
                  </button>
                ))}
                <p className="text-xs text-muted-foreground">Or enter manually below:</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" min="1" max={selected?.quantity} value={scrapForm.quantity} onChange={e => setScrapForm({ ...scrapForm, quantity: e.target.value })} required data-testid="scrap-qty" /></div>
              <div className="space-y-1.5"><Label>{scrapMode === 'self' ? 'Your Name' : 'Returned By'}</Label><Input value={scrapForm.scrapped_by} onChange={e => { setScrapForm({ ...scrapForm, scrapped_by: e.target.value }); setScrapUserId(''); }} placeholder="Name" /></div>
            </div>
            <div className="space-y-1.5"><Label>Reason *</Label><Input value={scrapForm.reason} onChange={e => setScrapForm({ ...scrapForm, reason: e.target.value })} required placeholder="Broken tip / worn out / damaged" data-testid="scrap-reason" /></div>
            <div className="space-y-1.5">
              <Label>Signature (optional)</Label>
              <SignaturePad onSignature={(sig) => setScrapForm(prev => ({ ...prev, signature: sig }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setScrapOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} data-testid="submit-scrap" className="bg-amber-600 hover:bg-amber-700">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Scrap</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== History ========== */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>History — {itemTitle(selected)}</DialogTitle></DialogHeader>
          <div className="flex gap-1 border-b border-border">
            <button onClick={() => setHistoryTab('issues')} className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 ${historyTab === 'issues' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
              <Send className="w-3.5 h-3.5" /> Issues ({issuesList.length})
            </button>
            <button onClick={() => setHistoryTab('scraps')} className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 ${historyTab === 'scraps' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
              <Trash2 className="w-3.5 h-3.5" /> Scraps ({scrapsList.length})
            </button>
          </div>
          {historyLoading ? (
            <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : historyError ? (
            <div className="py-6 text-center">
              <AlertTriangle className="w-6 h-6 mx-auto text-amber-600 mb-2" />
              <p className="text-sm text-muted-foreground">{historyError}</p>
              <p className="text-xs text-muted-foreground mt-1">Check browser console for backend response details.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {(historyTab === 'issues' ? issuesList : scrapsList).length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No {historyTab} recorded.</p>
              ) : (historyTab === 'issues' ? issuesList : scrapsList).map((h, i) => (
                <div key={h.issue_id || h.scrap_id || i} className="border rounded p-3 text-sm space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className="text-xs capitalize">{selected?.category || h.type}</Badge>
                        <span className="text-xs font-medium">{itemTitle(h.item_details || selected)}</span>
                      </div>
                      {historyTab === 'issues' ? (
                        <>
                          <p className="font-medium">Issued to: {h.issued_to_name || h.issued_to || '-'}</p>
                          <p className="text-xs text-muted-foreground">Issued by: {h.issued_by_name || h.issued_by || '-'}</p>
                          {h.machine_name && <p className="text-xs text-muted-foreground">Machine: {h.machine_name}</p>}
                          {h.purpose && <p className="text-xs text-muted-foreground">Purpose: {h.purpose}</p>}
                        </>
                      ) : (
                        <>
                          <p className="font-medium">Returned by: {h.returned_by_name || h.scrapped_by || '-'}</p>
                          <p className="text-xs text-muted-foreground">Collected by: {h.collected_by_name || '-'}</p>
                          {h.reason && <p className="text-xs text-muted-foreground">Reason: {h.reason}</p>}
                        </>
                      )}
                      <p className="text-xs text-muted-foreground">{h.timestamp_ist || ((h.timestamp || h.issued_at || h.scrapped_at || h.collected_at) ? new Date(h.timestamp || h.issued_at || h.scrapped_at || h.collected_at).toLocaleString() : '-')}</p>
                    </div>
                    <Badge className="flex-shrink-0" variant={historyTab === 'scraps' ? 'destructive' : 'secondary'}>Qty: {h.quantity || 1}</Badge>
                  </div>
                  {h.signature && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Signature</p>
                      <img src={normalizeImg(h.signature)} alt="signature" className="w-full rounded cursor-pointer object-contain" style={{ backgroundColor: '#1E293B', minHeight: 180 }} onClick={() => setEnlargedImg(normalizeImg(h.signature))} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== Image Enlarge ========== */}
      <Dialog open={!!enlargedImg} onOpenChange={(o) => !o && setEnlargedImg(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Preview</DialogTitle></DialogHeader>
          {enlargedImg && <img src={enlargedImg} alt="" className="w-full max-h-[75vh] object-contain rounded" style={{ backgroundColor: '#1E293B' }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ToolsInserts;
