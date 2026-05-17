import { useAuth } from '@/contexts/AuthContext';

export function useBasePath() {
  const { role } = useAuth();
  
  // Returns the base path for course-related routes based on user role
  const basePath = role === 'professor' ? '/professor' : '/admin';
  
  return { basePath };
}
