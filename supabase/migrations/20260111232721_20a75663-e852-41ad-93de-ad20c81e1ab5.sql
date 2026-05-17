-- Create subjects table (matérias)
CREATE TABLE public.subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_certificate_instructions BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on subjects
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- RLS policies for subjects
CREATE POLICY "Admins can manage subjects"
ON public.subjects FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Enrolled users can view subjects"
ON public.subjects FOR SELECT
USING (
  (EXISTS (
    SELECT 1 FROM enrollments
    WHERE enrollments.user_id = auth.uid()
    AND enrollments.course_id = subjects.course_id
    AND enrollments.is_active = true
  ))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'professor'::app_role)
);

-- Create activities table (atividades - exercícios simples)
CREATE TABLE public.activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on activities
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- RLS policies for activities
CREATE POLICY "Admins can manage activities"
ON public.activities FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Enrolled users can view activities"
ON public.activities FOR SELECT
USING (
  (EXISTS (
    SELECT 1 FROM subjects s
    JOIN enrollments e ON e.course_id = s.course_id
    WHERE s.id = activities.subject_id
    AND e.user_id = auth.uid()
    AND e.is_active = true
  ))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'professor'::app_role)
);

-- Add subject_id to lessons table
ALTER TABLE public.lessons ADD COLUMN subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;

-- Add subject_id to assignments table (trabalhos)
ALTER TABLE public.assignments ADD COLUMN subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;

-- Add subject_id to exams table
ALTER TABLE public.exams ADD COLUMN subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;

-- Create trigger for subjects updated_at
CREATE TRIGGER update_subjects_updated_at
BEFORE UPDATE ON public.subjects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for activities updated_at
CREATE TRIGGER update_activities_updated_at
BEFORE UPDATE ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_subjects_course_id ON public.subjects(course_id);
CREATE INDEX idx_activities_subject_id ON public.activities(subject_id);
CREATE INDEX idx_lessons_subject_id ON public.lessons(subject_id);
CREATE INDEX idx_assignments_subject_id ON public.assignments(subject_id);
CREATE INDEX idx_exams_subject_id ON public.exams(subject_id);