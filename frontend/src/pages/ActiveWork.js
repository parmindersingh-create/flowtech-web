import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  ArrowLeft, Loader2, Clock, Square, Activity, RefreshCw, ArrowRightLeft, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const isCnc = (cat) => {
  const c = (cat || '').toLowerCase();
  return c === 'cnc' || c.includes('cnc');
};

const parseStartTime = (str) => {
  if (!str) return null;
  try {
    const [datePart, timePart, ampm] = str.split(' ');
    const [day, month, year] = datePart.split('/');
    let [hours, minutes] = timePart.split(':').map(Number);
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return new Date(year, month - 1, day, hours, minutes);
  } catch { return null; }
};

const ActiveWork = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeWork, setActiveWork] = useState([]);
  const [loading, setLoading] = useState(true);
  const [operators, setOperators] = useState([]);
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);
  const [selectedWork, setSelectedWork] = useState(null);
  const [handoverData, setHandoverData] = useState({ new_operator_id: '', new_operator_name: '', remarks: '' });
  const [submitting, setSubmitting] = useState(false);
  const [isPostQtyOpen, setIsPostQtyOpen] = useState(false);
  const [postQty, setPostQty] = useState('');

  const openPostQty = (work) => {
    setSelectedWork(work);
    setPostQty('');
    setIsPostQtyOpen(true);
  };

  const handlePostQty = async () => {
    if (!selectedWork || !postQty || parseInt(postQty, 10) <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/production/${selectedWork.entry_id}/post-qty`, {
        qty: parseInt(postQty, 10),
      });
      toast.success(data?.message || `Posted ${postQty} pcs`);
      setIsPostQtyOpen(false);
      setPostQty('');
      fetchActiveWork();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to post quantity');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    fetchActiveWork();
    fetchOperators();
    const interval = setInterval(fetchActiveWork, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchActiveWork = async () => {
    try {
      // Try authenticated endpoint first
      let work = [];
      try {
        const { data } = await axios.get(`${API_URL}/api/production/active`);
        work = Array.isArray(data) ? data : [];
      } catch { work = []; }

      // If no data from authenticated endpoint, use public machine status
      if (work.length === 0) {
        const { data: machineData } = await axios.get(`${API_URL}/api/machine-status/summary-public`, { withCredentials: false });
        const runningMachines = (machineData?.machines || []).filter(m => m.status === 'running');
        work = runningMachines.map(m => ({
          entry_id: m.entry_id || m.machine_id,
          machine_id: m.machine_id,
          machine_name: m.machine_name,
          category: m.category,
          operator_name: m.operator_name,
          job_details: m.job_details,
          start_time: m.start_time,
          started_at: parseStartTime(m.start_time)?.toISOString(),
          target_quantity: m.target_quantity,
          cycle_time: m.cycle_time,
        }));
      }
      setActiveWork(work);
    } catch (error) {
      console.error('Error fetching active work:', error);
    } finally { setLoading(false); }
  };

  const fetchOperators = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/operators`).catch(() => axios.get(`${API_URL}/api/users/assignable`));
      setOperators(Array.isArray(data) ? data : []);
    } catch { setOperators([]); }
  };

  const openHandover = (work) => {
    setSelectedWork(work);
    setHandoverData({ new_operator_id: '', new_operator_name: '', remarks: '' });
    setIsHandoverOpen(true);
  };

  const handleHandover = async () => {
    if (!selectedWork) return;
    if (!handoverData.new_operator_id && !handoverData.new_operator_name) {
      toast.error('Please select an operator to handover to');
      return;
    }
    setSubmitting(true);
    try {
      const selectedOp = operators.find(o => o.user_id === handoverData.new_operator_id);
      await axios.post(`${API_URL}/api/production/handover/${selectedWork.entry_id}`, {
        new_operator_id: handoverData.new_operator_id,
        new_operator_name: selectedOp?.name || handoverData.new_operator_name,
        remarks: handoverData.remarks,
      });
      toast.success('Handover request sent');
      setIsHandoverOpen(false);
      fetchActiveWork();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to handover');
    } finally { setSubmitting(false); }
  };

  const [elapsedTimes, setElapsedTimes] = useState({});

  useEffect(() => {
    const timer = setInterval(() => {
      const times = {};
      activeWork.forEach(work => {
        const startStr = work.started_at || work.start_time;
        let start = startStr ? new Date(startStr) : null;
        if (!start || isNaN(start)) start = parseStartTime(startStr);
        if (start && !isNaN(start)) {
          const diff = Math.floor((Date.now() - start.getTime()) / 1000);
          const h = Math.floor(diff / 3600);
          const m = Math.floor((diff % 3600) / 60);
          const s = diff % 60;
          const key = work.entry_id || work.machine_id;
          times[key] = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
      });
      setElapsedTimes(times);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeWork]);

  const getCategoryColor = (cat) => {
    const c = (cat || '').toLowerCase();
    if (c.includes('vmc')) return 'bg-emerald-600';
    if (c.includes('cnc')) return 'bg-blue-600';
    if (c.includes('moulding') || c.includes('molding')) return 'bg-purple-600';
    return 'bg-gray-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="active-work-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-3xl font-extrabold tracking-tight">Active Work</h1>
        </div>
        <Button variant="outline" onClick={fetchActiveWork} data-testid="refresh-btn">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {activeWork.length === 0 ? (
        <Card className="border border-border">
          <CardContent className="py-12 text-center">
            <Activity className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Active Work</h3>
            <p className="text-muted-foreground mb-4">There are no machines currently running.</p>
            <Link to="/dashboard/start-work">
              <Button>Start New Work</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {activeWork.map((work, i) => {
            const key = work.entry_id || work.machine_id || i;
            return (
              <Card key={key} className="border border-emerald-200 bg-emerald-50/30" data-testid={`active-work-card-${key}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="w-4 h-4 bg-emerald-500 rounded-full animate-pulse" />
                        <h3 className="font-bold text-xl">{work.machine_name || work.category}</h3>
                        {work.category && (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${getCategoryColor(work.category)}`}>
                            {work.category === 'cnc_lathe' ? 'CNC' : work.category === 'vmc' ? 'VMC' : work.category}
                          </span>
                        )}
                        <Badge className="status-running border-none">Running</Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Operator</p>
                          <p className="font-semibold">{work.operator_name}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Job Details</p>
                          <p className="font-medium">{work.job_details}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Start Time</p>
                          <p className="font-medium">{work.start_time || (work.started_at ? new Date(work.started_at).toLocaleTimeString() : '-')}</p>
                        </div>
                        {work.target_quantity && (
                          <div>
                            <p className="text-sm text-muted-foreground">Target Qty</p>
                            <p className="font-medium">{work.target_quantity}</p>
                          </div>
                        )}
                        {isCnc(work.category) && work.spindle_rpm && (
                          <div>
                            <p className="text-sm text-muted-foreground">🔄 Spindle RPM</p>
                            <p className="font-medium">{work.spindle_rpm} RPM</p>
                          </div>
                        )}
                        {isCnc(work.category) && work.feed_rate && (
                          <div>
                            <p className="text-sm text-muted-foreground">📏 Feed Rate</p>
                            <p className="font-medium">{work.feed_rate} mm/min</p>
                          </div>
                        )}
                        {(work.total_posted_qty || 0) > 0 && (
                          <div className="col-span-2 md:col-span-4 mt-2 p-2 bg-blue-100/60 border border-blue-200 rounded">
                            <p className="text-xs text-blue-700 font-semibold">
                              📊 Posted so far: <span className="font-bold">{work.total_posted_qty}</span> pcs
                              {work.last_post_time && <span className="ml-2 text-blue-600 font-normal">• Last: {new Date(work.last_post_time).toLocaleTimeString()}</span>}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-3">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Elapsed Time</p>
                        <p className="text-3xl font-bold font-mono text-emerald-600">
                          {elapsedTimes[key] || '00:00:00'}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap justify-center">
                        <Button size="sm" variant="outline" onClick={() => openPostQty(work)} className="border-blue-300 text-blue-700 hover:bg-blue-50" data-testid={`post-qty-btn-${key}`}>
                          <BarChart3 className="w-4 h-4 mr-1" /> Post Qty
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openHandover(work)} data-testid={`handover-btn-${key}`}>
                          <ArrowRightLeft className="w-4 h-4 mr-1" /> Handover
                        </Button>
                        <Link to="/dashboard/end-work">
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" data-testid={`end-btn-${key}`}>
                            <Square className="w-4 h-4 mr-1" /> End
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="text-center text-sm text-muted-foreground">
        <Clock className="w-4 h-4 inline mr-1" /> Auto-refreshes every 30 seconds
      </div>

      {/* Handover Dialog */}
      <Dialog open={isHandoverOpen} onOpenChange={setIsHandoverOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" /> Handover Work
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded">
              <p className="text-sm"><span className="text-muted-foreground">Machine:</span> <span className="font-medium">{selectedWork?.machine_name}</span></p>
              <p className="text-sm"><span className="text-muted-foreground">Current Operator:</span> <span className="font-medium">{selectedWork?.operator_name}</span></p>
              <p className="text-sm"><span className="text-muted-foreground">Job:</span> {selectedWork?.job_details}</p>
            </div>
            <div className="space-y-2">
              <Label>Handover To *</Label>
              <Select value={handoverData.new_operator_id} onValueChange={(v) => setHandoverData({ ...handoverData, new_operator_id: v })}>
                <SelectTrigger data-testid="handover-operator-select">
                  <SelectValue placeholder="Select operator" />
                </SelectTrigger>
                <SelectContent>
                  {operators.filter(o => o.user_id !== user?.user_id).map(op => (
                    <SelectItem key={op.user_id} value={op.user_id}>{op.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Or Enter Name Manually</Label>
              <Input
                placeholder="Operator name"
                value={handoverData.new_operator_name}
                onChange={(e) => setHandoverData({ ...handoverData, new_operator_name: e.target.value, new_operator_id: '' })}
              />
            </div>
            <div className="space-y-2">
              <Label>Remarks (Optional)</Label>
              <Input
                placeholder="Any notes for the handover"
                value={handoverData.remarks}
                onChange={(e) => setHandoverData({ ...handoverData, remarks: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHandoverOpen(false)}>Cancel</Button>
            <Button onClick={handleHandover} disabled={submitting} data-testid="submit-handover-btn">
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Handover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Post Qty Dialog */}
      <Dialog open={isPostQtyOpen} onOpenChange={setIsPostQtyOpen}>
        <DialogContent className="max-w-md" data-testid="post-qty-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" /> Post Production Quantity
            </DialogTitle>
          </DialogHeader>
          {selectedWork && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded">
                <p className="text-sm"><span className="text-muted-foreground">Machine:</span> <span className="font-medium">{selectedWork.machine_name}</span></p>
                <p className="text-sm"><span className="text-muted-foreground">Job:</span> {selectedWork.job_details}</p>
                {(selectedWork.total_posted_qty || 0) > 0 && (
                  <p className="text-sm mt-1"><span className="text-muted-foreground">Already posted:</span> <span className="font-bold text-blue-700">{selectedWork.total_posted_qty} pcs</span></p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Quantity Produced Since Last Post *</Label>
                <Input
                  type="number"
                  min="1"
                  value={postQty}
                  onChange={(e) => setPostQty(e.target.value)}
                  placeholder="Enter pieces produced"
                  autoFocus
                  data-testid="post-qty-input"
                />
                <p className="text-xs text-muted-foreground">This will record an intermediate production checkpoint with timestamp and avg cycle time.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPostQtyOpen(false)}>Cancel</Button>
            <Button onClick={handlePostQty} disabled={submitting || !postQty} className="bg-blue-600 hover:bg-blue-700" data-testid="confirm-post-qty">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BarChart3 className="w-4 h-4 mr-2" />}
              Post Qty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default ActiveWork;
