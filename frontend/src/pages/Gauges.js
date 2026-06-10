import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
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
  Ruler,
  Send,
  RotateCcw,
  History
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const ITEMS_PER_PAGE = 20;

const Gauges = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const [isLogsDialogOpen, setIsLogsDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    gauge_type: '',
    sub_type: '',
    gauge_details: '',
    make: '',
    stored_at: ''
  });
  const [issueData, setIssueData] = useState({ issued_to: '', machine_name: '' });

  const fetchGauges = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/gauges`);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching gauges:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGauges();
  }, [fetchGauges]);

  const handleAddEntry = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/gauges`, formData);
      toast.success('Gauge added successfully');
      setIsAddDialogOpen(false);
      resetForm();
      fetchGauges();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add gauge');
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssue = async () => {
    if (!selectedItem) return;
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/gauges/${selectedItem.gauge_id}/issue`, issueData);
      toast.success('Gauge issued successfully');
      setIsIssueDialogOpen(false);
      setIssueData({ issued_to: '', machine_name: '' });
      fetchGauges();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to issue gauge');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async () => {
    if (!selectedItem) return;
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/gauges/${selectedItem.gauge_id}/return`, {});
      toast.success('Gauge returned successfully');
      setIsReturnDialogOpen(false);
      fetchGauges();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to return gauge');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchTransactions = async (gaugeId) => {
    try {
      const { data } = await axios.get(`${API_URL}/api/gauges/${gaugeId}/transactions`);
      setTransactions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setTransactions([]);
    }
  };

  const resetForm = () => {
    setFormData({
      gauge_type: '',
      sub_type: '',
      gauge_details: '',
      make: '',
      stored_at: ''
    });
  };

  // Filter items
  const filteredItems = items.filter(item => {
    const searchLower = search.toLowerCase();
    return (
      (item.gauge_type || '').toLowerCase().includes(searchLower) ||
      (item.sub_type || '').toLowerCase().includes(searchLower) ||
      (item.gauge_details || '').toLowerCase().includes(searchLower) ||
      (item.make || '').toLowerCase().includes(searchLower)
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="space-y-6" data-testid="gauges-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Gauges</h1>
        <Button onClick={() => setIsAddDialogOpen(true)} data-testid="add-gauge-btn">
          <Plus className="w-4 h-4 mr-2" /> Add Gauge
        </Button>
      </div>

      {/* Search */}
      <Card className="border border-border">
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search gauges..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-10"
              data-testid="search-input"
            />
          </div>
        </CardContent>
      </Card>

      {/* Gauges Table */}
      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Type</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Sub Type</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Details</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Make</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Location</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Ruler className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No gauges found</p>
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((item, index) => (
                <TableRow key={item.gauge_id || index} className="table-row-hover" data-testid={`gauge-row-${index}`}>
                  <TableCell className="font-medium">{item.gauge_type}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{item.sub_type}</TableCell>
                  <TableCell className="truncate max-w-[200px]">{item.gauge_details}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{item.make}</TableCell>
                  <TableCell>
                    <Badge className={`border-none ${
                      item.status === 'issued' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {item.status || 'Available'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {item.status === 'issued' ? item.issued_to : item.stored_at}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {item.status !== 'issued' ? (
                          <DropdownMenuItem onClick={() => {
                            setSelectedItem(item);
                            setIsIssueDialogOpen(true);
                          }}>
                            <Send className="w-4 h-4 mr-2" /> Issue
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => {
                            setSelectedItem(item);
                            setIsReturnDialogOpen(true);
                          }}>
                            <RotateCcw className="w-4 h-4 mr-2" /> Return
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => {
                          setSelectedItem(item);
                          fetchTransactions(item.gauge_id);
                          setIsLogsDialogOpen(true);
                        }}>
                          <History className="w-4 h-4 mr-2" /> History
                        </DropdownMenuItem>
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
              Showing {startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, filteredItems.length)} of {filteredItems.length}
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

      {/* Add Entry Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Gauge</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddEntry} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gauge_type">Gauge Type *</Label>
                <Input
                  id="gauge_type"
                  value={formData.gauge_type}
                  onChange={(e) => setFormData({...formData, gauge_type: e.target.value})}
                  required
                  placeholder="e.g., Micrometer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub_type">Sub Type *</Label>
                <Input
                  id="sub_type"
                  value={formData.sub_type}
                  onChange={(e) => setFormData({...formData, sub_type: e.target.value})}
                  required
                  placeholder="e.g., 0-25mm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gauge_details">Gauge Details *</Label>
              <Input
                id="gauge_details"
                value={formData.gauge_details}
                onChange={(e) => setFormData({...formData, gauge_details: e.target.value})}
                required
                placeholder="Detailed description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="make">Make *</Label>
                <Input
                  id="make"
                  value={formData.make}
                  onChange={(e) => setFormData({...formData, make: e.target.value})}
                  required
                  placeholder="e.g., Mitutoyo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stored_at">Stored At *</Label>
                <Input
                  id="stored_at"
                  value={formData.stored_at}
                  onChange={(e) => setFormData({...formData, stored_at: e.target.value})}
                  required
                  placeholder="e.g., Rack A"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Add Gauge
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Issue Dialog */}
      <Dialog open={isIssueDialogOpen} onOpenChange={setIsIssueDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Issue Gauge</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Issuing: <span className="font-medium text-foreground">{selectedItem?.gauge_type} - {selectedItem?.gauge_details}</span>
            </p>
            <div className="space-y-2">
              <Label>Issue To *</Label>
              <Input value={issueData.issued_to} onChange={(e) => setIssueData({...issueData, issued_to: e.target.value})} placeholder="Operator name" />
            </div>
            <div className="space-y-2">
              <Label>Machine</Label>
              <Input value={issueData.machine_name} onChange={(e) => setIssueData({...issueData, machine_name: e.target.value})} placeholder="Machine name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsIssueDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleIssue} disabled={submitting || !issueData.issued_to}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={isReturnDialogOpen} onOpenChange={setIsReturnDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Return Gauge</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Returning: <span className="font-medium text-foreground">{selectedItem?.gauge_type} - {selectedItem?.gauge_details}</span>
              <br />Issued to: <span className="font-medium text-foreground">{selectedItem?.issued_to}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReturnDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleReturn} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirm Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction History Dialog */}
      <Dialog open={isLogsDialogOpen} onOpenChange={setIsLogsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gauge History</DialogTitle>
          </DialogHeader>
          <div className="max-h-[300px] overflow-auto">
            {transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No transaction history</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Machine</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{new Date(t.timestamp).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge className={t.action === 'issue' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}>
                          {t.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{t.user_name || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.machine_name || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Gauges;
