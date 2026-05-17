-- Create storage bucket for contract PDF templates
INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-templates', 'contract-templates', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read contract templates (they're base templates, not sensitive)
CREATE POLICY "Anyone can read contract templates"
ON storage.objects FOR SELECT
USING (bucket_id = 'contract-templates');

-- Only admins can upload/manage contract templates
CREATE POLICY "Admins can manage contract templates"
ON storage.objects FOR ALL
USING (bucket_id = 'contract-templates' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'contract-templates' AND public.has_role(auth.uid(), 'admin'));