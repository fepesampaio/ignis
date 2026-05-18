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
  Info,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const navItems =
    role === 'admin'
      ? adminNavItems
      : role === 'professor'
        ? professorNavItems
        : role === 'polo'
          ? poloNavItems
          : studentNavItems;

  const getRoleLabel = () => {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'professor':
        return 'Professor';
      case 'polo':
        return 'Polo';
      default:
        return 'Aluno';
    }
  };

  const SidebarContent = ({ isSheet = false }: { isSheet?: boolean }) => (
    <>
      <div
        className={cn(
          'flex items-center border-b border-sidebar-border p-4',
          collapsed && !isSheet ? 'flex-col gap-2' : 'justify-between'
        )}
      >
        {collapsed && !isSheet ? (
          <>
            {settings.platform_logo_url ? (
              <img
                src={settings.platform_logo_url}
                alt={settings.platform_name}
                className="h-10 w-10 rounded-xl object-contain"
                title={settings.platform_name}
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary to-primary"
                title={settings.platform_name}
              >
                <GraduationCap className="h-6 w-6 text-sidebar-primary-foreground" />
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(false)}
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              title="Expandir menu"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {settings.platform_logo_url ? (
                <img
                  src={settings.platform_logo_url}
                  alt={settings.platform_name}
                  className="h-10 w-10 rounded-xl object-contain"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary to-primary">
                  <GraduationCap className="h-6 w-6 text-sidebar-primary-foreground" />
                </div>
              )}
              <div>
                <h1 className="font-display text-lg font-bold text-sidebar-foreground">
                  {settings.platform_name}
                </h1>
                <p className="text-xs text-sidebar-foreground/60">Sistema de Ensino</p>
              </div>
            </div>
            {!isSheet && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(true)}
                className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                title="Recolher menu"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
          </>
        )}
      </div>

      {(!collapsed || isSheet) && (
        <div className="border-b border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-accent">
              <span className="font-medium text-sidebar-foreground">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{user?.email}</p>
              <span className="mt-1 inline-block rounded-full bg-sidebar-primary/20 px-2 py-0.5 text-xs text-sidebar-primary">
                {getRoleLabel()}
              </span>
            </div>
          </div>
        </div>
      )}

      <nav className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-4">
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
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {(!collapsed || isSheet) && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-4">
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
            <Bell className="h-5 w-5 flex-shrink-0" />
            <UnreadBadge collapsed={collapsed && !isSheet} />
          </div>
          {(!collapsed || isSheet) && <span>Notificações</span>}
        </Link>

        <Link
          to="/about"
          className={cn(
            'sidebar-nav-item',
            location.pathname === '/about' && 'active',
            collapsed && !isSheet && 'justify-center px-3'
          )}
          onClick={isSheet ? () => setMobileOpen(false) : undefined}
          onMouseEnter={() => prefetchRoute('/about')}
          onFocus={() => prefetchRoute('/about')}
          onTouchStart={() => prefetchRoute('/about')}
          title={collapsed && !isSheet ? 'Sobre' : undefined}
        >
          <Info className="h-5 w-5 flex-shrink-0" />
          {(!collapsed || isSheet) && <span>Sobre</span>}
        </Link>

        <a
          href="https://wa.me/message/LWSEFGTD2JQXI1"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'sidebar-nav-item text-green-400 hover:bg-green-500/10 hover:text-green-300',
            collapsed && !isSheet && 'justify-center px-3'
          )}
          onClick={isSheet ? () => setMobileOpen(false) : undefined}
          title={collapsed && !isSheet ? 'Suporte' : undefined}
        >
          <MessageCircle className="h-5 w-5 flex-shrink-0" />
          {(!collapsed || isSheet) && <span>Suporte</span>}
        </a>

        <button
          className={cn(
            'sidebar-nav-item w-full text-red-400 hover:bg-red-500/10 hover:text-red-300',
            collapsed && !isSheet && 'justify-center px-3'
          )}
          type="button"
          onClick={() => {
            if (isSheet) setMobileOpen(false);
            void signOut();
          }}
          title={collapsed && !isSheet ? 'Sair' : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {(!collapsed || isSheet) && <span>Sair</span>}
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <>
        <div className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-sidebar-border bg-gradient-sidebar px-4">
          <div className="flex items-center gap-3">
            {settings.platform_logo_url ? (
              <img
                src={settings.platform_logo_url}
                alt={settings.platform_name}
                className="h-8 w-8 rounded-lg object-contain"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-primary">
                <GraduationCap className="h-5 w-5 text-sidebar-primary-foreground" />
              </div>
            )}
            <span className="font-display font-bold text-sidebar-foreground">
              {settings.platform_name}
            </span>
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-sidebar-border bg-gradient-sidebar p-0">
              <div className="flex h-full flex-col">
                <SidebarContent isSheet />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="h-16" />
      </>
    );
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col bg-gradient-sidebar transition-all duration-300',
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
    <span
      className={cn(
        'absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground',
        collapsed && '-right-2 -top-1'
      )}
    >
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  );
}
