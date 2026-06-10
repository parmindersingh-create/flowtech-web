import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { ArrowLeft, Loader2, AlertTriangle, Plus, Camera, Upload, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const ITEMS_PER_PAGE = 10;

const Breakdown = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [machines, setMachines] = useState([]);
  const [breakdowns, setBreakdowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState('report');

  const [formData, setFormData] = useState({
    machine_id: '',
    alarm_image: null,
    machine_image: null,
    action_taken: '',
    action_taken_by: ''
  });

  const [isResolveDialogOpen, setIsResolveDialogOpen] = useState(false);
  const [selectedBreakdown, setSelectedBreakdown] = useState(null);
  const [resolveRemarks, setResolveRemarks] = useState('');
  const [isCommentDialogOpen, setIsCommentDialogOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const isAdmin = user?.role === 'Admin' || user?.is_admin;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [machinesRes, breakdownsRes] = await Promise.all([
        axios.get(`${API_URL}/api/machines`),
        axios.get(`${API_URL}/api/breakdowns`).catch(() => ({ data: [] }))
      ]);
      setMachines(Array.isArray(machinesRes.data) ? machinesRes.data : []);
      setBreakdowns(Array.isArray(breakdownsRes.data) ? breakdownsRes.data : []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (field, e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, [field]: file });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.machine_id) {
      toast.error('Please select a machine');
      return;
    }
    setSubmitting(true);

    try {
      const payload = new FormData();
      payload.append('machine_id', formData.machine_id);
      payload.append('action_taken', formData.action_taken);
      payload.append('action_taken_by', formData.action_taken_by || user?.name || '');
      if (formData.alarm_image) payload.append('alarm_image', formData.alarm_image);
      if (formData.machine_image) payload.append('machine_image', formData.machine_image);

      await axios.post(`${API_URL}/api/breakdowns`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Breakdown reported successfully!');
      setFormData({
        machine_id: '',
        alarm_image: null,
        machine_image: null,
        action_taken: '',
        action_taken_by: ''
      });
      fetchData();
      setActiveTab('history');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to report breakdown');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedBreakdown) return;
    setSubmitting(true);

    try {
      await axios.put(`${API_URL}/api/breakdowns/${selectedBreakdown.breakdown_id}/resolve`, {
        remarks: resolveRemarks
      });
      toast.success('Breakdown resolved!');
      setIsResolveDialogOpen(false);
      setResolveRemarks('');
      fetchData();
    } catch (error) {
      // Fallback to legacy POST shape
      try {
        await axios.post(`${API_URL}/api/breakdowns/${selectedBreakdown.breakdown_id}/resolve`, { remarks: resolveRemarks });
        toast.success('Breakdown resolved!');
        setIsResolveDialogOpen(false); setResolveRemarks(''); fetchData();
      } catch (e2) { toast.error(e2.response?.data?.detail || 'Failed to resolve breakdown'); }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedBreakdown || !commentText.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/breakdowns/${selectedBreakdown.breakdown_id}/comment`, { text: commentText });
      toast.success('Comment added');
      setCommentText(''); setIsCommentDialogOpen(false); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add comment'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteBreakdown = async (bd) => {
    if (!window.confirm('Delete this breakdown record?')) return;
    try {
      await axios.delete(`${API_URL}/api/breakdowns/${bd.breakdown_id}`);
      toast.success('Deleted'); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete'); }
  };

  // Pagination
  const totalPages = Math.ceil(breakdowns.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedBreakdowns = breakdowns.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="breakdown-page">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-3xl font-extrabold tracking-tight">Machine Breakdown</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="report">Report Breakdown</TabsTrigger>
          <TabsTrigger value="history">History ({breakdowns.length})</TabsTrigger>
        </TabsList>

        {/* Report Breakdown Tab */}
        <TabsContent value="report">
          <Card className="border border-border max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Report New Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Machine Selection */}
                <div className="space-y-2">
                  <Label>Select Machine *</Label>
                  <Select value={formData.machine_id} onValueChange={(v) => setFormData({ ...formData, machine_id: v })}>
                    <SelectTrigger data-testid="machine-select">
                      <SelectValue placeholder="Select machine with issue" />
                    </SelectTrigger>
                    <SelectContent>
                      {machines.map(m => (
                        <SelectItem key={m.machine_id} value={m.machine_id}>
                          {m.name || m.machine_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Alarm Photo */}
                <div className="space-y-2">
                  <Label>Alarm Photo</Label>
                  <label className="block">
                    <div className="flex items-center justify-center gap-2 p-6 border-2 border-dashed rounded cursor-pointer hover:bg-muted/50 transition-colors">
                      <Camera className="w-6 h-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {formData.alarm_image ? formData.alarm_image.name : 'Upload alarm screen photo'}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageChange('alarm_image', e)}
                      className="hidden"
                      data-testid="alarm-image-upload"
                    />
                  </label>
                </div>

                {/* Machine Photo */}
                <div className="space-y-2">
                  <Label>Machine Photo</Label>
                  <label className="block">
                    <div className="flex items-center justify-center gap-2 p-6 border-2 border-dashed rounded cursor-pointer hover:bg-muted/50 transition-colors">
                      <Camera className="w-6 h-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {formData.machine_image ? formData.machine_image.name : 'Upload machine photo'}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageChange('machine_image', e)}
                      className="hidden"
                      data-testid="machine-image-upload"
                    />
                  </label>
                </div>

                {/* Action Taken */}
                <div className="space-y-2">
                  <Label htmlFor="action_taken">Action Taken *</Label>
                  <Textarea
                    id="action_taken"
                    value={formData.action_taken}
                    onChange={(e) => setFormData({ ...formData, action_taken: e.target.value })}
                    placeholder="Describe the issue and action taken"
                    rows={3}
                    required
                    data-testid="action-taken-input"
                  />
                </div>

                {/* Action Taken By */}
                <div className="space-y-2">
                  <Label htmlFor="action_taken_by">Action Taken By</Label>
                  <Input
                    id="action_taken_by"
                    value={formData.action_taken_by}
                    onChange={(e) => setFormData({ ...formData, action_taken_by: e.target.value })}
                    placeholder={user?.name || 'Enter name'}
                    data-testid="action-by-input"
                  />
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => navigate('/dashboard')} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="flex-1 bg-red-600 hover:bg-red-700" data-testid="submit-breakdown">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
                    Report Breakdown
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card className="border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Machine</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Date</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Action Taken</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedBreakdowns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No breakdown records</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedBreakdowns.map((bd, i) => (
                    <TableRow key={bd.breakdown_id || i} className="table-row-hover">
                      <TableCell className="font-medium">{bd.machine_name}</TableCell>
                      <TableCell className="text-sm">
                        {bd.reported_at ? new Date(bd.reported_at).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">
                        {bd.action_taken}
                      </TableCell>
                      <TableCell>
                        <Badge className={bd.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                          {bd.status || 'pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {bd.status !== 'resolved' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedBreakdown(bd);
                                setIsResolveDialogOpen(true);
                              }}
                              data-testid={`resolve-${bd.breakdown_id}`}
                            >
                              Resolve
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedBreakdown(bd); setIsCommentDialogOpen(true); }} data-testid={`comment-${bd.breakdown_id}`}>
                            💬 {bd.comments?.length || 0}
                          </Button>
                          {isAdmin && (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteBreakdown(bd)}>
                              ✕
                            </Button>
                          )}
                        </div>
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
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Resolve Dialog */}
      <Dialog open={isResolveDialogOpen} onOpenChange={setIsResolveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Breakdown</DialogTitle>
          </DialogHeader>
          {selectedBreakdown && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded">
                <p className="text-sm text-muted-foreground">Machine:</p>
                <p className="font-semibold">{selectedBreakdown.machine_name}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="resolve_remarks">Resolution Remarks</Label>
                <Textarea
                  id="resolve_remarks"
                  value={resolveRemarks}
                  onChange={(e) => setResolveRemarks(e.target.value)}
                  placeholder="Describe the resolution"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResolveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comment Dialog */}
      <Dialog open={isCommentDialogOpen} onOpenChange={setIsCommentDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Comments — {selectedBreakdown?.machine_name}</DialogTitle></DialogHeader>
          {selectedBreakdown && (
            <div className="space-y-3">
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {(selectedBreakdown.comments || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No comments yet</p>
                ) : (selectedBreakdown.comments || []).map((c, i) => (
                  <div key={c.comment_id || i} className="border rounded p-2 text-sm">
                    <p>{c.text}</p>
                    <p className="text-xs text-muted-foreground mt-1">{c.user_name || '-'}{c.created_at ? ` • ${new Date(c.created_at).toLocaleString()}` : ''}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Add Comment</Label>
                <Textarea value={commentText} onChange={e => setCommentText(e.target.value)} rows={2} placeholder="Parts ordered, ETA tomorrow…" data-testid="comment-input" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCommentDialogOpen(false); setCommentText(''); }}>Close</Button>
            <Button onClick={handleAddComment} disabled={submitting || !commentText.trim()} data-testid="submit-comment">{submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Breakdown;
