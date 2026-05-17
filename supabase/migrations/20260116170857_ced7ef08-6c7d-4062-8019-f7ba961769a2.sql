-- Add RLS policy for polo users to view enrollments from their polo
CREATE POLICY "Polo users can view their polo enrollments" 
ON public.enrollments 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM polo_users pu 
    WHERE pu.user_id = auth.uid() 
    AND pu.polo_id = enrollments.polo_id
  )
);

-- Also need to allow polo users to view profiles of their students
CREATE POLICY "Polo users can view profiles of their students" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM polo_users pu 
    JOIN enrollments e ON e.polo_id = pu.polo_id
    WHERE pu.user_id = auth.uid() 
    AND e.user_id = profiles.user_id
  )
);