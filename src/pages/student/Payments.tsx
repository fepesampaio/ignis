import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PaymentDialog } from '@/components/student/PaymentDialog';
import { 
  Receipt, 
  Download, 
  Calendar, 
  CreditCard, 
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Wallet
} from 'lucide-react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface Payment {
  id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  paid_at: string | null;
  asaas_payment_id: string | null;
  installment_number: number | null;
  total_installments: number | null;
  courses: {
    id: string;
    title: string;
  } | null;
  asaas_status?: string;
  due_date?: string;
  value?: number;
  billing_type?: string;
  invoice_url?: string;
  bank_slip_url?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
  description?: string;
  payment_date?: string;
  net_value?: number;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { 
    label: 'Pendente', 
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    icon: <Clock className="w-4 h-4" />
  },
  RECEIVED: { 
    label: 'Pago', 
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: <CheckCircle2 className="w-4 h-4" />
  },
  CONFIRMED: { 
    label: 'Confirmado', 
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: <CheckCircle2 className="w-4 h-4" />
  },
  OVERDUE: { 
    label: 'Vencido', 
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: <AlertCircle className="w-4 h-4" />
  },
  REFUNDED: { 
    label: 'Reembolsado', 
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: <XCircle className="w-4 h-4" />
  },
  RECEIVED_IN_CASH: { 
    label: 'Recebido em Dinheiro', 
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: <CheckCircle2 className="w-4 h-4" />
  },
  REFUND_REQUESTED: { 
    label: 'Reembolso Solicitado', 
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    icon: <Clock className="w-4 h-4" />
  },
  CHARGEBACK_REQUESTED: { 
    label: 'Chargeback Solicitado', 
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: <AlertCircle className="w-4 h-4" />
  },
  CHARGEBACK_DISPUTE: { 
    label: 'Disputa de Chargeback', 
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: <AlertCircle className="w-4 h-4" />
  },
  AWAITING_CHARGEBACK_REVERSAL: { 
    label: 'Aguardando Reversão', 
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    icon: <Clock className="w-4 h-4" />
  },
  DUNNING_REQUESTED: { 
    label: 'Negativação Solicitada', 
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: <AlertCircle className="w-4 h-4" />
  },
  DUNNING_RECEIVED: { 
    label: 'Recuperado por Negativação', 
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: <CheckCircle2 className="w-4 h-4" />
  },
  AWAITING_RISK_ANALYSIS: { 
    label: 'Análise de Risco', 
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    icon: <Clock className="w-4 h-4" />
  },
  pending: { 
    label: 'Pendente', 
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    icon: <Clock className="w-4 h-4" />
  },
  paid: { 
    label: 'Pago', 
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: <CheckCircle2 className="w-4 h-4" />
  },
  cancelled: { 
    label: 'Cancelado', 
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    icon: <XCircle className="w-4 h-4" />
  },
};

const billingTypeLabels: Record<string, string> = {
  BOLETO: 'Boleto Bancário',
  CREDIT_CARD: 'Cartão de Crédito',
  PIX: 'PIX',
  UNDEFINED: 'Não definido',
};

