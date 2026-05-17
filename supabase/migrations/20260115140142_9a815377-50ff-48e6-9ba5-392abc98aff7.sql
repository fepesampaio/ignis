-- Add enrollment_display_name column to courses table
ALTER TABLE public.courses 
ADD COLUMN enrollment_display_name TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN public.courses.enrollment_display_name IS 'Nome que aparece no formulário de matrícula. Se vazio, usa o título do curso.';