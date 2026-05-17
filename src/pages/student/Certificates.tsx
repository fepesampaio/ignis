import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Award, Download, ExternalLink, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Certificate {
  id: string;
  certificate_number: string;
  validation_hash: string;
  issued_at: string;
  courses: {
    title: string;
    workload_hours: number;
    category: string | null;
  };
}

export default function StudentCertificates() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: certificates, isLoading } = useQuery({
    queryKey: ['student-certificates', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('certificates')
        .select(`
          id,
          certificate_number,
          validation_hash,
          issued_at,
          courses (
            title,
            workload_hours,
            category
          )
        `)
        .eq('user_id', user.id)
        .order('issued_at', { ascending: false });

      if (error) throw error;
      return data as Certificate[];
    },
    enabled: !!user?.id,
  });

  const getValidationUrl = (hash: string) => {
    return `${window.location.origin}/certificate/validate/${hash}`;
  };

  const handleDownload = (certificate: Certificate) => {
    navigate(`/student/certificates/${certificate.id}/download`);
  };

  return (
    <DashboardLayout
      title="Meus Certificados"
      subtitle="Visualize e baixe seus certificados de conclusão"
    >
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : certificates && certificates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certificates.map((certificate) => (
            <Card key={certificate.id} className="card-elevated">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{certificate.courses?.category || 'Curso'}</Badge>
                  <Award className="h-5 w-5 text-yellow-500" />
                </div>
                <CardTitle className="text-lg">{certificate.courses?.title}</CardTitle>
                <CardDescription>
                  Certificado: {certificate.certificate_number}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {format(new Date(certificate.issued_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{certificate.courses?.workload_hours}h</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => handleDownload(certificate)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar PDF
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum certificado disponível</h3>
            <p className="text-muted-foreground mb-4">
              Complete seus cursos e provas para obter certificados.
            </p>
            <Button onClick={() => navigate('/student/courses')}>
              Ver Meus Cursos
            </Button>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
