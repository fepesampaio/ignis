-- Add welcome video URL field to courses table
ALTER TABLE public.courses 
ADD COLUMN welcome_video_url TEXT;