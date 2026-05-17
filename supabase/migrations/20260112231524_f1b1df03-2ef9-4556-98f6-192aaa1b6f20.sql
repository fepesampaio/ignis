-- Add release_after_days to subjects table
ALTER TABLE public.subjects 
ADD COLUMN IF NOT EXISTS release_after_days integer NOT NULL DEFAULT 0;

-- Create table for individual overrides per enrollment
CREATE TABLE public.enrollment_subject_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  release_after_days integer NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(enrollment_id, subject_id)
);

-- Enable RLS
ALTER TABLE public.enrollment_subject_overrides ENABLE ROW LEVEL SECURITY;

-- Policies for enrollment_subject_overrides
CREATE POLICY "Admins can do everything with overrides"
ON public.enrollment_subject_overrides
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can view their own overrides"
ON public.enrollment_subject_overrides
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.id = enrollment_id
    AND e.user_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_enrollment_subject_overrides_updated_at
BEFORE UPDATE ON public.enrollment_subject_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Copy existing release_after_days from first lesson of each subject to subject
UPDATE public.subjects s
SET release_after_days = COALESCE(
  (SELECT MIN(l.release_after_days) FROM public.lessons l WHERE l.subject_id = s.id),
  0
);