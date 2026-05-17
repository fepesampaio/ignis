import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Award, Loader2, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CertificateGeneratorProps {
  courseId: string;
  progress: number;
  hasPassedExams: boolean;
  hasCertificate: boolean;
}

export function CertificateGenerator({
  courseId,
  progress,
  hasPassedExams,
  hasCertificate,
}: CertificateGeneratorProps) {
  const navigate = useNavigate();
  const [generated, setGenerated] = useState(hasCertificate);

  const canGenerate = progress >= 100 && hasPassedExams && !hasCertificate;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const { data, error } = await supabase.functions.invoke('generate-certificate', {
        body: { courseId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      setGenerated(true);
      toast.success('Certificado gerado com sucesso!');
    },
    onError: (error) => {
      console.error('Error generating certificate:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar certificado');
    },
  });

  if (generated || hasCertificate) {
    return (
      <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
        <CardContent className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">
                Certificado disponível!
              </p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Você concluiu o curso com sucesso.
              </p>
            </div>
          </div>
          <Button onClick={() => navigate('/student/certificates')}>
            <Award className="h-4 w-4 mr-2" />
            Ver Certificado
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!canGenerate) {
    return (
      <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Award className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Certificado
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {progress < 100 
                  ? `Complete todas as aulas (${progress}% concluído)`
                  : 'Seja aprovado em todas as provas'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="h-5 w-5 text-primary" />
          <div>
            <p className="font-medium">Parabéns!</p>
            <p className="text-sm text-muted-foreground">
              Você completou o curso! Gere seu certificado agora.
            </p>
          </div>
        </div>
        <Button 
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Award className="h-4 w-4 mr-2" />
          )}
          Gerar Certificado
        </Button>
      </CardContent>
    </Card>
  );
}
