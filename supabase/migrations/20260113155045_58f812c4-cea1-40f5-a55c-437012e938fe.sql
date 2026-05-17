-- Add column to control if subject requires passing previous exam or just completion
ALTER TABLE public.subjects 
ADD COLUMN require_previous_exam BOOLEAN NOT NULL DEFAULT true;

-- Comment explaining the column
COMMENT ON COLUMN public.subjects.require_previous_exam IS 'When true, requires passing all exams of previous subject to unlock. When false, only requires completing the previous subject (all lessons).';