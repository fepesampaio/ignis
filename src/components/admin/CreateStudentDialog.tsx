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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GroupedCourseSelect } from '@/components/ui/grouped-course-select';
import { toast } from 'sonner';
import { Copy, Check, UserPlus, Loader2, Mail, User, MapPin, Phone, Building, AlertTriangle, Percent, X, FileDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

const formSchema = z.object({
  // Personal data
  fullName: z.string().min(3, 'Nome completo deve ter pelo menos 3 caracteres'),
  sex: z.string().min(1, 'Selecione o sexo'),
  cpf: z.string().min(14, 'CPF inválido'),
  birthDate: z.string().min(10, 'Data de nascimento inválida'),
  
  // Address
  cep: z.string().min(9, 'CEP inválido'),
  streetNumber: z.string().min(1, 'Número é obrigatório'),
  street: z.string().min(1, 'Rua é obrigatória'),
  neighborhood: z.string().min(1, 'Bairro é obrigatório'),
  city: z.string().min(1, 'Cidade é obrigatória'),
  state: z.string().min(1, 'Estado é obrigatório'),
  
  // Contact
  whatsapp: z.string().min(15, 'WhatsApp inválido'),
  email: z.string().email('E-mail inválido'),
  
  // Course and Polo
  courseId: z.string().min(1, 'Selecione um curso'),
  secondCourseId: z.string().optional(),
  poloId: z.string().optional(),
  dueDate: z.string().optional(), // Made optional for migrated students
  
  // Options
  sendEmail: z.boolean().default(true),
});

type FormData = z.infer<typeof formSchema>;

interface CreateStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCourseId?: string;
}

interface CreatedCredentials {
  email: string;
  password: string;
  fullName: string;
  emailSent?: boolean;
}

