-- Allow anyone to read certificate-related settings
CREATE POLICY "Anyone can read certificate settings" 
ON public.system_settings 
FOR SELECT 
USING (key IN ('certificate_template_url', 'certificate_fields_mapping'));