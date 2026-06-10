import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Loader2, Plus, Search, Edit2, KeyRound, UserX, UserCheck, ShieldAlert, Save, Zap, Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { parseApiError } from '../utils/parseApiError';

const API = process.env.REACT_APP_BACKEND_URL;
const ROLE_LABELS = {
  super_admin: 'Super Admin', manager: 'Manager', hr: 'HR', office_staff: 'Office Staff',
  operator_vmc: 'Operator (VMC)', operator_cnc: 'Operator (CNC)', operator_moulding: 'Operator (Moulding)',
  programmer_vmc: 'Programmer (VMC)', programmer_cnc: 'Programmer (CNC)',
  fitter: 'Fitter', general_fitter: 'General Fitter', polisher: 'Polisher', die_maker: 'Die Maker', turner: 'Turner',
};
const labelOf = (r) => ROLE_LABELS[r] || r;

// Minimum APK version must mirror MIN_APK_VERSION on the backend so the
// "outdated" badge in Manage Users reflects what the server enforces.
const MIN_APK_VERSION = '1.1.44';
const _versionTuple = (v) => (String(v || '').match(/\d+/g) || ['0']).slice(0, 4).map(Number);
const isOutdatedAPK = (version, client) => {
  if (!version) return false;
  if (client && client !== 'apk') return false;
  const a = _versionTuple(version);
  const b = _versionTuple(MIN_APK_VERSION);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
};
const apkVersionBadgeClass = (version, client) =>
  isOutdatedAPK(version, client)
    ? 'border-red-300 bg-red-50 text-red-700'
    : 'border-emerald-300 bg-emerald-50 text-emerald-700';
const formatLastLogin = (iso) => {
  if (!iso) return 'never';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const now = Date.now();
    const diff = (now - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' });
  } catch { return iso; }
};

