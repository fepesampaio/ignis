import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { BlockedAccessScreen } from '@/components/student/BlockedAccessScreen';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSidebarState } from '@/contexts/SidebarContext';

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const { role, accessStatus, loading } = useAuth();
  const isMobile = useIsMobile();
  const { collapsed } = useSidebarState();

  // Show blocked screen for students with blocked access
  if (!loading && role === 'aluno' && accessStatus?.blocked) {
    return <BlockedAccessScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className={`min-h-screen transition-all duration-300 ${isMobile ? 'ml-0' : collapsed ? 'ml-20' : 'ml-64'}`}>
        <div className="p-4 sm:p-6 lg:p-8">
          {(title || subtitle) && (
            <header className="mb-6 sm:mb-8 animate-fade-in">
              {title && (
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-display font-bold text-foreground">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-sm sm:text-base text-muted-foreground mt-1">{subtitle}</p>
              )}
            </header>
          )}
          <div className="animate-slide-up">{children}</div>
        </div>
      </main>
    </div>
  );
}
