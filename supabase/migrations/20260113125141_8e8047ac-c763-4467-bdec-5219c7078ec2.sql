-- Function to link a new professor to all existing courses
CREATE OR REPLACE FUNCTION public.link_professor_to_all_courses()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'professor' THEN
    INSERT INTO public.course_professors (course_id, professor_id)
    SELECT c.id, NEW.user_id
    FROM public.courses c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.course_professors cp 
      WHERE cp.course_id = c.id AND cp.professor_id = NEW.user_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger when a new professor role is created
CREATE TRIGGER on_professor_created
AFTER INSERT ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.link_professor_to_all_courses();

-- Function to link a new course to all existing professors
CREATE OR REPLACE FUNCTION public.link_course_to_all_professors()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.course_professors (course_id, professor_id)
  SELECT NEW.id, ur.user_id
  FROM public.user_roles ur
  WHERE ur.role = 'professor'
    AND NOT EXISTS (
      SELECT 1 FROM public.course_professors cp 
      WHERE cp.course_id = NEW.id AND cp.professor_id = ur.user_id
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger when a new course is created
CREATE TRIGGER on_course_created
AFTER INSERT ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.link_course_to_all_professors();