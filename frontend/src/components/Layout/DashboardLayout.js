import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import ErrorBoundary from '../ErrorBoundary';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import VoiceCommand from '../VoiceCommand';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Factory,
  LayoutDashboard,
  Briefcase,
  Cpu,
  Package,
  Wrench,
  Ruler,
  ClipboardList,
  Users,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Tv,
  User,
  Play,
  Square,
  Activity,
  AlertTriangle,
  Bell,
  BarChart3,
  AlertCircle,
  Settings,
  TrendingUp,
  BookOpen,
  Layers,
  Brain,
  Timer,
  UserCheck,
  Banknote,
  CalendarClock
} from 'lucide-react';

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [];
  
  // Check user role (normalize to lowercase for robustness)
  const roleLower = (user?.role || '').toLowerCase();
  const isSuperAdmin = roleLower === 'super_admin';
  const isAdmin = isSuperAdmin || roleLower === 'admin' || roleLower === 'manager' || roleLower === 'hr' || user?.is_admin === true;
  const isTL = roleLower === 'tl' || roleLower === 'team_lead' || roleLower === 'team lead' || roleLower === 'supervisor';
  const isAdminOrTL = isAdmin || isTL;
  // Shop-floor restricted roles — only get Start Work + Breakdown + My Attendance
  const RESTRICTED_SET = new Set([
    'operator_vmc', 'operator_cnc', 'operator_moulding',
    'programmer_vmc', 'programmer_cnc',
    'fitter', 'general_fitter', 'polisher', 'die_maker', 'turner',
  ]);
  const isRestricted = !isAdminOrTL && RESTRICTED_SET.has(roleLower);

  if (isRestricted) {
    navItems.push(
      { path: '/dashboard/start-work', icon: Play, label: 'Start Work' },
      { path: '/dashboard/breakdown', icon: AlertTriangle, label: 'Breakdown' },
      { path: '/dashboard/my-attendance', icon: UserCheck, label: 'My Attendance' },
    );
  } else {
    // All non-restricted users see these
    navItems.push(
      { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/dashboard/start-work', icon: Play, label: 'Start Work' },
      { path: '/dashboard/end-work', icon: Square, label: 'End Work' },
      { path: '/dashboard/active-work', icon: Activity, label: 'Active Work' },
      { path: '/dashboard/my-attendance', icon: UserCheck, label: 'My Attendance' },
    );
  }

  // Admin & TL see full menu
  if (isAdminOrTL) {
    navItems.push(
      { path: '/dashboard/jobs', icon: Briefcase, label: 'Jobs' },
      { path: '/dashboard/machines', icon: Cpu, label: 'Machines' },
      { path: '/dashboard/breakdown', icon: AlertTriangle, label: 'Breakdown' },
    );
  }

  // Non-admin non-restricted: show storage & tools. Restricted roles skip entirely.
  if (!isRestricted) {
    navItems.push(
      { path: '/dashboard/storage', icon: Package, label: 'Storage' },
      { path: '/dashboard/tools', icon: Wrench, label: 'Tools & Inserts' },
      { path: '/dashboard/moulds', icon: Layers, label: 'Moulds' },
    );
  }

  // Admin & TL see production, reports, parts
  if (isAdminOrTL) {
    navItems.push(
      { path: '/dashboard/production', icon: ClipboardList, label: 'Production' },
      { path: '/dashboard/daily-production', icon: BarChart3, label: 'Daily Production' },
      { path: '/dashboard/notifications', icon: Bell, label: 'Notifications' },
      { path: '/dashboard/reports', icon: BarChart3, label: 'Reports' },
      { path: '/dashboard/low-stock', icon: AlertCircle, label: 'Low Stock' },
      { path: '/dashboard/parts-library', icon: BookOpen, label: 'Parts Library' },
      { path: '/dashboard/assemblies', icon: Layers, label: 'Assemblies' },
    );
  }

  // Admin only
  if (isAdmin) {
    navItems.push(
      { path: '/dashboard/attendance', icon: UserCheck, label: 'Attendance' },
      { path: '/dashboard/leave-alerts', icon: CalendarClock, label: 'Leave & Alerts' },
      { path: '/dashboard/salary', icon: Banknote, label: 'Salary' },
      { path: '/dashboard/ai-audit', icon: Brain, label: 'AI Audit' },
      { path: '/dashboard/scheduler', icon: Timer, label: 'Scheduler' },
      { path: '/dashboard/operator-stats', icon: TrendingUp, label: 'Operator Stats' },
      { path: '/dashboard/manage-users', icon: Users, label: 'Manage Users' },
    );
  }

  // All non-restricted users see settings
  if (!isRestricted) {
    navItems.push(
      { path: '/dashboard/settings', icon: Settings, label: 'Settings' },
    );
  }

  const NavItem = ({ item }) => {
    const isActive = location.pathname === item.path || 
      (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
    
    return (
      <NavLink
        to={item.path}
        className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors border-l-2 ${
          isActive
            ? 'bg-primary/10 text-primary border-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent'
        }`}
        onClick={() => setSidebarOpen(false)}
        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <item.icon className="w-5 h-5" strokeWidth={2} />
        <span>{item.label}</span>
      </NavLink>
    );
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-56 bg-card border-r border-border transform transition-transform lg:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary flex items-center justify-center">
                <Factory className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <span className="font-extrabold tracking-tight block text-sm">VMC Job Shop</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
              data-testid="close-sidebar-btn"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-2 overflow-y-auto">
            {navItems.map((item) => (
              <NavItem key={item.path} item={item} />
            ))}
          </nav>

          {/* TV Mode Link */}
          <div className="px-2 py-2 border-t border-border">
            <NavLink
              to="/tv"
              target="_blank"
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded"
              data-testid="tv-mode-link"
            >
              <Tv className="w-5 h-5" strokeWidth={2} />
              <span>TV Display</span>
            </NavLink>
          </div>

          {/* User Section */}
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-2">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 bg-muted flex items-center justify-center rounded-full">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role || 'User'}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between px-4 py-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
              data-testid="open-sidebar-btn"
            >
              <Menu className="w-5 h-5" />
            </Button>

            <div className="flex-1 lg:hidden" />

            <div className="flex items-center gap-3">
              <VoiceCommand />

              <NavLink to="/tv" target="_blank" className="hidden sm:flex">
                <Button variant="outline" size="sm" data-testid="tv-mode-btn">
                  <Tv className="w-4 h-4 mr-2" /> TV Mode
                </Button>
              </NavLink>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2" data-testid="user-menu-btn">
                    {user?.picture ? (
                      <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 bg-muted flex items-center justify-center rounded-full">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <span className="hidden sm:inline text-sm font-medium">{user?.name}</span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                    <p className="text-xs text-primary mt-1 capitalize">{user?.role}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer" data-testid="logout-btn">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 pb-16">
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
