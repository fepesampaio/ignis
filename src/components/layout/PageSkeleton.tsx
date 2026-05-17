import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, WifiOff } from 'lucide-react';

type Variant = 'table' | 'cards' | 'lessons' | 'dashboard' | 'detail';

function detectVariant(pathname: string): Variant {
  if (/\/(users|enrollments|finance|polos|payments|grades|certificates|commissions|submissions|student-payments)/.test(pathname)) {
    return 'table';
  }
  if (/\/(lessons|exams|assignments|activities)/.test(pathname)) {
    return 'lessons';
  }
  if (/\/(courses|subjects)/.test(pathname)) {
    return 'cards';
  }
  if (/\/(dashboard|admin|professor|polo)$/.test(pathname)) {
    return 'dashboard';
  }
  return 'detail';
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72 mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-3 mb-4">
          <Skeleton className="h-10 flex-1 max-w-sm" />
          <Skeleton className="h-10 w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b border-border/40">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="h-32 w-full rounded-none" />
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LessonsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="aspect-video w-full rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <CardsSkeleton />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-4 w-2/3 mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
        <Skeleton className="h-32 w-full mt-4" />
      </CardContent>
    </Card>
  );
}

function SkeletonByVariant({ variant }: { variant: Variant }) {
  switch (variant) {
    case 'table': return <TableSkeleton />;
    case 'cards': return <CardsSkeleton />;
    case 'lessons': return <LessonsSkeleton />;
    case 'dashboard': return <DashboardSkeleton />;
    default: return <DetailSkeleton />;
  }
}

function TimeoutMessage() {
  return (
    <Card className="max-w-md mx-auto mt-12 animate-fade-in">
      <CardContent className="pt-6 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <WifiOff className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-foreground">Carregando dados...</p>
          <p className="text-sm text-muted-foreground mt-1">
            Verifique sua conexão se demorar muito.
          </p>
        </div>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Full-page Suspense fallback that PRESERVES the layout (Sidebar + Header)
 * and shows a skeleton matching the route variant. After 10s, shows a
 * friendly timeout message with a reload button.
 */
export function PageSkeleton() {
  const location = useLocation();
  const variant = detectVariant(location.pathname);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, []);

  // Auth / public routes: don't render dashboard chrome
  if (location.pathname === '/auth' || location.pathname.startsWith('/certificate/validate')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        {timedOut ? <TimeoutMessage /> : <Skeleton className="h-64 w-full max-w-md" />}
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {timedOut ? <TimeoutMessage /> : <SkeletonByVariant variant={variant} />}
      </div>
    </DashboardLayout>
  );
}
