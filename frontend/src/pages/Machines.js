import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Search,
  Plus,
  MoreVertical,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Cpu,
  Edit,
  Trash2,
  History,
  Wrench,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const ITEMS_PER_PAGE = 20;

const CATEGORIES = [
  { value: 'cnc_lathe', label: 'CNC Lathe' },
  { value: 'vmc', label: 'VMC' },
  { value: 'moulding', label: 'Moulding' },
  { value: 'tool_room', label: 'Tool Room' },
  { value: 'assembly', label: 'Assembly' }
];

const Machines = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [history, setHistory] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    category: 'vmc',
    description: ''
  });

  const fetchMachines = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/machine-status/summary-public`, { withCredentials: false });
      setMachines(data.machines || []);
    } catch (error) {
      console.error('Error fetching machines:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  const handleAddMachine = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/machines`, formData);
      toast.success('Machine added successfully');
      setIsAddDialogOpen(false);
      resetForm();
      fetchMachines();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add machine');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditMachine = async (e) => {
    e.preventDefault();
    if (!selectedMachine) return;
    setSubmitting(true);
    try {
      await axios.put(`${API_URL}/api/machines/${selectedMachine.machine_id}`, formData);
      toast.success('Machine updated successfully');
      setIsEditDialogOpen(false);
      fetchMachines();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update machine');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMachine = async (machine) => {
    if (!window.confirm(`Delete machine "${machine.machine_name}"?`)) return;
    try {
      await axios.delete(`${API_URL}/api/machines/${machine.machine_id}`);
      toast.success('Machine deleted');
      fetchMachines();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete machine');
    }
  };

  const fetchHistory = async (machineId) => {
    try {
      const { data } = await axios.get(`${API_URL}/api/machines/${machineId}/history`);
      setHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching history:', error);
      setHistory([]);
    }
  };

  const openEditDialog = (machine) => {
    setSelectedMachine(machine);
    setFormData({
      name: machine.machine_name || machine.name || '',
      category: machine.category || 'vmc',
      description: machine.description || ''
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ name: '', category: 'vmc', description: '' });
  };

  // Filter machines
  const filteredMachines = machines.filter(machine => {
    const searchLower = search.toLowerCase();
    const matchesSearch = (
      (machine.machine_name || '').toLowerCase().includes(searchLower) ||
      (machine.machine_id || '').toLowerCase().includes(searchLower) ||
      (machine.category || '').toLowerCase().includes(searchLower) ||
      (machine.operator_name || '').toLowerCase().includes(searchLower)
    );
    const matchesStatus = statusFilter === 'all' || machine.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || machine.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Pagination
  const totalPages = Math.ceil(filteredMachines.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedMachines = filteredMachines.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'running':
        return <Badge className="status-running border-none">Running</Badge>;
      case 'idle':
        return <Badge className="status-idle border-none">Idle</Badge>;
      case 'breakdown':
        return <Badge className="status-breakdown border-none">Breakdown</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'Admin' || user?.is_admin;

  const MachineFormFields = () => (
    <>
      <div className="space-y-2">
        <Label htmlFor="name">Machine Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          placeholder="e.g., VMC Machine 1"
          data-testid="machine-name-input"
        />
      </div>
      <div className="space-y-2">
        <Label>Category *</Label>
        <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
          <SelectTrigger data-testid="machine-category-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Machine description"
          rows={2}
          data-testid="machine-description-input"
        />
      </div>
    </>
  );

  return (
    <div className="space-y-6" data-testid="machines-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Machines</h1>
        {isAdmin && (
          <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }} data-testid="add-machine-btn">
            <Plus className="w-4 h-4 mr-2" /> Add Machine
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="border border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search machines..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="pl-10"
                data-testid="search-input"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[140px]" data-testid="status-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
                <SelectItem value="breakdown">Breakdown</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[140px]" data-testid="category-filter">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Machines Table */}
      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Machine</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Category</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Operator</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Current Job</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : paginatedMachines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Cpu className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No machines found</p>
                </TableCell>
              </TableRow>
            ) : (
              paginatedMachines.map((machine, index) => (
                <TableRow 
                  key={machine.machine_id || index} 
                  className={`table-row-hover ${machine.status === 'breakdown' ? 'bg-red-50/50' : ''}`}
                  data-testid={`machine-row-${index}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        machine.status === 'running' ? 'bg-emerald-500 animate-pulse' :
                        machine.status === 'breakdown' ? 'bg-red-500' :
                        'bg-amber-500'
                      }`} />
                      <button
                        className="font-medium text-left hover:underline"
                        onClick={() => navigate(`/dashboard/machines/${machine.machine_id}/spares`)}
                        data-testid={`machine-name-${index}`}
                      >{machine.machine_name}</button>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {machine.category?.replace('_', ' ') || '-'}
                  </TableCell>
                  <TableCell>{getStatusBadge(machine.status)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {machine.operator_name || '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground truncate max-w-[200px]">
                    {machine.job_details || '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/dashboard/machines/${machine.machine_id}/spares`)}>
                          <Wrench className="w-4 h-4 mr-2" /> View Spares
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/dashboard/breakdown?machineId=${machine.machine_id}&machineName=${encodeURIComponent(machine.machine_name || '')}`)} className={machine.status === 'breakdown' ? 'text-red-600 font-semibold' : ''}>
                          <AlertTriangle className="w-4 h-4 mr-2" /> {machine.status === 'breakdown' ? 'View / Update Breakdown' : 'Report Breakdown'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setSelectedMachine(machine);
                          fetchHistory(machine.machine_id);
                          setIsHistoryDialogOpen(true);
                        }}>
                          <History className="w-4 h-4 mr-2" /> View History
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuItem onClick={() => openEditDialog(machine)}>
                              <Edit className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteMachine(machine)} className="text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-4 px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, filteredMachines.length)} of {filteredMachines.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium px-2">{currentPage} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Machine Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Machine</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddMachine} className="space-y-4">
            <MachineFormFields />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} data-testid="submit-add-machine">
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Add Machine
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Machine Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Machine</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditMachine} className="space-y-4">
            <MachineFormFields />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} data-testid="submit-edit-machine">
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Update
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Machine History - {selectedMachine?.machine_name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[300px] overflow-auto">
            {history.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No history available</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{new Date(entry.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm">{entry.operator_name}</TableCell>
                      <TableCell className="text-sm truncate max-w-[150px]">{entry.job_details}</TableCell>
                      <TableCell>{getStatusBadge(entry.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Machines;
