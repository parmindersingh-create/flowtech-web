import React, { useState, useEffect, useCallback } from 'react';
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Search, Plus, MoreVertical, Loader2, Layers, Image as ImageIcon,
  Send, RotateCcw, History, Edit, Trash2, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from '../components/SignaturePad';
import { useAuth } from '../context/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

const MOULD_CATEGORIES = [
  { value: 'injection_mould', label: 'Injection Mould' },
  { value: 'gravity_mould', label: 'Gravity Mould' },
  { value: 'pressure_die_casting', label: 'Pressure Die Casting' },
  { value: 'vacuum_forming', label: 'Vacuum Forming' },
];
const labelOf = (v) => MOULD_CATEGORIES.find(c => c.value === v)?.label || v || '-';
const normalizeImg = (src) => {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('data:') || src.startsWith('http')) return src;
  return `data:image/png;base64,${src}`;
};

const emptyForm = {
  serial_no: '', mould_category: 'injection_mould', mould_name: '',
  assembly_name: '', designer_mould_no: '', factory_mould_no: '',
  location_place: '', location_rack: '', remarks: '',
  article_image: '', core_cavity_image: '',
};

const statusBadge = (s) => {
  if (s === 'available') return <Badge className="bg-emerald-500 hover:bg-emerald-500 text-xs">Available</Badge>;
  if (s === 'with_user') return <Badge className="bg-amber-500 hover:bg-amber-500 text-xs">In Use</Badge>;
  if (s === 'maintenance') return <Badge variant="destructive" className="text-xs">Maintenance</Badge>;
  return <Badge variant="outline" className="text-xs">{s || '-'}</Badge>;
};

