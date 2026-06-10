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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { ArrowLeft, Loader2, Square, Clock, CheckCircle, RefreshCw, BarChart3, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const fmtCycle = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' && v.includes(':')) return v;
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return '0s';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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

const EndWork = () => {
  const navigate = useNavigate();
  const [activeWork, setActiveWork] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWork, setSelectedWork] = useState(null);
  const [isEndDialogOpen, setIsEndDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [elapsedTimes, setElapsedTimes] = useState({});

  const [endData, setEndData] = useState({
    produced_quantity: '',
    qty_since_last_post: '',
    rejection_quantity: '0',
    remarks: ''
  });

  useEffect(() => { fetchActiveWork(); }, []);

  const fetchActiveWork = async () => {
    setLoading(true);
    try {
      // Try authenticated endpoint first
      let work = [];
      try {
        const { data } = await axios.get(`${API_URL}/api/production/active`);
        work = Array.isArray(data) ? data : [];
      } catch { work = []; }

      // If authenticated endpoint returned no data, use public machine status
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
          _from_public: true,
        }));
      }
      setActiveWork(work);
    } catch (error) {
      console.error('Error fetching active work:', error);
    } finally { setLoading(false); }
  };

  // Elapsed time counter
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
          times[work.entry_id || work.machine_id] = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }
      });
      setElapsedTimes(times);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeWork]);

  const openEndDialog = (work) => {
    setSelectedWork(work);
    const hasPosts = (work.total_posted_qty || 0) > 0;
    setEndData({
      produced_quantity: hasPosts ? '' : (work.target_quantity?.toString() || ''),
      qty_since_last_post: '',
      rejection_quantity: '0',
      remarks: ''
    });
    setIsEndDialogOpen(true);
  };

  const handleEndWork = async () => {
    if (!selectedWork) return;
    setSubmitting(true);
    try {
      const hasPosts = (selectedWork.total_posted_qty || 0) > 0;
      const qtySinceLast = parseInt(endData.qty_since_last_post, 10) || 0;
      const totalQty = hasPosts
        ? (selectedWork.total_posted_qty || 0) + qtySinceLast
        : (parseInt(endData.produced_quantity, 10) || 0);

      const payload = {
        entry_id: selectedWork.entry_id,
        machine_id: selectedWork.machine_id,
        produced_quantity: totalQty,
        rejection_quantity: parseInt(endData.rejection_quantity) || 0,
        remarks: endData.remarks,
      };
      if (hasPosts) payload.qty_since_last_post = qtySinceLast;

      await axios.post(`${API_URL}/api/production/end`, payload);
      toast.success('Work ended successfully!');
      setIsEndDialogOpen(false);
      fetchActiveWork();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to end work');
    } finally { setSubmitting(false); }
  };

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
    <div className="space-y-6" data-testid="end-work-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-3xl font-extrabold tracking-tight">End Work</h1>
        </div>
        <Button variant="outline" onClick={fetchActiveWork} data-testid="refresh-btn">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {activeWork.length === 0 ? (
        <Card className="border border-border">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Active Work</h3>
            <p className="text-muted-foreground mb-4">There are no active work entries to end.</p>
            <Button onClick={() => navigate('/dashboard/start-work')}>Start New Work</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-muted-foreground">Select a work entry to end ({activeWork.length} active):</p>
          
          {activeWork.map((work, i) => {
            const key = work.entry_id || work.machine_id || i;
            return (
              <Card key={key} className="border border-emerald-200 bg-emerald-50/30" data-testid={`active-work-${key}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                        <h3 className="font-semibold text-lg">{work.machine_name || work.category}</h3>
                        {work.category && (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${getCategoryColor(work.category)}`}>
                            {work.category === 'cnc_lathe' ? 'CNC' : work.category === 'vmc' ? 'VMC' : work.category}
                          </span>
                        )}
                        <Badge className="status-running border-none">Running</Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Operator</p>
                          <p className="font-medium">{work.operator_name}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Job Details</p>
                          <p className="font-medium truncate">{work.job_details}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Start Time</p>
                          <p className="font-medium">{work.start_time || (work.started_at ? new Date(work.started_at).toLocaleTimeString() : '-')}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Elapsed</p>
                          <p className="font-medium font-mono text-emerald-600">
                            <Clock className="w-4 h-4 inline mr-1" />
                            {elapsedTimes[key] || '00:00:00'}
                          </p>
                        </div>
                        {((work.category || '').toLowerCase().includes('cnc')) && work.spindle_rpm && (
                          <div>
                            <p className="text-muted-foreground">🔄 Spindle RPM</p>
                            <p className="font-medium">{work.spindle_rpm} RPM</p>
                          </div>
                        )}
                        {((work.category || '').toLowerCase().includes('cnc')) && work.feed_rate && (
                          <div>
                            <p className="text-muted-foreground">📏 Feed Rate</p>
                            <p className="font-medium">{work.feed_rate} mm/min</p>
                          </div>
                        )}
                        {(work.total_posted_qty || 0) > 0 && (
                          <div className="col-span-2 md:col-span-4 mt-1 p-2 bg-blue-50 border border-blue-200 rounded">
                            <p className="text-xs text-blue-700 font-semibold">
                              📊 Already Posted: <span className="font-bold">{work.total_posted_qty}</span> pcs
                              {work.last_post_time && <span className="ml-2 font-normal">• Last: {new Date(work.last_post_time).toLocaleTimeString()}</span>}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      onClick={() => openEndDialog(work)}
                      className="bg-blue-600 hover:bg-blue-700"
                      data-testid={`end-work-${key}`}
                    >
                      <Square className="w-4 h-4 mr-2" /> End Work
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* End Work Dialog */}
      <Dialog open={isEndDialogOpen} onOpenChange={setIsEndDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>End Work Entry</DialogTitle>
          </DialogHeader>
          {selectedWork && (() => {
            const hasPosts = (selectedWork.total_posted_qty || 0) > 0;
            const postedQty = selectedWork.total_posted_qty || 0;
            const qtySinceLast = parseInt(endData.qty_since_last_post, 10) || 0;
            const totalQty = hasPosts ? postedQty + qtySinceLast : (parseInt(endData.produced_quantity, 10) || 0);

            // Calculate Production Loss (Expected vs Actual)
            // Expected = (duration_seconds / cycle_time_seconds)
            const cycleTimeSec = Number(selectedWork.cycle_time) || 0;
            const startStr = selectedWork.started_at || selectedWork.start_time;
            let start = startStr ? new Date(startStr) : null;
            if (!start || isNaN(start)) start = parseStartTime(startStr);
            const durationSec = start && !isNaN(start) ? Math.max(0, (Date.now() - start.getTime()) / 1000) : 0;
            const expectedQty = cycleTimeSec > 0 ? Math.floor(durationSec / cycleTimeSec) : 0;
            const lossQty = expectedQty - totalQty;
            const lossPct = expectedQty > 0 ? (lossQty / expectedQty) * 100 : 0;

            return (
              <div className="space-y-4">
                <div className="p-3 bg-muted/50 rounded">
                  <p className="text-sm text-muted-foreground">Ending work for:</p>
                  <p className="font-semibold">{selectedWork.machine_name || selectedWork.category}</p>
                  <p className="text-sm">{selectedWork.operator_name} - {selectedWork.job_details}</p>
                </div>

                {hasPosts && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded space-y-1">
                    <p className="text-sm font-semibold text-blue-800 flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" /> Already Posted: {postedQty} pcs
                    </p>
                    {selectedWork.last_post_time && (
                      <p className="text-xs text-blue-700">Last post: {new Date(selectedWork.last_post_time).toLocaleString()}</p>
                    )}
                    <p className="text-xs text-blue-700">{(selectedWork.production_posts || []).length} intermediate post{(selectedWork.production_posts || []).length === 1 ? '' : 's'} recorded.</p>
                  </div>
                )}

                {hasPosts ? (
                  <div className="space-y-2">
                    <Label>Qty Since Last Post *</Label>
                    <Input
                      type="number" min="0"
                      value={endData.qty_since_last_post}
                      onChange={(e) => setEndData({ ...endData, qty_since_last_post: e.target.value })}
                      placeholder="Pieces produced after the last post"
                      data-testid="qty-since-last-post-input"
                    />
                    <div className="flex justify-between items-center p-2 bg-emerald-50 border border-emerald-200 rounded">
                      <span className="text-sm text-emerald-800">Total Final Qty:</span>
                      <span className="font-bold text-lg text-emerald-700">{totalQty} pcs</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Produced Quantity *</Label>
                    <Input
                      type="number" min="0"
                      value={endData.produced_quantity}
                      onChange={(e) => setEndData({ ...endData, produced_quantity: e.target.value })}
                      placeholder="Enter quantity produced"
                      data-testid="produced-qty-input"
                    />
                  </div>
                )}

                {/* Production Loss preview */}
                {cycleTimeSec > 0 && totalQty > 0 && (
                  <div className={`p-3 rounded border ${lossQty > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" /> Production Loss Preview
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Expected</p>
                        <p className="font-bold">{expectedQty} pcs</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Actual</p>
                        <p className="font-bold">{totalQty} pcs</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Loss</p>
                        <p className={`font-bold ${lossQty > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {lossQty > 0 ? `−${lossQty}` : `+${-lossQty}`} ({lossPct.toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Cycle: {fmtCycle(cycleTimeSec)} • Duration: {Math.floor(durationSec/60)} min</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Rejection Quantity</Label>
                  <Input type="number" min="0" value={endData.rejection_quantity} onChange={(e) => setEndData({ ...endData, rejection_quantity: e.target.value })} placeholder="Enter rejected pieces" data-testid="rejection-qty-input" />
                </div>
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea value={endData.remarks} onChange={(e) => setEndData({ ...endData, remarks: e.target.value })} placeholder="Any additional notes" rows={2} data-testid="end-remarks-input" />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEndDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleEndWork}
              disabled={submitting || (
                ((selectedWork?.total_posted_qty || 0) > 0)
                  ? !endData.qty_since_last_post
                  : !endData.produced_quantity
              )}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="confirm-end-work"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Confirm End
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EndWork;
