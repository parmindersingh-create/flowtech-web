import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Search, Loader2, ChevronLeft, ChevronRight, Shield, User, MoreVertical,
  UserCheck, Ban, RefreshCw, Trash2, AlertTriangle, CheckCircle, XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const ITEMS_PER_PAGE = 20;

const ALL_ROLES = [
  { value: 'Admin', label: 'Admin', icon: 'shield', color: 'bg-red-100 text-red-700', warning: true },
  { value: 'Supervisor', label: 'Supervisor', icon: 'briefcase', color: 'bg-amber-100 text-amber-700' },
  { value: 'Team Lead', label: 'Team Lead', icon: 'users', color: 'bg-orange-100 text-orange-700' },
  { value: 'Operator (VMC)', label: 'Operator (VMC)', icon: 'cog', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'Operator (CNC)', label: 'Operator (CNC)', icon: 'wrench', color: 'bg-blue-100 text-blue-700' },
  { value: 'Operator (Moulding)', label: 'Operator (Moulding)', icon: 'factory', color: 'bg-purple-100 text-purple-700' },
  { value: 'Designer', label: 'Designer', icon: 'ruler', color: 'bg-pink-100 text-pink-700' },
  { value: 'Programmer', label: 'Programmer', icon: 'code', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'Store Manager', label: 'Store Manager', icon: 'package', color: 'bg-teal-100 text-teal-700' },
  { value: 'Quality Inspector', label: 'Quality Inspector', icon: 'search', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'Viewer', label: 'Viewer', icon: 'eye', color: 'bg-gray-100 text-gray-600' },
];

const FILTER_ROLES = ['Admin', 'Supervisor', 'Team Lead', 'Operator', 'Designer', 'Programmer', 'Store Manager', 'Quality Inspector', 'Viewer', 'pending'];

