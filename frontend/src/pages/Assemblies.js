import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Checkbox } from '../components/ui/checkbox';
import { Search, Plus, Loader2, ChevronLeft, ChevronRight, Layers, Edit, Trash2, MoreVertical, Eye, Printer, Download, Package, QrCode, ClipboardCheck, AlertTriangle, CheckCircle, Link2, ShoppingCart, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { exportToPDF } from '../utils/exportPDF';
import { QRCodeSVG } from 'qrcode.react';
import { printBOMSheet } from '../utils/safePrint';
import PrintQRModal, { PUBLIC_QR_HOST } from '../components/PrintQRModal';

const API = process.env.REACT_APP_BACKEND_URL;
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
      <span className="text-xs text-muted-foreground whitespace-nowrap">Showing {start}-{end} of {total}</span>
      <Button variant="outline" size="sm" onClick={() => onChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
      <span className="text-sm font-medium">{currentPage}/{totalPages}</span>
      <Button variant="outline" size="sm" onClick={() => onChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}><ChevronRight className="w-4 h-4" /></Button>
    </div>
  );
};

const DetailRow = ({ label, value }) => (
  <div className="flex justify-between py-2 border-b border-border">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium">{value}</span>
  </div>
);

const Assemblies = () => {
  const [assemblies, setAssemblies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Dialogs
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBOMOpen, setIsBOMOpen] = useState(false);
  const [isAddPartOpen, setIsAddPartOpen] = useState(false);
  const [isQROpen, setIsQROpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [form, setForm] = useState({ name: '', description: '' });

  // BOM parts
  const [bomParts, setBomParts] = useState([]);
  const [bomLoading, setBomLoading] = useState(false);

  // Add part to assembly
  const [allParts, setAllParts] = useState([]);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [partQty, setPartQty] = useState(1);

  // Plan Assembly
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [planQty, setPlanQty] = useState(1);
  const [planResult, setPlanResult] = useState(null);

  // ─── New Add Part flow (search-similar + create / link) ───
  const CATEGORIES = ['Machined Part', 'O-Ring', 'PIPE', 'Housing', 'PIN', 'NUT', 'BOLT', 'Fastener', 'Bush', 'Seal', 'Spring', 'Washer', 'Gasket', 'Other'];
  // Material/Type choices depend on the chosen Category so we surface the
  // right options (e.g. Viton/EPDM/Silicon for O-Rings, SS/MS/Brass for metal).
  const MATERIAL_TYPES_BY_CATEGORY = {
    'O-Ring':       ['Viton', 'NBR', 'EPDM', 'Silicon', 'Neoprene', 'PTFE', 'Rubber'],
    'Seal':         ['Viton', 'NBR', 'EPDM', 'Silicon', 'Neoprene', 'PTFE', 'Rubber'],
    'Gasket':       ['Viton', 'NBR', 'EPDM', 'Silicon', 'Neoprene', 'PTFE', 'Rubber', 'Graphite'],
    'Machined Part':['SS', 'MS', 'EN8', 'EN24', 'EN31', 'Brass', 'Aluminum', 'Copper', 'Bronze', 'Cast Iron'],
    'PIPE':         ['SS', 'MS', 'PVC', 'Copper', 'GI'],
    'PIN':          ['SS', 'MS', 'EN8', 'EN24', 'Brass'],
    'NUT':          ['SS', 'MS', 'GI', 'Brass'],
    'BOLT':         ['SS', 'MS', 'GI', 'Brass'],
    'Fastener':     ['SS', 'MS', 'GI', 'Brass'],
    'Housing':      ['SS', 'MS', 'Aluminum', 'Cast Iron'],
    'Bush':         ['Brass', 'Bronze', 'SS', 'MS', 'Nylon', 'Teflon'],
    'Spring':       ['Spring Steel', 'SS', 'Music Wire'],
    'Washer':       ['SS', 'MS', 'Brass', 'Nylon'],
    'Other':        ['SS', 'MS', 'Brass', 'Aluminum', 'Rubber', 'Plastic', 'Other'],
  };
  const DEFAULT_MATERIAL_TYPES = ['SS', 'MS', 'Brass', 'Aluminum', 'Rubber', 'Plastic', 'Other'];
  const getMaterialTypeOptions = (category) =>
    MATERIAL_TYPES_BY_CATEGORY[category] || DEFAULT_MATERIAL_TYPES;
  const EMPTY_PART_FORM = { name: '', category: '', part_type: '', size: '', length: '', quantity: 1, unit: 'PCS', remarks: '' };
  const [partForm, setPartForm] = useState(EMPTY_PART_FORM);
  const [similarParts, setSimilarParts] = useState([]);
  const [isSimilarOpen, setIsSimilarOpen] = useState(false);
  const [searchingSimilar, setSearchingSimilar] = useState(false);

  // Edit Part dialog
  const [isEditPartOpen, setIsEditPartOpen] = useState(false);
  const [editPartTarget, setEditPartTarget] = useState(null);
  const [editPartForm, setEditPartForm] = useState(EMPTY_PART_FORM);

  // Part -> [{assembly_id, name}] usage map (for "Linked to ..." badges)
  const [usageMap, setUsageMap] = useState({});

  // Smart delete (preview + shared part choices)
  const [deletePreview, setDeletePreview] = useState(null);
  const [deleteSharedSelected, setDeleteSharedSelected] = useState({});  // part_id -> bool

  // Order list (purchase / cutting plan)
  const [isOrderOpen, setIsOrderOpen] = useState(false);
  const [orderQty, setOrderQty] = useState(1);
  const [orderCutting, setOrderCutting] = useState(3);
  const [orderResult, setOrderResult] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);

  const fetchAssemblies = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/assemblies`);
      setAssemblies(Array.isArray(data) ? data : data.assemblies || []);
    } catch (e) { console.error(e); setAssemblies([]); }
    finally { setLoading(false); }
  }, []);

  const fetchUsageMap = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/parts-library/usage-map`);
      setUsageMap(data?.usage || {});
    } catch { setUsageMap({}); }
  }, []);

  useEffect(() => { fetchAssemblies(); fetchUsageMap(); }, [fetchAssemblies, fetchUsageMap]);

  const filtered = assemblies.filter(a => {
    const s = search.toLowerCase();
    return (a.name || '').toLowerCase().includes(s) || (a.description || '').toLowerCase().includes(s) || (a.assembly_id || '').toLowerCase().includes(s);
  });
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const resetForm = () => setForm({ name: '', description: '' });

  const handleSave = async (isEdit = false) => {
    if (!form.name) { toast.error('Assembly name is required'); return; }
    setSubmitting(true);
    try {
      if (isEdit && selected) {
        await axios.put(`${API}/api/assemblies/${selected.assembly_id}`, form);
        toast.success('Assembly updated');
      } else {
        await axios.post(`${API}/api/assemblies`, form);
        toast.success('Assembly created');
      }
      setIsAddOpen(false); setIsEditOpen(false); resetForm(); fetchAssemblies();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save'); }
    finally { setSubmitting(false); }
  };

  // Smart delete — fetch preview first so user can see what will be wiped
  // vs kept (parts linked to other assemblies are protected by default).
  const openDelete = async (asm) => {
    setSelected(asm);
    setDeletePreview(null);
    setDeleteSharedSelected({});
    setIsDeleteOpen(true);
    try {
      const { data } = await axios.get(`${API}/api/manage/assemblies/${asm.assembly_id}/delete-preview`);
      setDeletePreview(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load delete preview');
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      // Backend deletes orphan (unique) parts automatically; only sends
      // the shared-part IDs the user explicitly opted to delete.
      const sharedToDelete = Object.entries(deleteSharedSelected)
        .filter(([, v]) => v).map(([k]) => k);

      await axios.request({
        method: 'delete',
        url: `${API}/api/manage/assemblies/${selected.assembly_id}`,
        data: { delete_shared_parts: sharedToDelete },
        headers: { 'Content-Type': 'application/json' },
      });
      const kept = (deletePreview?.shared_parts || []).filter(p => !sharedToDelete.includes(p.part_id));
      toast.success(`Assembly deleted${kept.length ? ` — ${kept.length} part(s) kept (linked elsewhere)` : ''}`);
      setIsDeleteOpen(false); setIsDetailOpen(false);
      setDeletePreview(null); setDeleteSharedSelected({});
      fetchAssemblies();
      fetchUsageMap();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const openDetail = (assembly) => { setSelected(assembly); setIsDetailOpen(true); };

  const openEdit = (assembly) => {
    setForm({ name: assembly.name, description: assembly.description || '' });
    setSelected(assembly);
    setIsEditOpen(true);
  };

  const fetchBOMParts = async (assemblyId) => {
    setBomLoading(true);
    try {
      // Try assembly detail endpoint first (returns enriched parts)
      const { data } = await axios.get(`${API}/api/assemblies/${assemblyId}`);
      if (data.parts && Array.isArray(data.parts) && data.parts.length > 0) {
        setBomParts(data.parts);
      } else {
        // Fallback: try /parts sub-endpoint
        try {
          const { data: partsData } = await axios.get(`${API}/api/assemblies/${assemblyId}/parts`);
          setBomParts(Array.isArray(partsData) ? partsData : partsData.parts || []);
        } catch { setBomParts([]); }
      }
      // Update selected with fresh data
      if (data.name) {
        setSelected(prev => ({ ...prev, ...data, _id: undefined }));
      }
    } catch (e) {
      // Fallback: try /parts sub-endpoint
      try {
        const { data: partsData } = await axios.get(`${API}/api/assemblies/${assemblyId}/parts`);
        setBomParts(Array.isArray(partsData) ? partsData : partsData.parts || []);
      } catch { console.error(e); setBomParts([]); }
    }
    finally { setBomLoading(false); }
  };

  const openBOM = (assembly) => {
    setSelected(assembly);
    fetchBOMParts(assembly.assembly_id);
    setIsBOMOpen(true);
  };

  const fetchAllParts = async () => {
    try {
      const { data } = await axios.get(`${API}/api/parts-library`);
      setAllParts(Array.isArray(data) ? data : data.parts || []);
    } catch { setAllParts([]); }
  };

  const handleAddPartToAssembly = async () => {
    if (!selectedPartId || !selected) { toast.error('Select a part'); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/assemblies/${selected.assembly_id}/parts`, { part_id: selectedPartId, quantity: partQty });
      toast.success('Part added to assembly');
      setIsAddPartOpen(false); setSelectedPartId(''); setPartQty(1);
      fetchBOMParts(selected.assembly_id);
      fetchAssemblies();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleRemovePartFromAssembly = async (partId) => {
    if (!selected) return;
    try {
      await axios.delete(`${API}/api/assemblies/${selected.assembly_id}/parts/${partId}`);
      toast.success('Part removed');
      fetchBOMParts(selected.assembly_id);
      fetchAssemblies();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  // ─── New Add Part flow ───
  const openNewAddPart = () => {
    setPartForm(EMPTY_PART_FORM);
    setSimilarParts([]);
    fetchAllParts(); // for name autocomplete suggestions
    setIsAddPartOpen(true);
  };

  // Compute a "preview" Part ID matching this assembly's existing pattern.
  // Pattern observed in DB: <ASSY_PREFIX>-<SEQ>-F<NNNN>-<MATERIAL>
  // Example: WEWG-19-F0148-SS  (prefix=WEWG, seq=19, F-num=148, mat=SS)
  // If we can't infer a prefix from this assembly's parts, fall back to F<NNNN>-<SUFFIX>.
  const computePreviewPartId = useCallback(() => {
    const mat = (partForm.part_type || '').toLowerCase();
    const cat = (partForm.category || '').toLowerCase();
    // Category drives the suffix first (more reliable than the material name)
    let suffix;
    if (cat.includes('o-ring') || cat.includes('oring')) suffix = 'OR';
    else if (cat === 'seal' || cat.includes('seal')) suffix = 'SL';
    else if (cat.includes('gasket')) suffix = 'GK';
    else if (cat.includes('spring')) suffix = 'SP';
    else if (cat.includes('pipe')) suffix = 'PP';
    else if (cat.includes('bush')) suffix = 'BH';
    else if (cat.includes('pin')) suffix = 'PN';
    else if (cat.includes('bolt')) suffix = 'BT';
    else if (cat.includes('nut')) suffix = 'NT';
    else if (cat.includes('washer')) suffix = 'WS';
    else if (cat.includes('housing')) suffix = 'HS';
    else if (cat.includes('fastener')) suffix = 'FS';
    else if (cat.includes('machined')) suffix = 'SS';
    else suffix = 'SS';
    // Material can override for metal parts (SS/MS/Brass/etc.)
    if (cat.includes('machined') || cat.includes('pipe') || cat.includes('pin')
        || cat.includes('nut') || cat.includes('bolt') || cat.includes('housing')
        || cat.includes('fastener') || cat.includes('bush')) {
      if (mat.includes('ss') || mat.includes('stainless')) suffix = 'SS';
      else if (mat === 'ms' || mat.startsWith('en')) suffix = mat.toUpperCase();
      else if (mat.includes('brass')) suffix = 'BR';
      else if (mat.includes('aluminum') || mat.includes('aluminium')) suffix = 'AL';
      else if (mat.includes('copper')) suffix = 'CU';
      else if (mat.includes('bronze')) suffix = 'BZ';
    }

    // Highest global F-number across all parts (next available)
    let maxFNum = 0;
    for (const p of allParts) {
      const m = /F(\d+)/i.exec(p.part_id || '');
      if (m) { const n = parseInt(m[1], 10); if (n > maxFNum) maxFNum = n; }
    }
    const nextFNum = String(maxFNum + 1).padStart(4, '0');

    // Tally prefixes used across this assembly's BOM and pick the MOST COMMON
    // one (so a single outlier part doesn't hijack the suggested prefix).
    const prefixCounts = {};
    const prefixMaxSeq = {};
    for (const bp of bomParts) {
      const pid = bp.part_id || '';
      const m = /^([A-Z]+)-(\d+)-F\d+/i.exec(pid);
      if (m) {
        const pfx = m[1].toUpperCase();
        prefixCounts[pfx] = (prefixCounts[pfx] || 0) + 1;
        const seq = parseInt(m[2], 10);
        if (!prefixMaxSeq[pfx] || seq > prefixMaxSeq[pfx]) prefixMaxSeq[pfx] = seq;
      }
    }
    let prefix = '';
    let bestCount = 0;
    for (const [pfx, cnt] of Object.entries(prefixCounts)) {
      // tie-breaker: prefer the longer / alphabetically earlier prefix
      if (cnt > bestCount || (cnt === bestCount && pfx.length > prefix.length)) {
        prefix = pfx;
        bestCount = cnt;
      }
    }
    if (prefix) {
      const nextSeq = (prefixMaxSeq[prefix] || 0) + 1;
      return `${prefix}-${nextSeq}-F${nextFNum}-${suffix}`;
    }
    return `F${nextFNum}-${suffix}`;
  }, [partForm.category, partForm.part_type, allParts, bomParts]);

  const searchSimilarAndAdd = async () => {
    if (!selected) return;
    const name = String(partForm.name || '').trim();
    if (!name) { toast.error('Part name is required'); return; }
    setSearchingSimilar(true);
    try {
      const { data } = await axios.post(
        `${API}/api/assemblies/${selected.assembly_id}/parts/search-similar`,
        { name, size: partForm.size || '', length: partForm.length || '', category: partForm.category || '' }
      );
      const matches = Array.isArray(data?.similar_parts) ? data.similar_parts : [];
      if (matches.length > 0) {
        setSimilarParts(matches);
        setIsSimilarOpen(true);
      } else {
        await createAndAddPart();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Search failed');
    } finally { setSearchingSimilar(false); }
  };

  const createAndAddPart = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const payload = {
        name: String(partForm.name || '').trim(),
        category: partForm.category || '',
        part_type: partForm.part_type || '',
        size: partForm.size || '',
        length: partForm.length || '',
        quantity: Number(partForm.quantity) || 1,
        unit: partForm.unit || 'PCS',
        remarks: partForm.remarks || '',
      };
      await axios.post(`${API}/api/assemblies/${selected.assembly_id}/parts/create-and-add`, payload);
      toast.success('Part created & added');
      setIsAddPartOpen(false); setIsSimilarOpen(false);
      setPartForm(EMPTY_PART_FORM); setSimilarParts([]);
      fetchBOMParts(selected.assembly_id);
      fetchAssemblies();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create part');
    } finally { setSubmitting(false); }
  };

  const linkExistingPart = async (partId) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/assemblies/${selected.assembly_id}/parts/link-existing`, {
        part_id: partId,
        quantity: Number(partForm.quantity) || 1,
      });
      toast.success('Part linked to assembly');
      setIsSimilarOpen(false); setIsAddPartOpen(false);
      setPartForm(EMPTY_PART_FORM); setSimilarParts([]);
      fetchBOMParts(selected.assembly_id);
      fetchAssemblies();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to link');
    } finally { setSubmitting(false); }
  };

  // ─── Edit Part ───
  const openEditPart = (p) => {
    setEditPartTarget(p);
    setEditPartForm({
      name: p.name || p.part_name || '',
      category: p.category || '',
      part_type: p.part_type || '',
      size: p.size || '',
      length: p.length || '',
      quantity: p.quantity || 1,
      unit: p.unit || 'PCS',
      remarks: p.remarks || '',
    });
    fetchAllParts(); // for name autocomplete suggestions
    setIsEditPartOpen(true);
  };

  const submitEditPart = async () => {
    if (!selected || !editPartTarget) return;
    setSubmitting(true);
    try {
      const payload = {
        name: String(editPartForm.name || '').trim(),
        category: editPartForm.category || '',
        part_type: editPartForm.part_type || '',
        size: editPartForm.size || '',
        length: editPartForm.length || '',
        quantity: Number(editPartForm.quantity) || 1,
        unit: editPartForm.unit || 'PCS',
        remarks: editPartForm.remarks || '',
      };
      await axios.put(`${API}/api/assemblies/${selected.assembly_id}/parts/${editPartTarget.part_id}`, payload);
      toast.success('Part updated');
      setIsEditPartOpen(false);
      setEditPartTarget(null);
      fetchBOMParts(selected.assembly_id);
      fetchAssemblies();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update');
    } finally { setSubmitting(false); }
  };

  const openQR = (assembly) => { setSelected(assembly); setIsQROpen(true); };

  // Plan Assembly — check stock availability
  const handlePlanAssembly = () => {
    if (!bomParts.length) { toast.error('No parts in BOM to plan'); return; }
    const qty = Math.max(1, planQty);
    const result = bomParts.map(p => {
      const needed = (p.quantity || 0) * qty;
      const stock = p.stock ?? p.available_stock ?? 0;
      const available = Math.min(stock, needed);
      const short = Math.max(0, needed - stock);
      return {
        part_id: p.part_id,
        name: p.name || p.part_name || '',
        category: p.category || '',
        per_assembly: p.quantity || 0,
        total_needed: needed,
        in_stock: stock,
        available,
        short,
        ok: short === 0,
      };
    });
    const allOk = result.every(r => r.ok);
    const canMake = bomParts.length > 0 ? Math.min(...bomParts.map(p => {
      const perAsm = p.quantity || 1;
      const stock = p.stock ?? 0;
      return Math.floor(stock / perAsm);
    })) : 0;

    setPlanResult({ qty, parts: result, allOk, canMake: Math.max(0, canMake) });
    setIsPlanOpen(true);
  };

  // Confirm & Deduct all parts from storage for planned assemblies
  const [deducting, setDeducting] = useState(false);
  const [isDeductConfirmOpen, setIsDeductConfirmOpen] = useState(false);

  const handleConfirmDeduct = async () => {
    if (!planResult?.allOk || !planResult.parts.length) return;
    setDeducting(true);
    let success = 0;
    let failed = 0;

    try {
      // Fetch storage entries to find matching parts
      let storageItems = [];
      try {
        const { data } = await axios.get(`${API}/api/storage`);
        storageItems = Array.isArray(data) ? data : [];
      } catch { /* continue */ }

      for (const part of planResult.parts) {
        try {
          // Find storage entry matching this part_id
          const storageEntry = storageItems.find(s => s.part_no === part.part_id);
          if (storageEntry) {
            await axios.post(`${API}/api/storage/${storageEntry.entry_id}/deduct`, {
              quantity: part.total_needed,
              reason: `Assembly plan: ${planResult.qty}x ${selected?.name || 'assembly'}`,
            });
          }
          success++;
        } catch {
          failed++;
        }
      }
      toast.success(`Deducted stock for ${success} parts${failed ? `, ${failed} failed` : ''}`);
      setIsDeductConfirmOpen(false);
      setIsPlanOpen(false);
      fetchBOMParts(selected.assembly_id);
    } catch (e) {
      toast.error('Deduction failed');
    } finally { setDeducting(false); }
  };

  const printBOM = () => {
    if (!selected || !bomParts.length) { toast.error('No BOM data'); return; }
    printBOMSheet({ assemblyName: selected.name, assemblyId: selected.assembly_id, description: selected.description, parts: bomParts });
  };

  // ─── Order Material / Cutting plan ───
  const openOrderList = () => {
    setOrderQty(1);
    setOrderCutting(3);
    setOrderResult(null);
    setIsOrderOpen(true);
  };

  const generateOrderList = async () => {
    if (!selected) return;
    setOrderLoading(true);
    try {
      const { data } = await axios.get(
        `${API}/api/assemblies/${selected.assembly_id}/order-list`,
        { params: { quantity: Math.max(1, orderQty), cutting_allowance_mm: Math.max(0, orderCutting) } }
      );
      setOrderResult(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to generate');
    } finally { setOrderLoading(false); }
  };

  const exportOrderListPDF = () => {
    if (!orderResult) return;
    const title = `Order List — ${orderResult.assembly_name} × ${orderResult.quantity}`;
    const filename = `order-${orderResult.assembly_id}-x${orderResult.quantity}-${new Date().toISOString().slice(0,10)}.pdf`;
    const sections = [];

    // Section 1 — Parts
    sections.push({ heading: 'BOM Parts (Total per Production Run)' });
    sections.push({
      columns: ['Part ID', 'Name', 'Material', 'Size', 'Length', 'Per Asm', 'Total Need', 'In Stock', 'Shortage'],
      rows: orderResult.parts.map(p => [
        p.part_id, p.name, p.material || '-', p.size || '-', p.length || '-',
        String(p.per_assembly), String(p.total_qty), String(p.in_stock),
        p.short > 0 ? String(p.short) : '0',
      ]),
    });

    // Section 2 — O-Rings
    if (orderResult.orings.length > 0) {
      sections.push({ heading: 'O-Ring Order (Grouped)' });
      sections.push({
        columns: ['Size', 'Material', 'Total Qty', 'In Stock', 'Shortage', 'Parts'],
        rows: orderResult.orings.map(o => [
          o.size || '-', o.material || '-', String(o.total_qty), String(o.in_stock), String(o.short),
          (o.parts || []).map(x => `${x.part_id}×${x.qty}`).join(', '),
        ]),
      });
    }

    // Section 3 — Raw Material
    if (orderResult.raw_material.length > 0) {
      sections.push({ heading: 'Raw Material — Cutting Plan' });
      sections.push({
        columns: ['Dia (Ø)', 'Material', 'Pieces', 'Cut Length (mm)', 'Loss (mm)', 'Total Length (mm)', 'Parts'],
        rows: orderResult.raw_material.map(r => [
          String(r.dia || '-'), r.material || '-', String(r.pieces),
          String(r.raw_length_mm), String(r.cut_loss_mm), String(r.total_length_mm),
          (r.parts || []).map(x => `${x.part_id}(${x.length_mm}×${x.pieces})`).join(', '),
        ]),
      });
    }

    // Lightweight multi-section PDF helper using exportToPDF (single-section);
    // we fall back to a stacked PDF: concat rows with header separators.
    const cols = ['#', 'Detail', 'Value 1', 'Value 2', 'Value 3', 'Value 4', 'Value 5', 'Value 6', 'Value 7'];
    const flat = [];
    sections.forEach(s => {
      if (s.heading) {
        flat.push([s.heading, '', '', '', '', '', '', '', '']);
      } else {
        flat.push([...s.columns, ...Array(9 - s.columns.length).fill('')]);
        s.rows.forEach(r => flat.push([...r, ...Array(9 - r.length).fill('')]));
        flat.push(['', '', '', '', '', '', '', '', '']);
      }
    });
    exportToPDF(cols, flat, title, filename);
    toast.success('PDF exported');
  };

  const exportOrderListCSV = () => {
    if (!orderResult) return;
    const lines = [];
    lines.push(`Order List,${orderResult.assembly_name},x${orderResult.quantity}`);
    lines.push('');
    lines.push('=== BOM Parts ===');
    lines.push(['Part ID','Name','Material','Size','Length','Per Asm','Total Need','In Stock','Shortage'].join(','));
    orderResult.parts.forEach(p => lines.push([p.part_id, p.name, p.material, p.size, p.length, p.per_assembly, p.total_qty, p.in_stock, p.short].map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')));
    if (orderResult.orings.length) {
      lines.push(''); lines.push('=== O-Rings ===');
      lines.push(['Size','Material','Total Qty','In Stock','Shortage','Parts'].join(','));
      orderResult.orings.forEach(o => lines.push([o.size, o.material, o.total_qty, o.in_stock, o.short, (o.parts||[]).map(x=>`${x.part_id}×${x.qty}`).join(' | ')].map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')));
    }
    if (orderResult.raw_material.length) {
      lines.push(''); lines.push('=== Raw Material ===');
      lines.push(['Dia','Material','Pieces','Cut Length (mm)','Loss (mm)','Total Length (mm)','Parts'].join(','));
      orderResult.raw_material.forEach(r => lines.push([r.dia, r.material, r.pieces, r.raw_length_mm, r.cut_loss_mm, r.total_length_mm, (r.parts||[]).map(x=>`${x.part_id}(${x.length_mm}mm×${x.pieces})`).join(' | ')].map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `order-${orderResult.assembly_id}-x${orderResult.quantity}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    toast.success('CSV exported');
  };

  const handleExportCSV = () => exportCSV(filtered.map(a => ({
    Assembly_ID: a.assembly_id, Name: a.name, Description: a.description || '', Parts_Count: a.parts_count ?? 0
  })), `assemblies_${new Date().toISOString().slice(0, 10)}.csv`);

  const handleExportPDF = () => {
    const cols = ['Assembly ID', 'Name', 'Description', 'Parts Count'];
    const rows = filtered.map(a => [a.assembly_id, a.name, a.description || '-', String(a.parts_count ?? 0)]);
    exportToPDF(cols, rows, 'Assemblies', `assemblies_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-4" data-testid="assemblies-page">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Assemblies & BOM</h1>
      </div>

      {/* Top bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1 flex-wrap">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search assemblies..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-10" data-testid="search-assemblies" />
          </div>
          <Button onClick={() => { resetForm(); setIsAddOpen(true); }} data-testid="add-assembly-btn"><Plus className="w-4 h-4 mr-2" /> Add Assembly</Button>
          <Button variant="outline" onClick={handleExportCSV} disabled={filtered.length === 0} data-testid="export-asm-csv-btn"><Download className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={filtered.length === 0} data-testid="export-asm-pdf-btn"><Download className="w-4 h-4 mr-2" /> PDF</Button>
        </div>
        <Paginator currentPage={page} totalPages={totalPages} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>

      {/* Assemblies Table */}
      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Assembly ID</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Name</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Description</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Parts</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : paginated.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8"><Layers className="w-10 h-10 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No assemblies found</p></TableCell></TableRow>
            ) : paginated.map((asm, i) => (
              <TableRow key={asm.assembly_id || i} className="table-row-hover cursor-pointer" onClick={() => openBOM(asm)} data-testid={`assembly-row-${i}`}>
                <TableCell className="font-mono text-sm text-primary">{asm.assembly_id}</TableCell>
                <TableCell className="font-medium">{asm.name}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[300px]">{asm.description || '-'}</TableCell>
                <TableCell><Badge variant="outline">{asm.parts_count ?? 0} parts</Badge></TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}><Button variant="ghost" size="icon" data-testid={`asm-menu-${i}`}><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openBOM(asm); }}><Eye className="w-4 h-4 mr-2" /> View BOM</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(asm); }}><Edit className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openQR(asm); }}><QrCode className="w-4 h-4 mr-2" /> QR Code</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelected(asm); openDelete(asm); }} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-end">
          <Paginator currentPage={page} totalPages={totalPages} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
        </div>
      )}

      {/* Add Assembly Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add New Assembly</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Assembly Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Gun Assembly" data-testid="assembly-name-input" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description..." rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={() => handleSave(false)} disabled={submitting} data-testid="save-assembly-btn">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save Assembly</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Assembly Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Assembly</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Assembly Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="edit-assembly-name" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={() => handleSave(true)} disabled={submitting} data-testid="update-assembly-btn">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Assembly Dialog — Smart Preview */}
      <Dialog open={isDeleteOpen} onOpenChange={(o) => { setIsDeleteOpen(o); if (!o) { setDeletePreview(null); setDeleteSharedSelected({}); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-destructive" /> Delete Assembly?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            <p className="text-sm">Permanently delete <span className="font-bold">{selected?.name}</span>?</p>

            {!deletePreview ? (
              <div className="py-6 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{deletePreview.total_parts}</div>
                    <div className="text-[11px] uppercase text-muted-foreground">Total Parts</div>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <div className="text-2xl font-bold text-red-700">{deletePreview.unique_parts_count}</div>
                    <div className="text-[11px] uppercase text-red-700">Will be deleted</div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="text-2xl font-bold text-amber-700">{deletePreview.shared_parts_count}</div>
                    <div className="text-[11px] uppercase text-amber-700">Linked elsewhere</div>
                  </div>
                </div>

                {deletePreview.shared_parts_count > 0 && (
                  <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-3">
                    <p className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
                      <Link2 className="w-4 h-4" /> These parts are used in other assemblies too
                    </p>
                    <p className="text-xs text-amber-800 mb-3">By default they are <span className="font-semibold">kept</span>. Tick a part below if you want to wipe it from every assembly it's in.</p>
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                      {deletePreview.shared_parts.map((p) => (
                        <label key={p.part_id} className="flex items-start gap-2 p-2 rounded hover:bg-amber-100/40 cursor-pointer text-xs">
                          <Checkbox
                            checked={!!deleteSharedSelected[p.part_id]}
                            onCheckedChange={(v) => setDeleteSharedSelected(s => ({ ...s, [p.part_id]: !!v }))}
                            data-testid={`delete-shared-${p.part_id}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-primary">{p.part_id}</span>
                              <span className="font-medium">{p.name}</span>
                              {p.size && <Badge variant="outline" className="text-[10px]">Size {p.size}</Badge>}
                            </div>
                            <p className="text-amber-800 mt-0.5">Also in: <span className="font-medium">{(p.also_used_in || []).join(', ')}</span></p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {deletePreview.unique_parts_count > 0 && (
                  <div className="border border-red-200 bg-red-50/40 rounded-lg p-3">
                    <p className="text-sm font-semibold text-red-900 mb-2">These parts are only used in this assembly — they will be removed from Parts Library:</p>
                    <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                      {deletePreview.unique_parts.map(p => (
                        <Badge key={p.part_id} variant="outline" className="text-[10px] font-mono text-red-700 border-red-300">
                          {p.part_id} <span className="ml-1 text-red-900 font-normal">{p.name}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDeleteOpen(false); setDeletePreview(null); setDeleteSharedSelected({}); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting || !deletePreview} data-testid="confirm-delete-asm-btn">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Delete Assembly</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BOM Detail Dialog */}
      <Dialog open={isBOMOpen} onOpenChange={setIsBOMOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span>BOM - {selected?.name}</span>
              {selected?.assembly_id && <span className="text-sm font-mono text-muted-foreground">{selected.assembly_id}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            {selected?.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}

            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm font-medium">{bomParts.length} parts in BOM</span>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={openNewAddPart} data-testid="add-part-to-bom-btn"><Plus className="w-4 h-4 mr-2" /> Add Part</Button>
                <Button size="sm" variant="outline" onClick={printBOM} disabled={bomParts.length === 0} data-testid="print-bom-btn"><Printer className="w-4 h-4 mr-2" /> Print BOM</Button>
                <Button size="sm" variant="outline" onClick={openOrderList} disabled={bomParts.length === 0} data-testid="open-order-list-btn"><ShoppingCart className="w-4 h-4 mr-2" /> Order Material</Button>
                <Button size="sm" onClick={() => { setPlanQty(1); setPlanResult(null); handlePlanAssembly(); }} disabled={bomParts.length === 0} data-testid="plan-assembly-btn"><ClipboardCheck className="w-4 h-4 mr-2" /> Plan Assembly</Button>
              </div>
            </div>

            {bomLoading ? (
              <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : bomParts.length === 0 ? (
              <div className="py-8 text-center"><Package className="w-10 h-10 mx-auto text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">No parts in this assembly yet</p></div>
            ) : (
              <div className="space-y-2">
                {bomParts.map((part, i) => {
                  const stock = part.stock ?? 0;
                  const needed = part.quantity || 0;
                  const sufficient = stock >= needed;
                  const partName = part.name || part.part_name || '-';
                  return (
                    <Card key={part.part_id || i} className={`border ${sufficient ? 'border-border' : 'border-red-500/30'}`} data-testid={`bom-part-${i}`}>
                      <CardContent className="p-3">
                        <div className="flex gap-3 items-start">
                          {/* QR + Image */}
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            <div className="w-14 h-14 bg-muted rounded flex items-center justify-center">
                              <QRCodeSVG value={part.part_id ? `${PUBLIC_QR_HOST}/part/${part.part_id}` : (partName || '')} size={48} level="L" />
                            </div>
                            {part.image ? (
                              <img src={part.image} alt="" className="w-14 h-14 rounded object-cover border" />
                            ) : null}
                          </div>
                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-mono text-xs text-primary font-bold">{part.part_id || '-'}</span>
                              <Badge className={`border-none text-xs ${sufficient ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {sufficient ? 'In Stock' : `Short ${needed - stock}`}
                              </Badge>
                              {(() => {
                                const others = (usageMap[part.part_id] || []).filter(u => u.assembly_id !== selected?.assembly_id);
                                if (others.length === 0) return null;
                                const title = `Also used in:\n${others.map(o => `• ${o.name} (${o.assembly_id})`).join('\n')}`;
                                return (
                                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]" title={title} data-testid={`linked-badge-${part.part_id}`}>
                                    <Link2 className="w-3 h-3 mr-1" /> Linked × {others.length}
                                  </Badge>
                                );
                              })()}
                            </div>
                            <p className="font-semibold text-sm truncate">{partName}</p>
                            <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              {part.category && <span>{part.category}</span>}
                              {part.part_type && <span>{part.part_type}</span>}
                              {part.size && <span>Size: {part.size}</span>}
                              {part.length && <span>L: {part.length}</span>}
                              {part.unit && <span>Unit: {part.unit}</span>}
                            </div>
                            <div className="flex gap-4 mt-1.5 text-xs">
                              <span>Qty: <span className="font-bold">{needed}</span></span>
                              <span>Stock: <span className={`font-bold ${sufficient ? 'text-emerald-600' : 'text-red-600'}`}>{stock}</span></span>
                            </div>
                          </div>
                          {/* Edit / Remove */}
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            <Button variant="ghost" size="icon" onClick={() => openEditPart(part)} data-testid={`edit-bom-part-${i}`} title="Edit part"><Edit className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleRemovePartFromAssembly(part.part_id)} data-testid={`remove-bom-part-${i}`} title="Remove from BOM"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBOMOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Part to Assembly Dialog — full form with duplicate detection */}
      <Dialog open={isAddPartOpen} onOpenChange={(o) => { setIsAddPartOpen(o); if (!o) { setPartForm(EMPTY_PART_FORM); setSimilarParts([]); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Add Part to {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            <div className="px-3 py-2 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-blue-700">Preview Part ID</span>
              <span className="font-mono text-sm font-bold text-blue-900" data-testid="preview-part-id">{computePreviewPartId()}</span>
            </div>
            <div>
              <Label className="text-xs">Part Name *</Label>
              <Input
                list="bom-part-name-suggestions"
                value={partForm.name}
                onChange={(e) => setPartForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Type or pick from list (e.g. O RING SEAL)"
                data-testid="part-form-name"
              />
              <datalist id="bom-part-name-suggestions">
                {Array.from(new Set(allParts.map(p => p.name || p.part_name).filter(Boolean))).sort().map(n => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={partForm.category} onValueChange={(v) => setPartForm(f => ({ ...f, category: v, part_type: '' }))}>
                  <SelectTrigger data-testid="part-form-category"><SelectValue placeholder="Choose..." /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Material / Type</Label>
                <Select value={partForm.part_type} onValueChange={(v) => setPartForm(f => ({ ...f, part_type: v }))}>
                  <SelectTrigger data-testid="part-form-type"><SelectValue placeholder="Choose..." /></SelectTrigger>
                  <SelectContent>
                    {getMaterialTypeOptions(partForm.category).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Size (Dia/OD × Thickness)</Label>
                <Input value={partForm.size} onChange={(e) => setPartForm(f => ({ ...f, size: e.target.value }))} placeholder="e.g. 8 x 1" data-testid="part-form-size" />
              </div>
              <div>
                <Label className="text-xs">Length (for Pipes)</Label>
                <Input value={partForm.length} onChange={(e) => setPartForm(f => ({ ...f, length: e.target.value }))} placeholder="e.g. 1030" data-testid="part-form-length" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Quantity *</Label>
                <Input type="number" min="1" value={partForm.quantity} onChange={(e) => setPartForm(f => ({ ...f, quantity: parseInt(e.target.value, 10) || 1 }))} data-testid="part-form-qty" />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Input value={partForm.unit} onChange={(e) => setPartForm(f => ({ ...f, unit: e.target.value }))} placeholder="PCS" data-testid="part-form-unit" />
              </div>
              <div className="col-span-1">
                <Label className="text-xs">Remarks</Label>
                <Input value={partForm.remarks} onChange={(e) => setPartForm(f => ({ ...f, remarks: e.target.value }))} data-testid="part-form-remarks" />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsAddPartOpen(false)} className="sm:order-1">Cancel</Button>
            <Button
              onClick={searchSimilarAndAdd}
              disabled={searchingSimilar || submitting || !partForm.name?.trim()}
              data-testid="check-similar-btn"
              className="sm:order-2"
            >
              {(searchingSimilar || submitting) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              Check & Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Similar Parts Found Dialog */}
      <Dialog open={isSimilarOpen} onOpenChange={setIsSimilarOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Similar Parts Found</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            <p className="text-sm text-muted-foreground">These existing parts match your input. Link to an existing part, or create a new one anyway.</p>
            {similarParts.map((sp, i) => (
              <Card key={sp.part_id || i} className={`border ${sp.is_exact_match ? 'border-emerald-300 bg-emerald-50/30' : 'border-border'}`} data-testid={`similar-part-${i}`}>
                <CardContent className="p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-bold text-primary">{sp.part_id}</span>
                      {sp.is_exact_match && <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px]"><CheckCircle className="w-3 h-3 mr-1" /> Exact Match</Badge>}
                    </div>
                    <p className="font-semibold text-sm">{sp.name}</p>
                    <div className="flex gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      {sp.category && <span>{sp.category}</span>}
                      {sp.size && <span>Size: {sp.size}</span>}
                      {sp.length && <span>L: {sp.length}</span>}
                      {typeof sp.stock === 'number' && <span>Stock: {sp.stock}</span>}
                    </div>
                    {Array.isArray(sp.used_in_assemblies) && sp.used_in_assemblies.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">Used in: <span className="font-medium">{sp.used_in_assemblies.join(', ')}</span></p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => linkExistingPart(sp.part_id)} disabled={submitting} data-testid={`link-similar-${i}`}>
                    Link
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsSimilarOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={createAndAddPart} disabled={submitting} data-testid="create-new-anyway-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Create New Part Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Part Dialog */}
      <Dialog open={isEditPartOpen} onOpenChange={(o) => { setIsEditPartOpen(o); if (!o) setEditPartTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Edit Part {editPartTarget?.part_id && <span className="font-mono text-sm text-muted-foreground">({editPartTarget.part_id})</span>}</DialogTitle></DialogHeader>
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            <div>
              <Label className="text-xs">Part Name *</Label>
              <Input
                list="bom-part-name-suggestions"
                value={editPartForm.name}
                onChange={(e) => setEditPartForm(f => ({ ...f, name: e.target.value }))}
                data-testid="edit-part-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={editPartForm.category} onValueChange={(v) => setEditPartForm(f => ({ ...f, category: v, part_type: '' }))}>
                  <SelectTrigger data-testid="edit-part-category"><SelectValue placeholder="Choose..." /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Material / Type</Label>
                <Select value={editPartForm.part_type} onValueChange={(v) => setEditPartForm(f => ({ ...f, part_type: v }))}>
                  <SelectTrigger data-testid="edit-part-type"><SelectValue placeholder="Choose..." /></SelectTrigger>
                  <SelectContent>
                    {getMaterialTypeOptions(editPartForm.category).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Size</Label>
                <Input value={editPartForm.size} onChange={(e) => setEditPartForm(f => ({ ...f, size: e.target.value }))} data-testid="edit-part-size" />
              </div>
              <div>
                <Label className="text-xs">Length</Label>
                <Input value={editPartForm.length} onChange={(e) => setEditPartForm(f => ({ ...f, length: e.target.value }))} data-testid="edit-part-length" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Quantity *</Label>
                <Input type="number" min="1" value={editPartForm.quantity} onChange={(e) => setEditPartForm(f => ({ ...f, quantity: parseInt(e.target.value, 10) || 1 }))} data-testid="edit-part-qty" />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Input value={editPartForm.unit} onChange={(e) => setEditPartForm(f => ({ ...f, unit: e.target.value }))} data-testid="edit-part-unit" />
              </div>
              <div>
                <Label className="text-xs">Remarks</Label>
                <Input value={editPartForm.remarks} onChange={(e) => setEditPartForm(f => ({ ...f, remarks: e.target.value }))} data-testid="edit-part-remarks" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditPartOpen(false)}>Cancel</Button>
            <Button onClick={submitEditPart} disabled={submitting || !editPartForm.name?.trim()} data-testid="edit-part-save-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Edit className="w-4 h-4 mr-2" />}
              Update Part
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Modal */}
      <PrintQRModal
        open={isQROpen}
        onClose={setIsQROpen}
        value={selected?.assembly_id}
        title="Assembly QR Code"
        subtitle={selected?.name}
      />

      {/* Plan Assembly Dialog */}
      <Dialog open={isPlanOpen} onOpenChange={setIsPlanOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              Plan Assembly - {selected?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            {/* Quantity input */}
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <Label className="whitespace-nowrap">Assemblies to plan:</Label>
              <Input type="number" min="1" value={planQty} onChange={e => setPlanQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-24" data-testid="plan-qty-input" />
              <Button onClick={handlePlanAssembly} size="sm" data-testid="check-stock-btn">Check Stock</Button>
            </div>

            {planResult && (
              <>
                {/* Summary */}
                <div className={`p-4 rounded-lg border ${planResult.allOk ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {planResult.allOk ? (
                      <><CheckCircle className="w-5 h-5 text-emerald-600" /><span className="font-semibold text-emerald-700">All parts available for {planResult.qty} assembl{planResult.qty === 1 ? 'y' : 'ies'}!</span></>
                    ) : (
                      <><AlertTriangle className="w-5 h-5 text-red-600" /><span className="font-semibold text-red-700">Stock shortage — can make {planResult.canMake} assembl{planResult.canMake === 1 ? 'y' : 'ies'} (requested {planResult.qty})</span></>
                    )}
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-emerald-700">{planResult.parts.filter(p => p.ok).length} parts OK</span>
                    {planResult.parts.filter(p => !p.ok).length > 0 && <span className="text-red-700">{planResult.parts.filter(p => !p.ok).length} parts short</span>}
                  </div>
                </div>

                {/* Parts detail */}
                <div className="space-y-1">
                  {planResult.parts.map((p, i) => (
                    <div key={p.part_id || i} className={`flex items-center gap-3 p-2.5 rounded border text-sm ${p.ok ? 'border-border bg-card' : 'border-red-300 bg-red-50'}`} data-testid={`plan-part-${i}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${p.ok ? 'bg-emerald-100' : 'bg-red-100'}`}>
                        {p.ok ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-primary">{p.part_id}</span>
                          <span className="font-medium truncate">{p.name}</span>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground mt-0.5">
                          <span>Per asm: {p.per_assembly}</span>
                          <span>Need: <span className="font-bold text-foreground">{p.total_needed}</span></span>
                          <span>Stock: <span className={`font-bold ${p.ok ? 'text-emerald-600' : 'text-red-600'}`}>{p.in_stock}</span></span>
                          {!p.ok && <span className="text-red-600 font-bold">Short: {p.short}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            {planResult?.allOk && (
              <Button onClick={() => setIsDeductConfirmOpen(true)} data-testid="confirm-deduct-btn">
                Confirm & Deduct Stock
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsPlanOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deduct Confirmation Dialog */}
      <Dialog open={isDeductConfirmOpen} onOpenChange={setIsDeductConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirm Stock Deduction</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Deduct parts from storage for <span className="font-bold">{planResult?.qty} assembl{planResult?.qty === 1 ? 'y' : 'ies'}</span> of <span className="font-bold">{selected?.name}</span>?</p>
            <div className="max-h-[200px] overflow-y-auto border rounded p-2 space-y-1">
              {planResult?.parts?.map((p, i) => (
                <div key={p.part_id || i} className="flex justify-between text-xs py-1 border-b border-border last:border-0">
                  <span className="font-mono text-primary">{p.part_id}</span>
                  <span>{p.name}</span>
                  <span className="font-bold">-{p.total_needed}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-amber-600 font-medium">This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeductConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDeduct} disabled={deducting} data-testid="confirm-deduct-final-btn">
              {deducting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Deduct All Parts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Material / Cutting Plan Dialog */}
      <Dialog open={isOrderOpen} onOpenChange={setIsOrderOpen}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Order Material — {selected?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            <div className="flex items-end gap-3 p-3 bg-muted/40 rounded-lg flex-wrap">
              <div>
                <Label className="text-xs">Production Quantity</Label>
                <Input type="number" min="1" value={orderQty} onChange={e => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-28 mt-1" data-testid="order-qty-input" />
              </div>
              <div>
                <Label className="text-xs">Cutting Allowance / piece (mm)</Label>
                <Input type="number" min="0" step="0.5" value={orderCutting} onChange={e => setOrderCutting(Math.max(0, parseFloat(e.target.value) || 0))} className="w-28 mt-1" data-testid="order-cutting-input" />
              </div>
              <Button onClick={generateOrderList} disabled={orderLoading} data-testid="generate-order-btn">
                {orderLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
                Generate
              </Button>
              {orderResult && (
                <>
                  <Button variant="outline" onClick={exportOrderListCSV} data-testid="order-csv-btn"><Download className="w-4 h-4 mr-2" /> CSV</Button>
                  <Button variant="outline" onClick={exportOrderListPDF} data-testid="order-pdf-btn"><FileDown className="w-4 h-4 mr-2" /> PDF</Button>
                </>
              )}
            </div>

            {orderResult && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 rounded-lg bg-muted/40 text-center">
                    <div className="text-2xl font-bold">{orderResult.totals.total_parts}</div>
                    <div className="text-[11px] uppercase text-muted-foreground">BOM Lines</div>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 text-center">
                    <div className="text-2xl font-bold text-blue-700">{orderResult.totals.total_oring_groups}</div>
                    <div className="text-[11px] uppercase text-blue-700">O-Ring Groups</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 text-center">
                    <div className="text-2xl font-bold text-emerald-700">{orderResult.totals.total_rawmat_groups}</div>
                    <div className="text-[11px] uppercase text-emerald-700">Raw Mat Groups</div>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 text-center">
                    <div className="text-2xl font-bold text-red-700">{orderResult.totals.total_shortage_items}</div>
                    <div className="text-[11px] uppercase text-red-700">Shortage Items</div>
                  </div>
                </div>

                {orderResult.orings.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-2 flex items-center gap-2"><Package className="w-4 h-4" /> O-Rings to Order ({orderResult.orings.length} groups)</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="text-xs">Size</TableHead>
                            <TableHead className="text-xs">Material</TableHead>
                            <TableHead className="text-xs text-right">Need Qty</TableHead>
                            <TableHead className="text-xs text-right">In Stock</TableHead>
                            <TableHead className="text-xs text-right">Shortage</TableHead>
                            <TableHead className="text-xs">Used In</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderResult.orings.map((o, i) => (
                            <TableRow key={i} data-testid={`oring-row-${i}`}>
                              <TableCell className="font-medium">{o.size || '-'}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[10px]">{o.material || '-'}</Badge></TableCell>
                              <TableCell className="text-right font-bold">{o.total_qty}</TableCell>
                              <TableCell className="text-right">{o.in_stock}</TableCell>
                              <TableCell className="text-right">
                                {o.short > 0 ? <span className="font-bold text-red-700">{o.short}</span> : <span className="text-emerald-700">0</span>}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {(o.parts || []).map(p => `${p.part_id}×${p.qty}`).join(', ')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {orderResult.raw_material.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-2 flex items-center gap-2"><Package className="w-4 h-4" /> Raw Material — Cutting Plan ({orderResult.raw_material.length} groups)</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="text-xs">Dia (Ø)</TableHead>
                            <TableHead className="text-xs">Material</TableHead>
                            <TableHead className="text-xs text-right">Pieces</TableHead>
                            <TableHead className="text-xs text-right">Cut (mm)</TableHead>
                            <TableHead className="text-xs text-right">Loss (mm)</TableHead>
                            <TableHead className="text-xs text-right">Total (mm)</TableHead>
                            <TableHead className="text-xs">Breakdown</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderResult.raw_material.map((r, i) => (
                            <TableRow key={i} data-testid={`rawmat-row-${i}`}>
                              <TableCell className="font-medium">Ø{r.dia}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[10px]">{r.material || '-'}</Badge></TableCell>
                              <TableCell className="text-right font-bold">{r.pieces}</TableCell>
                              <TableCell className="text-right">{r.raw_length_mm}</TableCell>
                              <TableCell className="text-right text-amber-700">{r.cut_loss_mm}</TableCell>
                              <TableCell className="text-right font-bold">{r.total_length_mm}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {(r.parts || []).map(p => `${p.part_id} (${p.length_mm}mm × ${p.pieces})`).join(', ')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-2"><Layers className="w-4 h-4" /> Full BOM × {orderResult.quantity}</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-xs">Part ID</TableHead>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Material</TableHead>
                          <TableHead className="text-xs">Size / Length</TableHead>
                          <TableHead className="text-xs text-right">Per Asm</TableHead>
                          <TableHead className="text-xs text-right">Total Need</TableHead>
                          <TableHead className="text-xs text-right">In Stock</TableHead>
                          <TableHead className="text-xs text-right">Shortage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderResult.parts.map((p, i) => (
                          <TableRow key={i} className={p.short > 0 ? 'bg-red-50/30' : ''} data-testid={`order-part-${i}`}>
                            <TableCell className="font-mono text-xs text-primary">{p.part_id}</TableCell>
                            <TableCell className="font-medium text-xs">{p.name}</TableCell>
                            <TableCell className="text-xs">{p.material || '-'}</TableCell>
                            <TableCell className="text-xs">{[p.size, p.length].filter(Boolean).join(' / ') || '-'}</TableCell>
                            <TableCell className="text-right text-xs">{p.per_assembly}</TableCell>
                            <TableCell className="text-right text-xs font-bold">{p.total_qty}</TableCell>
                            <TableCell className="text-right text-xs">{p.in_stock}</TableCell>
                            <TableCell className="text-right text-xs">
                              {p.short > 0 ? <span className="font-bold text-red-700">{p.short}</span> : <span className="text-emerald-700">0</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}

            {!orderResult && !orderLoading && (
              <div className="py-12 text-center text-muted-foreground">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Enter a production quantity and click <span className="font-semibold">Generate</span> to compute the cutting + purchase plan.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOrderOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Assemblies;
