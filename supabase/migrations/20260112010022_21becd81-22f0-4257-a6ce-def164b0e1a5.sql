-- Allow inserting profiles via service role (for edge function create-student)
-- Drop the existing restrictive policy if it exists
DROP POLICY IF EXISTS "System can create profiles" ON public.profiles;

-- Create policy to allow inserts (edge function uses service role which bypasses RLS anyway)
-- But we add this for completeness and if anyone queries with anon key
CREATE POLICY "Admins can insert profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));