export function CreateStudentDialog({ open, onOpenChange }: CreateStudentDialogProps) {
  const queryClient = useQueryClient();
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [selectedCourseInfo, setSelectedCourseInfo] = useState<{ price: string; priceValue: number; qtdparcelas: number } | null>(null);
  const [enableSecondCourse, setEnableSecondCourse] = useState(false);
  const [isMigratedStudent, setIsMigratedStudent] = useState(false);

  // Fetch polos
  const { data: polos } = useQuery({
    queryKey: ['active-polos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('polos')
        .select('id, name, wallet_id, city, state')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch courses from database with subject count and payment info
  const { data: dbCourses } = useQuery({
    queryKey: ['courses-for-enrollment-with-payment-info'],
    queryFn: async () => {
      const { data: coursesData, error } = await supabase
        .from('courses')
        .select('id, title, category, installment_price, installment_count')
        .eq('is_active', true)
        .order('title');

      if (error) throw error;

      // Get subject count for each course
      const coursesWithSubjects = await Promise.all(
        (coursesData || []).map(async (course) => {
          const { count } = await supabase
            .from('subjects')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', course.id)
            .eq('is_active', true);
          return { ...course, subjectsCount: count || 0 };
        })
      );

      return coursesWithSubjects;
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: '',
      sex: '',
      cpf: '',
      birthDate: '',
      cep: '',
      streetNumber: '',
      street: '',
      neighborhood: '',
      city: '',
      state: '',
      whatsapp: '',
      email: '',
      courseId: '',
      secondCourseId: '',
      poloId: '',
      dueDate: '',
      sendEmail: true,
    },
  });

  // Reset second course when checkbox is disabled
  useEffect(() => {
    if (!enableSecondCourse) {
      form.setValue('secondCourseId', '');
    }
  }, [enableSecondCourse, form]);

  const watchedCourseId = form.watch('courseId');
  const watchedSecondCourseId = form.watch('secondCourseId');
  const selectedDbCourse = dbCourses?.find(c => c.id === watchedCourseId);
  const secondDbCourse = dbCourses?.find(c => c.id === watchedSecondCourseId);
  const hasNoSubjects = selectedDbCourse && selectedDbCourse.subjectsCount === 0;
  const secondHasNoSubjects = secondDbCourse && secondDbCourse.subjectsCount === 0;

  // Filter available courses for second select (exclude first course)
  const availableSecondCourses = useMemo(() => {
    return dbCourses?.filter(c => c.id !== watchedCourseId) || [];
  }, [dbCourses, watchedCourseId]);

  // Check if EJA + Técnico combination for discount
  const discountInfo = useMemo(() => {
    if (!selectedDbCourse || !secondDbCourse) return null;

    const categories = [
      selectedDbCourse.category?.toLowerCase() || '',
      secondDbCourse.category?.toLowerCase() || ''
    ];

    const hasEJA = categories.some(c => c.includes('eja'));
    const hasTecnico = categories.some(c => c.includes('técnico') || c.includes('tecnico'));

    if (hasEJA && hasTecnico) {
      return {
        percentage: 8,
        message: 'Desconto de 8% aplicado automaticamente para combinação EJA + Técnico'
      };
    }

    return null;
  }, [selectedDbCourse, secondDbCourse]);

  // Format price from course database fields
  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return 'A definir';
    return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Calculate combined payment info for display
  const combinedPaymentInfo = useMemo(() => {
    if (!selectedDbCourse) return null;

    const firstPrice = selectedDbCourse.installment_price ?? 0;
    const firstCount = selectedDbCourse.installment_count ?? 1;
    
    let totalPrice = firstPrice;
    let maxInstallments = firstCount;

    // Add second course price if selected
    if (secondDbCourse) {
      const secondPrice = secondDbCourse.installment_price ?? 0;
      const secondCount = secondDbCourse.installment_count ?? 1;
      totalPrice += secondPrice;
      maxInstallments = Math.max(firstCount, secondCount);
    }

    // Apply discount if applicable
    let finalPrice = totalPrice;
    if (discountInfo) {
      const discountAmount = totalPrice * (discountInfo.percentage / 100);
      finalPrice = totalPrice - discountAmount;
    }

    return {
      originalPrice: totalPrice,
      finalPrice: finalPrice,
      formattedOriginalPrice: formatPrice(totalPrice),
      formattedFinalPrice: formatPrice(finalPrice),
      qtdparcelas: maxInstallments,
      hasDiscount: discountInfo !== null,
    };
  }, [selectedDbCourse, secondDbCourse, discountInfo]);

  useEffect(() => {
    if (selectedDbCourse) {
      const price = selectedDbCourse.installment_price;
      const count = selectedDbCourse.installment_count;
      
      if (price !== null && count !== null) {
        setSelectedCourseInfo({
          price: formatPrice(price),
          priceValue: price,
          qtdparcelas: count,
        });
      } else {
        // Default values if no price configured
        setSelectedCourseInfo({
          price: 'Não configurado',
          priceValue: 0,
          qtdparcelas: 1,
        });
      }
    } else {
      setSelectedCourseInfo(null);
    }
  }, [selectedDbCourse]);

  // CEP lookup
  const handleCEPBlur = async (cep: string) => {
    const cleanCEP = cep.replace(/\D/g, '');
    if (cleanCEP.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
        const data = await response.json();
        if (!data.erro) {
          form.setValue('street', data.logradouro || '');
          form.setValue('neighborhood', data.bairro || '');
          form.setValue('city', data.localidade || '');
          form.setValue('state', data.uf || '');
        }
      } catch (error) {
        console.error('Error fetching CEP:', error);
      }
    }
  };

  const createStudentMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      // Get course info from DB - using new database fields
      const selectedCourse = dbCourses?.find(c => c.id === data.courseId);
      const secondCourse = enableSecondCourse && data.secondCourseId 
        ? dbCourses?.find(c => c.id === data.secondCourseId) 
        : null;
      
      const courseInfo = {
        priceValue: selectedCourse?.installment_price ?? 0,
        qtdparcelas: selectedCourse?.installment_count ?? 1,
      };
      
      // Get polo info for split configuration
      const selectedPolo = polos?.find(p => p.id === data.poloId);
      
      // Determine course category for split percentage from DB course category
      const courseCategory = selectedCourse?.category?.toLowerCase() || '';
      
      // Split percentages based on course type
      // EJA and Técnicos: 40%, Técnico por Competência: 35%, Profissionais: 50%
      let splitPercentage = 0;
      if (selectedPolo) {
        if (courseCategory.includes('eja') || (courseCategory.includes('técnico') && !courseCategory.includes('competência'))) {
          splitPercentage = 40;
        } else if (courseCategory.includes('competência')) {
          splitPercentage = 35;
        } else if (courseCategory.includes('profissional')) {
          splitPercentage = 50;
        }
      }

      // Build course IDs array
      const courseIds = [data.courseId];
      if (secondCourse) {
        courseIds.push(data.secondCourseId!);
      }
      
      const response = await supabase.functions.invoke('create-student', {
        body: {
          email: data.email,
          fullName: data.fullName,
          phone: data.whatsapp,
          courseId: data.courseId, // Primary course
          courseIds: courseIds, // All courses (including second if selected)
          sendEmail: data.sendEmail,
          platformUrl: window.location.origin,
          poloId: data.poloId || null,
          splitConfig: selectedPolo ? {
            walletId: selectedPolo.wallet_id,
            percentage: splitPercentage,
            poloName: selectedPolo.name,
          } : null,
          hasDiscount: discountInfo !== null,
          discountPercentage: discountInfo?.percentage || 0,
          isMigrated: isMigratedStudent,
          migrationSource: isMigratedStudent ? 'moodle' : null,
          additionalData: {
            sex: data.sex,
            cpf: data.cpf,
            birthDate: data.birthDate,
            address: {
              cep: data.cep,
              streetNumber: data.streetNumber,
              street: data.street,
              neighborhood: data.neighborhood,
              city: data.city,
              state: data.state,
            },
            whatsapp: data.whatsapp,
            dueDate: isMigratedStudent ? '' : data.dueDate, // No due date for migrated students
            monthlyValue: combinedPaymentInfo?.finalPrice || courseInfo?.priceValue || 0,
            installments: combinedPaymentInfo?.qtdparcelas || courseInfo?.qtdparcelas || 1,
          },
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao criar aluno');
      }

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erro ao criar aluno');
      }

      return { ...response.data, coursesCount: courseIds.length, hasDiscount: discountInfo !== null };
    },
    onSuccess: (data) => {
      setCredentials({
        email: data.credentials.email,
        password: data.credentials.password,
        fullName: data.user.fullName,
        emailSent: data.emailSent,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-enrollments'] });
      
      if (data.coursesCount > 1) {
        if (data.hasDiscount) {
          toast.success(`Aluno matriculado em ${data.coursesCount} cursos com desconto de 8%!`);
        } else {
          toast.success(`Aluno matriculado em ${data.coursesCount} cursos com sucesso!`);
        }
      } else {
        toast.success(data.message || 'Aluno criado com sucesso!');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (data: FormData) => {
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
    setSelectedCourseInfo(null);
    setEnableSecondCourse(false);
    setIsMigratedStudent(false);
    form.reset();
    onOpenChange(false);
  };

  const handleCreateAnother = () => {
    setCredentials(null);
    setSelectedCourseInfo(null);
    setEnableSecondCourse(false);
    form.reset({
      fullName: '',
      sex: '',
      cpf: '',
      birthDate: '',
      cep: '',
      streetNumber: '',
      street: '',
      neighborhood: '',
      city: '',
      state: '',
      whatsapp: '',
      email: '',
      courseId: '',
      secondCourseId: '',
      poloId: '',
      dueDate: '',
      sendEmail: true,
    });
  };

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
              {credentials.emailSent 
                ? 'O aluno receberá os dados de acesso por email'
                : 'Compartilhe os dados de acesso abaixo com o aluno'}
            </DialogDescription>
          </DialogHeader>

          {credentials.emailSent && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Mail className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-700 dark:text-blue-300">
                Email com os dados de acesso enviado para <strong>{credentials.email}</strong>
              </span>
            </div>
          )}

          <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Dados de Acesso</CardTitle>
                {credentials.emailSent && (
                  <Badge variant="secondary" className="text-xs">
                    <Mail className="w-3 h-3 mr-1" />
                    Enviado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-2 bg-background rounded border">
                <div>
                  <p className="text-xs text-muted-foreground">Nome</p>
                  <p className="font-medium">{credentials.fullName}</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-background rounded border">
                <div>
                  <p className="text-xs text-muted-foreground">E-mail</p>
                  <p className="font-medium font-mono">{credentials.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCopy(credentials.email, 'email')}
                >
                  {copiedField === 'email' ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between p-2 bg-background rounded border">
                <div>
                  <p className="text-xs text-muted-foreground">Senha</p>
                  <p className="font-medium font-mono">{credentials.password}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCopy(credentials.password, 'password')}
                >
                  {copiedField === 'password' ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleCopy(
                  `E-mail: ${credentials.email}\nSenha: ${credentials.password}`,
                  'all'
                )}
              >
                {copiedField === 'all' ? (
                  <>
                    <Check className="w-4 h-4 mr-2 text-green-600" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar Todos os Dados
                  </>
                )}
              </Button>
            </CardContent>
          </Card>


          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={handleCreateAnother} className="flex-1">
              <UserPlus className="w-4 h-4 mr-2" />
              Criar Outro
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
          <DialogTitle>Cadastrar Nova Matrícula</DialogTitle>
          <DialogDescription>
            Preencha todos os dados do aluno para realizar a matrícula.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
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
                  render={({ field }) => (
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
                      <FormMessage />
                    </FormItem>
                  )}
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
                            onChange={(e) => field.onChange(maskCEP(e.target.value))}
                            onBlur={(e) => handleCEPBlur(e.target.value)}
                            maxLength={9}
                          />
                        </FormControl>
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
                          <Input placeholder="Número" {...field} />
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
                      <FormLabel>Curso *</FormLabel>
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

                {hasNoSubjects && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Atenção:</strong> Este curso não possui matérias cadastradas. 
                      O aluno não terá conteúdo disponível após a matrícula.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Second Course Option */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enableSecondCourseNew"
                      checked={enableSecondCourse}
                      onCheckedChange={(checked) => setEnableSecondCourse(checked === true)}
                    />
                    <label
                      htmlFor="enableSecondCourseNew"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Matricular em 2 cursos
                    </label>
                  </div>

                  {enableSecondCourse && (
                    <>
                      <FormField
                        control={form.control}
                        name="secondCourseId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Segundo Curso</FormLabel>
                            <FormControl>
                              <GroupedCourseSelect
                                courses={availableSecondCourses}
                                value={field.value || ''}
                                onValueChange={field.onChange}
                                placeholder="Selecione o segundo curso"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {secondHasNoSubjects && (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>Atenção:</strong> O segundo curso não possui matérias cadastradas.
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}
                </div>

                {/* Discount Alert */}
                {discountInfo && (
                  <Alert className="bg-green-500/10 border-green-500/20">
                    <Percent className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700">
                      <strong>Desconto Automático!</strong> {discountInfo.message}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Selected Courses Summary */}
                {(selectedDbCourse || secondDbCourse) && (
                  <div className="p-3 bg-muted rounded-lg space-y-2">
                    <p className="text-sm font-medium">Cursos selecionados:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedDbCourse && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          {selectedDbCourse.title}
                          {selectedDbCourse.category && (
                            <span className="text-muted-foreground">({selectedDbCourse.category})</span>
                          )}
                        </Badge>
                      )}
                      {secondDbCourse && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          {secondDbCourse.title}
                          {secondDbCourse.category && (
                            <span className="text-muted-foreground">({secondDbCourse.category})</span>
                          )}
                          <button 
                            type="button"
                            onClick={() => form.setValue('secondCourseId', '')}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      )}
                    </div>
                    {combinedPaymentInfo && (
                      <div className="pt-2 border-t mt-2 space-y-2">
                        {combinedPaymentInfo.hasDiscount && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Valor Original (soma):</span>
                            <span className="text-sm line-through text-muted-foreground">
                              {combinedPaymentInfo.formattedOriginalPrice}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            Valor da Mensalidade{combinedPaymentInfo.hasDiscount ? ' (com desconto)' : ''}:
                          </span>
                          <span className={`font-bold text-lg ${combinedPaymentInfo.hasDiscount ? 'text-green-600' : 'text-primary'}`}>
                            {combinedPaymentInfo.formattedFinalPrice}
                          </span>
                        </div>
                        {combinedPaymentInfo.hasDiscount && discountInfo && (
                          <p className="text-sm text-green-600 font-medium">
                            💰 Desconto de {discountInfo.percentage}% aplicado
                          </p>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Quantidade de Parcelas:</span>
                          <Badge variant="secondary">{combinedPaymentInfo.qtdparcelas}x</Badge>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="poloId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Building className="w-4 h-4" />
                        Polo
                      </FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === 'none' ? '' : val)} value={field.value || 'none'}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um polo (opcional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sem polo</SelectItem>
                          {polos?.filter(polo => polo.id).map((polo) => (
                            <SelectItem key={polo.id} value={polo.id}>
                              {polo.name} {polo.city && polo.state ? `(${polo.city}/${polo.state})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {(() => {
                          const courseCategory = selectedDbCourse?.category?.toLowerCase() || '';
                          
                          if (!field.value) return 'Selecione um polo para configurar split de pagamento';
                          
                          if (courseCategory.includes('eja') || (courseCategory.includes('técnico') && !courseCategory.includes('competência'))) {
                            return 'Split: 40% para o polo em cada mensalidade';
                          } else if (courseCategory.includes('competência')) {
                            return 'Split: 35% para o polo em cada mensalidade';
                          } else if (courseCategory.includes('profissional')) {
                            return 'Split: 50% para o polo em cada mensalidade';
                          }
                          return 'Selecione um curso para ver o percentual de split';
                        })()}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Migrated Student Option */}
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isMigratedStudent"
                      checked={isMigratedStudent}
                      onCheckedChange={(checked) => setIsMigratedStudent(checked === true)}
                    />
                    <label
                      htmlFor="isMigratedStudent"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Aluno migrado do Moodle
                    </label>
                  </div>

                  {isMigratedStudent && (
                    <Alert className="bg-amber-500/10 border-amber-500/20">
                      <FileDown className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-700">
                        <strong>Aluno migrado:</strong> Não será gerado contrato nem boletos. 
                        O acesso será liberado imediatamente. Os boletos serão buscados pelo CPF no Asaas.
                        Gerencie o progresso na página "Progresso Alunos".
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {!isMigratedStudent && (
                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vencimento da Mensalidade *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="dd/mm/aaaa" 
                            {...field}
                            onChange={(e) => field.onChange(maskDate(e.target.value))}
                            maxLength={10}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

              </div>


              <div className="flex justify-end gap-2 pt-4 sticky bottom-0 bg-background pb-2">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createStudentMutation.isPending}>
                  {createStudentMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Salvar Matrícula
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
