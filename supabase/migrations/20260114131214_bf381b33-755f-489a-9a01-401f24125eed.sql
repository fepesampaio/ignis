-- Create storage bucket for certificate templates
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificate-templates', 'certificate-templates', true);

-- Policy: Only admins can upload/manage certificate templates
CREATE POLICY "Admins can manage certificate templates"
ON storage.objects
FOR ALL
USING (bucket_id = 'certificate-templates' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'certificate-templates' AND has_role(auth.uid(), 'admin'::app_role));

-- Policy: Anyone can view certificate templates (needed for PDF generation)
CREATE POLICY "Anyone can view certificate templates"
ON storage.objects
FOR SELECT
USING (bucket_id = 'certificate-templates');