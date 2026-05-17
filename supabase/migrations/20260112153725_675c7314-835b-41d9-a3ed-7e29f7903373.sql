-- Add activity_id to questions table to support questions for activities
ALTER TABLE public.questions 
  ADD COLUMN activity_id uuid REFERENCES public.activities(id) ON DELETE CASCADE,
  ALTER COLUMN exam_id DROP NOT NULL;

-- Add constraint to ensure question belongs to either exam or activity (not both, not neither)
ALTER TABLE public.questions
  ADD CONSTRAINT question_belongs_to_exam_or_activity 
  CHECK (
    (exam_id IS NOT NULL AND activity_id IS NULL) OR 
    (exam_id IS NULL AND activity_id IS NOT NULL)
  );

-- Create index for activity_id
CREATE INDEX idx_questions_activity_id ON public.questions(activity_id);

-- Update RLS policy for questions to include activities
DROP POLICY IF EXISTS "Users can view questions during exams" ON public.questions;

CREATE POLICY "Users can view questions during exams or activities" 
ON public.questions 
FOR SELECT 
USING (
  (EXISTS (
    SELECT 1 FROM exams e
    JOIN enrollments en ON (en.course_id = e.course_id)
    WHERE e.id = questions.exam_id 
    AND en.user_id = auth.uid() 
    AND en.is_active = true
  )) 
  OR (EXISTS (
    SELECT 1 FROM activities a
    JOIN subjects s ON (s.id = a.subject_id)
    JOIN enrollments en ON (en.course_id = s.course_id)
    WHERE a.id = questions.activity_id 
    AND en.user_id = auth.uid() 
    AND en.is_active = true
  ))
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'professor'::app_role)
);

-- Update RLS policy for question_options to include activities
DROP POLICY IF EXISTS "Users can view options during exams" ON public.question_options;

CREATE POLICY "Users can view options during exams or activities" 
ON public.question_options 
FOR SELECT 
USING (
  (EXISTS (
    SELECT 1 FROM questions q
    JOIN exams e ON (e.id = q.exam_id)
    JOIN enrollments en ON (en.course_id = e.course_id)
    WHERE q.id = question_options.question_id 
    AND en.user_id = auth.uid() 
    AND en.is_active = true
  )) 
  OR (EXISTS (
    SELECT 1 FROM questions q
    JOIN activities a ON (a.id = q.activity_id)
    JOIN subjects s ON (s.id = a.subject_id)
    JOIN enrollments en ON (en.course_id = s.course_id)
    WHERE q.id = question_options.question_id 
    AND en.user_id = auth.uid() 
    AND en.is_active = true
  ))
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'professor'::app_role)
);

-- Create table to track student answers to activity questions
CREATE TABLE public.activity_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  selected_option_id uuid REFERENCES public.question_options(id) ON DELETE SET NULL,
  is_correct boolean,
  answered_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(activity_id, question_id, user_id)
);

-- Enable RLS
ALTER TABLE public.activity_answers ENABLE ROW LEVEL SECURITY;

-- Users can manage their own answers
CREATE POLICY "Users can manage their activity answers" 
ON public.activity_answers 
FOR ALL 
USING (auth.uid() = user_id);

-- Admins can view all answers
CREATE POLICY "Admins can view all activity answers" 
ON public.activity_answers 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Professors can view student answers
CREATE POLICY "Professors can view activity answers" 
ON public.activity_answers 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM activities a
    JOIN subjects s ON (s.id = a.subject_id)
    JOIN course_professors cp ON (cp.course_id = s.course_id)
    WHERE a.id = activity_answers.activity_id 
    AND cp.professor_id = auth.uid()
  )
);