export default function StudentPayments() {
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['student-payments'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase.functions.invoke('get-student-payments', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      return data as { payments: Payment[]; user_name: string; user_email: string };
    },
  });

  const handlePayNow = (payment: Payment) => {
    if (!payment.asaas_payment_id) {
      toast.error('Este pagamento não pode ser processado online');
      return;
    }
    setSelectedPayment(payment);
    setPaymentDialogOpen(true);
  };

  const handlePaymentSuccess = () => {
    refetch();
    setSelectedPayment(null);
  };

  const getStatusInfo = (payment: Payment) => {
    const status = payment.asaas_status || payment.status;
    return statusConfig[status] || statusConfig.pending;
  };

  const getDueDateStatus = (dueDate: string | undefined) => {
    if (!dueDate) return null;
    const date = parseISO(dueDate);
    if (isToday(date)) return 'today';
    if (isPast(date)) return 'overdue';
    return 'upcoming';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (error) {
    return (
      <DashboardLayout title="Meus Pagamentos">
        <Card className="glass-card border-destructive/30">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <p className="text-foreground font-medium">Erro ao carregar pagamentos</p>
            <p className="text-muted-foreground text-sm mt-1">{(error as Error).message}</p>
            <Button onClick={() => refetch()} variant="outline" className="mt-4">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Meus Pagamentos">
      <div className="space-y-6">
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Receipt className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Cobranças</p>
                <p className="text-2xl font-bold text-foreground">
                  {isLoading ? <Skeleton className="h-8 w-16" /> : data?.payments.length || 0}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pagos</p>
                <p className="text-2xl font-bold text-foreground">
                  {isLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    data?.payments.filter(p => 
                      ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'paid'].includes(p.asaas_status || p.status)
                    ).length || 0
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-foreground">
                  {isLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    data?.payments.filter(p => 
                      ['PENDING', 'pending'].includes(p.asaas_status || p.status)
                    ).length || 0
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payments List */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Histórico de Pagamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 rounded-lg bg-muted/30 space-y-3">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-24" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : data?.payments.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-foreground font-medium">Nenhum pagamento encontrado</p>
                <p className="text-muted-foreground text-sm">Seus pagamentos aparecerão aqui</p>
              </div>
            ) : (
              <div className="space-y-4">
                {[...(data?.payments || [])].sort((a, b) => {
                  // Sort by installment_number ascending
                  const numA = a.installment_number || 0;
                  const numB = b.installment_number || 0;
                  return numA - numB;
                }).map((payment) => {
                  const statusInfo = getStatusInfo(payment);
                  const dueDateStatus = getDueDateStatus(payment.due_date);
                  const isPending = ['PENDING', 'pending'].includes(payment.asaas_status || payment.status);

                  return (
                    <div
                      key={payment.id}
                      className="p-4 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            {payment.installment_number && (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-medium">
                                Parcela {String(payment.installment_number).padStart(2, '0')}
                              </Badge>
                            )}
                            <h3 className="font-semibold text-foreground">
                              {payment.courses?.title || payment.description || 'Pagamento'}
                            </h3>
                            <Badge className={`${statusInfo.color} flex items-center gap-1`}>
                              {statusInfo.icon}
                              {statusInfo.label}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <CreditCard className="w-4 h-4" />
                              {billingTypeLabels[payment.billing_type || ''] || payment.payment_method || 'Boleto'}
                            </span>
                            
                            {payment.due_date && (
                              <span className={`flex items-center gap-1 ${
                                dueDateStatus === 'overdue' && isPending 
                                  ? 'text-red-400' 
                                  : dueDateStatus === 'today' && isPending
                                    ? 'text-yellow-400'
                                    : ''
                              }`}>
                                <Calendar className="w-4 h-4" />
                                Vencimento: {format(parseISO(payment.due_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                              </span>
                            )}

                            {payment.payment_date && (
                              <span className="flex items-center gap-1 text-green-400">
                                <CheckCircle2 className="w-4 h-4" />
                                Pago em: {format(parseISO(payment.payment_date), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <span className="text-xl font-bold text-foreground">
                            {formatCurrency(payment.value || payment.amount)}
                          </span>

                          {isPending && payment.asaas_payment_id && (
                            <div className="flex flex-wrap gap-2 justify-end">
                              <Button
                                size="sm"
                                onClick={() => handlePayNow(payment)}
                                className="gap-2"
                              >
                                <Wallet className="w-4 h-4" />
                                Pagar Agora
                              </Button>

                              {payment.bank_slip_url && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(payment.bank_slip_url, '_blank')}
                                  className="gap-2"
                                >
                                  <Download className="w-4 h-4" />
                                  Boleto
                                </Button>
                              )}
                            </div>
                          )}

                          {!isPending && payment.invoice_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(payment.invoice_url, '_blank')}
                              className="gap-2"
                            >
                              <FileText className="w-4 h-4" />
                              Ver Comprovante
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Dialog */}
      {selectedPayment && (
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          payment={selectedPayment}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </DashboardLayout>
  );
}
