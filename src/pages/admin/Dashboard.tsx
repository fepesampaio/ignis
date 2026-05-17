import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/ui/stats-card';
import { Users, BookOpen, GraduationCap, CreditCard, Loader2, AlertTriangle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export default function AdminDashboard() {
  const queryClient = useQueryClient();

  // Realtime listener for enrollments - invalidates monthly enrollments on INSERT
  useEffect(() => {
    const channel = supabase
      .channel('admin-enrollments-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'enrollments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['admin-stats-monthly-enrollments'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: totalStudents = 0, isLoading: loadingStudents } = useQuery({
    queryKey: ['admin-stats-students'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'aluno');
      if (error) throw error;
      return count || 0;
    },
  });

  // Matrículas do mês atual
  const { data: monthlyEnrollments = 0, isLoading: loadingMonthlyEnrollments } = useQuery({
    queryKey: ['admin-stats-monthly-enrollments'],
    queryFn: async () => {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { count, error } = await supabase
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .gte('enrolled_at', firstDay)
        .lte('enrolled_at', lastDay);
      if (error) throw error;
      return count || 0;
    },
  });

  // Alunos com acesso bloqueado
  const { data: blockedStudents = 0, isLoading: loadingBlocked } = useQuery({
    queryKey: ['admin-stats-blocked-students'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('access_blocked', true)
        .eq('is_active', true);
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  const { data: monthlyRevenue = 0, isLoading: loadingRevenue } = useQuery({
    queryKey: ['admin-stats-revenue'],
    queryFn: async () => {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data, error } = await supabase
        .from('payments')
        .select('amount')
        .eq('status', 'RECEIVED')
        .gte('paid_at', firstDayOfMonth)
        .lte('paid_at', lastDayOfMonth);
      
      if (error) throw error;
      
      return data?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
    },
  });

  const isLoading = loadingStudents || loadingMonthlyEnrollments || loadingBlocked || loadingRevenue;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <DashboardLayout
      title="Painel Administrativo"
      subtitle="Gerencie cursos, alunos e matrículas"
    >
      {isLoading && (
        <div className="flex items-center justify-center py-4 mb-4">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard title="Total de Alunos" value={totalStudents} icon={Users} variant="primary" />
        <StatsCard title="Matrículas do Mês" value={monthlyEnrollments} icon={GraduationCap} variant="secondary" />
        <StatsCard title="Alunos Bloqueados" value={blockedStudents} icon={AlertTriangle} variant="warning" />
        <StatsCard title="Receita Mensal" value={formatCurrency(monthlyRevenue)} icon={CreditCard} variant="success" />
      </div>
      <div className="card-elevated p-8 text-center">
        <h3 className="text-lg font-semibold mb-2">Bem-vindo ao painel administrativo!</h3>
        <p className="text-muted-foreground">Use o menu lateral para gerenciar cursos, usuários e matrículas.</p>
      </div>
    </DashboardLayout>
  );
}