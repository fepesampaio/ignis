import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar,
  BookOpen,
  Building2,
  CreditCard,
  FileText,
  Receipt,
  FileDown,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { generateTranscriptPDF } from '@/lib/generateTranscript';
import { toast } from 'sonner';

interface StudentProfile {
  full_name: string;
  email: string;
  avatar_url: string | null;
  cpf: string | null;
  phone: string | null;
  whatsapp: string | null;
  birth_date: string | null;
  sex: string | null;
  address_cep: string | null;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
}

interface EnrollmentDetails {
  id: string;
  user_id: string;
  course_id: string;
  enrolled_at: string;
  is_active: boolean;
  completed_at: string | null;
  contract_status: string | null;
  payment_status: string | null;
  profile: StudentProfile | null;
  course: { title: string } | null;
  polo: { id: string; name: string } | null;
}

interface StudentDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollment: EnrollmentDetails | null;
}

export function StudentDetailsDialog({ open, onOpenChange, enrollment }: StudentDetailsDialogProps) {
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleGenerateTranscript = async () => {
    if (!enrollment) return;
    setGeneratingPdf(true);
    try {
      toast.info('Gerando histórico escolar...');
      await generateTranscriptPDF(enrollment.user_id, enrollment.course_id, enrollment.id);
      toast.success('Histórico escolar gerado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar histórico escolar');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Fetch first payment to get due date
  const { data: firstPayment } = useQuery({
    queryKey: ['enrollment-first-payment', enrollment?.user_id, enrollment?.course_id],
    queryFn: async () => {
      if (!enrollment) return null;
      const { data, error } = await supabase
        .from('payments')
        .select('due_date')
        .eq('user_id', enrollment.user_id)
        .eq('course_id', enrollment.course_id)
        .order('installment_number', { ascending: true })
        .limit(1)
        .single();
      if (error) return null;
      return data;
    },
    enabled: open && !!enrollment,
  });

  // Fetch fresh profile data when dialog opens
  const { data: freshProfile } = useQuery({
    queryKey: ['student-profile-details', enrollment?.user_id],
    queryFn: async () => {
      if (!enrollment) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', enrollment.user_id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: open && !!enrollment,
  });

  if (!enrollment) return null;

  // Use fresh profile data if available, otherwise fall back to enrollment profile
  const profile = freshProfile || enrollment.profile;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    // Handle DD/MM/YYYY format
    if (dateString.includes('/')) {
      return dateString;
    }
    // Handle YYYY-MM-DD format - parse without timezone issues
    if (dateString.includes('-') && dateString.length === 10) {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    }
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const getDueDateDay = (dateString: string | null) => {
    if (!dateString) return '-';
    // Parse date without timezone issues (YYYY-MM-DD format)
    if (dateString.includes('-') && dateString.length === 10) {
      const day = parseInt(dateString.split('-')[2], 10);
      return `Dia ${day}`;
    }
    const date = new Date(dateString);
    return `Dia ${date.getDate()}`;
  };

  const formatAddress = () => {
    if (!profile) return '-';
    const parts = [
      profile.address_street,
      profile.address_number ? `Nº ${profile.address_number}` : null,
      profile.address_neighborhood,
      profile.address_city,
      profile.address_state,
      profile.address_cep ? `CEP: ${profile.address_cep}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '-';
  };

  const getSexLabel = (sex: string | null) => {
    if (!sex) return '-';
    switch (sex.toLowerCase()) {
      case 'm':
      case 'masculino':
        return 'Masculino';
      case 'f':
      case 'feminino':
        return 'Feminino';
      default:
        return sex;
    }
  };

  const getContractStatusLabel = (status: string | null) => {
    switch (status) {
      case 'signed':
        return { label: 'Assinado', className: 'bg-green-500/10 text-green-600 border-green-500/20' };
      case 'pending':
        return { label: 'Pendente', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' };
      case 'sent':
        return { label: 'Enviado', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' };
      default:
        return { label: 'Não enviado', className: 'bg-muted text-muted-foreground' };
    }
  };

  const getPaymentStatusLabel = (status: string | null) => {
    switch (status) {
      case 'active':
        return { label: 'Em dia', className: 'bg-green-500/10 text-green-600 border-green-500/20' };
      case 'overdue':
        return { label: 'Em atraso', className: 'bg-red-500/10 text-red-600 border-red-500/20' };
      case 'pending':
        return { label: 'Pendente', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' };
      default:
        return { label: '-', className: 'bg-muted text-muted-foreground' };
    }
  };

  const contractStatus = getContractStatusLabel(enrollment.contract_status);
  const paymentStatus = getPaymentStatusLabel(enrollment.payment_status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Aluno</DialogTitle>
          <DialogDescription>
            Informações da matrícula e dados pessoais do aluno
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header with Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-lg">
                {profile?.full_name?.charAt(0).toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">{profile?.full_name || 'N/A'}</h3>
              <p className="text-sm text-muted-foreground">{profile?.email || 'N/A'}</p>
              <div className="flex gap-2 mt-2">
                {enrollment.is_active ? (
                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                    Matrícula Ativa
                  </Badge>
                ) : (
                  <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
                    Matrícula Inativa
                  </Badge>
                )}
                {enrollment.completed_at && (
                  <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                    Concluído
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateTranscript}
              disabled={generatingPdf}
            >
              <FileDown className="w-4 h-4 mr-2" />
              {generatingPdf ? 'Gerando...' : 'Gerar Histórico Escolar'}
            </Button>
          </div>

          <Separator />

          {/* Course and Polo Info */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <BookOpen className="w-4 h-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Curso</p>
                    <p className="font-medium">{enrollment.course?.title || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Building2 className="w-4 h-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Polo</p>
                    {enrollment.polo ? (
                      <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20">
                        {enrollment.polo.name}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Interno</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Data da Matrícula</p>
                    <p className="font-medium">{formatDate(enrollment.enrolled_at)}</p>
                  </div>
                </div>
                {enrollment.completed_at && (
                  <div className="flex items-start gap-3">
                    <Calendar className="w-4 h-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Data de Conclusão</p>
                      <p className="font-medium">{formatDate(enrollment.completed_at)}</p>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-4 h-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Contrato</p>
                    <Badge className={contractStatus.className}>{contractStatus.label}</Badge>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CreditCard className="w-4 h-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Pagamento</p>
                    <Badge className={paymentStatus.className}>{paymentStatus.label}</Badge>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Receipt className="w-4 h-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Vencimento</p>
                    <p className="font-medium">{getDueDateDay(firstPayment?.due_date)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personal Data */}
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Dados Pessoais
            </h4>
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">CPF</p>
                    <p className="font-medium">{profile?.cpf || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sexo</p>
                    <p className="font-medium">{getSexLabel(profile?.sex)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Data de Nascimento</p>
                    <p className="font-medium">{formatDate(profile?.birth_date)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Contato
            </h4>
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">E-mail</p>
                      <p className="font-medium">{profile?.email || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Telefone</p>
                      <p className="font-medium">{profile?.phone || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 sm:col-span-2">
                    <Phone className="w-4 h-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">WhatsApp</p>
                      <p className="font-medium">{profile?.whatsapp || '-'}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Address */}
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Endereço
            </h4>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm">{formatAddress()}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}