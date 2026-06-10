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
  Briefcase,
  Edit,
  Trash2,
  Play,
  CheckCircle,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const ITEMS_PER_PAGE = 20;

const CATEGORIES = ['VMC', 'CNC Lathe', 'Grinding', 'Milling', 'Other'];

const Jobs = () => {
  const [jobs, setJobs] = useState([]);
  const [machines, setMachines] = useState([]);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCommentsDialogOpen, setIsCommentsDialogOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    category: 'VMC',
    sub_category: '',
    machine_name: '',
    job_details: '',
    assigned_to: '',
    target_qty: '',
    expected_hours: ''
  });

  const fetchJobs = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/jobs`);
      setJobs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMachines = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/machines`);
      setMachines(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching machines:', error);
    }
  };

  const fetchOperators = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/users/assignable`);
      setOperators(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching operators:', error);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchMachines();
    fetchOperators();
  }, [fetchJobs]);

  const handleAddJob = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        target_qty: formData.target_qty ? parseInt(formData.target_qty) : null,
        expected_hours: formData.expected_hours ? parseFloat(formData.expected_hours) : null
      };
      await axios.post(`${API_URL}/api/jobs`, payload);
      toast.success('Job created successfully');
      setIsAddDialogOpen(false);
      resetForm();
      fetchJobs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create job');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditJob = async (e) => {
    e.preventDefault();
    if (!selectedJob) return;
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        target_qty: formData.target_qty ? parseInt(formData.target_qty) : null,
        expected_hours: formData.expected_hours ? parseFloat(formData.expected_hours) : null
      };
      await axios.put(`${API_URL}/api/jobs/${selectedJob.job_id}`, payload);
      toast.success('Job updated successfully');
      setIsEditDialogOpen(false);
      fetchJobs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update job');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!window.confirm('Are you sure you want to delete this job?')) return;
    try {
      await axios.delete(`${API_URL}/api/jobs/${jobId}`);
      toast.success('Job deleted successfully');
      fetchJobs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete job');
    }
  };

  const handleStartJob = async (job) => {
    try {
      await axios.post(`${API_URL}/api/jobs/start`, { job_id: job.job_id });
      toast.success('Job started');
      fetchJobs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start job');
    }
  };

  const handleCompleteJob = async (job) => {
    try {
      await axios.post(`${API_URL}/api/jobs/complete`, { job_id: job.job_id });
      toast.success('Job completed');
      fetchJobs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to complete job');
    }
  };

  const fetchComments = async (jobId) => {
    try {
      const { data } = await axios.get(`${API_URL}/api/jobs/${jobId}/comments`);
      setComments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching comments:', error);
      setComments([]);
    }
  };

  const handleAddComment = async () => {
    if (!selectedJob || !newComment.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/jobs/${selectedJob.job_id}/comments`, { comment: newComment });
      toast.success('Comment added');
      setNewComment('');
      fetchComments(selectedJob.job_id);
    } catch (error) {
      toast.error('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      category: 'VMC',
      sub_category: '',
      machine_name: '',
      job_details: '',
      assigned_to: '',
      target_qty: '',
      expected_hours: ''
    });
  };

  const openEditDialog = (job) => {
    setSelectedJob(job);
    setFormData({
      category: job.category || 'VMC',
      sub_category: job.sub_category || '',
      machine_name: job.machine_name || '',
      job_details: job.job_details || '',
      assigned_to: job.assigned_to || '',
      target_qty: job.target_qty?.toString() || '',
      expected_hours: job.expected_hours?.toString() || ''
    });
    setIsEditDialogOpen(true);
  };

  // Filter jobs
  const filteredJobs = jobs.filter(job => {
    const searchLower = search.toLowerCase();
    const matchesSearch = (
      (job.job_details || '').toLowerCase().includes(searchLower) ||
      (job.machine_name || '').toLowerCase().includes(searchLower) ||
      (job.assigned_to || '').toLowerCase().includes(searchLower)
    );
    const jobStatus = (job.status || 'pending').toLowerCase();
    let matchesStatus = statusFilter === 'all';
    if (statusFilter === 'active') matchesStatus = ['active', 'in_progress', 'running'].includes(jobStatus);
    else if (statusFilter === 'pending') matchesStatus = jobStatus === 'pending' || !job.status;
    else if (statusFilter === 'completed') matchesStatus = ['completed', 'done'].includes(jobStatus);
    return matchesSearch && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedJobs = filteredJobs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const getStatusBadge = (status) => {
    const statusLower = (status || 'pending').toLowerCase();
    if (statusLower === 'active' || statusLower === 'in_progress' || statusLower === 'running') {
      return <Badge className="status-running border-none">Active</Badge>;
    } else if (statusLower === 'completed' || statusLower === 'done') {
      return <Badge className="bg-emerald-100 text-emerald-700 border-none">Completed</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-700 border-none">Pending</Badge>;
  };

  const JobFormFields = () => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category *</Label>
          <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Machine *</Label>
          <Select value={formData.machine_name} onValueChange={(v) => setFormData({...formData, machine_name: v})}>
            <SelectTrigger><SelectValue placeholder="Select machine" /></SelectTrigger>
            <SelectContent>
              {machines.map(m => (
                <SelectItem key={m.machine_id || m.name} value={m.name}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="job_details">Job Details *</Label>
        <Textarea
          id="job_details"
          value={formData.job_details}
          onChange={(e) => setFormData({...formData, job_details: e.target.value})}
          required
          rows={2}
          placeholder="Describe the job..."
        />
      </div>
      <div className="space-y-2">
        <Label>Assign To *</Label>
        <Select value={formData.assigned_to} onValueChange={(v) => setFormData({...formData, assigned_to: v})}>
          <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
          <SelectContent>
            {operators.map(op => (
              <SelectItem key={op.user_id || op.name} value={op.name}>{op.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="target_qty">Target Quantity</Label>
          <Input
            id="target_qty"
            type="number"
            min="1"
            value={formData.target_qty}
            onChange={(e) => setFormData({...formData, target_qty: e.target.value})}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expected_hours">Expected Hours</Label>
          <Input
            id="expected_hours"
            type="number"
            step="0.5"
            min="0"
            value={formData.expected_hours}
            onChange={(e) => setFormData({...formData, expected_hours: e.target.value})}
          />
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-6" data-testid="jobs-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Jobs</h1>
        <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }} data-testid="add-job-btn">
          <Plus className="w-4 h-4 mr-2" /> Create Job
        </Button>
      </div>

      {/* Status Tabs + Search + Pagination */}
      <Card className="border border-border">
        <CardContent className="p-4 space-y-3">
          {/* Clickable Status Tabs */}
          <div className="flex flex-wrap gap-2" data-testid="job-status-tabs">
            {[
              { value: 'all', label: 'All', count: jobs.length },
              { value: 'active', label: 'Active', count: jobs.filter(j => ['active','in_progress','running'].includes((j.status||'').toLowerCase())).length },
              { value: 'pending', label: 'Pending', count: jobs.filter(j => (j.status||'pending').toLowerCase() === 'pending' || !j.status).length },
              { value: 'completed', label: 'Completed', count: jobs.filter(j => ['completed','done'].includes((j.status||'').toLowerCase())).length },
            ].map(tab => (
              <button
                key={tab.value}
                onClick={() => { setStatusFilter(tab.value); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  statusFilter === tab.value
                    ? tab.value === 'active' ? 'bg-emerald-600 text-white shadow-sm'
                    : tab.value === 'pending' ? 'bg-amber-500 text-white shadow-sm'
                    : tab.value === 'completed' ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
                data-testid={`tab-${tab.value}`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search jobs..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="pl-10"
                data-testid="search-input"
              />
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredJobs.length)} of {filteredJobs.length}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm font-medium">{currentPage}/{totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Job Details</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Machine</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Assigned To</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Target</TableHead>
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
            ) : paginatedJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No jobs found</p>
                </TableCell>
              </TableRow>
            ) : (
              paginatedJobs.map((job, index) => (
                <TableRow key={job.job_id || index} className="table-row-hover cursor-pointer" onClick={() => { setSelectedJob(job); setIsDetailOpen(true); }} data-testid={`job-row-${index}`}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{job.job_details}</p>
                      <p className="text-xs text-muted-foreground">{job.category}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{job.machine_name || '-'}</TableCell>
                  <TableCell className="hidden lg:table-cell">{job.assigned_to || '-'}</TableCell>
                  <TableCell>{getStatusBadge(job.status)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{job.target_qty || '-'}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(job)}>
                          <Edit className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        {job.status !== 'active' && job.status !== 'completed' && (
                          <DropdownMenuItem onClick={() => handleStartJob(job)}>
                            <Play className="w-4 h-4 mr-2" /> Start
                          </DropdownMenuItem>
                        )}
                        {job.status === 'active' && (
                          <DropdownMenuItem onClick={() => handleCompleteJob(job)}>
                            <CheckCircle className="w-4 h-4 mr-2" /> Complete
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => {
                          setSelectedJob(job);
                          fetchComments(job.job_id);
                          setIsCommentsDialogOpen(true);
                        }}>
                          <MessageSquare className="w-4 h-4 mr-2" /> Comments
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteJob(job.job_id)} className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

      </Card>

      {/* Add Job Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Job</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddJob} className="space-y-4">
            <JobFormFields />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Job Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Job</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditJob} className="space-y-4">
            <JobFormFields />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Update
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Job Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Job Details</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/10 text-primary border-none">{selectedJob.category || 'Other'}</Badge>
                    {getStatusBadge(selectedJob.status)}
                  </div>
                  <span className="text-xs text-muted-foreground">{selectedJob.job_id}</span>
                </div>
                <div className="p-3 bg-muted/50 rounded space-y-2">
                  <div><span className="text-sm text-muted-foreground">Job Details:</span><p className="font-medium">{selectedJob.job_details}</p></div>
                  {selectedJob.machine_name && <div><span className="text-sm text-muted-foreground">Machine:</span><p className="font-medium">{selectedJob.machine_name}</p></div>}
                  {selectedJob.assigned_to && <div><span className="text-sm text-muted-foreground">Assigned To:</span><p className="font-medium">{selectedJob.assigned_to}</p></div>}
                  {selectedJob.target_qty && <div><span className="text-sm text-muted-foreground">Target Qty:</span><p className="font-medium">{selectedJob.target_qty}</p></div>}
                  {selectedJob.expected_hours && <div><span className="text-sm text-muted-foreground">Expected Hours:</span><p className="font-medium">{selectedJob.expected_hours}h</p></div>}
                  {selectedJob.created_at && <div><span className="text-sm text-muted-foreground">Created:</span><p className="font-medium">{new Date(selectedJob.created_at).toLocaleDateString()}</p></div>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setIsDetailOpen(false); openEditDialog(selectedJob); }} data-testid="detail-edit-btn">
                  <Edit className="w-4 h-4 mr-2" /> Edit
                </Button>
                {selectedJob.status !== 'active' && selectedJob.status !== 'completed' && (
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => { handleStartJob(selectedJob); setIsDetailOpen(false); }} data-testid="detail-start-btn">
                    <Play className="w-4 h-4 mr-2" /> Start
                  </Button>
                )}
                {selectedJob.status === 'active' && (
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => { handleCompleteJob(selectedJob); setIsDetailOpen(false); }} data-testid="detail-complete-btn">
                    <CheckCircle className="w-4 h-4 mr-2" /> Complete
                  </Button>
                )}
                <Button variant="outline" onClick={() => { setIsDetailOpen(false); fetchComments(selectedJob.job_id); setIsCommentsDialogOpen(true); }} data-testid="detail-comments-btn">
                  <MessageSquare className="w-4 h-4 mr-2" /> Comments
                </Button>
                <Button variant="destructive" onClick={() => { handleDeleteJob(selectedJob.job_id); setIsDetailOpen(false); }} data-testid="detail-delete-btn">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Comments Dialog */}
      <Dialog open={isCommentsDialogOpen} onOpenChange={setIsCommentsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Job Comments</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="max-h-[200px] overflow-auto space-y-2">
              {comments.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No comments yet</p>
              ) : (
                comments.map((c, i) => (
                  <div key={i} className="p-3 bg-muted/50 rounded">
                    <p className="text-sm">{c.comment}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.user_name} • {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
              />
              <Button onClick={handleAddComment} disabled={submitting || !newComment.trim()}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCommentsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Jobs;