const Moulds = () => {
  const { user } = useAuth();
  const [moulds, setMoulds] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [giveOpen, setGiveOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [enlarged, setEnlarged] = useState(null);
  const [selected, setSelected] = useState(null);

  const [form, setForm] = useState(emptyForm);
  const [giveForm, setGiveForm] = useState({ given_to: '', given_to_name: '', signature: '', remarks: '' });
  const [returnForm, setReturnForm] = useState({ returned_by_name: '', signature: '', remarks: '' });
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchMoulds = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filter !== 'all') params.set('status', filter === 'available' ? 'available' : 'with_user');
      const { data } = await axios.get(`${API}/api/moulds?${params.toString()}`);
      setMoulds(Array.isArray(data) ? data : (data?.moulds || []));
    } catch (err) { toast.error('Failed to load moulds'); }
    finally { setLoading(false); }
  }, [search, filter]);

  useEffect(() => { fetchMoulds(); }, [fetchMoulds]);

  useEffect(() => {
    axios.get(`${API}/api/operators`).then(r => setUsers(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const handleImgUpload = (e, field, setter) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setter(prev => ({ ...prev, [field]: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const handleAdd = async (e) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await axios.post(`${API}/api/moulds`, form);
      toast.success('Mould added'); setAddOpen(false); setForm(emptyForm); fetchMoulds();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add'); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    try {
      await axios.put(`${API}/api/moulds/${selected.mould_id}`, form);
      toast.success('Mould updated'); setEditOpen(false); fetchMoulds();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (m) => {
    if (!window.confirm(`Delete mould "${m.mould_name}"?`)) return;
    try {
      await axios.delete(`${API}/api/moulds/${m.mould_id}`);
      toast.success('Deleted'); fetchMoulds();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete'); }
  };

  const openEdit = (m) => { setSelected(m); setForm({
    serial_no: m.serial_no || '', mould_category: m.mould_category || 'injection_mould',
    mould_name: m.mould_name || '', assembly_name: m.assembly_name || '',
    designer_mould_no: m.designer_mould_no || '', factory_mould_no: m.factory_mould_no || '',
    location_place: m.location_place || '', location_rack: m.location_rack || '',
    remarks: m.remarks || '', article_image: m.article_image || '', core_cavity_image: m.core_cavity_image || '',
  }); setEditOpen(true); };

  const openGive = (m) => {
    setSelected(m);
    setGiveForm({ given_to: '', given_to_name: '', signature: '', remarks: '' });
    setGiveOpen(true);
  };
  const openReturn = (m) => {
    setSelected(m);
    setReturnForm({ returned_by_name: m.current_holder_name || '', signature: '', remarks: '' });
    setReturnOpen(true);
  };

  const handleGive = async (e) => {
    e.preventDefault();
    if (!giveForm.given_to_name.trim()) return toast.error('Select a user or enter a name');
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/moulds/${selected.mould_id}/transaction`, {
        action: "give",
        given_to: giveForm.given_to || null,
        given_to_name: giveForm.given_to_name,
        signature: giveForm.signature || null,
        remarks: giveForm.remarks || null,
      });
      toast.success('Mould given'); setGiveOpen(false); fetchMoulds();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to give'); }
    finally { setSubmitting(false); }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/moulds/${selected.mould_id}/transaction`, {
        action: "return",
        returned_by_name: returnForm.returned_by_name || null,
        signature: returnForm.signature || null,
        remarks: returnForm.remarks || null,
      });
      toast.success('Mould returned'); setReturnOpen(false); fetchMoulds();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to return'); }
    finally { setSubmitting(false); }
  };

  const openHistory = async (m) => {
    setSelected(m); setHistoryOpen(true); setHistoryLoading(true); setHistory([]);
    try {
      const { data } = await axios.get(`${API}/api/moulds/${m.mould_id}/history`);
      const list = Array.isArray(data) ? data : (data?.transactions || data?.history || []);
      setHistory(list);
    } catch { toast.error('Failed to load history'); }
    finally { setHistoryLoading(false); }
  };

  const openDetail = (m) => { setSelected(m); setDetailOpen(true); };

  const filtered = moulds.filter(m => {
    if (filter === 'available' && m.status !== 'available') return false;
    if (filter === 'in_use' && m.status !== 'with_user') return false;
    if (search) {
      const q = search.toLowerCase();
      return [m.mould_name, m.serial_no, m.mould_category, m.assembly_name]
        .some(v => (v || '').toLowerCase().includes(q));
    }
    return true;
  });

  const FormFields = ({ value, onChange }) => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Serial No *</Label><Input value={value.serial_no} onChange={e => onChange({ ...value, serial_no: e.target.value })} required placeholder="M001" /></div>
        <div className="space-y-1.5"><Label>Category *</Label>
          <Select value={value.mould_category} onValueChange={v => onChange({ ...value, mould_category: v })}>
            <SelectTrigger data-testid="mould-cat-select"><SelectValue /></SelectTrigger>
            <SelectContent>{MOULD_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label>Mould Name *</Label><Input value={value.mould_name} onChange={e => onChange({ ...value, mould_name: e.target.value })} required placeholder="Pump Body Mould" /></div>
      <div className="space-y-1.5"><Label>Assembly Name</Label><Input value={value.assembly_name} onChange={e => onChange({ ...value, assembly_name: e.target.value })} placeholder="Dosing Pump A" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Designer Mould No</Label><Input value={value.designer_mould_no} onChange={e => onChange({ ...value, designer_mould_no: e.target.value })} placeholder="DM-001" /></div>
        <div className="space-y-1.5"><Label>Factory Mould No</Label><Input value={value.factory_mould_no} onChange={e => onChange({ ...value, factory_mould_no: e.target.value })} placeholder="FM-001" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Location Place</Label><Input value={value.location_place} onChange={e => onChange({ ...value, location_place: e.target.value })} placeholder="Rack A" /></div>
        <div className="space-y-1.5"><Label>Location Rack</Label><Input value={value.location_rack} onChange={e => onChange({ ...value, location_rack: e.target.value })} placeholder="Shelf 3" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Article Image</Label>
          <Input type="file" accept="image/*" onChange={(e) => handleImgUpload(e, 'article_image', onChange === setForm ? setForm : onChange)} />
          {value.article_image && <img src={normalizeImg(value.article_image)} alt="" className="h-16 mt-1 rounded border" />}
        </div>
        <div className="space-y-1.5">
          <Label>Core/Cavity Image</Label>
          <Input type="file" accept="image/*" onChange={(e) => handleImgUpload(e, 'core_cavity_image', onChange === setForm ? setForm : onChange)} />
          {value.core_cavity_image && <img src={normalizeImg(value.core_cavity_image)} alt="" className="h-16 mt-1 rounded border" />}
        </div>
      </div>
      <div className="space-y-1.5"><Label>Remarks</Label><Textarea rows={2} value={value.remarks} onChange={e => onChange({ ...value, remarks: e.target.value })} /></div>
    </>
  );

  const UserSelect = ({ value, onSelect }) => {
    const [q, setQ] = useState('');
    const filtered = users.filter(u => (u.name || '').toLowerCase().includes(q.toLowerCase()) || (u.role || '').toLowerCase().includes(q.toLowerCase()));
    return (
      <div className="border rounded p-2 max-h-48 overflow-y-auto">
        <Input className="mb-2" placeholder="Search users…" value={q} onChange={e => setQ(e.target.value)} />
        {filtered.map(u => (
          <button key={u.user_id} type="button" onClick={() => onSelect(u)} className={`w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm flex items-center justify-between ${value === u.user_id ? 'bg-primary/10' : ''}`}>
            <span>{u.name}</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">{u.role || ''}{value === u.user_id && <CheckCircle className="w-3.5 h-3.5 text-primary" />}</span>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No users</p>}
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="moulds-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3"><Layers className="w-7 h-7" />Moulds</h1>
        <Button onClick={() => { setForm(emptyForm); setAddOpen(true); }} data-testid="add-mould-btn"><Plus className="w-4 h-4 mr-2" />Add Mould</Button>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {[{ k: 'all', l: 'All' }, { k: 'available', l: 'Available' }, { k: 'in_use', l: 'In Use' }].map(t => (
          <button key={t.k} onClick={() => setFilter(t.k)} className={`px-4 py-2 text-sm font-medium border-b-2 ${filter === t.k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} data-testid={`mould-tab-${t.k}`}>{t.l}</button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-10" placeholder="Search name, serial, category, assembly…" value={search} onChange={e => setSearch(e.target.value)} data-testid="mould-search" />
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center"><Layers className="w-12 h-12 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No moulds found</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(m => (
            <Card key={m.mould_id} className="border hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(m)} data-testid={`mould-card-${m.mould_id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <Badge variant="outline" className="text-[10px] uppercase mb-1">{labelOf(m.mould_category)}</Badge>
                    <h3 className="font-semibold truncate">{m.mould_name || '-'}</h3>
                    <p className="text-xs text-muted-foreground">#{m.serial_no || '-'}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      {m.status === 'available' ? (
                        <DropdownMenuItem onClick={() => openGive(m)}><Send className="w-4 h-4 mr-2" />Give</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => openReturn(m)}><RotateCcw className="w-4 h-4 mr-2" />Return</DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => openHistory(m)}><History className="w-4 h-4 mr-2" />History</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(m)}><Edit className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(m)} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center justify-between">
                  {statusBadge(m.status)}
                  {m.current_holder_name && <span className="text-xs text-muted-foreground truncate">→ {m.current_holder_name}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Mould</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <FormFields value={form} onChange={setForm} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} data-testid="submit-add-mould">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Mould</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-3">
            <FormFields value={form} onChange={setForm} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.mould_name}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Badge variant="outline" className="uppercase text-xs">{labelOf(selected.mould_category)}</Badge>
                {statusBadge(selected.status)}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground uppercase">Serial No</p><p className="font-medium">#{selected.serial_no || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Assembly</p><p className="font-medium">{selected.assembly_name || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Designer Mould No</p><p className="font-medium">{selected.designer_mould_no || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Factory Mould No</p><p className="font-medium">{selected.factory_mould_no || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Place</p><p className="font-medium">{selected.location_place || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase">Rack</p><p className="font-medium">{selected.location_rack || '-'}</p></div>
                {selected.current_holder_name && <div className="col-span-2"><p className="text-xs text-muted-foreground uppercase">Current Holder</p><p className="font-medium">{selected.current_holder_name} {selected.given_at && <span className="text-xs text-muted-foreground">• since {new Date(selected.given_at).toLocaleDateString()}</span>}</p></div>}
                {selected.remarks && <div className="col-span-2"><p className="text-xs text-muted-foreground uppercase">Remarks</p><p className="font-medium">{selected.remarks}</p></div>}
              </div>
              {(selected.article_image || selected.core_cavity_image) && (
                <div className="grid grid-cols-2 gap-2">
                  {selected.article_image && <div><p className="text-xs text-muted-foreground mb-1">Article</p><img src={normalizeImg(selected.article_image)} alt="" className="w-full h-32 object-cover rounded border cursor-pointer" onClick={() => setEnlarged(normalizeImg(selected.article_image))} /></div>}
                  {selected.core_cavity_image && <div><p className="text-xs text-muted-foreground mb-1">Core / Cavity</p><img src={normalizeImg(selected.core_cavity_image)} alt="" className="w-full h-32 object-cover rounded border cursor-pointer" onClick={() => setEnlarged(normalizeImg(selected.core_cavity_image))} /></div>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {selected.status === 'available'
                  ? <Button onClick={() => { setDetailOpen(false); openGive(selected); }}><Send className="w-4 h-4 mr-2" />Give</Button>
                  : <Button onClick={() => { setDetailOpen(false); openReturn(selected); }}><RotateCcw className="w-4 h-4 mr-2" />Return</Button>}
                <Button variant="outline" onClick={() => { setDetailOpen(false); openHistory(selected); }}><History className="w-4 h-4 mr-2" />History</Button>
                <Button variant="outline" onClick={() => { setDetailOpen(false); openEdit(selected); }}><Edit className="w-4 h-4 mr-2" />Edit</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Give */}
      <Dialog open={giveOpen} onOpenChange={setGiveOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Give Mould — {selected?.mould_name}</DialogTitle></DialogHeader>
          <form onSubmit={handleGive} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Select User</Label>
              <UserSelect value={giveForm.given_to} onSelect={(u) => setGiveForm({ ...giveForm, given_to: u.user_id, given_to_name: u.name })} />
            </div>
            <div className="space-y-1.5"><Label>Or enter name manually</Label>
              <Input value={giveForm.given_to_name} onChange={e => setGiveForm({ ...giveForm, given_to_name: e.target.value, given_to: '' })} placeholder="Name" data-testid="mould-give-name" />
            </div>
            <div className="space-y-1.5"><Label>Remarks</Label><Textarea rows={2} value={giveForm.remarks} onChange={e => setGiveForm({ ...giveForm, remarks: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Signature (optional on web)</Label>
              <SignaturePad onSignature={(s) => setGiveForm(prev => ({ ...prev, signature: s }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGiveOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} data-testid="submit-give">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Give</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Return */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Return Mould — {selected?.mould_name}</DialogTitle></DialogHeader>
          <form onSubmit={handleReturn} className="space-y-3">
            <div className="space-y-1.5"><Label>Returned By</Label><Input value={returnForm.returned_by_name} onChange={e => setReturnForm({ ...returnForm, returned_by_name: e.target.value })} placeholder="Name" /></div>
            <div className="space-y-1.5"><Label>Remarks</Label><Textarea rows={2} value={returnForm.remarks} onChange={e => setReturnForm({ ...returnForm, remarks: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Signature (optional on web)</Label>
              <SignaturePad onSignature={(s) => setReturnForm(prev => ({ ...prev, signature: s }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} data-testid="submit-return">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Return</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* History */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>History — {selected?.mould_name}</DialogTitle></DialogHeader>
          {historyLoading ? <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            : history.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No history yet</p>
              : <div className="space-y-2">
                {history.map((h, i) => (
                  <div key={h.log_id || i} className="border rounded p-3 text-sm">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <Badge variant={h.type === 'return' ? 'secondary' : 'default'} className="text-xs mb-1">{h.type === 'return' ? 'Returned' : 'Given'}</Badge>
                        <p className="font-medium">{h.type === 'return' ? (h.returned_by_name || '-') : (h.given_to_name || '-')}</p>
                        <p className="text-xs text-muted-foreground">{h.timestamp_ist || (h.timestamp ? new Date(h.timestamp).toLocaleString() : (h.given_at || h.returned_at) ? new Date(h.given_at || h.returned_at).toLocaleString() : '-')}</p>
                        {h.remarks && <p className="text-xs mt-1">{h.remarks}</p>}
                      </div>
                    </div>
                    {h.signature && <img src={normalizeImg(h.signature)} alt="sig" className="w-full rounded cursor-pointer object-contain mt-2" style={{ backgroundColor: '#1E293B', minHeight: 180 }} onClick={() => setEnlarged(normalizeImg(h.signature))} />}
                  </div>
                ))}
              </div>}
        </DialogContent>
      </Dialog>

      {/* Enlarge */}
      <Dialog open={!!enlarged} onOpenChange={(o) => !o && setEnlarged(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Preview</DialogTitle></DialogHeader>
          {enlarged && <img src={enlarged} alt="" className="w-full max-h-[75vh] object-contain rounded" style={{ backgroundColor: '#1E293B' }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Moulds;
