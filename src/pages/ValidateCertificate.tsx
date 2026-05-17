import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Award, Calendar, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CertificateData {
  certificate_number: string;
  issued_at: string;
  student_name: string;
  course_title: string;
  workload_hours: number;
  category: string | null;
}

export default function ValidateCertificate() {
  const { hash } = useParams<{ hash: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [certificate, setCertificate] = useState<CertificateData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const validateCertificate = async () => {
      if (!hash) {
        setError('Hash de validação não fornecido');
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: fnError } = await supabase.functions.invoke('validate-certificate', {
          body: null,
          headers: {},
        });

        // Since we can't pass query params easily, let's query directly
        const { data: cert, error: certError } = await supabase
          .from('certificates')
          .select(`
            certificate_number,
            issued_at,
            user_id,
            courses (
              title,
              workload_hours,
              category
            )
          `)
          .eq('validation_hash', hash)
          .single();

        if (certError || !cert) {
          setIsValid(false);
          setError('Certificado não encontrado');
        } else {
          // Get student name
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('user_id', cert.user_id)
            .single();

          setIsValid(true);
          setCertificate({
            certificate_number: cert.certificate_number,
            issued_at: cert.issued_at,
            student_name: profile?.full_name || 'Nome não disponível',
            course_title: cert.courses?.title || '',
            workload_hours: cert.courses?.workload_hours || 0,
            category: cert.courses?.category || null,
          });
        }
      } catch (err) {
        console.error('Validation error:', err);
        setError('Erro ao validar certificado');
        setIsValid(false);
      } finally {
        setIsLoading(false);
      }
    };

    validateCertificate();
  }, [hash]);

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Award className="h-12 w-12 text-primary" />
          </div>
          <CardTitle>Validação de Certificado</CardTitle>
          <CardDescription>
            Verifique a autenticidade do certificado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isValid && certificate ? (
            <div className="space-y-6">
              {/* Valid badge */}
              <div className="flex items-center justify-center gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-200">
                  Certificado Válido
                </span>
              </div>

              {/* Certificate details */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Aluno</p>
                    <p className="font-medium">{certificate.student_name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Award className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Curso</p>
                    <p className="font-medium">{certificate.course_title}</p>
                    {certificate.category && (
                      <Badge variant="secondary" className="mt-1">
                        {certificate.category}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Emitido em</p>
                      <p className="font-medium text-sm">
                        {format(new Date(certificate.issued_at), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Carga Horária</p>
                      <p className="font-medium text-sm">{certificate.workload_hours}h</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Número do Certificado</p>
                  <p className="font-mono font-medium">{certificate.certificate_number}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2 p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                <XCircle className="h-6 w-6 text-red-600" />
                <span className="font-medium text-red-800 dark:text-red-200">
                  Certificado Inválido
                </span>
              </div>
              <p className="text-muted-foreground">
                {error || 'Este certificado não foi encontrado em nossa base de dados.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
