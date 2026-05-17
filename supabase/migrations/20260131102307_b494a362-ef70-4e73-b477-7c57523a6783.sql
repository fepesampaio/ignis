-- Add admin policies for lesson_progress table
CREATE POLICY "Admins can manage all progress"
ON public.lesson_progress
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add admin policies for activity_answers table
CREATE POLICY "Admins can manage all activity answers"
ON public.activity_answers
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add admin policies for exam_attempts table
CREATE POLICY "Admins can manage all attempts"
ON public.exam_attempts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add admin policies for exam_answers table
CREATE POLICY "Admins can manage all exam answers"
ON public.exam_answers
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add admin policies for assignment_submissions table (if not exists)
CREATE POLICY "Admins can insert submissions"
ON public.assignment_submissions
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));