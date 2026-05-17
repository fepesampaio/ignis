import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { PaginationControls } from '@/components/ui/pagination-controls';
const PAGE_SIZE = 5;
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  Search,
  Building,
  PieChart,
  Calendar,
  User,
  BookOpen,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState, useMemo, useEffect } from 'react';

interface CommissionRecord {
  payment_id: string;
  asaas_payment_id: string | null;
  student_name: string;
  student_email: string;
  course_title: string;
  course_category: string;
  payment_amount: number;
  split_percentage: number;
  commission_value: number;
  payment_status: string;
  payment_due_date: string;
  payment_paid_at: string | null;
  installment_number: number | null;
  total_installments: number | null;
}

interface CommissionsData {
  polo: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    wallet_id: string;
  };
  summary: {
    total_commission_received: number;
    total_commission_pending: number;
    total_commission: number;
    total_payments: number;
    category_breakdown: Record<string, {
      total: number;
      received: number;
      pending: number;
      count: number;
      splitPercentage: number;
    }>;
  };
  commissions: CommissionRecord[];
  pagination?: { page: number; pageSize: number; total: number };
  available_categories?: string[];
}

export default function PoloCommissions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Debounce search and reset to page 1 on filter changes
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, categoryFilter]);

  const { data, isLoading, error } = useQuery<CommissionsData>({
    queryKey: ['polo-commissions', page, debouncedSearch, statusFilter, categoryFilter],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await supabase.functions.invoke('get-polo-commissions', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch,
          status: statusFilter,
          category: categoryFilter,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    placeholderData: keepPreviousData,
  });

  const filteredCommissions = data?.commissions ?? [];
  const total = data?.pagination?.total ?? 0;
  const categories = data?.available_categories ?? [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RECEIVED':
      case 'CONFIRMED':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Recebido</Badge>;
      case 'PENDING':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pendente</Badge>;
      case 'OVERDUE':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Vencido</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <p className="text-destructive">Erro ao carregar comissões</p>
              <p className="text-sm text-muted-foreground mt-2">
                {error instanceof Error ? error.message : 'Erro desconhecido'}
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-display font-bold text-foreground">
            Comissões e Splits
          </h1>
          {isLoading ? (
            <Skeleton className="h-5 w-48" />
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building className="w-4 h-4" />
              <span>{data?.polo.name}</span>
              {data?.polo.city && (
                <span className="text-sm">- {data.polo.city}/{data.polo.state}</span>
              )}
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(data?.summary.total_commission_received || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Comissões Recebidas</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600">
                      {formatCurrency(data?.summary.total_commission_pending || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Comissões Pendentes</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(data?.summary.total_commission || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Geral</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.summary.total_payments || 0}</p>
                    <p className="text-xs text-muted-foreground">Total de Parcelas</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Category Breakdown */}
        {data?.summary.category_breakdown && Object.keys(data.summary.category_breakdown).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <PieChart className="w-5 h-5" />
                Comissões por Categoria
              </CardTitle>
              <CardDescription>
                Percentuais de split variam conforme a categoria do curso
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(data.summary.category_breakdown).map(([category, info]) => (
                  <div
                    key={category}
                    className="p-4 rounded-xl border bg-muted/30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{category}</span>
                      <Badge variant="outline">{info.splitPercentage}%</Badge>
                    </div>
                    <p className="text-xl font-bold">{formatCurrency(info.total)}</p>
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-green-600">
                        ✓ {formatCurrency(info.received)}
                      </span>
                      <span className="text-amber-600">
                        ⏳ {formatCurrency(info.pending)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {info.count} parcela{info.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Commission Details Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Histórico de Comissões</CardTitle>
            <CardDescription>
              Detalhamento de todas as comissões por pagamento
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por aluno ou curso..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="received">Recebidos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="overdue">Vencidos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredCommissions.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 mx-auto text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">
                  Nenhuma comissão encontrada
                </p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Curso</TableHead>
                      <TableHead className="text-center">Parcela</TableHead>
                      <TableHead className="text-right">Valor Pago</TableHead>
                      <TableHead className="text-center">Split</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCommissions.map((commission) => (
                      <TableRow key={commission.payment_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{commission.student_name}</p>
                              <p className="text-xs text-muted-foreground">{commission.student_email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm">{commission.course_title}</p>
                              <p className="text-xs text-muted-foreground">{commission.course_category}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {commission.installment_number && commission.total_installments ? (
                            <span className="text-sm">
                              {commission.installment_number}/{commission.total_installments}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(commission.payment_amount)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{commission.split_percentage}%</Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary">
                          {formatCurrency(commission.commission_value)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="w-3 h-3 text-muted-foreground" />
                            {commission.payment_due_date ? 
                              format(new Date(commission.payment_due_date), 'dd/MM/yyyy', { locale: ptBR }) :
                              '-'
                            }
                          </div>
                          {commission.payment_paid_at && (
                            <p className="text-xs text-green-600 mt-0.5">
                              Pago: {format(new Date(commission.payment_paid_at), 'dd/MM/yyyy', { locale: ptBR })}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(commission.payment_status)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <PaginationControls
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
