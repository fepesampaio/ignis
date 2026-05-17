import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Clock, CheckCircle, XCircle, Search } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { StatsCard } from '@/components/ui/stats-card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { AdminPagination } from '@/components/admin/AdminPagination';

interface PaymentRow {
  id: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  installment_number: number | null;
  total_installments: number | null;
  user_id: string;
  course_id: string;
  profile?: { full_name: string; email: string };
  course?: { title: string };
}

const PAGE_SIZE = 5;

const getCommissionPercent = (category: string | null): number => {
  if (!category) return 0;
  const cat = category.toLowerCase();
  if (cat.includes('eja') || cat.includes('técnico') || cat.includes('tecnico')) return 40;
  if (cat.includes('competência') || cat.includes('competencia')) return 35;
  if (cat.includes('profissional')) return 50;
  return 0;
};

export default function AdminFinance() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  // Stats: lightweight query (only needed columns)
  const { data: stats } = useQuery({
    queryKey: ['admin-finance-stats'],
    queryFn: async () => {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const [receivedRes, pendingRes, overdueRes] = await Promise.all([
        supabase
          .from('payments')
          .select('amount, course_id, user_id')
          .in('status', ['RECEIVED', 'CONFIRMED'])
          .gte('paid_at', firstDayOfMonth.toISOString())
          .lte('paid_at', lastDayOfMonth.toISOString()),
        supabase.from('payments').select('amount').eq('status', 'PENDING'),
        supabase.from('payments').select('amount').eq('status', 'OVERDUE'),
      ]);

      if (receivedRes.error) throw receivedRes.error;
      if (pendingRes.error) throw pendingRes.error;
      if (overdueRes.error) throw overdueRes.error;

      const received = receivedRes.data || [];
      // Fetch courses + enrollments only for the received-this-month slice
      const courseIds = [...new Set(received.map((r) => r.course_id))];
      const userIds = [...new Set(received.map((r) => r.user_id))];

      const [coursesRes, enrollmentsRes] = await Promise.all([
        courseIds.length
          ? supabase.from('courses').select('id, category').in('id', courseIds)
          : Promise.resolve({ data: [], error: null } as any),
        userIds.length
          ? supabase
              .from('enrollments')
              .select('user_id, course_id, polo_id')
              .in('user_id', userIds)
              .in('course_id', courseIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const coursesMap = new Map<string, { category: string | null }>(
        (coursesRes.data || []).map((c: any) => [c.id, { category: c.category }])
      );
      const enrollmentsMap = new Map<string, string | null>(
        (enrollmentsRes.data || []).map((e: any) => [`${e.user_id}-${e.course_id}`, e.polo_id])
      );

      let totalNetReceived = 0;
      received.forEach((p) => {
        const amount = Number(p.amount);
        const poloId = enrollmentsMap.get(`${p.user_id}-${p.course_id}`);
        if (poloId) {
          const pct = getCommissionPercent(coursesMap.get(p.course_id)?.category || null);
          totalNetReceived += amount * (1 - pct / 100);
        } else {
          totalNetReceived += amount;
        }
      });

      const totalPending = (pendingRes.data || []).reduce((s, p) => s + Number(p.amount), 0);
      const totalOverdue = (overdueRes.data || []).reduce((s, p) => s + Number(p.amount), 0);

      return { totalNetReceived, totalPending, totalOverdue };
    },
    staleTime: 60_000,
  });

  // Paginated list
  const { data, isFetching } = useQuery({
    queryKey: ['admin-finance-list', { search: debouncedSearch, status: statusFilter, page }],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // If searching by user name/email, resolve matching user_ids first
      let userIdFilter: string[] | null = null;
      if (debouncedSearch.trim()) {
        const term = `%${debouncedSearch.trim()}%`;
        const { data: matchingProfiles } = await supabase
          .from('profiles')
          .select('user_id')
          .or(`full_name.ilike.${term},email.ilike.${term}`)
          .limit(500);
        userIdFilter = (matchingProfiles || []).map((p) => p.user_id);

        // Also match by course title
        const { data: matchingCourses } = await supabase
          .from('courses')
          .select('id')
          .ilike('title', term)
          .limit(200);
        const courseIds = (matchingCourses || []).map((c) => c.id);

        if (userIdFilter.length === 0 && courseIds.length === 0) {
          return { rows: [] as PaymentRow[], total: 0 };
        }

        let query = supabase
          .from('payments')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);
        if (statusFilter !== 'all') query = query.eq('status', statusFilter);

        // Combine OR filters: user_id IN (...) OR course_id IN (...)
        const orParts: string[] = [];
        if (userIdFilter.length) orParts.push(`user_id.in.(${userIdFilter.join(',')})`);
        if (courseIds.length) orParts.push(`course_id.in.(${courseIds.join(',')})`);
        query = query.or(orParts.join(','));

        const { data: paymentsData, error, count } = await query;
        if (error) throw error;
        return await enrichPayments(paymentsData || [], count || 0);
      }

      let query = supabase
        .from('payments')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data: paymentsData, error, count } = await query;
      if (error) throw error;
      return await enrichPayments(paymentsData || [], count || 0);
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  async function enrichPayments(paymentsData: any[], total: number) {
    const userIds = [...new Set(paymentsData.map((p) => p.user_id))];
    const courseIds = [...new Set(paymentsData.map((p) => p.course_id))];

    const [profilesRes, coursesRes] = await Promise.all([
      userIds.length
        ? supabase.from('profiles').select('user_id, full_name, email').in('user_id', userIds)
        : Promise.resolve({ data: [], error: null } as any),
      courseIds.length
        ? supabase.from('courses').select('id, title').in('id', courseIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
    const coursesMap = new Map((coursesRes.data || []).map((c: any) => [c.id, c]));

    const rows = paymentsData.map((p) => ({
      ...p,
      profile: profilesMap.get(p.user_id),
      course: coursesMap.get(p.course_id),
    })) as PaymentRow[];

    return { rows, total };
  }

  const rows = data?.rows || [];
  const total = data?.total || 0;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RECEIVED':
      case 'CONFIRMED':
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            Pago
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <Clock className="w-3 h-3 mr-1" />
            Pendente
          </Badge>
        );
      case 'OVERDUE':
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <XCircle className="w-3 h-3 mr-1" />
            Vencido
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout title="Financeiro" subtitle="Gerencie pagamentos e receitas">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatsCard
          title="Receita Líquida do Mês"
          value={stats ? formatCurrency(stats.totalNetReceived) : '...'}
          icon={TrendingUp}
          variant="success"
        />
        <StatsCard
          title="Pendente"
          value={stats ? formatCurrency(stats.totalPending) : '...'}
          icon={Clock}
          variant="warning"
        />
        <StatsCard
          title="Vencido"
          value={stats ? formatCurrency(stats.totalOverdue) : '...'}
          icon={XCircle}
          variant="primary"
        />
      </div>

      {/* Filters */}
      <div className="card-elevated p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por aluno, email ou curso..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="RECEIVED">Pago</SelectItem>
              <SelectItem value="PENDING">Pendente</SelectItem>
              <SelectItem value="OVERDUE">Vencido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Payments Table */}
      <div className="card-elevated overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aluno</TableHead>
              <TableHead>Curso</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pago em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isFetching && rows.length === 0 ? (
              [...Array(8)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <div className="h-12 bg-muted animate-pulse rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum pagamento encontrado
                </TableCell>
              </TableRow>
            ) : (
              rows.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{payment.profile?.full_name || 'N/A'}</p>
                      <p className="text-xs text-muted-foreground">{payment.profile?.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {payment.course?.title || 'N/A'}
                  </TableCell>
                  <TableCell>
                    {payment.installment_number && payment.total_installments
                      ? `${payment.installment_number}/${payment.total_installments}`
                      : '-'}
                  </TableCell>
                  <TableCell className="font-medium">{formatCurrency(payment.amount)}</TableCell>
                  <TableCell>
                    {payment.due_date
                      ? format(new Date(payment.due_date), 'dd/MM/yyyy', { locale: ptBR })
                      : '-'}
                  </TableCell>
                  <TableCell>{getStatusBadge(payment.status)}</TableCell>
                  <TableCell>
                    {payment.paid_at
                      ? format(new Date(payment.paid_at), 'dd/MM/yyyy', { locale: ptBR })
                      : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <AdminPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>
    </DashboardLayout>
  );
}
