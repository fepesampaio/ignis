-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_id UUID,
  related_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- System can create notifications (via trigger with security definer)
CREATE POLICY "System can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Create function to notify student when assignment is graded
CREATE OR REPLACE FUNCTION public.notify_assignment_graded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assignment_title TEXT;
  professor_name TEXT;
BEGIN
  -- Only trigger when score is set for the first time or updated
  IF (NEW.score IS NOT NULL AND (OLD.score IS NULL OR OLD.score != NEW.score)) THEN
    -- Get assignment title
    SELECT title INTO assignment_title
    FROM public.assignments
    WHERE id = NEW.assignment_id;
    
    -- Get professor name if available
    IF NEW.graded_by IS NOT NULL THEN
      SELECT full_name INTO professor_name
      FROM public.profiles
      WHERE user_id = NEW.graded_by;
    END IF;
    
    -- Insert notification
    INSERT INTO public.notifications (user_id, title, message, type, related_id, related_type)
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
      'assignment_submission'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER on_assignment_graded
  AFTER UPDATE ON public.assignment_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_assignment_graded();

-- Create index for faster queries
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;