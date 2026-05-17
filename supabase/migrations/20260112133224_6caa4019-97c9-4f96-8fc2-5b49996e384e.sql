-- Add handout_url (apostila) field to subjects table
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS handout_url text;

-- Add lesson_id to activities table to link exercises to specific lessons
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_activities_lesson_id ON public.activities(lesson_id);