import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  ArrowLeft, Plus, Loader2, Package, AlertTriangle, MoreVertical, Edit, Trash2,
  History, Image as ImageIcon, Minus, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import SignaturePad from '../components/SignaturePad';

const API = process.env.REACT_APP_BACKEND_URL;

const SPARE_CATEGORIES = [
  'Bearings', 'Belts', 'Motors', 'Electronics', 'Hydraulics', 'Pneumatics',
  'Filters', 'Seals & Gaskets', 'Gears', 'Coolant', 'Lubricants', 'Fasteners',
  'Sensors', 'Spindle Parts', 'Tool Holders', 'Other',
];

const emptyForm = {
  category: 'Bearings', customCategory: '', name: '', specs: '', make: '',
  quantity: 1, min_quantity: 0, location: '', image: '',
};

const MachineSpares = () => {
  const { machineId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'Admin' || user?.is_admin;

  const [spares, setSpares] = useState([]);
  const [machineName, setMachineName] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [takeOpen, setTakeOpen] = useState(false);
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [enlargedSig, setEnlargedSig] = useState(null);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [takeForm, setTakeForm] = useState({ quantity: 1, remarks: '', signature: '' });
  const [stockForm, setStockForm] = useState({ quantity: 1, remarks: '' });

  const fetchSpares = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/machines/${machineId}/spares`);
      const list = Array.isArray(data) ? data : (data.spares || []);
      setSpares(list);
      if (list[0]?.machine_name) setMachineName(list[0].machine_name);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load spares');
    } finally { setLoading(false); }
  }, [machineId]);

  const fetchMachineName = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/machine-status/summary-public`, { withCredentials: false });
      const m = (data.machines || []).find(x => x.machine_id === machineId);
      if (m?.machine_name) setMachineName(m.machine_name);
    } catch { /* ignore */ }
  }, [machineId]);

  useEffect(() => { fetchSpares(); fetchMachineName(); }, [fetchSpares, fetchMachineName]);

  const openDetail = async (spare) => {
    setSelected(spare);
    setDetailOpen(true);
    try {
      const { data } = await axios.get(`${API}/api/machine-spares/${spare.spare_id}/history`);
      setHistory(Array.isArray(data) ? data : []);
    } catch { setHistory([]); }
  };

  const resolveCategory = (f) => f.category === 'Other' ? (f.customCategory.trim() || 'Other') : f.category;

  const handleImageChange = (e, setter) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setter(prev => ({ ...prev, image: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        category: resolveCategory(form), name: form.name, specs: form.specs, make: form.make,
        quantity: Number(form.quantity) || 0, min_quantity: Number(form.min_quantity) || 0,
        location: form.location, image: form.image || null,
      };
      await axios.post(`${API}/api/machines/${machineId}/spares`, payload);
      toast.success('Spare added');
      setAddOpen(false); setForm(emptyForm); fetchSpares();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add spare'); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    try {
      const payload = {
        category: resolveCategory(form), name: form.name, specs: form.specs, make: form.make,
        quantity: Number(form.quantity) || 0, min_quantity: Number(form.min_quantity) || 0,
        location: form.location, image: form.image || null,
      };
      await axios.put(`${API}/api/machine-spares/${selected.spare_id}`, payload);
      toast.success('Spare updated');
      setEditOpen(false); fetchSpares();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (spare) => {
    if (!window.confirm(`Delete spare "${spare.name}"?`)) return;
    try {
      await axios.delete(`${API}/api/machine-spares/${spare.spare_id}`);
      toast.success('Spare deleted'); fetchSpares();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete'); }
  };

  const handleTake = async (e) => {
    e.preventDefault();
    if (!selected) return;
    const q = Number(takeForm.quantity);
    if (!q || q <= 0) return toast.error('Enter a valid quantity');
    if (q > selected.quantity) return toast.error('Quantity exceeds stock');
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/machine-spares/${selected.spare_id}/take`, {
        quantity: q, remarks: takeForm.remarks, signature: takeForm.signature || null,
      });
      toast.success('Spare taken');
      setTakeOpen(false); setTakeForm({ quantity: 1, remarks: '', signature: '' });
      const refreshed = await axios.get(`${API}/api/machine-spares/${selected.spare_id}`);
      setSelected(refreshed.data);
      fetchSpares();
      const hist = await axios.get(`${API}/api/machine-spares/${selected.spare_id}/history`);
      setHistory(Array.isArray(hist.data) ? hist.data : []);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to take spare'); }
    finally { setSubmitting(false); }
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    if (!selected) return;
    const q = Number(stockForm.quantity);
    if (!q || q <= 0) return toast.error('Enter a valid quantity');
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/machine-spares/${selected.spare_id}/add-stock`, {
        quantity: q, remarks: stockForm.remarks,
      });
      toast.success('Stock added');
      setAddStockOpen(false); setStockForm({ quantity: 1, remarks: '' });
      const refreshed = await axios.get(`${API}/api/machine-spares/${selected.spare_id}`);
      setSelected(refreshed.data);
      fetchSpares();
      const hist = await axios.get(`${API}/api/machine-spares/${selected.spare_id}/history`);
      setHistory(Array.isArray(hist.data) ? hist.data : []);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add stock'); }
    finally { setSubmitting(false); }
  };

  const openEditForm = (spare) => {
    setSelected(spare);
    const known = SPARE_CATEGORIES.includes(spare.category);
    setForm({
      category: known ? spare.category : 'Other',
      customCategory: known ? '' : (spare.category || ''),
      name: spare.name || '', specs: spare.specs || '', make: spare.make || '',
      quantity: spare.quantity || 0, min_quantity: spare.min_quantity || 0,
      location: spare.location || '', image: spare.image || '',
    });
    setEditOpen(true);
  };

  const lowStockCount = spares.filter(s => (s.is_low_stock ?? (s.quantity <= (s.min_quantity || 0)))).length;
  const totalQty = spares.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

  const FormFields = ({ value, onChange }) => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Category *</Label>
          <Select value={value.category} onValueChange={(v) => onChange({ ...value, category: v })}>
            <SelectTrigger data-testid="spare-category-select"><SelectValue /></SelectTrigger>
            <SelectContent>{SPARE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          {value.category === 'Other' && (
            <Input placeholder="Enter custom category" value={value.customCategory} onChange={e => onChange({ ...value, customCategory: e.target.value })} data-testid="spare-custom-category" />
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Make</Label>
          <Input value={value.make} onChange={e => onChange({ ...value, make: e.target.value })} placeholder="e.g., SKF" data-testid="spare-make" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} required placeholder="e.g., Bearing 6205" data-testid="spare-name" />
      </div>
      <div className="space-y-1.5">
        <Label>Specs</Label>
        <Input value={value.specs} onChange={e => onChange({ ...value, specs: e.target.value })} placeholder="e.g., 25x52x15mm" data-testid="spare-specs" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" min="0" value={value.quantity} onChange={e => onChange({ ...value, quantity: e.target.value })} required data-testid="spare-qty" /></div>
        <div className="space-y-1.5"><Label>Min Qty</Label><Input type="number" min="0" value={value.min_quantity} onChange={e => onChange({ ...value, min_quantity: e.target.value })} data-testid="spare-min-qty" /></div>
        <div className="space-y-1.5"><Label>Location</Label><Input value={value.location} onChange={e => onChange({ ...value, location: e.target.value })} placeholder="Rack A-12" data-testid="spare-location" /></div>
      </div>
      <div className="space-y-1.5">
        <Label>Image</Label>
        <Input type="file" accept="image/*" onChange={(e) => handleImageChange(e, onChange === setForm ? setForm : onChange)} data-testid="spare-image" />
        {value.image && <img src={value.image} alt="preview" className="h-20 mt-2 rounded border object-cover" />}
      </div>
    </>
  );

  return (
    <div className="space-y-4" data-testid="machine-spares-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('/dashboard/machines')} data-testid="back-btn">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Machine Spares</h1>
            <p className="text-sm text-muted-foreground">{machineName || machineId}</p>
          </div>
        </div>
        <Button onClick={() => { setForm(emptyForm); setAddOpen(true); }} data-testid="add-spare-btn">
          <Plus className="w-4 h-4 mr-2" /> Add Spare
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border"><CardContent className="p-4"><p className="text-xs font-bold uppercase text-muted-foreground">Total Items</p><p className="text-2xl font-extrabold">{spares.length}</p></CardContent></Card>
        <Card className="border"><CardContent className="p-4"><p className="text-xs font-bold uppercase text-red-600">Low Stock</p><p className="text-2xl font-extrabold text-red-600">{lowStockCount}</p></CardContent></Card>
        <Card className="border"><CardContent className="p-4"><p className="text-xs font-bold uppercase text-emerald-600">Total Qty</p><p className="text-2xl font-extrabold text-emerald-600">{totalQty}</p></CardContent></Card>
      </div>

      {/* Spares Grid */}
      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
      ) : spares.length === 0 ? (
        <div className="py-16 text-center"><Package className="w-12 h-12 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No spares yet. Click "Add Spare" to get started.</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {spares.map((s) => {
            const low = s.is_low_stock ?? (s.quantity <= (s.min_quantity || 0));
            return (
              <Card key={s.spare_id} className={`border cursor-pointer hover:shadow-md transition-shadow ${low ? 'border-red-500 border-2' : ''}`} onClick={() => openDetail(s)} data-testid={`spare-card-${s.spare_id}`}>
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden">
                      {s.image ? <img src={s.image} alt={s.name} className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm truncate">{s.name}</h3>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-6 w-6"><MoreVertical className="w-3.5 h-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => openEditForm(s)}><Edit className="w-3.5 h-3.5 mr-2" /> Edit</DropdownMenuItem>
                            {isAdmin && <DropdownMenuItem onClick={() => handleDelete(s)} className="text-destructive"><Trash2 className="w-3.5 h-3.5 mr-2" /> Delete</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.category}{s.make ? ` • ${s.make}` : ''}</p>
                      {s.specs && <p className="text-xs text-muted-foreground truncate">{s.specs}</p>}
                      {s.location && <p className="text-xs text-muted-foreground truncate">📍 {s.location}</p>}
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant={low ? 'destructive' : 'secondary'} className="text-xs">Qty: {s.quantity}</Badge>
                        {low && <Badge variant="destructive" className="text-xs"><AlertTriangle className="w-3 h-3 mr-1" />Low</Badge>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Spare */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Spare Part</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <FormFields value={form} onChange={setForm} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} data-testid="submit-add-spare">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add Spare</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Spare */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Spare</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-3">
            <FormFields value={form} onChange={setForm} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Update</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="spare-detail-modal">
          <DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="w-32 h-32 rounded bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden">
                  {selected.image ? <img src={selected.image} alt={selected.name} className="w-full h-full object-cover" /> : <ImageIcon className="w-10 h-10 text-muted-foreground" />}
                </div>
                <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-muted-foreground uppercase">Category</p><p className="font-medium">{selected.category}</p></div>
                  <div><p className="text-xs text-muted-foreground uppercase">Make</p><p className="font-medium">{selected.make || '-'}</p></div>
                  <div><p className="text-xs text-muted-foreground uppercase">Specs</p><p className="font-medium">{selected.specs || '-'}</p></div>
                  <div><p className="text-xs text-muted-foreground uppercase">Location</p><p className="font-medium">{selected.location || '-'}</p></div>
                  <div><p className="text-xs text-muted-foreground uppercase">Quantity</p><p className="font-bold text-lg">{selected.quantity}</p></div>
                  <div><p className="text-xs text-muted-foreground uppercase">Min Qty</p><p className="font-medium">{selected.min_quantity || 0}</p></div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => { setTakeForm({ quantity: 1, remarks: '', signature: '' }); setTakeOpen(true); }} data-testid="take-spare-btn"><Minus className="w-4 h-4 mr-2" />Take Spare</Button>
                <Button className="flex-1" variant="outline" onClick={() => { setStockForm({ quantity: 1, remarks: '' }); setAddStockOpen(true); }} data-testid="add-stock-btn"><Plus className="w-4 h-4 mr-2" />Add Stock</Button>
                <Button variant="outline" onClick={() => openEditForm(selected)}><Pencil className="w-4 h-4" /></Button>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2"><History className="w-4 h-4" /><p className="text-sm font-semibold">Transaction History</p></div>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No transactions yet</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {history.map((h) => (
                      <div key={h.log_id} className="flex items-start justify-between p-2 rounded border text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={h.action === 'taken' ? 'destructive' : 'default'} className="text-xs">{h.action === 'taken' ? 'Taken' : 'Added'}</Badge>
                            <span className="font-bold">{h.quantity}</span>
                            <span className="text-xs text-muted-foreground">by {h.action === 'taken' ? (h.taken_by_name || '-') : (h.added_by_name || '-')}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{h.timestamp_ist || (h.timestamp ? new Date(h.timestamp).toLocaleString() : '-')}</p>
                          {h.remarks && <p className="text-xs mt-0.5">{h.remarks}</p>}
                        </div>
                        {h.signature && (
                          <img src={h.signature} alt="sig" className="h-10 rounded cursor-pointer" style={{backgroundColor:'#1E293B'}} onClick={(e) => { e.stopPropagation(); setEnlargedSig(h.signature); }} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Take Spare */}
      <Dialog open={takeOpen} onOpenChange={setTakeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Take Spare — {selected?.name}</DialogTitle></DialogHeader>
          <form onSubmit={handleTake} className="space-y-3">
            <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" min="1" max={selected?.quantity} value={takeForm.quantity} onChange={e => setTakeForm({ ...takeForm, quantity: e.target.value })} required data-testid="take-qty" /></div>
            <div className="space-y-1.5"><Label>Remarks</Label><Textarea value={takeForm.remarks} onChange={e => setTakeForm({ ...takeForm, remarks: e.target.value })} placeholder="e.g., For bearing replacement" rows={2} data-testid="take-remarks" /></div>
            <div className="space-y-1.5">
              <Label>Signature</Label>
              <SignaturePad onSignature={(sig) => setTakeForm(prev => ({ ...prev, signature: sig }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTakeOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} data-testid="submit-take">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Confirm</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Stock */}
      <Dialog open={addStockOpen} onOpenChange={setAddStockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Stock — {selected?.name}</DialogTitle></DialogHeader>
          <form onSubmit={handleAddStock} className="space-y-3">
            <div className="space-y-1.5"><Label>Quantity *</Label><Input type="number" min="1" value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })} required data-testid="stock-qty" /></div>
            <div className="space-y-1.5"><Label>Remarks</Label><Textarea value={stockForm.remarks} onChange={e => setStockForm({ ...stockForm, remarks: e.target.value })} placeholder="e.g., Restocked from vendor" rows={2} data-testid="stock-remarks" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddStockOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} data-testid="submit-add-stock">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add Stock</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Signature Enlarge */}
      <Dialog open={!!enlargedSig} onOpenChange={(o) => !o && setEnlargedSig(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Signature</DialogTitle></DialogHeader>
          {enlargedSig && <img src={enlargedSig} alt="Signature" className="w-full max-h-[70vh] object-contain rounded" style={{backgroundColor:'#1E293B'}} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MachineSpares;
