import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Settings, Palette, CreditCard, FileText, Mail, Award, Save, Loader2, Upload, X, Eye, MapPin } from 'lucide-react';
import { CertificateFieldMapperDialog, CertificateFieldsMapping, MultiPageCertificateMapping } from '@/components/admin/CertificateFieldMapperDialog';

interface SystemSetting {
  id: string;
  key: string;
  value: unknown;
  category: string;
  description: string | null;
}

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const [pendingChanges, setPendingChanges] = useState<Record<string, unknown>>({});
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [showFieldMapper, setShowFieldMapper] = useState(false);
  const templateInputRef = useRef<HTMLInputElement>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .order('category');
      if (error) throw error;
      return data as SystemSetting[];
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (changes: Record<string, unknown>) => {
      const updates = Object.entries(changes).map(async ([key, value]) => {
        const { error } = await supabase
          .from('system_settings')
          .update({ value: JSON.stringify(value) })
          .eq('key', key);
        if (error) throw error;
      });
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['system-settings-public'] });
      setPendingChanges({});
      toast.success('Configurações salvas com sucesso!');
    },
    onError: (error) => {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    },
  });

  const handleTemplateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Formato não suportado. Use PNG, JPG ou PDF.');
      return;
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 10MB.');
      return;
    }

    setUploadingTemplate(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `template-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('certificate-templates')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('certificate-templates')
        .getPublicUrl(fileName);

      // Save the URL to settings
      const { error: updateError } = await supabase
        .from('system_settings')
        .update({ value: JSON.stringify(urlData.publicUrl) })
        .eq('key', 'certificate_template_url');

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['system-settings-public'] });
      toast.success('Template de certificado enviado com sucesso!');
    } catch (error) {
      console.error('Error uploading template:', error);
      toast.error('Erro ao enviar template');
    } finally {
      setUploadingTemplate(false);
      if (templateInputRef.current) {
        templateInputRef.current.value = '';
      }
    }
  };

  const removeTemplate = async () => {
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: JSON.stringify('') })
        .eq('key', 'certificate_template_url');

      if (error) throw error;

      // Also clear the mapping
      await supabase
        .from('system_settings')
        .update({ value: JSON.stringify(null) })
        .eq('key', 'certificate_fields_mapping');

      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['system-settings-public'] });
      toast.success('Template removido');
    } catch (error) {
      console.error('Error removing template:', error);
      toast.error('Erro ao remover template');
    }
  };

  const saveFieldsMapping = async (mapping: MultiPageCertificateMapping) => {
    setSavingMapping(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key: 'certificate_fields_mapping',
          value: JSON.stringify(mapping),
          category: 'certificate',
          description: 'Mapeamento de posição dos campos no certificado (multi-página)',
        }, { onConflict: 'key' });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['system-settings-public'] });
      setShowFieldMapper(false);
      toast.success('Mapeamento de campos salvo com sucesso!');
    } catch (error) {
      console.error('Error saving fields mapping:', error);
      toast.error('Erro ao salvar mapeamento');
    } finally {
      setSavingMapping(false);
    }
  };

  const getCurrentFieldsMapping = (): CertificateFieldsMapping | MultiPageCertificateMapping | null => {
    const value = getSettingValue('certificate_fields_mapping');
    if (!value || value === '') return null;
    // Handle both legacy single-page and new multi-page formats
    return value as CertificateFieldsMapping | MultiPageCertificateMapping;
  };

  const getSettingValue = (key: string): unknown => {
    if (key in pendingChanges) {
      return pendingChanges[key];
    }
    const setting = settings?.find(s => s.key === key);
    if (!setting) return '';
    try {
      return typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
    } catch {
      return setting.value;
    }
  };

  const updateLocalSetting = (key: string, value: unknown) => {
    setPendingChanges(prev => ({ ...prev, [key]: value }));
  };

  const saveChanges = () => {
    if (Object.keys(pendingChanges).length === 0) {
      toast.info('Nenhuma alteração pendente');
      return;
    }
    updateSettingsMutation.mutate(pendingChanges);
  };

  const hasChanges = Object.keys(pendingChanges).length > 0;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Settings className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Configurações</h1>
              <p className="text-muted-foreground">Gerencie as configurações do sistema</p>
            </div>
          </div>
          <Button onClick={saveChanges} disabled={!hasChanges || updateSettingsMutation.isPending}>
            {updateSettingsMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar Alterações
            {hasChanges && <span className="ml-2 px-2 py-0.5 bg-primary-foreground/20 rounded-full text-xs">{Object.keys(pendingChanges).length}</span>}
          </Button>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto gap-2">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Geral
            </TabsTrigger>
            <TabsTrigger value="payment" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Pagamento
            </TabsTrigger>
            <TabsTrigger value="contract" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Contrato
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="certificate" className="flex items-center gap-2">
              <Award className="w-4 h-4" />
              Certificado
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Configurações Gerais
                </CardTitle>
                <CardDescription>
                  Personalize o nome, logo e cores da plataforma
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="platform_name">Nome da Plataforma</Label>
                    <Input
                      id="platform_name"
                      value={String(getSettingValue('platform_name') || '')}
                      onChange={(e) => updateLocalSetting('platform_name', e.target.value)}
                      placeholder="Nome da sua plataforma"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="platform_logo_url">URL do Logo</Label>
                    <Input
                      id="platform_logo_url"
                      value={String(getSettingValue('platform_logo_url') || '')}
                      onChange={(e) => updateLocalSetting('platform_logo_url', e.target.value)}
                      placeholder="https://exemplo.com/logo.png"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="platform_primary_color">Cor Primária</Label>
                    <div className="flex gap-2">
                      <Input
                        id="platform_primary_color"
                        type="color"
                        value={String(getSettingValue('platform_primary_color') || '#6366f1')}
                        onChange={(e) => updateLocalSetting('platform_primary_color', e.target.value)}
                        className="w-16 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={String(getSettingValue('platform_primary_color') || '#6366f1')}
                        onChange={(e) => updateLocalSetting('platform_primary_color', e.target.value)}
                        placeholder="#6366f1"
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="platform_secondary_color">Cor Secundária</Label>
                    <div className="flex gap-2">
                      <Input
                        id="platform_secondary_color"
                        type="color"
                        value={String(getSettingValue('platform_secondary_color') || '#8b5cf6')}
                        onChange={(e) => updateLocalSetting('platform_secondary_color', e.target.value)}
                        className="w-16 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={String(getSettingValue('platform_secondary_color') || '#8b5cf6')}
                        onChange={(e) => updateLocalSetting('platform_secondary_color', e.target.value)}
                        placeholder="#8b5cf6"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Settings */}
          <TabsContent value="payment">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Configurações de Pagamento
                </CardTitle>
                <CardDescription>
                  Configure a integração com o Asaas e valores padrão
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <p className="text-sm text-muted-foreground">
                    <strong>Nota:</strong> A chave API do Asaas está configurada como variável de ambiente segura (ASAAS_API_KEY). 
                    Para alterá-la, entre em contato com o suporte técnico.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="asaas_environment">Ambiente Asaas</Label>
                    <Select
                      value={String(getSettingValue('asaas_environment') || 'sandbox')}
                      onValueChange={(value) => updateLocalSetting('asaas_environment', value)}
                    >
                      <SelectTrigger id="asaas_environment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
                        <SelectItem value="production">Produção</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="default_course_price">Valor Padrão do Curso (R$)</Label>
                    <Input
                      id="default_course_price"
                      type="number"
                      step="0.01"
                      value={String(getSettingValue('default_course_price') || '1200.00')}
                      onChange={(e) => updateLocalSetting('default_course_price', parseFloat(e.target.value))}
                      placeholder="1200.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="default_installments">Parcelas Padrão</Label>
                    <Input
                      id="default_installments"
                      type="number"
                      min="1"
                      max="24"
                      value={String(getSettingValue('default_installments') || '12')}
                      onChange={(e) => updateLocalSetting('default_installments', parseInt(e.target.value))}
                      placeholder="12"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contract Settings */}
          <TabsContent value="contract">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Configurações de Contrato
                </CardTitle>
                <CardDescription>
                  Configure a integração com o Assinafy para assinatura digital de contratos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <p className="text-sm text-muted-foreground">
                    <strong>Nota:</strong> A API Key e o Account ID do Assinafy estão configurados como variáveis de ambiente seguras (ASSINAFY_API_KEY e ASSINAFY_ACCOUNT_ID). 
                    Para alterá-los, entre em contato com o suporte técnico.
                  </p>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Templates Configurados</h4>
                  <p className="text-xs text-muted-foreground">
                    O sistema utiliza automaticamente os templates configurados no Assinafy com base na categoria do curso.
                  </p>
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <h5 className="font-medium text-sm mb-1">Contrato Aluno</h5>
                      <p className="text-xs text-muted-foreground">
                        Usado para cursos: EJA, Técnico, Profissional
                      </p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <h5 className="font-medium text-sm mb-1">Contrato Competência.pdf</h5>
                      <p className="text-xs text-muted-foreground">
                        Usado para cursos: Técnico por Competência
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                  <h4 className="font-medium text-sm text-green-900 dark:text-green-100 mb-2">
                    ✅ Integração Ativa
                  </h4>
                  <p className="text-xs text-green-700 dark:text-green-300">
                    A integração com o Assinafy está configurada e funcionando. Os contratos são enviados automaticamente 
                    quando um novo aluno é matriculado. Após a assinatura, o sistema libera o acesso e gera as cobranças automaticamente.
                  </p>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="font-medium text-sm text-blue-900 dark:text-blue-100 mb-2">
                    📝 Configuração do Webhook
                  </h4>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                    Configure o webhook no painel do Assinafy com as seguintes informações:
                  </p>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-medium text-blue-800 dark:text-blue-200">URL:</span>
                      <code className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded text-blue-700 dark:text-blue-300">
                        https://fteosxivqodhnaikesht.supabase.co/functions/v1/assinafy-webhook
                      </code>
                    </div>
                    <div>
                      <span className="font-medium text-blue-800 dark:text-blue-200">Evento:</span>
                      <code className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded text-blue-700 dark:text-blue-300">
                        document_ready
                      </code>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Settings */}
          <TabsContent value="email">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Configurações de Email
                </CardTitle>
                <CardDescription>
                  Configure os emails e notificações do sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <p className="text-sm text-muted-foreground">
                    <strong>Nota:</strong> A chave API do Resend está configurada como variável de ambiente segura (RESEND_API_KEY). 
                    Para alterá-la, entre em contato com o suporte técnico.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email_from_name">Nome do Remetente</Label>
                    <Input
                      id="email_from_name"
                      value={String(getSettingValue('email_from_name') || '')}
                      onChange={(e) => updateLocalSetting('email_from_name', e.target.value)}
                      placeholder="Nome da Plataforma"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email_from_address">Email do Remetente</Label>
                    <Input
                      id="email_from_address"
                      type="email"
                      value={String(getSettingValue('email_from_address') || '')}
                      onChange={(e) => updateLocalSetting('email_from_address', e.target.value)}
                      placeholder="noreply@suaplataforma.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notification_payment_reminder_days">Dias Antes do Vencimento para Lembrete</Label>
                  <Input
                    id="notification_payment_reminder_days"
                    type="number"
                    min="1"
                    max="30"
                    value={String(getSettingValue('notification_payment_reminder_days') || '3')}
                    onChange={(e) => updateLocalSetting('notification_payment_reminder_days', parseInt(e.target.value))}
                    placeholder="3"
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Número de dias antes do vencimento para enviar lembrete de pagamento
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Certificate Settings */}
          <TabsContent value="certificate">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Configurações de Certificado
                </CardTitle>
                <CardDescription>
                  Configure o template e assinatura dos certificados
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Template Upload Section */}
                <div className="space-y-4">
                  <Label>Template de Certificado</Label>
                  <div className="p-4 bg-muted/50 rounded-lg border space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Faça upload de um template de certificado (PNG, JPG ou PDF). Os dados do aluno, matérias e datas serão inseridos automaticamente na geração.
                    </p>
                    
                    {getSettingValue('certificate_template_url') ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-4 p-3 bg-background rounded-lg border">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">Template atual</p>
                            <p className="text-xs text-muted-foreground truncate max-w-md">
                              {String(getSettingValue('certificate_template_url'))}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(String(getSettingValue('certificate_template_url')), '_blank')}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Visualizar
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={removeTemplate}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Remover
                            </Button>
                          </div>
                        </div>
                        
                        {/* Field Mapping Button */}
                        <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                          <div>
                            <p className="text-sm font-medium text-foreground">Mapeamento de Campos</p>
                            <p className="text-xs text-muted-foreground">
                              {getCurrentFieldsMapping() 
                                ? 'Campos mapeados - clique para editar' 
                                : 'Defina onde cada informação será inserida no certificado'}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowFieldMapper(true)}
                          >
                            <MapPin className="w-4 h-4 mr-1" />
                            Mapear Campos
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">
                        Nenhum template enviado. O sistema usará o template padrão.
                      </div>
                    )}

                    <div>
                      <input
                        ref={templateInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.pdf"
                        onChange={handleTemplateUpload}
                        className="hidden"
                        id="template-upload"
                      />
                      <Button
                        variant="outline"
                        onClick={() => templateInputRef.current?.click()}
                        disabled={uploadingTemplate}
                      >
                        {uploadingTemplate ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        {uploadingTemplate ? 'Enviando...' : 'Enviar Template'}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="certificate_institution_name">Nome da Instituição</Label>
                    <Input
                      id="certificate_institution_name"
                      value={String(getSettingValue('certificate_institution_name') || '')}
                      onChange={(e) => updateLocalSetting('certificate_institution_name', e.target.value)}
                      placeholder="Nome da instituição no certificado"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="certificate_logo_url">URL do Logo do Certificado</Label>
                    <Input
                      id="certificate_logo_url"
                      value={String(getSettingValue('certificate_logo_url') || '')}
                      onChange={(e) => updateLocalSetting('certificate_logo_url', e.target.value)}
                      placeholder="https://exemplo.com/logo-certificado.png"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="certificate_signatory_name">Nome do Signatário</Label>
                    <Input
                      id="certificate_signatory_name"
                      value={String(getSettingValue('certificate_signatory_name') || '')}
                      onChange={(e) => updateLocalSetting('certificate_signatory_name', e.target.value)}
                      placeholder="Nome completo do responsável"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="certificate_signatory_title">Cargo do Signatário</Label>
                    <Input
                      id="certificate_signatory_title"
                      value={String(getSettingValue('certificate_signatory_title') || '')}
                      onChange={(e) => updateLocalSetting('certificate_signatory_title', e.target.value)}
                      placeholder="Ex: Diretor Acadêmico"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Certificate Field Mapper Dialog */}
      {getSettingValue('certificate_template_url') && (
        <CertificateFieldMapperDialog
          open={showFieldMapper}
          onOpenChange={setShowFieldMapper}
          templateUrl={String(getSettingValue('certificate_template_url'))}
          currentMapping={getCurrentFieldsMapping()}
          onSave={saveFieldsMapping}
          saving={savingMapping}
        />
      )}
    </DashboardLayout>
  );
}
