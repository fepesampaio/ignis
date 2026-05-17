-- Create a table for system settings
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  category text NOT NULL DEFAULT 'general',
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage settings
CREATE POLICY "Admins can manage system settings"
ON public.system_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.system_settings (key, value, category, description) VALUES
('platform_name', '"EduPlatform"', 'general', 'Nome da plataforma'),
('platform_logo_url', '""', 'general', 'URL do logo da plataforma'),
('platform_primary_color', '"#6366f1"', 'general', 'Cor primária do sistema'),
('platform_secondary_color', '"#8b5cf6"', 'general', 'Cor secundária do sistema'),
('asaas_environment', '"sandbox"', 'payment', 'Ambiente do Asaas (sandbox/production)'),
('default_installments', '12', 'payment', 'Número padrão de parcelas'),
('default_course_price', '1200.00', 'payment', 'Valor padrão do curso'),
('assinafy_environment', '"sandbox"', 'contract', 'Ambiente do Assinafy (sandbox/production)'),
('contract_template_id', '""', 'contract', 'ID do template de contrato no Assinafy'),
('email_from_name', '"EduPlatform"', 'email', 'Nome do remetente de emails'),
('email_from_address', '"noreply@eduplatform.com"', 'email', 'Email do remetente'),
('notification_payment_reminder_days', '3', 'email', 'Dias antes do vencimento para lembrete'),
('certificate_signatory_name', '""', 'certificate', 'Nome do signatário do certificado'),
('certificate_signatory_title', '""', 'certificate', 'Cargo do signatário'),
('certificate_institution_name', '"EduPlatform"', 'certificate', 'Nome da instituição no certificado'),
('certificate_logo_url', '""', 'certificate', 'URL do logo no certificado');