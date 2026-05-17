import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, Search } from 'lucide-react';
import { EnrolledCourseCard } from '@/components/student/EnrolledCourseCard';

export default function StudentCourses() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  const { data: enrolledCourses, isLoading } = useQuery({
    queryKey: ['student-enrolled-courses', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: enrollments, error: enrollmentError } = await supabase
        .from('enrollments')
        .select(`
          id,
          course_id,
          courses (
            id,
            title,
            description,
            category,
            thumbnail_url,
            workload_hours
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (enrollmentError) throw enrollmentError;
      if (!enrollments || enrollments.length === 0) return [];

      const courseIds = enrollments.map((e) => e.course_id);

      const [lessonsResult, progressResult] = await Promise.all([
        supabase
          .from('lessons')
          .select('id, course_id')
          .in('course_id', courseIds)
          .eq('is_active', true),
        supabase
          .from('lesson_progress')
          .select('lesson_id, lessons!inner(course_id)')
          .eq('user_id', user.id)
          .eq('completed', true)
          .in('lessons.course_id', courseIds),
      ]);

      const lessonsByCourse = new Map<string, number>();
      (lessonsResult.data || []).forEach((lesson) => {
        lessonsByCourse.set(lesson.course_id, (lessonsByCourse.get(lesson.course_id) || 0) + 1);
      });

      const completedByCourse = new Map<string, number>();
      (progressResult.data || []).forEach((p: any) => {
        const courseId = p.lessons?.course_id;
        if (courseId) {
          completedByCourse.set(courseId, (completedByCourse.get(courseId) || 0) + 1);
        }
      });

      return enrollments.map((enrollment) => {
        const totalLessons = lessonsByCourse.get(enrollment.course_id) || 0;
        const completed = completedByCourse.get(enrollment.course_id) || 0;
        const progress = totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0;
        return {
          ...enrollment,
          lessonsCount: totalLessons,
          completedLessons: completed,
          progress,
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  });

  // Memoize filtering so typing in search doesn't recompute on unrelated renders
  const filteredCourses = useMemo(() => {
    if (!enrolledCourses) return [];
    const term = searchTerm.toLowerCase();
    if (!term) return enrolledCourses;
    return enrolledCourses.filter((enrollment) =>
      enrollment.courses?.title.toLowerCase().includes(term)
    );
  }, [enrolledCourses, searchTerm]);

  // Stable callback so memoized cards don't re-render on every parent render
  const handleContinue = useCallback(
    (courseId: string) => {
      navigate(`/student/courses/${courseId}/subjects`);
    },
    [navigate]
  );

  return (
    <DashboardLayout
      title="Meus Cursos"
      subtitle="Acesse seus cursos e continue aprendendo"
    >
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar curso..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-2 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCourses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((enrollment) => (
            <EnrolledCourseCard
              key={enrollment.id}
              enrollmentId={enrollment.id}
              courseId={enrollment.course_id}
              title={enrollment.courses?.title}
              description={enrollment.courses?.description}
              category={enrollment.courses?.category}
              thumbnailUrl={enrollment.courses?.thumbnail_url}
              workloadHours={enrollment.courses?.workload_hours}
              progress={enrollment.progress}
              completedLessons={enrollment.completedLessons}
              lessonsCount={enrollment.lessonsCount}
              onContinue={handleContinue}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Nenhum curso encontrado</h3>
          <p className="text-muted-foreground">
            Você ainda não está matriculado em nenhum curso.
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
