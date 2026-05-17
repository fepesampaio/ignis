
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
  SELECT a.title, a.course_id INTO assignment_title, course_id_val
  FROM public.assignments a
  WHERE a.id = NEW.assignment_id;

  SELECT full_name INTO student_name
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  FOR prof IN
    SELECT professor_id FROM public.course_professors WHERE course_id = course_id_val
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, related_id, related_type, target_role)
    VALUES (
      prof.professor_id,
      'Novo trabalho enviado',
      COALESCE(student_name, 'Um aluno') || ' enviou o trabalho "' || COALESCE(assignment_title, 'Trabalho') || '"',
      'assignment',
      NEW.id,
      'assignment_submission',
      'professor'
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_assignment_graded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  assignment_title TEXT;
  professor_name TEXT;
BEGIN
  IF (NEW.score IS NOT NULL AND (OLD.score IS NULL OR OLD.score != NEW.score)) THEN
    SELECT title INTO assignment_title
    FROM public.assignments
    WHERE id = NEW.assignment_id;
    
    IF NEW.graded_by IS NOT NULL THEN
      SELECT full_name INTO professor_name
      FROM public.profiles
      WHERE user_id = NEW.graded_by;
    END IF;
    
    INSERT INTO public.notifications (user_id, title, message, type, related_id, related_type, target_role)
    VALUES (
      NEW.user_id,
      'Trabalho Corrigido',
      CASE
        WHEN NEW.feedback IS NOT NULL AND NEW.feedback != '' THEN
          'Seu trabalho "' || COALESCE(assignment_title, 'Trabalho') || '" foi corrigido. Nota: ' || NEW.score || '. Feedback: ' || LEFT(NEW.feedback, 100) || CASE WHEN LENGTH(NEW.feedback) > 100 THEN '...' ELSE '' END
        ELSE
          'Seu trabalho "' || COALESCE(assignment_title, 'Trabalho') || '" foi corrigido. Nota: ' || NEW.score
      END,
      'grade',
      NEW.id,
      'assignment_submission',
      'aluno'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
