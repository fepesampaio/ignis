import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/ui/stats-card';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, CalendarClock, GraduationCap, PlayCircle, ClipboardPen, FileText, Award, ChevronRight, History } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EnrolledCourseCard } from '@/components/student/EnrolledCourseCard';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['student-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch enrolled courses with progress
  const { data: enrolledCourses, isLoading } = useQuery({
    queryKey: ['student-dashboard-courses', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select(`
          id, enrolled_at, completed_at, course_id,
          courses ( id, title, description, category, thumbnail_url, workload_hours )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(4);

      if (error) throw error;
      if (!enrollments || enrollments.length === 0) return [];

      const courseIds = enrollments.map(e => e.course_id);

      const [lessonsResult, progressResult] = await Promise.all([
        supabase.from('lessons').select('id, course_id').in('course_id', courseIds).eq('is_active', true),
        supabase.from('lesson_progress').select('lesson_id, lessons!inner(course_id)').eq('user_id', user.id).eq('completed', true).in('lessons.course_id', courseIds),
      ]);

      const allLessons = lessonsResult.data || [];
      const completedProgress = progressResult.data || [];

      const lessonsByCourse = new Map<string, number>();
      allLessons.forEach(l => {
        lessonsByCourse.set(l.course_id, (lessonsByCourse.get(l.course_id) || 0) + 1);
      });

      const completedByCourse = new Map<string, number>();
      completedProgress.forEach((p: any) => {
        const cid = p.lessons?.course_id;
        if (cid) completedByCourse.set(cid, (completedByCourse.get(cid) || 0) + 1);
      });

      return enrollments.map((enrollment) => {
        const totalLessons = lessonsByCourse.get(enrollment.course_id) || 0;
        const completed = completedByCourse.get(enrollment.course_id) || 0;
        const progress = totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0;
        return { ...enrollment, lessonsCount: totalLessons, completedLessons: completed, progress };
      });
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  });

  // Fetch next payment due date & last payment due date (completion forecast)
  const { data: paymentStats } = useQuery({
    queryKey: ['student-payment-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return { nextDue: null, lastDue: null };

      const [nextResult, lastResult] = await Promise.all([
        supabase
          .from('payments')
          .select('due_date')
          .eq('user_id', user.id)
          .in('status', ['PENDING', 'OVERDUE'])
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true })
          .limit(1),
        supabase
          .from('payments')
          .select('due_date')
          .eq('user_id', user.id)
          .not('due_date', 'is', null)
          .order('due_date', { ascending: false })
          .limit(1),
      ]);

      return {
        nextDue: nextResult.data?.[0]?.due_date || null,
        lastDue: lastResult.data?.[0]?.due_date || null,
      };
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  // Fetch the student's most recent activity across the platform ("Where you left off")
  const { data: lastActivity } = useQuery({
    queryKey: ['student-last-activity', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const [progressRes, answersRes, submissionsRes, attemptsRes] = await Promise.all([
        supabase
          .from('lesson_progress')
          .select('lesson_id, completed, completed_at, lessons!inner(id, title, order_index, course_id, subject_id, courses(title), subjects(title, custom_title))')
          .eq('user_id', user.id)
          .eq('completed', true)
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(1),
        supabase
          .from('activity_answers')
          .select('answered_at, activities!inner(id, title, subject_id, subjects!inner(id, course_id, title, custom_title, courses(title)))')
          .eq('user_id', user.id)
          .order('answered_at', { ascending: false })
          .limit(1),
        supabase
          .from('assignment_submissions')
          .select('submitted_at, assignments!inner(id, title, course_id, subject_id, courses(title), subjects(title, custom_title))')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false })
          .limit(1),
        supabase
          .from('exam_attempts')
          .select('completed_at, exams!inner(id, title, course_id, subject_id, courses(title), subjects(title, custom_title))')
          .eq('user_id', user.id)
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(1),
      ]);

      type Item = {
        type: 'lesson' | 'activity' | 'assignment' | 'exam';
        date: string;
        title: string;
        subjectName: string;
        courseName: string;
        href: string;
      };

      const items: Item[] = [];

      // Build a safe href: prefer deep link, fall back to subject page, then course page, then courses list
      const buildHref = (
        courseId?: string | null,
        subjectId?: string | null,
        deep?: string | null,
      ): string => {
        if (courseId && subjectId && deep) {
          return `/student/courses/${courseId}/subjects/${subjectId}/${deep}`;
        }
        if (courseId && subjectId) {
          return `/student/courses/${courseId}/subjects/${subjectId}`;
        }
        if (courseId) {
          return `/student/courses/${courseId}/subjects`;
        }
        return '/student/courses';
      };

      const lp: any = progressRes.data?.[0];
      if (lp?.lessons) {
        items.push({
          type: 'lesson',
          date: lp.completed_at,
          title: `Você assistiu à aula "${lp.lessons.title}"`,
          subjectName: lp.lessons.subjects?.custom_title || lp.lessons.subjects?.title || '',
          courseName: lp.lessons.courses?.title || '',
          href: buildHref(lp.lessons.course_id, lp.lessons.subject_id),
        });
      }

      const aa: any = answersRes.data?.[0];
      if (aa?.activities) {
        const subj = aa.activities.subjects;
        items.push({
          type: 'activity',
          date: aa.answered_at,
          title: `Você respondeu o exercício "${aa.activities.title}"`,
          subjectName: subj?.custom_title || subj?.title || '',
          courseName: subj?.courses?.title || '',
          href: buildHref(
            subj?.course_id,
            aa.activities.subject_id,
            aa.activities.id ? `activities/${aa.activities.id}` : null,
          ),
        });
      }

      const sub: any = submissionsRes.data?.[0];
      if (sub?.assignments) {
        items.push({
          type: 'assignment',
          date: sub.submitted_at,
          title: `Você enviou o trabalho "${sub.assignments.title}"`,
          subjectName: sub.assignments.subjects?.custom_title || sub.assignments.subjects?.title || '',
          courseName: sub.assignments.courses?.title || '',
          href: buildHref(
            sub.assignments.course_id,
            sub.assignments.subject_id,
            sub.assignments.subject_id ? 'assignments' : null,
          ),
        });
      }

      const at: any = attemptsRes.data?.[0];
      if (at?.exams) {
        items.push({
          type: 'exam',
          date: at.completed_at,
          title: `Você realizou a prova "${at.exams.title}"`,
          subjectName: at.exams.subjects?.custom_title || at.exams.subjects?.title || '',
          courseName: at.exams.courses?.title || '',
          href: buildHref(
            at.exams.course_id,
            at.exams.subject_id,
            at.exams.id ? `exams/${at.exams.id}` : null,
          ),
        });
      }

      if (!items.length) return null;
      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return items[0];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60,
  });

  const averageProgress = useMemo(
    () =>
      enrolledCourses?.length
        ? Math.round(enrolledCourses.reduce((acc, c) => acc + c.progress, 0) / enrolledCourses.length)
        : 0,
    [enrolledCourses]
  );

  const nextDueFormatted = paymentStats?.nextDue
    ? format(new Date(paymentStats.nextDue), 'dd/MM/yyyy')
    : 'Nenhum';

  const completionForecast = paymentStats?.lastDue
    ? format(new Date(paymentStats.lastDue), 'MMM/yyyy', { locale: ptBR })
    : '—';

  const firstName = profile?.full_name?.split(' ')[0] || 'Aluno';

  const handleContinue = useCallback(
    (courseId: string) => {
      navigate(`/student/courses/${courseId}/subjects`);
    },
    [navigate]
  );

  const handleViewAll = useCallback(() => {
    navigate('/student/courses');
  }, [navigate]);

  return (
    <DashboardLayout
      title={`Olá, ${firstName}! 👋`}
      subtitle="Acompanhe seu progresso e continue aprendendo"
    >
      {/* Stats Grid - 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatsCard
          title="Próximo Vencimento"
          value={nextDueFormatted}
          icon={CalendarClock}
          variant="primary"
        />
        <StatsCard
          title="Previsão de Conclusão"
          value={completionForecast}
          icon={GraduationCap}
          variant="success"
        />
        <LastActivityCard activity={lastActivity} onNavigate={(href) => navigate(href)} />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Courses */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-semibold text-foreground">
              Meus Cursos
            </h2>
            <Button variant="outline" onClick={handleViewAll}>
              Ver Todos
            </Button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardContent className="py-6 space-y-3">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-2 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : enrolledCourses && enrolledCourses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {enrolledCourses.slice(0, 4).map((enrollment) => (
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
                  variant="compact"
                  onContinue={handleContinue}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nenhum curso matriculado</h3>
                <p className="text-muted-foreground">
                  Você ainda não está matriculado em nenhum curso.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Progress Overview */}
        <div className="space-y-6">
          <h2 className="text-xl font-display font-semibold text-foreground">
            Progresso Geral
          </h2>
          <div className="card-elevated p-6 flex flex-col items-center">
            <ProgressRing progress={averageProgress} size={160} />
            <p className="mt-4 text-muted-foreground text-center">
              {averageProgress > 0
                ? 'Continue assim! Você está no caminho certo.'
                : 'Comece seus estudos para ver seu progresso aqui!'}
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

interface LastActivityItem {
  type: 'lesson' | 'activity' | 'assignment' | 'exam';
  date: string;
  title: string;
  subjectName: string;
  courseName: string;
  href: string;
}

function LastActivityCard({
  activity,
  onNavigate,
}: {
  activity: LastActivityItem | null | undefined;
  onNavigate: (href: string) => void;
}) {
  const iconMap = {
    lesson: PlayCircle,
    activity: ClipboardPen,
    assignment: FileText,
    exam: Award,
  } as const;

  const Icon = activity ? iconMap[activity.type] : History;

  const relative = activity
    ? formatDistanceToNow(new Date(activity.date), { addSuffix: true, locale: ptBR })
    : null;

  return (
    <button
      type="button"
      onClick={() => activity && onNavigate(activity.href)}
      disabled={!activity}
      className="text-left rounded-lg border bg-card text-card-foreground shadow-sm p-4 transition-all hover:shadow-md hover:border-primary/40 disabled:cursor-default disabled:hover:shadow-sm disabled:hover:border-border focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 flex-shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Onde você parou
          </p>
          {activity ? (
            <>
              <p className="text-sm font-semibold text-foreground mt-1 line-clamp-2">
                {activity.title}
              </p>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {activity.subjectName}
                {activity.courseName ? ` · ${activity.courseName}` : ''}
              </p>
              {relative && (
                <p className="text-[11px] text-muted-foreground/80 mt-1">{relative}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Nenhuma atividade recente. Comece a estudar!
            </p>
          )}
        </div>
        {activity && <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />}
      </div>
    </button>
  );
}
