-- Ensure the overly permissive policy is removed (may already be gone, but ensure cleanup)
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;