const Users = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingUsers, setPendingUsers] = useState([]);

  useEffect(() => { fetchUsers(); fetchStats(); }, []);

  const fetchUsers = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/users`);
      const all = Array.isArray(data) ? data : [];
      setUsers(all);
      setPendingUsers(all.filter(u => u.role === 'pending' || u.role === 'Pending' || !u.role));
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    } finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/users/stats`);
      setStats(data);
    } catch (error) { console.error('Error fetching stats:', error); }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser || !selectedRole) return;
    setSubmitting(true);
    try {
      // Try spec endpoint first, fallback to body-based
      await axios.put(`${API_URL}/api/users/${selectedUser.user_id}/role`, { role: selectedRole })
        .catch(() => axios.put(`${API_URL}/api/users/role`, { user_id: selectedUser.user_id, role: selectedRole }));
      toast.success(`Role updated to ${selectedRole}`);
      setIsRoleDialogOpen(false);
      fetchUsers();
      fetchStats();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update role');
    } finally { setSubmitting(false); }
  };

  const handleApproveUser = async (u, role) => {
    try {
      await axios.put(`${API_URL}/api/users/${u.user_id}/role`, { role })
        .catch(() => axios.put(`${API_URL}/api/users/role`, { user_id: u.user_id, role }));
      toast.success(`${u.name} approved as ${role}`);
      fetchUsers();
      fetchStats();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve');
    }
  };

  const handleBlockUser = async (u) => {
    const action = u.is_blocked ? 'unblock' : 'block';
    if (!window.confirm(`${action} ${u.name}?`)) return;
    try {
      await axios.put(`${API_URL}/api/users/${u.user_id}/block`, { is_blocked: !u.is_blocked });
      toast.success(`User ${action}ed`);
      fetchUsers();
    } catch (error) { toast.error(error.response?.data?.detail || `Failed to ${action}`); }
  };

  const handleResetRole = async (u) => {
    if (!window.confirm('Reset role to pending?')) return;
    try {
      await axios.post(`${API_URL}/api/users/${u.user_id}/reset-role`);
      toast.success('Role reset');
      fetchUsers(); fetchStats();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API_URL}/api/users/${u.user_id}`);
      toast.success('User deleted');
      fetchUsers(); fetchStats();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
  };

  const filteredUsers = users.filter(u => {
    const s = search.toLowerCase();
    const matchS = (u.name || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s);
    const matchR = roleFilter === 'all' || (u.role || 'pending').toLowerCase().includes(roleFilter.toLowerCase());
    return matchS && matchR;
  });

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const getRoleConfig = (role) => {
    const r = (role || '').toLowerCase();
    const found = ALL_ROLES.find(ar => ar.value.toLowerCase() === r);
    if (found) return found;
    if (r === 'operator') return { value: 'Operator', label: 'Operator', color: 'bg-emerald-100 text-emerald-700' };
    if (r === 'store') return { value: 'Store', label: 'Store Manager', color: 'bg-teal-100 text-teal-700' };
    if (r === 'pending' || !r) return { value: 'pending', label: 'Pending Approval', color: 'bg-yellow-100 text-yellow-700' };
    return { value: role, label: role, color: 'bg-gray-100 text-gray-600' };
  };

  const openRoleDialog = (u) => {
    setSelectedUser(u);
    setSelectedRole(u.role || 'Viewer');
    setIsRoleDialogOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="users-page">
      <h1 className="text-3xl font-extrabold tracking-tight">User Management</h1>

      {/* Pending Approvals */}
      {pendingUsers.length > 0 && (
        <Card className="border border-amber-300 bg-amber-50/30" data-testid="pending-approvals-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h2 className="font-semibold text-lg">Pending Approvals ({pendingUsers.length})</h2>
            </div>
            <div className="space-y-2">
              {pendingUsers.map((u, i) => (
                <div key={u.user_id || i} className="flex items-center justify-between p-3 bg-background rounded border border-border">
                  <div className="flex items-center gap-3">
                    {u.picture ? (
                      <img src={u.picture} alt={u.name} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 bg-muted flex items-center justify-center rounded-full">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openRoleDialog(u)} data-testid={`approve-user-${i}`}>
                      <CheckCircle className="w-3 h-3 mr-1" /> Assign Role
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteUser(u)} data-testid={`reject-user-${i}`}>
                      <XCircle className="w-3 h-3 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border border-border"><CardContent className="p-4 text-center"><p className="text-2xl font-extrabold">{stats.total || users.length}</p><p className="text-sm text-muted-foreground">Total Users</p></CardContent></Card>
          <Card className="border border-border"><CardContent className="p-4 text-center"><p className="text-2xl font-extrabold text-emerald-600">{stats.online || 0}</p><p className="text-sm text-muted-foreground">Online Now</p></CardContent></Card>
          <Card className="border border-border"><CardContent className="p-4 text-center"><p className="text-2xl font-extrabold text-amber-600">{stats.pending || pendingUsers.length}</p><p className="text-sm text-muted-foreground">Pending Approval</p></CardContent></Card>
          <Card className="border border-border"><CardContent className="p-4 text-center"><p className="text-2xl font-extrabold text-red-600">{stats.blocked || 0}</p><p className="text-sm text-muted-foreground">Blocked</p></CardContent></Card>
        </div>
      )}

      {/* Filters + Pagination */}
      <Card className="border border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search users..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="pl-10" data-testid="search-input" />
              </div>
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[170px]" data-testid="role-filter">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {FILTER_ROLES.map(r => <SelectItem key={r} value={r.toLowerCase()}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredUsers.length)} of {filteredUsers.length}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm font-medium">{currentPage}/{totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">User</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Email</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Role</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Joined</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : paginatedUsers.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><User className="w-12 h-12 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No users found</p></TableCell></TableRow>
            ) : (
              paginatedUsers.map((u, index) => {
                const rc = getRoleConfig(u.role);
                return (
                  <TableRow key={u.user_id || index} className={`table-row-hover ${u.is_blocked ? 'bg-red-50/50' : ''}`} data-testid={`user-row-${index}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {u.picture ? (
                          <img src={u.picture} alt={u.name} className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 bg-muted flex items-center justify-center rounded-full">
                            {u.role?.toLowerCase() === 'admin' ? <Shield className="w-4 h-4 text-primary" /> : <User className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">{u.name}</span>
                          {u.is_online && <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block ml-2" />}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge
                        className={`border-none cursor-pointer hover:opacity-80 transition-opacity ${rc.color}`}
                        onClick={() => openRoleDialog(u)}
                        data-testid={`role-badge-${index}`}
                      >
                        {rc.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {u.is_blocked ? (
                        <Badge variant="destructive" className="border-none">Blocked</Badge>
                      ) : u.is_online ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-none">Online</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Offline</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {u.created_at ? format(new Date(u.created_at), 'MMM dd, yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openRoleDialog(u)}>
                            <UserCheck className="w-4 h-4 mr-2" /> Change Role
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleBlockUser(u)}>
                            <Ban className="w-4 h-4 mr-2" /> {u.is_blocked ? 'Unblock' : 'Block'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResetRole(u)}>
                            <RefreshCw className="w-4 h-4 mr-2" /> Reset Role
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteUser(u)} className="text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Change Role Dialog - Full 11 roles */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded">
              {selectedUser?.picture ? (
                <img src={selectedUser.picture} alt={selectedUser.name} className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 bg-muted flex items-center justify-center rounded-full">
                  <User className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-medium">{selectedUser?.name}</p>
                <p className="text-xs text-muted-foreground">{selectedUser?.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Select Role</Label>
              <div className="grid grid-cols-1 gap-1.5 max-h-[300px] overflow-y-auto">
                {ALL_ROLES.map((role) => (
                  <button
                    key={role.value}
                    onClick={() => setSelectedRole(role.value)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                      selectedRole === role.value
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-primary/30 hover:bg-muted/30'
                    }`}
                    data-testid={`role-option-${role.value.toLowerCase().replace(/[() ]/g, '-')}`}
                  >
                    <Badge className={`border-none text-xs ${role.color}`}>{role.label}</Badge>
                    {role.warning && selectedRole === role.value && (
                      <span className="text-xs text-red-500 ml-auto flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Full access
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateRole} disabled={submitting || !selectedRole} data-testid="save-role-btn">
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {selectedUser?.role === 'pending' || !selectedUser?.role ? 'Approve & Assign' : 'Update Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
