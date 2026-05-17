import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebarState } from '@/contexts/SidebarContext';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  FileText,
  Users,
  Settings,
  CreditCard,
  Award,
  ClipboardList,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BookMarked,
  Bell,
  TrendingUp,
  MessageCircle,
  Building,
  UserCog,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { NotificationBell } from './NotificationBell';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ROUTE_LOADERS } from '@/lib/routePrefetch';

const prefetchRoute = (path: string) => {
  const loader = ROUTE_LOADERS[path];
  if (loader) loader();
};

const studentNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/student/dashboard' },
  { icon: BookOpen, label: 'Meus Cursos', path: '/student/courses' },
  { icon: TrendingUp, label: 'Notas', path: '/student/grades' },
  { icon: CreditCard, label: 'Pagamentos', path: '/student/payments' },
  { icon: Award, label: 'Certificados', path: '/student/certificates' },
];

const professorNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/professor' },
  { icon: BookMarked, label: 'Cursos', path: '/professor/courses' },
  { icon: ClipboardList, label: 'Correções', path: '/professor/submissions' },
];

const adminNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
  { icon: BookMarked, label: 'Cursos', path: '/admin/courses' },
  { icon: Users, label: 'Usuários', path: '/admin/users' },
  { icon: GraduationCap, label: 'Matrículas', path: '/admin/enrollments' },
  { icon: FileText, label: 'Declaração', path: '/admin/declaration' },
  { icon: UserCog, label: 'Progresso Alunos', path: '/admin/student-progress' },
  { icon: Building, label: 'Polos', path: '/admin/polos' },
  { icon: CreditCard, label: 'Financeiro', path: '/admin/finance' },
  { icon: Settings, label: 'Configurações', path: '/admin/settings' },
];

const poloNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/polo' },
  { icon: GraduationCap, label: 'Matrículas', path: '/polo/enrollments' },
  { icon: CreditCard, label: 'Pagamentos', path: '/polo/student-payments' },
  { icon: TrendingUp, label: 'Comissões', path: '/polo/commissions' },
];

export function Sidebar() {
  const { role, signOut, user } = useAuth();
  const { settings } = useSystemSettings();
  const location = useLocation();
  const { collapsed, setCollapsed } = useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const navItems = role === 'admin' 
    ? adminNavItems 
    : role === 'professor' 
      ? professorNavItems 
      : role === 'polo'
        ? poloNavItems
        : studentNavItems;

  const getRoleLabel = () => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'professor': return 'Professor';
      case 'polo': return 'Polo';
      default: return 'Aluno';
    }
  };

  const SidebarContent = ({ isSheet = false }: { isSheet?: boolean }) => (
    <>
      {/* Logo */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border p-4",
        collapsed && !isSheet ? "flex-col gap-2" : "justify-between"
      )}>
        {collapsed && !isSheet ? (
          <>
            {settings.platform_logo_url ? (
              <img 
                src={settings.platform_logo_url} 
                alt={settings.platform_name} 
                className="w-10 h-10 rounded-xl object-contain"
                title={settings.platform_name}
              />
            ) : (
              <div 
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-sidebar-primary to-primary flex items-center justify-center"
                title={settings.platform_name}
              >
                <GraduationCap className="w-6 h-6 text-sidebar-primary-foreground" />
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(false)}
              className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              title="Expandir menu"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {settings.platform_logo_url ? (
                <img 
                  src={settings.platform_logo_url} 
                  alt={settings.platform_name} 
                  className="w-10 h-10 rounded-xl object-contain"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sidebar-primary to-primary flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-sidebar-primary-foreground" />
                </div>
              )}
              <div>
                <h1 className="font-display font-bold text-sidebar-foreground text-lg">{settings.platform_name}</h1>
                <p className="text-xs text-sidebar-foreground/60">Sistema de Ensino</p>
              </div>
            </div>
            {!isSheet && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(true)}
                className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                title="Recolher menu"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}
          </>
        )}
      </div>

      {/* User Info */}
      {(!collapsed || isSheet) && (
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center">
              <span className="text-sidebar-foreground font-medium">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.email}
              </p>
              <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-sidebar-primary/20 text-sidebar-primary mt-1">
                {getRoleLabel()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'sidebar-nav-item',
                isActive && 'active',
                collapsed && !isSheet && 'justify-center px-3'
              )}
              onClick={isSheet ? () => setMobileOpen(false) : undefined}
              onMouseEnter={() => prefetchRoute(item.path)}
              onFocus={() => prefetchRoute(item.path)}
              onTouchStart={() => prefetchRoute(item.path)}
              title={collapsed && !isSheet ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {(!collapsed || isSheet) && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Notifications, Support & Logout */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <Link
          to="/notifications"
          className={cn(
            'sidebar-nav-item',
            location.pathname === '/notifications' && 'active',
            collapsed && !isSheet && 'justify-center px-3'
          )}
          onClick={isSheet ? () => setMobileOpen(false) : undefined}
          title={collapsed && !isSheet ? 'Notificações' : undefined}
        >
          <div className="relative">
            <Bell className="w-5 h-5 flex-shrink-0" />
            <UnreadBadge collapsed={collapsed && !isSheet} />
          </div>
          {(!collapsed || isSheet) && <span>Notificações</span>}
        </Link>
        <a
          href="https://wa.me/message/LWSEFGTD2JQXI1"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'sidebar-nav-item text-green-400 hover:text-green-300 hover:bg-green-500/10',
            collapsed && !isSheet && 'justify-center px-3'
          )}
          onClick={isSheet ? () => setMobileOpen(false) : undefined}
          title={collapsed && !isSheet ? 'Suporte' : undefined}
        >
          <MessageCircle className="w-5 h-5 flex-shrink-0" />
          {(!collapsed || isSheet) && <span>Suporte</span>}
        </a>
        <button
          onClick={signOut}
          className={cn(
            'sidebar-nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10',
            collapsed && !isSheet && 'justify-center px-3'
          )}
          type="button"
          {...(isSheet ? { onClick: () => { setMobileOpen(false); signOut(); } } : { onClick: signOut })}
          title={collapsed && !isSheet ? 'Sair' : undefined}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {(!collapsed || isSheet) && <span>Sair</span>}
        </button>
      </div>
    </>
  );

  // Mobile: use Sheet drawer
  if (isMobile) {
    return (
      <>
        {/* Mobile Header */}
        <div className="fixed top-0 left-0 right-0 h-16 bg-gradient-sidebar border-b border-sidebar-border flex items-center justify-between px-4 z-50">
          <div className="flex items-center gap-3">
            {settings.platform_logo_url ? (
              <img 
                src={settings.platform_logo_url} 
                alt={settings.platform_name} 
                className="w-8 h-8 rounded-lg object-contain"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sidebar-primary to-primary flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-sidebar-primary-foreground" />
              </div>
            )}
            <span className="font-display font-bold text-sidebar-foreground">{settings.platform_name}</span>
          </div>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent 
              side="left" 
              className="w-72 p-0 bg-gradient-sidebar border-sidebar-border"
            >
              <div className="h-full flex flex-col">
                <SidebarContent isSheet />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        {/* Spacer for fixed header */}
        <div className="h-16" />
      </>
    );
  }

  // Desktop: regular sidebar
  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-gradient-sidebar flex flex-col transition-all duration-300 z-50',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      <SidebarContent />
    </aside>
  );
}

function UnreadBadge({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['unread-notifications-count', user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  if (unreadCount === 0) return null;

  return (
    <span className={cn(
      "absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1",
      collapsed && "-top-1 -right-2"
    )}>
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  );
}
