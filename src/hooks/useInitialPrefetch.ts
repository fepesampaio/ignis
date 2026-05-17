import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { warmRoutesForRole } from '@/lib/routePrefetch';

/**
 * Right after the user is authenticated and their role is known, this hook:
 *  1. Warms up the JS chunks of the most likely next routes (idle-time).
 *  2. Pre-fetches the essential data for the role's primary screens.
 *
 * Run once near the top of the app tree (inside AuthProvider).
 */
export function useInitialPrefetch() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user || !role) return;

    // Route chunks
    warmRoutesForRole(role);

    const ric: (cb: () => void) => void =
      (window as any).requestIdleCallback || ((cb) => setTimeout(cb, 200));

    ric(() => {
      if (role === 'aluno') {
        // Enrolled courses (used by /dashboard and /student/courses)
        queryClient.prefetchQuery({
          queryKey: ['student-enrolled-courses', user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from('enrollments')
              .select('id, enrolled_at, is_active, course_id, courses(id, title, category, thumbnail_url)')
              .eq('user_id', user.id)
              .eq('is_active', true);
            if (error) throw error;
            return data;
          },
        });
        // Profile
        queryClient.prefetchQuery({
          queryKey: ['student-profile', user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', user.id)
              .maybeSingle();
            if (error) throw error;
            return data;
          },
        });
      } else if (role === 'admin') {
        // Admin dashboard counts
        queryClient.prefetchQuery({
          queryKey: ['admin-stats-students'],
          queryFn: async () => {
            const { count } = await supabase
              .from('user_roles')
              .select('*', { count: 'exact', head: true })
              .eq('role', 'aluno');
            return count || 0;
          },
        });
      }
    });
  }, [user, role, queryClient]);
}
