-- Add new fields for certificate instructions customization
ALTER TABLE public.subjects
ADD COLUMN IF NOT EXISTS welcome_video_url TEXT,
ADD COLUMN IF NOT EXISTS custom_title TEXT,
ADD COLUMN IF NOT EXISTS html_content TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.subjects.welcome_video_url IS 'YouTube video URL for the subject welcome/intro video';
COMMENT ON COLUMN public.subjects.custom_title IS 'Custom display title for certificate instructions subjects';
COMMENT ON COLUMN public.subjects.html_content IS 'Custom HTML content for certificate instructions subjects';