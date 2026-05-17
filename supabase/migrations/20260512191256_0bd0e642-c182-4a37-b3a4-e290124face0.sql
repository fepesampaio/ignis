-- Frente 2: Performance indexes for high-traffic queries
-- All idempotent; safe to re-run.

-- Exam grading: every read of an attempt joins exam_answers by attempt_id
CREATE INDEX IF NOT EXISTS idx_exam_answers_attempt_id
  ON public.exam_answers (attempt_id);

CREATE INDEX IF NOT EXISTS idx_exam_answers_question_id
  ON public.exam_answers (question_id);

-- Loading exam/activity questions always pulls options by question_id
CREATE INDEX IF NOT EXISTS idx_question_options_question_id
  ON public.question_options (question_id);

-- Subject progress calc: "completed lessons for this user"
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_completed
  ON public.lesson_progress (user_id, completed);

-- Access control + student payments screen
CREATE INDEX IF NOT EXISTS idx_payments_user_status
  ON public.payments (user_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_course_id
  ON public.payments (course_id);

-- Active enrollments per user is the most common RLS filter in the app
CREATE INDEX IF NOT EXISTS idx_enrollments_user_active
  ON public.enrollments (user_id, is_active);

-- Professor-side: list courses/submissions assigned to the logged professor
CREATE INDEX IF NOT EXISTS idx_course_professors_professor_id
  ON public.course_professors (professor_id);

-- Submissions tabs (Pendentes vs Corrigidos)
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_graded
  ON public.assignment_submissions (assignment_id, graded_at);

-- Activity answers lookup by user (student's own answers screen)
CREATE INDEX IF NOT EXISTS idx_activity_answers_user_id
  ON public.activity_answers (user_id);

-- Exam attempts filtered by exam (professor sees all attempts of an exam)
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_id
  ON public.exam_attempts (exam_id);

-- Enrollment subject overrides: lookup by enrollment is the hot path
CREATE INDEX IF NOT EXISTS idx_enrollment_subject_overrides_enrollment_id
  ON public.enrollment_subject_overrides (enrollment_id);