const ManageUsers = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | active | inactive

  // Dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [quickTarget, setQuickTarget] = useState(null);

  // Forms
  const [addForm, setAddForm] = useState({ name: '', username: '', password: '', role: 'operator_vmc', email: '' });
  const [editForm, setEditForm] = useState({ name: '', username: '', role: '', email: '', is_active: true });
  const [resetPwd, setResetPwd] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [quickForm, setQuickForm] = useState({ username: '', password: '', role: 'operator_vmc' });
  const [submitting, setSubmitting] = useState(false);

  // Email config status (turns the "Send by email" UI on/off)
  const [emailConfigured, setEmailConfigured] = useState(false);
  // Re-send credentials dialog
  const [emailTarget, setEmailTarget] = useState(null);
  const [emailPwd, setEmailPwd] = useState('');

  // WhatsApp config status + dialog state
  const [waConfigured, setWaConfigured] = useState(false);
  const [waTarget, setWaTarget] = useState(null);
  const [waPwd, setWaPwd] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/users`);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(parseApiError(e, 'Failed to load users'));
    } finally { setLoading(false); }
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/roles`);
      setRoles(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadUsers();
    loadRoles();
    axios.get(`${API}/api/email/status`)
      .then(r => setEmailConfigured(!!r.data?.configured))
      .catch(() => setEmailConfigured(false));
    axios.get(`${API}/api/whatsapp/status`)
      .then(r => setWaConfigured(!!r.data?.configured))
      .catch(() => setWaConfigured(false));
  }, [loadUsers, loadRoles]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter(u => {
      if (filter === 'active' && u.is_active === false) return false;
      if (filter === 'inactive' && u.is_active !== false) return false;
      if (!s) return true;
      return (u.name || '').toLowerCase().includes(s)
        || (u.username || '').toLowerCase().includes(s)
        || (u.email || '').toLowerCase().includes(s)
        || (u.role || '').toLowerCase().includes(s);
    });
  }, [users, search, filter]);

  const isSuperAdmin = ['super_admin', 'admin', 'manager', 'hr'].includes((currentUser?.role || '').toLowerCase());

  // ─── handlers ───
  const submitAdd = async () => {
    if (!addForm.name || !addForm.username || !addForm.password) { toast.error('Name, username & password required'); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/users`, {
        name: addForm.name, username: addForm.username.toLowerCase(),
        password: addForm.password, role: addForm.role, email: addForm.email,
      });
      toast.success('User created');
      setAddOpen(false);
      setAddForm({ name: '', username: '', password: '', role: 'operator_vmc', email: '' });
      loadUsers();
    } catch (e) { toast.error(parseApiError(e, 'Create failed')); }
    finally { setSubmitting(false); }
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    // Block activation if no username assigned
    if (editForm.is_active && (!editForm.username || editForm.username.length < 3)) {
      toast.error('Assign a username before activating this user');
      return;
    }
    setSubmitting(true);
    try {
      const payload = { ...editForm };
      // Don't send blank username — backend will reject "" via regex
      if (!payload.username) delete payload.username;
      await axios.put(`${API}/api/users/${editTarget.user_id}`, payload);
      toast.success('User updated');
      setEditTarget(null);
      loadUsers();
    } catch (e) { toast.error(parseApiError(e, 'Update failed')); }
    finally { setSubmitting(false); }
  };

  const submitReset = async () => {
    if (!resetTarget || !resetPwd) { toast.error('Enter a new password'); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/users/${resetTarget.user_id}/reset-password`, { new_password: resetPwd });
      toast.success(`Password reset for ${resetTarget.username}`);
      setResetTarget(null); setResetPwd('');
    } catch (e) { toast.error(parseApiError(e, 'Reset failed')); }
    finally { setSubmitting(false); }
  };

  const toggleActive = async (u) => {
    setSubmitting(true);
    try {
      await axios.put(`${API}/api/users/${u.user_id}`, { is_active: !(u.is_active === false ? false : true) });
      toast.success(`User ${u.is_active === false ? 'activated' : 'deactivated'}`);
      loadUsers();
    } catch (e) { toast.error(parseApiError(e, 'Action failed')); }
    finally { setSubmitting(false); }
  };

  // Quick Activate — assign username + password + role and activate in one click.
  const generatePassword = () => {
    const adjectives = ['quick', 'happy', 'bright', 'lucky', 'fresh', 'sharp', 'super'];
    const nouns = ['lion', 'sun', 'star', 'wind', 'oak', 'fox', 'wave'];
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    return `${pick(adjectives)}-${pick(nouns)}-${Math.floor(100 + Math.random() * 900)}`;
  };

  const submitSendWhatsApp = async () => {
    if (!waTarget) return;
    if (!waPwd || waPwd.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/users/${waTarget.user_id}/send-whatsapp`, { password: waPwd });
      toast.success(`WhatsApp sent to ${waTarget.phone}`);
      setWaTarget(null);
      setWaPwd('');
    } catch (e) {
      toast.error(parseApiError(e, 'WhatsApp send failed'));
    } finally { setSubmitting(false); }
  };

  const submitSendEmail = async () => {
    if (!emailTarget) return;
    if (!emailPwd || emailPwd.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/users/${emailTarget.user_id}/send-credentials`, { password: emailPwd });
      toast.success(`Credentials emailed to ${emailTarget.email}`);
      setEmailTarget(null);
      setEmailPwd('');
    } catch (e) {
      toast.error(parseApiError(e, 'Email failed'));
    } finally { setSubmitting(false); }
  };

  const submitQuickActivate = async () => {
    if (!quickTarget) return;
    const u = (quickForm.username || '').trim();
    if (!u || !/^[a-z0-9._-]{3,30}$/.test(u)) {
      toast.error('Username must be 3-30 chars: lowercase letters, digits, ._-');
      return;
    }
    if (!quickForm.password || quickForm.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API}/api/users/${quickTarget.user_id}/quick-activate`, {
        username: u,
        password: quickForm.password,
        role: quickForm.role,
      });
      // Tell the admin whether the credentials email + WhatsApp were delivered
      const em = data?.email || {};
      const wa = data?.whatsapp || {};
      const successBits = [];
      const warnBits = [];
      if (em.sent) successBits.push(`email → ${em.to || quickTarget.email}`);
      else if (em.reason && em.reason !== 'no_email_on_user' && em.reason !== 'email_not_configured') warnBits.push(`email: ${em.reason}`);
      if (wa.sent) successBits.push(`WhatsApp → ${wa.to || quickTarget.phone}`);
      else if (wa.reason && wa.reason !== 'no_phone_on_user' && wa.reason !== 'whatsapp_not_configured') warnBits.push(`WhatsApp: ${wa.reason}`);
      if (successBits.length) {
        toast.success(`Activated — sent via ${successBits.join(' + ')}`);
      } else {
        toast.success(data?.message || 'User activated — copy creds manually');
      }
      warnBits.forEach(w => toast.warning(w));
      // Copy credentials to clipboard so admin can paste them to the operator
      try {
        await navigator.clipboard.writeText(`Username: ${u}\nPassword: ${quickForm.password}`);
      } catch { /* clipboard might be blocked */ }
      setQuickTarget(null);
      setQuickForm({ username: '', password: '', role: 'operator_vmc' });
      loadUsers();
    } catch (e) {
      toast.error(parseApiError(e, 'Activation failed'));
    } finally { setSubmitting(false); }
  };

  const submitNewRole = async () => {
    if (!newRoleName.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/roles`, { name: newRoleName });
      toast.success(`Role added: ${newRoleName}`);
      setNewRoleOpen(false); setNewRoleName('');
      loadRoles();
    } catch (e) { toast.error(parseApiError(e, 'Failed to add role')); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4 pb-24" data-testid="manage-users-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Manage Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {users.filter(u => u.is_active !== false).length} active · {users.filter(u => u.is_active === false).length} inactive · {users.length} total
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setNewRoleOpen(true)} data-testid="add-role-btn">
            <ShieldAlert className="w-4 h-4 mr-2" /> Add Role
          </Button>
          {isSuperAdmin && (
            <Button onClick={() => setAddOpen(true)} data-testid="add-user-btn">
              <Plus className="w-4 h-4 mr-2" /> Add User
            </Button>
          )}
        </div>
      </div>

      <Card className="border">
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search name, username, role, email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="users-search" />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs">Username</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Email</TableHead>
              <TableHead className="text-xs">Role</TableHead>
              <TableHead className="text-xs text-center">Status</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Last Login</TableHead>
              <TableHead className="text-xs hidden xl:table-cell">App Version</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No users match</TableCell></TableRow>
            ) : filtered.map((u) => (
              <TableRow key={u.user_id} data-testid={`user-row-${u.username}`}>
                <TableCell className="font-mono text-xs">
                  {u.username ? (
                    <span>{u.username}</span>
                  ) : (
                    <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 text-[10px]">no username</Badge>
                  )}
                </TableCell>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{u.email || '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[11px]">{labelOf(u.role)}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  {u.is_active === false
                    ? <Badge className="bg-slate-200 text-slate-700 border-none text-[11px]">Inactive</Badge>
                    : <Badge className="bg-emerald-100 text-emerald-700 border-none text-[11px]">Active</Badge>}
                </TableCell>
                <TableCell className="text-xs hidden lg:table-cell">
                  {u.last_login_at ? (
                    <div className="flex flex-col">
                      <span className="text-foreground">{formatLastLogin(u.last_login_at)}</span>
                      {u.last_client && (
                        <span className="text-[10px] text-muted-foreground uppercase">{u.last_client}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">never</span>
                  )}
                </TableCell>
                <TableCell className="text-xs hidden xl:table-cell">
                  {u.last_app_version ? (
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] ${apkVersionBadgeClass(u.last_app_version, u.last_client)}`}
                      title={u.last_device_info || ''}
                    >
                      v{u.last_app_version}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground italic">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end flex-wrap">
                    {isSuperAdmin && (
                      <>
                        {(u.is_active === false || !u.username) && (
                          <Button
                            size="sm"
                            className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => {
                              setQuickTarget(u);
                              // Suggest a username from email/name as a starting point
                              const seedFromEmail = (u.email || '').split('@')[0];
                              const seedFromName = (u.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                              const seed = (seedFromEmail || seedFromName || '').slice(0, 30).replace(/[^a-z0-9._-]/g, '');
                              setQuickForm({
                                username: seed,
                                password: '',
                                role: u.role && u.role !== 'super_admin' ? u.role : 'operator_vmc',
                              });
                            }}
                            data-testid={`quick-activate-${u.user_id}`}
                          >
                            <Zap className="w-3.5 h-3.5 mr-1" /> Activate
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditTarget(u); setEditForm({ name: u.name || '', username: u.username || '', role: u.role || 'operator_vmc', email: u.email || '', phone: u.phone || '', is_active: u.is_active !== false }); }} data-testid={`edit-${u.username || u.user_id}`}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setResetTarget(u); setResetPwd(''); }} data-testid={`reset-${u.username || u.user_id}`}>
                          <KeyRound className="w-3.5 h-3.5" />
                        </Button>
                        {emailConfigured && u.username && u.email && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => { setEmailTarget(u); setEmailPwd(generatePassword()); }}
                            title={`Send credentials to ${u.email}`}
                            data-testid={`email-${u.username}`}
                          >
                            <Mail className="w-3.5 h-3.5 text-blue-600" />
                          </Button>
                        )}
                        {waConfigured && u.username && u.phone && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => { setWaTarget(u); setWaPwd(generatePassword()); }}
                            title={`Send WhatsApp to ${u.phone}`}
                            data-testid={`wa-${u.username}`}
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 px-2"
                          onClick={() => toggleActive(u)}
                          disabled={u.user_id === currentUser?.user_id || (!u.username && u.is_active === false)}
                          title={u.user_id === currentUser?.user_id ? 'Cannot deactivate yourself' : (!u.username && u.is_active === false ? 'Use Quick Activate to assign username' : '')}
                          data-testid={`toggle-${u.username || u.user_id}`}
                        >
                          {u.is_active === false
                            ? <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                            : <UserX className="w-3.5 h-3.5 text-red-700" />}
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Add User */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md" data-testid="add-user-dialog">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Full Name *</Label>
              <Input value={addForm.name} onChange={(e) => setAddForm(f => ({ ...f, name: e.target.value }))} data-testid="add-name" /></div>
            <div><Label className="text-xs">Username *</Label>
              <Input value={addForm.username} onChange={(e) => setAddForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))} placeholder="lowercase letters, digits, ._-" data-testid="add-username" /></div>
            <div><Label className="text-xs">Password *</Label>
              <Input type="text" value={addForm.password} onChange={(e) => setAddForm(f => ({ ...f, password: e.target.value }))} placeholder="min 6 chars" data-testid="add-password" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Role *</Label>
                <Select value={addForm.role} onValueChange={(v) => setAddForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger data-testid="add-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => <SelectItem key={r} value={r}>{labelOf(r)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Email (optional)</Label>
                <Input value={addForm.email} onChange={(e) => setAddForm(f => ({ ...f, email: e.target.value }))} data-testid="add-email" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAdd} disabled={submitting} data-testid="add-submit">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />} Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md" data-testid="edit-user-dialog">
          <DialogHeader><DialogTitle>Edit {editTarget?.name || editTarget?.username || 'user'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} data-testid="edit-name" /></div>
            <div>
              <Label className="text-xs">Username {!editTarget?.username && <span className="text-amber-600 font-semibold">(not assigned — required to activate)</span>}</Label>
              <Input
                value={editForm.username}
                onChange={(e) => setEditForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))}
                placeholder="lowercase letters, digits, ._-  (3-30 chars)"
                data-testid="edit-username"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Username is what this user types on the login screen.</p>
            </div>
            <div><Label className="text-xs">Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm(f => ({ ...f, role: v }))}>
                <SelectTrigger data-testid="edit-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => <SelectItem key={r} value={r}>{labelOf(r)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Email</Label>
              <Input value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} data-testid="edit-email" /></div>
            <div>
              <Label className="text-xs">WhatsApp Phone</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+91 9876543210 or 9876543210"
                data-testid="edit-phone"
              />
              <p className="text-[11px] text-muted-foreground mt-1">10-digit India numbers auto-prefix +91. Used for sending login credentials via WhatsApp.</p>
            </div>
            <label className="flex items-center gap-2 text-sm pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
                disabled={!editForm.username || editForm.username.length < 3}
                title={!editForm.username ? 'Assign a username first' : ''}
                data-testid="edit-active"
              />
              Active (can log in)
              {!editForm.username && <span className="text-[11px] text-amber-600">— assign username first</span>}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={submitEdit} disabled={submitting} data-testid="edit-submit">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="max-w-sm" data-testid="reset-password-dialog">
          <DialogHeader><DialogTitle>Reset password for {resetTarget?.username}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs">New Password (min 6 chars)</Label>
            <Input type="text" value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} placeholder="••••••" data-testid="reset-password-input" />
            <p className="text-[11px] text-muted-foreground">User's existing sessions will be invalidated.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button onClick={submitReset} disabled={submitting} data-testid="reset-submit">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />} Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Activate */}
      <Dialog open={!!quickTarget} onOpenChange={(o) => !o && setQuickTarget(null)}>
        <DialogContent className="max-w-md" data-testid="quick-activate-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-emerald-600" /> Quick Activate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 text-xs">
              <div className="font-semibold">{quickTarget?.name || 'Unnamed user'}</div>
              {quickTarget?.email && <div className="text-muted-foreground">{quickTarget.email}</div>}
              <div className="text-[10px] text-emerald-700 mt-0.5">Will set username, password, role and activate in one click.</div>
              {emailConfigured && quickTarget?.email && (
                <div className="text-[10px] text-blue-700 mt-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Credentials will be emailed to <span className="font-semibold">{quickTarget.email}</span>
                </div>
              )}
              {waConfigured && quickTarget?.phone && (
                <div className="text-[10px] text-emerald-700 mt-1 flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" /> WhatsApp will be sent to <span className="font-semibold">{quickTarget.phone}</span>
                </div>
              )}
              {!quickTarget?.email && !quickTarget?.phone && (
                <div className="text-[10px] text-amber-700 mt-1">No email or phone on file — credentials will be copied to your clipboard.</div>
              )}
            </div>
            <div>
              <Label className="text-xs">Username</Label>
              <Input
                value={quickForm.username}
                onChange={(e) => setQuickForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))}
                placeholder="lowercase letters, digits, ._-"
                data-testid="quick-username"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-1">3-30 chars. This is what the user types to log in.</p>
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={quickForm.role} onValueChange={(v) => setQuickForm(f => ({ ...f, role: v }))}>
                <SelectTrigger data-testid="quick-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => <SelectItem key={r} value={r}>{labelOf(r)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Password (min 6 chars)</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={quickForm.password}
                  onChange={(e) => setQuickForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="auto-generate or type"
                  data-testid="quick-password"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 text-xs"
                  onClick={() => setQuickForm(f => ({ ...f, password: generatePassword() }))}
                  data-testid="quick-generate-pwd"
                >Generate</Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Will be copied to your clipboard after Activate.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickTarget(null)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={submitQuickActivate}
              disabled={submitting}
              data-testid="quick-activate-submit"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />} Activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Credentials Email */}
      <Dialog open={!!emailTarget} onOpenChange={(o) => !o && setEmailTarget(null)}>
        <DialogContent className="max-w-md" data-testid="send-email-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-blue-600" /> Email login credentials</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-xs">
              <div className="font-semibold">{emailTarget?.name}</div>
              <div className="text-muted-foreground">To: <span className="font-medium text-foreground">{emailTarget?.email}</span></div>
              <div className="text-muted-foreground">Username: <span className="font-mono text-foreground">{emailTarget?.username}</span></div>
            </div>
            <div>
              <Label className="text-xs">New password to email (min 6 chars)</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={emailPwd}
                  onChange={(e) => setEmailPwd(e.target.value)}
                  placeholder="auto-generated"
                  data-testid="send-email-password"
                />
                <Button type="button" variant="outline" className="shrink-0 text-xs" onClick={() => setEmailPwd(generatePassword())}>
                  Generate
                </Button>
              </div>
              <p className="text-[11px] text-amber-700 mt-1">
                Sending will also <span className="font-semibold">rotate</span> the user's password to this value. Their existing sessions will be invalidated.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailTarget(null)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={submitSendEmail}
              disabled={submitting}
              data-testid="send-email-submit"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />} Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Credentials via WhatsApp */}
      <Dialog open={!!waTarget} onOpenChange={(o) => !o && setWaTarget(null)}>
        <DialogContent className="max-w-md" data-testid="send-whatsapp-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MessageCircle className="w-5 h-5 text-emerald-600" /> Send credentials via WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 text-xs">
              <div className="font-semibold">{waTarget?.name}</div>
              <div className="text-muted-foreground">To: <span className="font-medium text-foreground">{waTarget?.phone}</span></div>
              <div className="text-muted-foreground">Username: <span className="font-mono text-foreground">{waTarget?.username}</span></div>
              <div className="text-[10px] text-amber-700 mt-1">Sandbox: recipient must first message <span className="font-mono">+1 415 523 8886</span> to opt in.</div>
            </div>
            <div>
              <Label className="text-xs">New password to send (min 6 chars)</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={waPwd}
                  onChange={(e) => setWaPwd(e.target.value)}
                  placeholder="auto-generated"
                  data-testid="send-wa-password"
                />
                <Button type="button" variant="outline" className="shrink-0 text-xs" onClick={() => setWaPwd(generatePassword())}>
                  Generate
                </Button>
              </div>
              <p className="text-[11px] text-amber-700 mt-1">
                Sending will also <span className="font-semibold">rotate</span> the user's password to this value. Existing sessions are invalidated.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaTarget(null)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={submitSendWhatsApp}
              disabled={submitting}
              data-testid="send-wa-submit"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MessageCircle className="w-4 h-4 mr-2" />} Send WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Role */}
      <Dialog open={newRoleOpen} onOpenChange={setNewRoleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Custom Role</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs">Role Name</Label>
            <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. quality_check" data-testid="new-role-name" />
            <p className="text-[11px] text-muted-foreground">Will be saved as lowercase with underscores.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewRoleOpen(false)}>Cancel</Button>
            <Button onClick={submitNewRole} disabled={submitting || !newRoleName.trim()} data-testid="new-role-submit">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />} Add Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageUsers;
