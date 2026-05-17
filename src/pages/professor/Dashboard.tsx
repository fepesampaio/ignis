import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/ui/stats-card';
import { ClipboardList, Bot, UserCheck, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DashboardMetrics {
  pending: number;
  autoGraded: number;
  manualGraded: number;
}

export default function ProfessorDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({ pending: 0, autoGraded: 0, manualGraded: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

      const [pendingRes, gradedRes] = await Promise.all([
        supabase
          .from('assignment_submissions')
          .select('id', { count: 'exact', head: true })
          .is('graded_at', null),
        supabase
          .from('assignment_submissions')
          .select('id, graded_by')
          .not('graded_at', 'is', null)
          .gte('graded_at', startOfMonth)
          .lte('graded_at', endOfMonth),
      ]);

      const pending = pendingRes.count ?? 0;
      const graded = gradedRes.data ?? [];
      const autoGraded = graded.filter((s) => s.graded_by === null).length;
      const manualGraded = graded.filter((s) => s.graded_by !== null).length;

      setMetrics({ pending, autoGraded, manualGraded });
      setLoading(false);
    }

    fetchMetrics();
  }, []);

  const total = metrics.autoGraded + metrics.manualGraded;

  return (
    <DashboardLayout
      title="Painel do Professor"
      subtitle="Acompanhe suas correções e trabalhos"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Correções Pendentes"
          value={loading ? '...' : metrics.pending}
          icon={ClipboardList}
          variant="warning"
        />
        <StatsCard
          title="Correções Automáticas"
          subtitle="Neste mês"
          value={loading ? '...' : metrics.autoGraded}
          icon={Bot}
          variant="secondary"
        />
        <StatsCard
          title="Correções Manuais"
          subtitle="Neste mês"
          value={loading ? '...' : metrics.manualGraded}
          icon={UserCheck}
          variant="primary"
        />
        <StatsCard
          title="Correções Totais"
          subtitle="Neste mês"
          value={loading ? '...' : total}
          icon={BarChart3}
          variant="success"
        />
      </div>
      <div className="card-elevated p-8 text-center">
        <h3 className="text-lg font-semibold mb-2">Bem-vindo ao seu painel!</h3>
        <p className="text-muted-foreground">Use o menu lateral para acessar turmas e corrigir trabalhos.</p>
      </div>
    </DashboardLayout>
  );
}
