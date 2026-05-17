
-- Trigger to notify professors when a student submits an assignment
CREATE OR REPLACE FUNCTION public.notify_assignment_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  assignment_title TEXT;
  student_name TEXT;
  course_id_val UUID;
  prof RECORD;
BEGIN
  -- Only on new submissions (INSERT)
  -- Get assignment info
  SELECT a.title, a.course_id INTO assignment_title, course_id_val
  FROM public.assignments a
  WHERE a.id = NEW.assignment_id;

  -- Get student name
  SELECT full_name INTO student_name
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  -- Notify all professors linked to the course
  FOR prof IN
    SELECT professor_id FROM public.course_professors WHERE course_id = course_id_val
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, related_id, related_type)
    VALUES (
      prof.professor_id,
      'Novo trabalho enviado',
      COALESCE(student_name, 'Um aluno') || ' enviou o trabalho "' || COALESCE(assignment_title, 'Trabalho') || '"',
      'assignment',
      NEW.id,
      'assignment_submission'
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Create trigger on assignment_submissions for INSERT only
CREATE TRIGGER notify_professors_on_submission
AFTER INSERT ON public.assignment_submissions
FOR EACH ROW
EXECUTE FUNCTION public.notify_assignment_submitted();
