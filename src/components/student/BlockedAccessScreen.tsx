import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CreditCard, Calendar, Phone, Mail, FileText, QrCode } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PaymentDialog } from './PaymentDialog';

interface BlockedAccessScreenProps {
  onRetry?: () => void;
}

export function BlockedAccessScreen({ onRetry }: BlockedAccessScreenProps) {
  const { accessStatus, signOut, checkAccess } = useAuth();
  const [selectedPayment, setSelectedPayment] = useState<{
    id: string;
    asaas_payment_id: string;
    amount: number;
    courseName?: string;
    installment: number;
    totalInstallments: number;
  } | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  if (!accessStatus || !accessStatus.blocked) {
    return null;
  }

  const handleRetry = async () => {
    await checkAccess();
    onRetry?.();
  };

  const handlePayment = (payment: {
    id: string;
    asaas_payment_id: string;
    amount: number;
    dueDate: string;
    courseName?: string;
    installment: number;
    totalInstallments: number;
  }) => {
    setSelectedPayment({
      id: payment.id,
      asaas_payment_id: payment.asaas_payment_id,
      amount: payment.amount,
      courseName: payment.courseName,
      installment: payment.installment,
      totalInstallments: payment.totalInstallments,
    });
    setPaymentDialogOpen(true);
  };

  const handlePaymentSuccess = async () => {
    setPaymentDialogOpen(false);
    setSelectedPayment(null);
    await checkAccess();
  };

  const isContractPending = accessStatus.contractStatus === 'pending' || accessStatus.contractStatus === 'sent';
  const hasOverduePayments = accessStatus.overduePayments && accessStatus.overduePayments.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-red-200 dark:border-red-800">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-2xl text-red-700 dark:text-red-400">
            Acesso Bloqueado
          </CardTitle>
          <CardDescription className="text-base">
            {accessStatus.reason || 'Seu acesso está temporariamente bloqueado'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Contract Pending */}
          {isContractPending && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-800 dark:text-amber-300">
                    {accessStatus.contractStatus === 'pending' 
                      ? 'Contrato Pendente' 
                      : 'Aguardando Assinatura'}
                  </h3>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    {accessStatus.contractStatus === 'pending'
                      ? 'Seu contrato está sendo preparado. Em breve você receberá um email para assinatura.'
                      : 'Verifique seu email e assine o contrato de matrícula para liberar seu acesso.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Overdue Payments */}
          {hasOverduePayments && (
            <div className="space-y-3">
              <h3 className="font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Pagamentos em Atraso
              </h3>
              
              <div className="space-y-2">
                {accessStatus.overduePayments?.map((payment) => (
                  <div 
                    key={payment.id}
                    className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800 rounded-lg p-3"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-medium text-sm">
                          {payment.courseName || 'Curso'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Parcela {payment.installment}/{payment.totalInstallments}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-red-600 dark:text-red-400">
                          {payment.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-red-500">
                          <Calendar className="w-3 h-3" />
                          <span>
                            Venceu em {format(new Date(payment.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button 
                      className="w-full" 
                      size="sm"
                      onClick={() => handlePayment(payment)}
                    >
                      <QrCode className="w-4 h-4 mr-2" />
                      Pagar via PIX
                    </Button>
                  </div>
                ))}
              </div>

              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mt-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-800 dark:text-green-300 text-sm">
                      Liberação Automática
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                      Após a confirmação do pagamento pelo sistema bancário, seu acesso será liberado automaticamente em até 24 horas. Você pode verificar novamente clicando no botão abaixo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contact Info */}
          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground text-center mb-3">
              Precisa de ajuda? Entre em contato conosco:
            </p>
            <div className="flex justify-center gap-4">
              <Button variant="outline" size="sm" asChild>
                <a href="https://wa.me/message/LWSEFGTD2JQXI1" target="_blank" rel="noopener noreferrer">
                  <Phone className="w-4 h-4 mr-2" />
                  WhatsApp
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="mailto:contato@institutoignis.com.br">
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </a>
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={handleRetry}
            >
              Verificar Novamente
            </Button>
            <Button 
              variant="destructive" 
              className="flex-1"
              onClick={signOut}
            >
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      {selectedPayment && (
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          payment={{
            id: selectedPayment.id,
            asaas_payment_id: selectedPayment.asaas_payment_id,
            amount: selectedPayment.amount,
            description: `${selectedPayment.courseName || 'Curso'} - Parcela ${selectedPayment.installment}/${selectedPayment.totalInstallments}`,
          }}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
