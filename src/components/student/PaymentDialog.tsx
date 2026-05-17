import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { 
  CreditCard, 
  QrCode, 
  Copy, 
  CheckCircle2, 
  Loader2,
  AlertCircle 
} from 'lucide-react';
import { toast } from 'sonner';

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: {
    id: string;
    asaas_payment_id: string;
    amount: number;
    value?: number;
    courses?: { title: string } | null;
    description?: string;
  };
  onSuccess: () => void;
}

const cardSchema = z.object({
  holder_name: z.string().min(3, 'Nome do titular é obrigatório').max(100),
  number: z.string().min(13, 'Número do cartão inválido').max(19),
  expiry_month: z.string().min(2, 'Mês inválido').max(2),
  expiry_year: z.string().min(4, 'Ano inválido').max(4),
  ccv: z.string().min(3, 'CVV inválido').max(4),
  cpf_cnpj: z.string().min(11, 'CPF/CNPJ inválido').max(18),
  email: z.string().email('Email inválido'),
  postal_code: z.string().min(8, 'CEP inválido').max(9),
  address_number: z.string().min(1, 'Número é obrigatório').max(10),
  phone: z.string().min(10, 'Telefone inválido').max(15),
});

type CardFormData = z.infer<typeof cardSchema>;

export function PaymentDialog({ open, onOpenChange, payment, onSuccess }: PaymentDialogProps) {
  const [activeTab, setActiveTab] = useState<'pix' | 'card'>('pix');
  const [isLoading, setIsLoading] = useState(false);
  const [pixData, setPixData] = useState<{
    encoded_image: string;
    payload: string;
    expiration_date: string;
  } | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const form = useForm<CardFormData>({
    resolver: zodResolver(cardSchema),
    defaultValues: {
      holder_name: '',
      number: '',
      expiry_month: '',
      expiry_year: '',
      ccv: '',
      cpf_cnpj: '',
      email: '',
      postal_code: '',
      address_number: '',
      phone: '',
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const loadPixData = async () => {
    if (pixData) return;
    
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase.functions.invoke('process-payment', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          asaas_payment_id: payment.asaas_payment_id,
          payment_method: 'PIX',
        },
      });

      if (error) throw error;
      if (data.pix_data) {
        setPixData(data.pix_data);
      }
    } catch (error) {
      console.error('Error loading PIX:', error);
      toast.error('Erro ao carregar código PIX');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'pix' | 'card');
    if (value === 'pix') {
      loadPixData();
    }
  };

  const copyPixCode = async () => {
    if (pixData?.payload) {
      try {
        await navigator.clipboard.writeText(pixData.payload);
        toast.success('Código PIX copiado!');
      } catch {
        toast.error('Erro ao copiar código');
      }
    }
  };

  const onSubmitCard = async (data: CardFormData) => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Usuário não autenticado');

      const { data: result, error } = await supabase.functions.invoke('process-payment', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          asaas_payment_id: payment.asaas_payment_id,
          payment_method: 'CREDIT_CARD',
          card_data: {
            holder_name: data.holder_name,
            number: data.number.replace(/\s/g, ''),
            expiry_month: data.expiry_month,
            expiry_year: data.expiry_year,
            ccv: data.ccv,
            holder_info: {
              name: data.holder_name,
              email: data.email,
              cpf_cnpj: data.cpf_cnpj,
              postal_code: data.postal_code,
              address_number: data.address_number,
              phone: data.phone,
            },
          },
        },
      });

      if (error) throw error;

      if (result.success && result.status === 'CONFIRMED') {
        setPaymentSuccess(true);
        toast.success('Pagamento realizado com sucesso!');
        setTimeout(() => {
          onSuccess();
          onOpenChange(false);
        }, 2000);
      } else if (result.status === 'PENDING') {
        toast.info('Pagamento em análise. Você será notificado quando for confirmado.');
        onOpenChange(false);
        onSuccess();
      } else {
        throw new Error(result.error || 'Erro ao processar pagamento');
      }
    } catch (error) {
      console.error('Error processing card payment:', error);
      toast.error((error as Error).message || 'Erro ao processar pagamento');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(' ') : value;
  };

  const formatCPF = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 11) {
      return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  const formatCEP = (value: string) => {
    const v = value.replace(/\D/g, '');
    return v.replace(/(\d{5})(\d{3})/, '$1-$2');
  };

  const formatPhone = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 10) {
      return v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  // Load PIX data when dialog opens with PIX tab
  useState(() => {
    if (open && activeTab === 'pix') {
      loadPixData();
    }
  });

  if (paymentSuccess) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-xl font-semibold text-foreground">Pagamento Confirmado!</h3>
            <p className="text-muted-foreground text-center mt-2">
              Seu pagamento foi processado com sucesso.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Realizar Pagamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Payment Info */}
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground">
              {payment.courses?.title || payment.description || 'Pagamento'}
            </p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {formatCurrency(payment.value || payment.amount)}
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 h-auto gap-2">
              <TabsTrigger value="pix" className="gap-2">
                <QrCode className="w-4 h-4" />
                PIX
              </TabsTrigger>
              <TabsTrigger value="card" className="gap-2">
                <CreditCard className="w-4 h-4" />
                Cartão
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pix" className="space-y-4 mt-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground mt-2">Gerando código PIX...</p>
                </div>
              ) : pixData ? (
                <div className="space-y-4">
                  {/* QR Code */}
                  <div className="flex justify-center">
                    <div className="p-4 bg-white rounded-lg">
                      <img
                        src={`data:image/png;base64,${pixData.encoded_image}`}
                        alt="QR Code PIX"
                        className="w-48 h-48"
                      />
                    </div>
                  </div>

                  {/* Copy Paste */}
                  <div className="space-y-2">
                    <Label>Código PIX Copia e Cola</Label>
                    <div className="flex gap-2">
                      <Input
                        value={pixData.payload}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={copyPixCode}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-sm text-primary flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Após o pagamento, a confirmação é automática em até 1 minuto.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <AlertCircle className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">
                    Erro ao carregar código PIX
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadPixData}
                    className="mt-4"
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="card" className="mt-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitCard)} className="space-y-4">
                  {/* Card Details */}
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="holder_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome no Cartão</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Como está no cartão" 
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número do Cartão</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="0000 0000 0000 0000"
                              {...field}
                              onChange={(e) => field.onChange(formatCardNumber(e.target.value))}
                              maxLength={19}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <FormField
                        control={form.control}
                        name="expiry_month"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mês</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="MM"
                                {...field}
                                maxLength={2}
                                onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="expiry_year"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ano</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="AAAA"
                                {...field}
                                maxLength={4}
                                onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="ccv"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CVV</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="123"
                                type="password"
                                {...field}
                                maxLength={4}
                                onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Holder Info */}
                  <div className="pt-4 border-t border-border space-y-4">
                    <h4 className="font-medium text-sm text-foreground">Dados do Titular</h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="cpf_cnpj"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CPF/CNPJ</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="000.000.000-00"
                                {...field}
                                onChange={(e) => field.onChange(formatCPF(e.target.value))}
                                maxLength={18}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="email@exemplo.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <FormField
                        control={form.control}
                        name="postal_code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CEP</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="00000-000"
                                {...field}
                                onChange={(e) => field.onChange(formatCEP(e.target.value))}
                                maxLength={9}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="address_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número</FormLabel>
                            <FormControl>
                              <Input placeholder="123" {...field} maxLength={10} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telefone</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="(00) 00000-0000"
                                {...field}
                                onChange={(e) => field.onChange(formatPhone(e.target.value))}
                                maxLength={15}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Pagar {formatCurrency(payment.value || payment.amount)}
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
