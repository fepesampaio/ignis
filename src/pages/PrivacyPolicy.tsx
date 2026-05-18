import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PrivacyPolicy() {
  return (
    <DashboardLayout
      title="Política de Privacidade"
      subtitle="Última atualização: 18 de maio de 2026"
    >
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Instituto Ignis de Educação Digital</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm leading-7 text-muted-foreground">
          <section className="space-y-3">
            <p>
              O Instituto Ignis de Educação Digital valoriza a privacidade dos seus usuários e está
              comprometido com a proteção de seus dados pessoais. Esta Política de Privacidade
              descreve como o nosso aplicativo oficial coleta, usa, armazena e compartilha as suas
              informações.
            </p>
            <p>
              Ao utilizar este aplicativo, você concorda com a coleta e o uso de informações de
              acordo com esta política, em conformidade com a Lei Geral de Proteção de Dados
              (LGPD) e as diretrizes da Google Play Store.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">1. Informações que Coletamos</h2>
            <p>
              Para fornecer os serviços educacionais e de gestão de forma eficiente, coletamos as
              seguintes categorias de dados, dependendo do seu tipo de perfil:
            </p>
            <div className="space-y-2">
              <p className="font-medium text-foreground">A. Perfil do Aluno</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Dados de identificação e acesso: nome completo, e-mail, CPF, matrícula e senha de acesso.</li>
                <li>Dados acadêmicos: histórico de frequência, notas, respostas de exercícios, envio de provas e progresso nas aulas assistidas.</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground">B. Perfil do Professor</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Dados de identificação: nome completo, e-mail, CPF e credenciais de acesso.</li>
                <li>Atividades pedagógicas: histórico de correções de trabalhos, atribuição de notas e feedbacks enviados aos alunos.</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground">C. Perfil do Polo (Administrativo)</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Dados de gestão: nome do responsável, e-mail e dados do polo parceiro.</li>
                <li>Dados de terceiros: informações inseridas para a realização de novas matrículas, como nome, documentos e dados de contato do novo aluno.</li>
                <li>Dados financeiros e comerciais: informações sobre o gerenciamento de matriculados e relatórios de comissões.</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground">D. Dados Técnicos e de Armazenamento (Todos os Usuários)</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Armazenamento local (cache): dados temporários de login e arquivos de mídia para acelerar o carregamento e otimizar a navegação.</li>
                <li>Dados do dispositivo: modelo do aparelho, sistema operacional e identificadores únicos do dispositivo para fins de segurança e notificações push.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">2. Como Utilizamos os Seus Dados</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Viabilizar o acesso à plataforma de ensino, incluindo aulas, exercícios e provas.</li>
              <li>Permitir o fluxo pedagógico entre professores e alunos, incluindo correção de trabalhos e lançamento de notas.</li>
              <li>Operacionalizar a gestão de polos, matrículas, administração de alunos e cálculo de comissões.</li>
              <li>Garantir a segurança do aplicativo, prevenindo fraudes e acessos não autorizados.</li>
              <li>Melhorar o desempenho do aplicativo através do armazenamento local de dados.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">3. Compartilhamento de Dados</h2>
            <p>O Instituto Ignis não vende, comercializa ou aluga os dados pessoais dos usuários. O compartilhamento ocorre apenas nas seguintes hipóteses:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Entre perfis do aplicativo: dados de alunos, como trabalhos e provas, são compartilhados com os professores para fins de correção.</li>
              <li>Provedores de serviços: os dados são armazenados com segurança em infraestrutura em nuvem Supabase/PostgreSQL.</li>
              <li>Obrigações legais: quando exigido por lei, regulação governamental ou ordem judicial competente.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">4. Armazenamento e Segurança dos Dados</h2>
            <p>
              Todos os dados pessoais são transmitidos de forma criptografada (HTTPS) e armazenados
              em ambientes de nuvem seguros.
            </p>
            <p>
              Os dados salvos no armazenamento local do seu dispositivo permanecem sob o controle do
              sistema operacional e podem ser limpos a qualquer momento através das configurações do
              smartphone.
            </p>
            <p>
              Manteremos suas informações pessoais pelo tempo necessário para cumprir obrigações
              educacionais, contratuais e legais junto à instituição de ensino.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">5. Seus Direitos (LGPD)</h2>
            <p>Como titular dos dados, você possui direitos garantidos pela LGPD, incluindo:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Confirmar a existência do tratamento de seus dados.</li>
              <li>Acessar os seus dados pessoais armazenados.</li>
              <li>Solicitar a correção de dados incompletos, inexatos ou desatualizados.</li>
              <li>Solicitar a exclusão de dados desnecessários ou tratados em desconformidade com a lei, respeitadas as obrigações legais de guarda.</li>
            </ul>
            <p>
              Para exercer seus direitos, entre em contato com o Encarregado de Proteção de Dados
              pelo e-mail: <span className="font-medium text-foreground">contato@institutoignis.com.br</span>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">6. Alterações nesta Política de Privacidade</h2>
            <p>
              Podemos atualizar esta Política de Privacidade periodicamente. Avisaremos sobre
              alterações postando a nova versão nesta página e atualizando a data de última
              atualização no topo deste documento.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">7. Contato</h2>
            <ul className="space-y-1">
              <li><span className="font-medium text-foreground">Instituição:</span> Instituto Ignis de Educação Digital</li>
              <li><span className="font-medium text-foreground">E-mail de suporte:</span> contato@institutoignis.com.br</li>
              <li><span className="font-medium text-foreground">Endereço:</span> Alameda Rio Negro 503, Sala 2020 – CEP 06454-000 – Alphaville, Barueri – SP</li>
            </ul>
          </section>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
