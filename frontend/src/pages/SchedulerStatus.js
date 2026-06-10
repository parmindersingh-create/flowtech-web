import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Loader2, Clock, Play, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const SchedulerStatus = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/scheduler/status`);
      setStatus(data);
    } catch { setStatus(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleTriggerAutoEnd = async () => {
    setTriggering(true);
    try {
      await axios.post(`${API}/api/scheduler/trigger-auto-end`);
      toast.success('Auto-end triggered successfully');
      fetchStatus();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to trigger auto-end');
    } finally { setTriggering(false); }
  };

  return (
    <div className="space-y-4" data-testid="scheduler-page">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
          <Clock className="w-8 h-8" /> Scheduler Status
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchStatus} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
          <Button onClick={handleTriggerAutoEnd} disabled={triggering} data-testid="trigger-auto-end-btn">
            {triggering ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            Trigger Auto-End Now
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
      ) : !status ? (
        <Card className="border border-red-200"><CardContent className="p-6 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-red-500 mb-2" />
          <p className="text-muted-foreground">Could not fetch scheduler status. You may not have admin access.</p>
        </CardContent></Card>
      ) : (
        <>
          {/* Status Card */}
          <Card className={`border ${status.running ? 'border-emerald-200' : 'border-red-200'}`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${status.running ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  {status.running ? <CheckCircle className="w-7 h-7 text-emerald-600" /> : <AlertTriangle className="w-7 h-7 text-red-600" />}
                </div>
                <div>
                  <p className="text-lg font-bold">{status.running ? 'Scheduler Running' : 'Scheduler Stopped'}</p>
                  <p className="text-sm text-muted-foreground">Timezone: {status.timezone || 'Asia/Kolkata'}</p>
                </div>
                <Badge className={`ml-auto border-none text-sm px-4 py-1 ${status.running ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {status.running ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Scheduled Jobs */}
          {status.jobs?.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Scheduled Jobs</h2>
              {status.jobs.map((job, i) => (
                <Card key={job.id || i} className="border" data-testid={`scheduler-job-${i}`}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{job.id || `Job ${i + 1}`}</p>
                      <p className="text-sm text-muted-foreground">{job.trigger || '-'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Next Run</p>
                      <p className="font-mono text-sm font-medium">{job.next_run || '-'}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Shift Schedule Info */}
          <Card className="border">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold">Shift Schedule</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs font-bold uppercase text-amber-600 mb-1">Morning Shift</p>
                  <p className="font-mono font-bold">8:00 AM → 8:00 PM</p>
                  <p className="text-xs text-muted-foreground mt-1">Auto-end at 8:00 PM</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-xs font-bold uppercase text-blue-600 mb-1">Night Shift</p>
                  <p className="font-mono font-bold">8:00 PM → 6:00 AM</p>
                  <p className="text-xs text-muted-foreground mt-1">Auto-end at 6:00 AM</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default SchedulerStatus;
