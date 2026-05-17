-- Add column to bypass exam requirement for individual students
ALTER TABLE public.enrollment_subject_overrides
ADD COLUMN bypass_exam_requirement boolean NOT NULL DEFAULT false;