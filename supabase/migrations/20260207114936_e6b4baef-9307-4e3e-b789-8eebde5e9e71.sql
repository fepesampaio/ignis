-- Recreate triggers to ensure they point to the correct functions
DROP TRIGGER IF EXISTS on_professor_created ON public.user_roles;
DROP TRIGGER IF EXISTS on_course_created ON public.courses;

CREATE TRIGGER on_professor_created
AFTER INSERT ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.link_professor_to_all_courses();

CREATE TRIGGER on_course_created
AFTER INSERT ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.link_course_to_all_professors();

-- Sync: ensure all current professors are linked to all current courses
INSERT INTO public.course_professors (course_id, professor_id)
SELECT c.id, ur.user_id
FROM public.courses c
CROSS JOIN public.user_roles ur
WHERE ur.role = 'professor'
  AND NOT EXISTS (
    SELECT 1 FROM public.course_professors cp
    WHERE cp.course_id = c.id AND cp.professor_id = ur.user_id
  );