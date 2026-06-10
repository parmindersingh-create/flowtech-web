import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Mic, Send, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const ACTION_ROUTES = {
  show_dashboard: '/dashboard',
  show_production: '/dashboard/production',
  show_daily_production: '/dashboard/daily-production',
  show_tools: '/dashboard/tools',
  show_storage: '/dashboard/storage',
  show_low_stock: '/dashboard/low-stock',
  show_report: '/dashboard/reports',
  show_reports: '/dashboard/reports',
  show_machines: '/dashboard/machines',
  show_jobs: '/dashboard/jobs',
  show_active_work: '/dashboard/active-work',
  show_parts_library: '/dashboard/parts-library',
  show_assemblies: '/dashboard/assemblies',
  show_notifications: '/dashboard/notifications',
  show_users: '/dashboard/users',
  show_operator_stats: '/dashboard/operator-stats',
  show_ai_audit: '/dashboard/ai-audit',
  show_breakdown: '/dashboard/breakdown',
  start_work: '/dashboard/start-work',
  end_work: '/dashboard/end-work',
};

const VoiceCommand = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const handleSend = async () => {
    if (!command.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data } = await axios.post(`${API}/api/ai/voice-command`, { command: command.trim() });
      setResult(data);
      if (data.action && ACTION_ROUTES[data.action]) {
        toast.success(data.message || `Navigating to ${data.action.replace(/_/g, ' ')}`);
        setTimeout(() => {
          navigate(ACTION_ROUTES[data.action]);
          setIsOpen(false);
          setCommand('');
          setResult(null);
        }, 800);
      } else if (data.message) {
        toast.info(data.message);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Command failed');
    } finally { setLoading(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) handleSend();
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} className="relative" data-testid="voice-command-btn" title="Voice Command">
        <Mic className="w-5 h-5" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Mic className="w-5 h-5" /> Voice Command</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Type a command like "show production report", "start work", "show low stock"</p>
            <div className="flex gap-2">
              <Input value={command} onChange={e => setCommand(e.target.value)} onKeyDown={handleKeyDown} placeholder="e.g. show dashboard" className="flex-1" autoFocus data-testid="voice-command-input" />
              <Button onClick={handleSend} disabled={loading || !command.trim()} data-testid="voice-command-send">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            {result && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                {result.action && <p className="font-medium">{result.message || `Action: ${result.action.replace(/_/g, ' ')}`}</p>}
                {result.machine && <p className="text-muted-foreground">Machine: {result.machine}</p>}
                {!result.action && result.message && <p>{result.message}</p>}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {['show dashboard', 'show production', 'show tools', 'show low stock', 'start work', 'end work'].map(cmd => (
                <Button key={cmd} variant="outline" size="sm" className="text-xs" onClick={() => { setCommand(cmd); }}>{cmd}</Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VoiceCommand;
