import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { LifeBuoy, Mail, MessageCircle, Shield } from 'lucide-react';

const APP_VERSION = '1.0.0';
const SUPPORT_EMAIL = 'contato@institutoignis.com.br';
const SUPPORT_WHATSAPP = 'https://wa.me/message/LWSEFGTD2JQXI1';

export default function About() {
  const { settings } = useSystemSettings();

  return (
    <DashboardLayout
      title="Sobre o App"
      subtitle="Informações institucionais e canais de suporte"
    >
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="card-elevated">
          <CardHeader>
            <div className="flex items-center gap-4">
              {settings.platform_logo_url ? (
                <img
                  src={settings.platform_logo_url}
                  alt={settings.platform_name}
                  className="h-16 w-16 rounded-2xl object-contain"
                />
              ) : null}
              <div>
                <CardTitle className="text-2xl">{settings.platform_name}</CardTitle>
                <CardDescription className="mt-1">
                  Plataforma educacional para acesso a cursos, atividades, pagamentos e certificados.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <span className="font-medium text-foreground">Versão do app</span>
              <span>{APP_VERSION}</span>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="font-medium text-foreground">Instituição responsável</p>
              <p className="mt-1">Instituto Ignis</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="font-medium text-foreground">Sobre</p>
              <p className="mt-1">
                Este aplicativo permite acompanhar a jornada acadêmica do aluno, acessar conteúdos,
                enviar atividades, consultar pagamentos e emitir documentos.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LifeBuoy className="h-5 w-5" />
                Suporte
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-start">
                <a href={SUPPORT_WHATSAPP} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <a href={`mailto:${SUPPORT_EMAIL}`}>
                  <Mail className="mr-2 h-4 w-4" />
                  {SUPPORT_EMAIL}
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5" />
                Privacidade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                A política de privacidade está disponível dentro do próprio aplicativo.
              </p>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/privacy-policy">
                  <Shield className="mr-2 h-4 w-4" />
                  Política de Privacidade
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
