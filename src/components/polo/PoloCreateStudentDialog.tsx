import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GroupedCourseSelect } from '@/components/ui/grouped-course-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Copy, Check, UserPlus, Loader2, User, MapPin, Phone, Building, AlertTriangle, Percent, CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const brazilianStates = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

// Mask functions
const maskCPF = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

const maskPhone = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{4})\d+?$/, '$1');
};

const maskCEP = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{3})\d+?$/, '$1');
};

const maskDate = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\/\d{4})\d+?$/, '$1');
};

// Parse a dd/MM/yyyy string into a Date (local), or return null
const parseBRDate = (val: string): Date | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(val);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() !== Number(yyyy) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
  return d;
};

// Compute age in completed years given a birth date
const computeAge = (birth: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

// Categories that require the student to be at least 18 years old
const RESTRICTED_CATEGORIES = ['eja', 'técnico', 'tecnico'];
export const categoryRequiresAdult = (category?: string | null): boolean => {
  if (!category) return false;
  const cat = category.toLowerCase();
  // 'técnico por competência' is also técnico — still restricted
  return RESTRICTED_CATEGORIES.some((k) => cat.includes(k));
};

const formSchema = z.object({
  fullName: z.string().min(3, 'Nome completo deve ter pelo menos 3 caracteres'),
  sex: z.string().min(1, 'Selecione o sexo'),
  cpf: z.string().min(14, 'CPF inválido'),
  birthDate: z
    .string()
    .min(10, 'Data de nascimento inválida')
    .refine((v) => {
      const d = parseBRDate(v);
      if (!d) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d <= today && d >= new Date(1900, 0, 1);
    }, 'Data de nascimento inválida'),
  cep: z.string().min(9, 'CEP inválido'),
  streetNumber: z.string().min(1, 'Número é obrigatório'),
  street: z.string().min(1, 'Rua é obrigatória'),
  neighborhood: z.string().min(1, 'Bairro é obrigatório'),
  city: z.string().min(1, 'Cidade é obrigatória'),
  state: z.string().min(1, 'Estado é obrigatório'),
  whatsapp: z.string().min(15, 'WhatsApp inválido'),
  email: z.string().email('E-mail inválido'),
  courseId: z.string().min(1, 'Selecione um curso'),
  secondCourseId: z.string().optional(),
  dueDate: z
    .string()
    .min(10, 'Data de vencimento inválida')
    .refine((val) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(val);
      if (!m) return false;
      const [_, dd, mm, yyyy] = m;
      const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      if (isNaN(date.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      maxDate.setHours(23, 59, 59, 999);
      return date >= today && date <= maxDate;
    }, 'Selecione uma data de vencimento entre hoje e o final do próximo mês'),
});

type FormData = z.infer<typeof formSchema>;

interface PoloInfo {
  id: string;
  name: string;
  wallet_id: string;
  city?: string | null;
  state?: string | null;
}

interface PoloCreateStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poloInfo: PoloInfo | null | undefined;
  onSuccess: () => void;
}

interface CreatedCredentials {
  email: string;
  password: string;
  fullName: string;
}

// Discount configuration for course combinations
const DISCOUNT_COMBINATIONS = [
  {
    categories: ['eja', 'técnico'],
    percentage: 8,
    label: 'Desconto EJA + Técnico',
    description: 'Ao matricular em EJA e Curso Técnico, o aluno recebe 8% de desconto no valor total.',
  },
];

export function PoloCreateStudentDialog({ open, onOpenChange, poloInfo, onSuccess }: PoloCreateStudentDialogProps) {
  const queryClient = useQueryClient();
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Fetch courses from database with payment info
  const { data: dbCourses } = useQuery({
    queryKey: ['courses-for-polo-enrollment-with-payment'],
    queryFn: async () => {
      const { data: coursesData, error } = await supabase
        .from('courses')
        .select('id, title, category, installment_price, installment_count')
        .eq('is_active', true)
        .order('title');
      if (error) throw error;
      return coursesData || [];
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: '', sex: '', cpf: '', birthDate: '', cep: '', streetNumber: '',
      street: '', neighborhood: '', city: '', state: '', whatsapp: '', email: '',
      courseId: '', secondCourseId: '', dueDate: '',
    },
  });

  const watchedCourseId = form.watch('courseId');
  const watchedSecondCourseId = form.watch('secondCourseId');
  
  const selectedDbCourse = dbCourses?.find(c => c.id === watchedCourseId);
  const secondDbCourse = dbCourses?.find(c => c.id === watchedSecondCourseId);

  // Check for discount eligibility
  const discountInfo = useMemo(() => {
    if (!selectedDbCourse || !secondDbCourse) return null;
    
    const firstCategory = selectedDbCourse.category?.toLowerCase() || '';
    const secondCategory = secondDbCourse.category?.toLowerCase() || '';
    
    for (const combo of DISCOUNT_COMBINATIONS) {
      const hasFirst = combo.categories.some(cat => firstCategory.includes(cat));
      const hasSecond = combo.categories.some(cat => secondCategory.includes(cat));
      const differentCategories = !combo.categories.some(cat => 
        firstCategory.includes(cat) && secondCategory.includes(cat)
      );
      
      if (hasFirst && hasSecond && differentCategories) {
        return combo;
      }
    }
    return null;
  }, [selectedDbCourse, secondDbCourse]);

  // Calculate combined payment info for both courses
  const combinedPaymentInfo = useMemo(() => {
    if (!selectedDbCourse) return null;
    
    const firstPrice = selectedDbCourse.installment_price || 0;
    const firstCount = selectedDbCourse.installment_count || 1;
    
    let totalPrice = firstPrice;
    let maxInstallments = firstCount;
    
    if (secondDbCourse) {
      const secondPrice = secondDbCourse.installment_price || 0;
      const secondCount = secondDbCourse.installment_count || 1;
      totalPrice += secondPrice;
      maxInstallments = Math.max(firstCount, secondCount);
    }
    
    let finalPrice = totalPrice;
    if (discountInfo) {
      finalPrice = totalPrice - (totalPrice * (discountInfo.percentage / 100));
    }
    
    return {
      originalPrice: totalPrice,
      finalPrice,
      qtdparcelas: maxInstallments,
      hasDiscount: !!discountInfo,
    };
  }, [selectedDbCourse, secondDbCourse, discountInfo]);

  // Format price
  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return 'Não configurado';
    return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // CEP lookup (ViaCEP) — non-blocking, with error feedback and auto-focus on number
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  const handleCEPLookup = async (cep: string) => {
    const cleanCEP = cep.replace(/\D/g, '');
    setCepError(null);
    if (cleanCEP.length !== 8) return;
    setCepLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
      const data = await response.json();
      if (data?.erro) {
        setCepError('CEP não encontrado');
        return;
      }
      form.setValue('street', data.logradouro || '', { shouldValidate: true });
      form.setValue('neighborhood', data.bairro || '', { shouldValidate: true });
      form.setValue('city', data.localidade || '', { shouldValidate: true });
      form.setValue('state', data.uf || '', { shouldValidate: true });
      // Focus the number field for fast entry
      setTimeout(() => {
        const el = document.getElementById('polo-street-number') as HTMLInputElement | null;
        el?.focus();
      }, 0);
    } catch (error) {
      setCepError('CEP não encontrado');
    } finally {
      setCepLoading(false);
    }
  };

  // Calculate split percentage for a course
  const getSplitPercentage = (category: string | null) => {
    if (!category) return 0;
    const cat = category.toLowerCase();
    
    // EJA and Técnico (not including competência): 40%
    if (cat.includes('eja') || (cat.includes('técnico') && !cat.includes('competência'))) {
      return 40;
    }
    // Competência or Técnico por Competência: 35%
    if (cat.includes('competência') || cat.includes('competencia')) {
      return 35;
    }
    // Profissional: 50%
    if (cat.includes('profissional')) {
      return 50;
    }
    return 0;
  };

  const createStudentMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');
      if (!poloInfo) throw new Error('Informações do polo não disponíveis');

      const selectedCourse = dbCourses?.find(c => c.id === data.courseId);
      const courseCategory = selectedCourse?.category?.toLowerCase() || '';
      
      const splitPercentage = getSplitPercentage(selectedCourse?.category || null);
      
      // Prepare course IDs array
      const courseIds = [data.courseId];
      if (data.secondCourseId && data.secondCourseId !== 'none') {
        courseIds.push(data.secondCourseId);
      }
      
      const response = await supabase.functions.invoke('create-student', {
        body: {
          email: data.email,
          fullName: data.fullName,
          phone: data.whatsapp,
          courseId: data.courseId,
          courseIds: courseIds,
          sendEmail: false, // Never send email for polo enrollments
          platformUrl: window.location.origin,
          poloId: poloInfo.id,
          splitConfig: { walletId: poloInfo.wallet_id, percentage: splitPercentage, poloName: poloInfo.name },
          additionalData: {
            sex: data.sex, cpf: data.cpf, birthDate: data.birthDate,
            address: { cep: data.cep, streetNumber: data.streetNumber, street: data.street, neighborhood: data.neighborhood, city: data.city, state: data.state },
            whatsapp: data.whatsapp, dueDate: data.dueDate,
            monthlyValue: combinedPaymentInfo?.finalPrice || selectedCourse?.installment_price || 0,
            installments: combinedPaymentInfo?.qtdparcelas || selectedCourse?.installment_count || 1,
          },
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao criar aluno');
      }

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erro ao criar aluno');
      }

      return response.data;
    },
    onSuccess: (data) => {
      setCredentials({
        email: data.credentials.email,
        password: data.credentials.password,
        fullName: data.user.fullName,
      });
      queryClient.invalidateQueries({ queryKey: ['polo-enrollments-list'] });
      onSuccess();
      toast.success(data.message || 'Aluno criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (data: FormData) => {
    const birth = parseBRDate(data.birthDate);
    const age = birth ? computeAge(birth) : null;
    if (age !== null && age < 18) {
      const firstCat = dbCourses?.find((c) => c.id === data.courseId)?.category || null;
      const secondCat = data.secondCourseId && data.secondCourseId !== 'none'
        ? dbCourses?.find((c) => c.id === data.secondCourseId)?.category || null
        : null;
      if (categoryRequiresAdult(firstCat) || categoryRequiresAdult(secondCat)) {
        toast.error('Para cursos das categorias EJA e Técnico, o aluno deve ter pelo menos 18 anos completos');
        return;
      }
    }
    createStudentMutation.mutate(data);
  };

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success('Copiado para a área de transferência');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleClose = () => {
    setCredentials(null);
    form.reset();
    onOpenChange(false);
  };

  const handleCreateAnother = () => {
    setCredentials(null);
    form.reset();
  };

  // Get available courses for second dropdown (excluding first selection)
  const availableSecondCourses = useMemo(() => {
    if (!dbCourses || !watchedCourseId) return [];
    return dbCourses.filter(c => c.id !== watchedCourseId);
  }, [dbCourses, watchedCourseId]);

  // Success state - simplified for polo users (no credentials shown)
  if (credentials) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="w-5 h-5" />
              Aluno Matriculado com Sucesso!
            </DialogTitle>
            <DialogDescription>
              A matrícula foi realizada com sucesso
            </DialogDescription>
          </DialogHeader>

          <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between p-3 bg-background rounded border">
                <div>
                  <p className="text-xs text-muted-foreground">Nome do Aluno</p>
                  <p className="font-medium">{credentials.fullName}</p>
                </div>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Os dados de acesso do aluno serão enviados por e-mail após a assinatura do contrato.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={handleCreateAnother} className="flex-1">
              <UserPlus className="w-4 h-4 mr-2" />
              Cadastrar Outro Aluno
            </Button>
            <Button onClick={handleClose} className="flex-1">
              Concluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Aluno</DialogTitle>
          <DialogDescription>
            Preencha todos os dados do aluno. A matrícula será vinculada automaticamente ao polo{' '}
            <strong>{poloInfo?.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* Polo Info Badge */}
        <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <Building className="w-5 h-5 text-primary" />
          <span className="text-sm">
            Polo: <strong>{poloInfo?.name}</strong>
            {poloInfo?.city && ` - ${poloInfo.city}/${poloInfo.state}`}
          </span>
        </div>

        <ScrollArea className="max-h-[calc(90vh-200px)] pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              
              {/* Personal Data Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <User className="w-4 h-4" />
                  Dados Pessoais
                </div>
                <Separator />
                
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo do aluno" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sex"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sexo *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="masculino">Masculino</SelectItem>
                            <SelectItem value="feminino">Feminino</SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cpf"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="000.000.000-00" 
                            {...field}
                            onChange={(e) => field.onChange(maskCPF(e.target.value))}
                            maxLength={14}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="birthDate"
                  render={({ field }) => {
                    const birth = parseBRDate(field.value);
                    const age = birth ? computeAge(birth) : null;
                    const isMinor = age !== null && age < 18;
                    return (
                      <FormItem>
                        <FormLabel>Data de Nascimento *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="dd/mm/aaaa"
                            {...field}
                            onChange={(e) => field.onChange(maskDate(e.target.value))}
                            maxLength={10}
                          />
                        </FormControl>
                        {age !== null && age >= 0 && (
                          <p className={cn('text-xs mt-1', isMinor ? 'text-amber-600 font-medium' : 'text-muted-foreground')}>
                            Idade: {age} {age === 1 ? 'ano' : 'anos'}
                            {isMinor ? ' — Menor de idade' : ''}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>

              {/* Address Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  Endereço
                </div>
                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cep"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CEP *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="00000-000"
                            {...field}
                            onChange={(e) => {
                              const masked = maskCEP(e.target.value);
                              field.onChange(masked);
                              if (cepError) setCepError(null);
                              if (masked.replace(/\D/g, '').length === 8) {
                                handleCEPLookup(masked);
                              }
                            }}
                            onBlur={(e) => handleCEPLookup(e.target.value)}
                            maxLength={9}
                          />
                        </FormControl>
                        {cepLoading && (
                          <p className="text-xs text-muted-foreground mt-1">Buscando endereço...</p>
                        )}
                        {cepError && !cepLoading && (
                          <p className="text-xs text-amber-600 mt-1">{cepError} — preencha manualmente</p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="streetNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número *</FormLabel>
                        <FormControl>
                          <Input id="polo-street-number" placeholder="Número" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rua *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome da rua" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="neighborhood"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bairro *</FormLabel>
                        <FormControl>
                          <Input placeholder="Bairro" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade *</FormLabel>
                        <FormControl>
                          <Input placeholder="Cidade" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="UF" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {brazilianStates.map((state) => (
                              <SelectItem key={state} value={state}>
                                {state}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Contact & Course Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  Contato e Curso
                </div>
                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="whatsapp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="(11) 99999-9999" 
                            {...field}
                            onChange={(e) => field.onChange(maskPhone(e.target.value))}
                            maxLength={15}
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
                        <FormLabel>E-mail *</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="email@exemplo.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="courseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Curso Principal *</FormLabel>
                      <FormControl>
                        <GroupedCourseSelect
                          courses={dbCourses}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Selecione um curso"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Second Course Selection */}
                <FormField
                  control={form.control}
                  name="secondCourseId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Segundo Curso (Opcional)</FormLabel>
                      <FormControl>
                        <GroupedCourseSelect
                          courses={availableSecondCourses}
                          value={field.value || 'none'}
                          onValueChange={field.onChange}
                          placeholder="Selecione um segundo curso (opcional)"
                          disabled={!watchedCourseId}
                          includeNoneOption
                          noneOptionLabel="Nenhum segundo curso"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Discount Alert */}
                {discountInfo && (
                  <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                    <Percent className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700 dark:text-green-300">
                      <strong>{discountInfo.label}:</strong> {discountInfo.description}
                    </AlertDescription>
                  </Alert>
                )}


                {combinedPaymentInfo && (
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Valor da Mensalidade:</span>
                      <div className="flex items-center gap-2">
                        {combinedPaymentInfo.hasDiscount && (
                          <span className="text-sm text-muted-foreground line-through">
                            {formatPrice(combinedPaymentInfo.originalPrice)}
                          </span>
                        )}
                        <span className="font-bold text-lg text-primary">
                          {formatPrice(combinedPaymentInfo.finalPrice)}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Quantidade de Parcelas:</span>
                      <Badge variant="secondary">{combinedPaymentInfo.qtdparcelas}x</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Split para o Polo:</span>
                      <Badge variant="outline">
                        {getSplitPercentage(selectedDbCourse?.category || null)}%
                      </Badge>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
                    const parsed = (() => {
                      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(field.value || '');
                      if (!m) return undefined;
                      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
                      return isNaN(d.getTime()) ? undefined : d;
                    })();
                    return (
                      <FormItem className="flex flex-col">
                        <FormLabel>Vencimento da Mensalidade *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                type="button"
                                variant="outline"
                                className={cn(
                                  'w-full pl-3 text-left font-normal',
                                  !parsed && 'text-muted-foreground'
                                )}
                              >
                                {parsed ? format(parsed, 'dd/MM/yyyy', { locale: ptBR }) : <span>Selecione uma data</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={parsed}
                              onSelect={(date) => {
                                if (!date) {
                                  field.onChange('');
                                  return;
                                }
                                if (date < today || date > maxDate) {
                                  toast.error('Selecione uma data de vencimento entre hoje e o final do próximo mês');
                                  return;
                                }
                                field.onChange(format(date, 'dd/MM/yyyy'));
                              }}
                              disabled={(date) => date < today || date > maxDate}
                              defaultMonth={parsed || today}
                              fromDate={today}
                              toDate={maxDate}
                              initialFocus
                              locale={ptBR}
                              className={cn('p-3 pointer-events-auto')}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createStudentMutation.isPending}>
                  {createStudentMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Cadastrar Aluno
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
