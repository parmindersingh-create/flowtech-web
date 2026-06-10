import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { ArrowLeft, Loader2, Play, Camera, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CATEGORIES = [
  { value: 'cnc_lathe', label: 'CNC Lathe' },
  { value: 'vmc', label: 'VMC' },
  { value: 'moulding', label: 'Moulding' },
  { value: 'tool_room', label: 'Tool Room' },
  { value: 'assembly', label: 'Assembly' },
  { value: 'programming', label: 'Programming' },
  { value: 'designing', label: 'Designing' }
];

const SUB_CATEGORIES = [
  { value: 'fixture', label: 'Fixture' },
  { value: 'mould', label: 'Mould' },
  { value: 'production', label: 'Production' }
];

const StartWork = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [machines, setMachines] = useState([]);
  const [operators, setOperators] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill from URL params (Dashboard idle-machine click)
  const prefilledMachineId = searchParams.get('machine_id') || '';
  const prefilledMachineName = searchParams.get('machine_name') || '';
  const prefilledCategoryRaw = (searchParams.get('category') || '').toLowerCase();
  const normalizeCategory = (c) => {
    if (!c) return '';
    if (c === 'cnc' || c === 'cnc_lathe' || c.includes('cnc')) return 'cnc_lathe';
    if (c.includes('vmc')) return 'vmc';
    if (c.includes('mould') || c.includes('mold')) return 'moulding';
    return c;
  };
  const prefilledCategory = normalizeCategory(prefilledCategoryRaw);

  const [formData, setFormData] = useState({
    operator_type: 'me',
    operator_id: '',
    operator_name: '',
    category: prefilledCategory,
    sub_category: '',
    machine_id: prefilledMachineId,
    job_id: '',
    job_details: '',
    quantity: '',
    cycle_time: '',
    spindle_rpm: '',
    feed_rate: '',
    setting_time: '',
    estimated_completion: '',
    remarks: '',
    image: null
  });

  useEffect(() => {
    fetchData();
    // If category was prefilled and is a machine-bound category, fetch its machines
    if (prefilledCategory && ['cnc_lathe', 'vmc', 'moulding'].includes(prefilledCategory)) {
      axios.get(`${API_URL}/api/machines/category/${prefilledCategory}`)
        .then(({ data }) => setMachines(Array.isArray(data) ? data : []))
        .catch(() => {});
      // Notify user that auto-fill happened
      if (prefilledMachineName) {
        toast.success(`${prefilledMachineName} pre-selected from Dashboard`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      const [machinesRes, operatorsRes, jobsRes] = await Promise.all([
        axios.get(`${API_URL}/api/machines`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/operators`).catch(() => axios.get(`${API_URL}/api/users/assignable`).catch(() => ({ data: [] }))),
        axios.get(`${API_URL}/api/jobs/available`).catch(() => ({ data: [] }))
      ]);
      setMachines(Array.isArray(machinesRes.data) ? machinesRes.data : []);
      setOperators(Array.isArray(operatorsRes.data) ? operatorsRes.data : []);
      setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = async (category) => {
    setFormData({ ...formData, category, machine_id: '', sub_category: '' });
    if (['cnc_lathe', 'vmc', 'moulding'].includes(category)) {
      try {
        const { data } = await axios.get(`${API_URL}/api/machines/category/${category}`);
        setMachines(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error fetching machines:', error);
      }
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, image: file });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const payload = new FormData();
      
      // Determine operator name
      let operatorName = '';
      if (formData.operator_type === 'me') {
        operatorName = user?.name || '';
      } else if (formData.operator_type === 'select') {
        const selectedOp = operators.find(o => o.user_id === formData.operator_id);
        operatorName = selectedOp?.name || '';
      } else {
        operatorName = formData.operator_name;
      }

      payload.append('operator_name', operatorName);
      payload.append('category', formData.category);
      if (formData.sub_category) payload.append('sub_category', formData.sub_category);
      if (formData.machine_id) payload.append('machine_id', formData.machine_id);
      if (formData.job_id) payload.append('job_id', formData.job_id);
      payload.append('job_details', formData.job_details);
      if (formData.quantity) payload.append('quantity', formData.quantity);
      if (formData.cycle_time) {
        // Convert HH:MM:SS (or MM:SS) to seconds
        const parts = formData.cycle_time.split(':').map(p => parseInt(p, 10) || 0);
        let secs;
        if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
        else secs = parts[0] || 0;
        payload.append('cycle_time', String(secs));
      }
      if (formData.category === 'cnc' || formData.category === 'cnc_lathe') {
        if (formData.spindle_rpm) payload.append('spindle_rpm', formData.spindle_rpm);
        if (formData.feed_rate) payload.append('feed_rate', formData.feed_rate);
      }
      if (formData.setting_time) payload.append('setting_time', formData.setting_time);
      if (formData.estimated_completion) payload.append('estimated_completion', formData.estimated_completion);
      if (formData.remarks) payload.append('remarks', formData.remarks);
      if (formData.image) payload.append('image', formData.image);

      await axios.post(`${API_URL}/api/production/start`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Work started successfully!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start work');
    } finally {
      setSubmitting(false);
    }
  };

  const needsMachine = ['cnc_lathe', 'vmc', 'moulding'].includes(formData.category);
  const needsSubCategory = ['programming', 'designing'].includes(formData.category);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="start-work-page">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-3xl font-extrabold tracking-tight">Start Work</h1>
      </div>

      <Card className="border border-border max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5 text-emerald-500" />
            New Work Entry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Operator Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Operator</Label>
              <RadioGroup
                value={formData.operator_type}
                onValueChange={(v) => setFormData({ ...formData, operator_type: v })}
                className="flex flex-wrap gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="me" id="me" />
                  <Label htmlFor="me" className="cursor-pointer">Me ({user?.name})</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="select" id="select" />
                  <Label htmlFor="select" className="cursor-pointer">Select User</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="manual" id="manual" />
                  <Label htmlFor="manual" className="cursor-pointer">Manual Entry</Label>
                </div>
              </RadioGroup>

              {formData.operator_type === 'select' && (
                <Select value={formData.operator_id} onValueChange={(v) => setFormData({ ...formData, operator_id: v })}>
                  <SelectTrigger data-testid="operator-select">
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map(op => (
                      <SelectItem key={op.user_id} value={op.user_id}>{op.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {formData.operator_type === 'manual' && (
                <Input
                  placeholder="Enter operator name"
                  value={formData.operator_name}
                  onChange={(e) => setFormData({ ...formData, operator_name: e.target.value })}
                  data-testid="operator-name-input"
                />
              )}
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={handleCategoryChange}>
                <SelectTrigger data-testid="category-select">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sub Category (for Programming/Designing) */}
            {needsSubCategory && (
              <div className="space-y-2">
                <Label>Sub Category *</Label>
                <Select value={formData.sub_category} onValueChange={(v) => setFormData({ ...formData, sub_category: v })}>
                  <SelectTrigger data-testid="sub-category-select">
                    <SelectValue placeholder="Select sub-category" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUB_CATEGORIES.map(sub => (
                      <SelectItem key={sub.value} value={sub.value}>{sub.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Machine Selection */}
            {needsMachine && (
              <div className="space-y-2">
                <Label>Machine *</Label>
                <Select value={formData.machine_id} onValueChange={(v) => setFormData({ ...formData, machine_id: v })}>
                  <SelectTrigger data-testid="machine-select">
                    <SelectValue placeholder="Select machine" />
                  </SelectTrigger>
                  <SelectContent>
                    {machines.map(m => (
                      <SelectItem key={m.machine_id} value={m.machine_id}>
                        {m.name || m.machine_name} {m.status === 'running' ? '(Running)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Job Selection */}
            <div className="space-y-2">
              <Label>Select Job (Optional)</Label>
              <Select value={formData.job_id} onValueChange={(v) => setFormData({ ...formData, job_id: v })}>
                <SelectTrigger data-testid="job-select">
                  <SelectValue placeholder="Select job or enter manually below" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map(job => (
                    <SelectItem key={job.job_id} value={job.job_id}>
                      {job.job_details || job.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Job Details */}
            <div className="space-y-2">
              <Label htmlFor="job_details">Job Details *</Label>
              <Textarea
                id="job_details"
                value={formData.job_details}
                onChange={(e) => setFormData({ ...formData, job_details: e.target.value })}
                placeholder="Describe the work to be done"
                rows={3}
                required
                data-testid="job-details-input"
              />
            </div>

            {/* Quantity and Times */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Target Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="e.g., 100"
                  data-testid="quantity-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cycle_time">Cycle Time</Label>
                <Input
                  id="cycle_time"
                  value={formData.cycle_time}
                  onChange={(e) => setFormData({ ...formData, cycle_time: e.target.value })}
                  placeholder="HH:MM:SS"
                  data-testid="cycle-time-input"
                />
              </div>
            </div>

            {(formData.category === 'cnc' || formData.category === 'cnc_lathe') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="spindle_rpm">🔄 Spindle RPM <span className="text-red-500">*</span></Label>
                  <Input
                    id="spindle_rpm"
                    type="number"
                    min="0"
                    value={formData.spindle_rpm}
                    onChange={(e) => setFormData({ ...formData, spindle_rpm: e.target.value })}
                    placeholder="e.g., 2500"
                    required
                    data-testid="spindle-rpm-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feed_rate">📏 Feed Rate (mm/min) <span className="text-red-500">*</span></Label>
                  <Input
                    id="feed_rate"
                    type="number"
                    min="0"
                    value={formData.feed_rate}
                    onChange={(e) => setFormData({ ...formData, feed_rate: e.target.value })}
                    placeholder="e.g., 150"
                    required
                    data-testid="feed-rate-input"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="setting_time">Setting Time (min)</Label>
                <Input
                  id="setting_time"
                  type="number"
                  min="0"
                  value={formData.setting_time}
                  onChange={(e) => setFormData({ ...formData, setting_time: e.target.value })}
                  placeholder="e.g., 30"
                  data-testid="setting-time-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimated_completion">Est. Completion</Label>
                <Input
                  id="estimated_completion"
                  type="datetime-local"
                  value={formData.estimated_completion}
                  onChange={(e) => setFormData({ ...formData, estimated_completion: e.target.value })}
                  data-testid="est-completion-input"
                />
              </div>
            </div>

            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Image (Optional)</Label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded cursor-pointer hover:bg-muted/50 transition-colors">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {formData.image ? formData.image.name : 'Click to upload image'}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    data-testid="image-upload"
                  />
                </label>
              </div>
            </div>

            {/* Remarks */}
            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                placeholder="Any additional notes"
                rows={2}
                data-testid="remarks-input"
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate('/dashboard')} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700" data-testid="submit-start-work">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                Start Work
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default StartWork;
