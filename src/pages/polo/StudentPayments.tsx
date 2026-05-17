import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { PaginationControls } from '@/components/ui/pagination-controls';
const PAGE_SIZE = 5;
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  Search,
  Building,
  Phone,
  Mail,
  ExternalLink,
  BookOpen,
  Calendar,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState, useEffect } from 'react';

interface Payment {
  id: string;
  amount: number;
  status: string;
  due_date: string;
  paid_at: string | null;
  installment_number: number;
  total_installments: number;
  payment_method: string | null;
  invoice_url: string | null;
  bank_slip_url: string | null;
}

interface StudentPayment {
  enrollment_id: string;
  student: {
    user_id: string;
    name: string;
    email: string;
    phone: string | null;
    whatsapp: string | null;
  };
  course: {
    id: string;
    title: string;
    category: string | null;
  };
  enrollment_status: {
    contract_status: string;
    payment_status: string;
    access_blocked: boolean;
    block_reason: string | null;
  };
  summary: {
    total_installments: number;
    paid_count: number;
    pending_count: number;
    overdue_count: number;
    total_paid: number;
    total_pending: number;
    total_overdue: number;
    total_amount: number;
  };
  payments: Payment[];
  enrolled_at: string;
}

interface PaymentsData {
  polo: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  };
  summary: {
    total_students: number;
    students_with_overdue: number;
    students_up_to_date: number;
    students_pending_first: number;
    total_collected: number;
    total_pending: number;
    total_overdue: number;
  };
  students: StudentPayment[];
  pagination?: { page: number; pageSize: number; total: number };
}

export default function PoloStudentPayments() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const { data, isLoading, error } = useQuery<PaymentsData>({
    queryKey: ['polo-student-payments', page, debouncedSearch, statusFilter],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await supabase.functions.invoke('get-polo-student-payments', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch,
          status: statusFilter,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    placeholderData: keepPreviousData,
  });

  const filteredStudents = data?.students ?? [];
  const total = data?.pagination?.total ?? 0;

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'RECEIVED':
      case 'CONFIRMED':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Pago</Badge>;
      case 'PENDING':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pendente</Badge>;
      case 'OVERDUE':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Vencido</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getStudentStatusBadge = (student: StudentPayment) => {
    if (student.summary.overdue_count > 0) {
      return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Inadimplente</Badge>;
    }
    if (student.summary.paid_count === 0) {
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Aguardando 1º Pgto</Badge>;
    }
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Em dia</Badge>;
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
              <p className="text-destructive">Erro ao carregar pagamentos</p>
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
            Pagamentos dos Alunos
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.summary.total_students || 0}</p>
                    <p className="text-xs text-muted-foreground">Total de Alunos</p>
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
                  <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(data?.summary.total_collected || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Recebido</p>
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
                      {formatCurrency(data?.summary.total_pending || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">A Receber</p>
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
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">
                      {data?.summary.students_with_overdue || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Inadimplentes</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Students List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Alunos Matriculados</CardTitle>
            <CardDescription>
              Clique em um aluno para ver os detalhes dos pagamentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
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
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="uptodate">Em dia</SelectItem>
                  <SelectItem value="pending">Aguardando 1º Pgto</SelectItem>
                  <SelectItem value="overdue">Inadimplentes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 mx-auto text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">
                  Nenhum aluno encontrado
                </p>
              </div>
            ) : (
              <Accordion type="single" collapsible className="space-y-3">
                {filteredStudents.map((student) => (
                  <AccordionItem
                    key={student.enrollment_id}
                    value={student.enrollment_id}
                    className="border rounded-lg px-4"
                  >
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-left w-full pr-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{student.student.name}</p>
                            {getStudentStatusBadge(student)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <BookOpen className="w-3 h-3" />
                              {student.course.title}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="text-right">
                            <p className="font-medium">
                              {student.summary.paid_count}/{student.summary.total_installments} pagas
                            </p>
                            <p className="text-muted-foreground">
                              {formatCurrency(student.summary.total_paid)} recebido
                            </p>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="space-y-4">
                        {/* Student Info */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">{student.student.email}</span>
                          </div>
                          {student.student.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">{student.student.phone}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">
                              Matriculado em {format(new Date(student.enrolled_at), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          </div>
                        </div>

                        {/* Payment Summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="p-3 rounded-lg bg-green-500/10 text-center">
                            <p className="text-lg font-bold text-green-600">
                              {formatCurrency(student.summary.total_paid)}
                            </p>
                            <p className="text-xs text-muted-foreground">Pago</p>
                          </div>
                          <div className="p-3 rounded-lg bg-amber-500/10 text-center">
                            <p className="text-lg font-bold text-amber-600">
                              {formatCurrency(student.summary.total_pending)}
                            </p>
                            <p className="text-xs text-muted-foreground">Pendente</p>
                          </div>
                          <div className="p-3 rounded-lg bg-red-500/10 text-center">
                            <p className="text-lg font-bold text-red-600">
                              {formatCurrency(student.summary.total_overdue)}
                            </p>
                            <p className="text-xs text-muted-foreground">Vencido</p>
                          </div>
                        </div>

                        {/* Access Status */}
                        {student.enrollment_status.access_blocked && (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                            <XCircle className="w-5 h-5 text-red-500" />
                            <div>
                              <p className="text-sm font-medium text-red-600">Acesso Bloqueado</p>
                              <p className="text-xs text-muted-foreground">
                                {student.enrollment_status.block_reason || 'Pagamento pendente'}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Payments Table */}
                        <div className="rounded-lg border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Parcela</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead>Vencimento</TableHead>
                                <TableHead>Pagamento</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {student.payments.map((payment) => (
                                <TableRow key={payment.id}>
                                  <TableCell className="font-medium">
                                    {payment.installment_number}/{payment.total_installments}
                                  </TableCell>
                                  <TableCell>{formatCurrency(payment.amount)}</TableCell>
                                  <TableCell>
                                    {payment.due_date ? 
                                      format(new Date(payment.due_date), 'dd/MM/yyyy', { locale: ptBR }) :
                                      '-'
                                    }
                                  </TableCell>
                                  <TableCell>
                                    {payment.paid_at ? 
                                      format(new Date(payment.paid_at), 'dd/MM/yyyy', { locale: ptBR }) :
                                      '-'
                                    }
                                  </TableCell>
                                  <TableCell>
                                    {getPaymentStatusBadge(payment.status)}
                                  </TableCell>
                                  <TableCell>
                                    {payment.bank_slip_url && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => window.open(payment.bank_slip_url!, '_blank')}
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
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
