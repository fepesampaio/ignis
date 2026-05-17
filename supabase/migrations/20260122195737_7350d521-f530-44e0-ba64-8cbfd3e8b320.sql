-- Fix notifications table RLS policy - currently allows any authenticated user to insert for any user
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- Create restrictive policies:
-- 1. Users can only create notifications for themselves (if needed for client-side)
CREATE POLICY "Users create own notifications"
ON public.notifications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 2. Admins can create notifications for anyone
CREATE POLICY "Admins create all notifications"
ON public.notifications
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Note: Edge functions using service role key will bypass RLS, so system notifications will still work