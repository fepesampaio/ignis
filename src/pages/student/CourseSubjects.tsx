import { useState, useRef, useEffect, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  CheckCircle, 
  BookOpen,
  FileText,
  Award,
  ChevronRight,
  Layers,
  Lock,
  Clock,
  Play,
  Calendar
} from 'lucide-react';
import { CertificateGenerator } from '@/components/student/CertificateGenerator';
import { EmbedVideoPlayer } from '@/components/student/EmbedVideoPlayer';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { useAllSubjectsReleaseStatus } from '@/hooks/useSubjectRelease';


interface Subject {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_active: boolean;
  is_certificate_instructions: boolean;
  release_after_days: number;
}

interface SubjectWithProgress extends Subject {
  lessonsCount: number;
  completedLessonsCount: number;
  isFullyCompleted: boolean;
}

// Lazy-rendered subject card using IntersectionObserver
const LazySubjectCard = memo(function LazySubjectCard({ 
  subject, index, courseId, releaseStatusMap, navigate, courseCategory 
}: { 
  subject: SubjectWithProgress; 
  index: number; 
  courseId: string; 
  releaseStatusMap: Record<string, any> | undefined;
  navigate: (path: string) => void;
  courseCategory?: string | null;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const subjectProgress = subject.lessonsCount > 0 
    ? Math.round((subject.completedLessonsCount / subject.lessonsCount) * 100)
    : 0;
  const isCompleted = subject.isFullyCompleted;
  const releaseStatus = releaseStatusMap?.[subject.id];
  const isLocked = releaseStatus?.isLocked ?? false;
  const daysUntilUnlock = releaseStatus?.daysUntilUnlock ?? 0;
  const lockedByExam = releaseStatus?.lockedByExam ?? false;
  const lockedByCompletion = releaseStatus?.lockedByCompletion ?? false;
  const previousSubjectTitle = releaseStatus?.previousSubjectTitle;

  const handleClick = () => {
    if (isLocked) {
      if (lockedByExam && previousSubjectTitle) {
        toast.error(`Você precisa ser aprovado na prova de "${previousSubjectTitle}" para acessar esta matéria`);
      } else if (lockedByCompletion && previousSubjectTitle) {
        toast.error(`Você precisa concluir todas as aulas de "${previousSubjectTitle}" para acessar esta matéria`);
      } else {
        toast.error(`Esta matéria será liberada em ${daysUntilUnlock} dia(s)`);
      }
      return;
    }
    navigate(`/student/courses/${courseId}/subjects/${subject.id}`);
  };

  if (!isVisible) {
    return (
      <div ref={cardRef}>
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="w-8 h-8 rounded-full" />
                <Skeleton className="w-5 h-5 rounded" />
              </div>
              <Skeleton className="w-5 h-5" />
            </div>
            <Skeleton className="h-5 w-3/4 mt-2" />
            <Skeleton className="h-3 w-1/2 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card 
      ref={cardRef}
      className={`cursor-pointer hover:shadow-md transition-shadow ${
        subject.is_certificate_instructions ? 'border-amber-500' : ''
      } ${isLocked ? 'opacity-60' : ''}`}
      onClick={handleClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm ${
              isLocked ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
            }`}>
              {index + 1}
            </div>
            {isLocked ? (
              <Lock className="h-5 w-5 text-muted-foreground" />
            ) : subject.is_certificate_instructions ? (
              <Award className="h-5 w-5 text-amber-500" />
            ) : isCompleted ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <BookOpen className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          {isLocked ? (
            <Badge variant="secondary" className="text-xs">
              {lockedByExam || lockedByCompletion ? (
                <Lock className="h-3 w-3" />
              ) : (
                <>
                  <Clock className="h-3 w-3 mr-1" />
                  {daysUntilUnlock}d
                </>
              )}
            </Badge>
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <CardTitle className="text-base mt-2">{subject.title}</CardTitle>
        {(() => {
          const isEjaOrTecnico = courseCategory && ['eja', 'técnico', 'tecnico'].includes(courseCategory.toLowerCase());
          if (subject.is_certificate_instructions && isEjaOrTecnico) {
            return (
              <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-1">
                <Award className="h-3 w-3" />
                <span>Solicite seu Certificado</span>
              </div>
            );
          }
          return (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Calendar className="h-3 w-3" />
              <span>Liberação: {subject.release_after_days === 0 ? 'Imediata' : `${subject.release_after_days} dias`}</span>
            </div>
          );
        })()}
      </CardHeader>
      <CardContent>
        {subject.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {subject.description}
          </p>
        )}
        {isLocked ? (
          <Badge variant="outline" className="text-muted-foreground">
            <Lock className="h-3 w-3 mr-1" />
            {lockedByExam ? `Aprovação pendente: ${previousSubjectTitle}` : 
             lockedByCompletion ? `Conclusão pendente: ${previousSubjectTitle}` :
             `Libera em ${daysUntilUnlock} dia(s)`}
          </Badge>
        ) : subject.is_certificate_instructions ? (
          <Badge variant="outline" className="border-amber-500 text-amber-700">
            <Award className="h-3 w-3 mr-1" />
            Instruções do Certificado
          </Badge>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">
                {subject.completedLessonsCount}/{subject.lessonsCount} aulas
              </span>
              <span className="font-medium">{subjectProgress}%</span>
            </div>
            <Progress value={subjectProgress} className="h-1.5" />
          </>
        )}
      </CardContent>
    </Card>
  );
});

export default function StudentCourseSubjects() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch course details
  const { data: course } = useQuery({
    queryKey: ['student-course', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, category, welcome_video_url')
        .eq('id', courseId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  // Fetch enrollment
  const { data: enrollment } = useQuery({
    queryKey: ['student-enrollment', courseId, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('enrollments')
        .select('id, enrolled_at, is_active')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId && !!user?.id,
  });

  // Fetch subjects with progress - optimized with parallel batch queries
  const { data: subjects, isLoading } = useQuery({
    queryKey: ['student-course-subjects', courseId, user?.id, 'v2'],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get all subjects
      const { data: subjectsData, error } = await supabase
        .from('subjects')
        .select('id, title, description, order_index, is_active, is_certificate_instructions, release_after_days')
        .eq('course_id', courseId)
        .eq('is_active', true)
        .order('order_index');

      if (error) throw error;
      if (!subjectsData || subjectsData.length === 0) return [];

      // Get all subject IDs
      const subjectIds = subjectsData.map(s => s.id);

      // Parallel fetch: Get all content types and their progress
      const [
        lessonsResult, 
        progressResult, 
        activitiesResult, 
        activityAnswersResult,
        examsResult,
        examAttemptsResult,
        assignmentsResult,
        assignmentSubmissionsResult
      ] = await Promise.all([
        // Get all lessons for all subjects
        supabase
          .from('lessons')
          .select('id, subject_id')
          .in('subject_id', subjectIds)
          .eq('is_active', true),
        // Get completed lessons via join
        supabase
          .from('lesson_progress')
          .select('lesson_id, lessons!inner(subject_id)')
          .eq('user_id', user.id)
          .eq('completed', true)
          .in('lessons.subject_id', subjectIds),
        // Get all activities for all subjects
        supabase
          .from('activities')
          .select('id, subject_id')
          .in('subject_id', subjectIds)
          .eq('is_active', true),
        // Get all activity answers for the user
        supabase
          .from('activity_answers')
          .select('activity_id, is_correct')
          .eq('user_id', user.id),
        // Get all exams for all subjects
        supabase
          .from('exams')
          .select('id, subject_id')
          .in('subject_id', subjectIds)
          .eq('is_active', true),
        // Get passed exam attempts
        supabase
          .from('exam_attempts')
          .select('exam_id')
          .eq('user_id', user.id)
          .eq('passed', true)
          .not('completed_at', 'is', null),
        // Get all assignments for all subjects
        supabase
          .from('assignments')
          .select('id, subject_id')
          .in('subject_id', subjectIds)
          .eq('is_active', true),
        // Get graded assignment submissions
        supabase
          .from('assignment_submissions')
          .select('assignment_id')
          .eq('user_id', user.id)
          .not('score', 'is', null)
      ]);

      const allLessons = lessonsResult.data || [];
      const completedProgress = progressResult.data || [];
      const allActivities = activitiesResult.data || [];
      const allActivityAnswers = activityAnswersResult.data || [];
      const allExams = examsResult.data || [];
      const passedExamAttempts = examAttemptsResult.data || [];
      const allAssignments = assignmentsResult.data || [];
      const gradedSubmissions = assignmentSubmissionsResult.data || [];

      // Count lessons per subject
      const lessonsBySubject = new Map<string, number>();
      allLessons.forEach(lesson => {
        if (lesson.subject_id) {
          const current = lessonsBySubject.get(lesson.subject_id) || 0;
          lessonsBySubject.set(lesson.subject_id, current + 1);
        }
      });

      // Count completed lessons per subject
      const completedLessonsBySubject = new Map<string, number>();
      completedProgress.forEach((p: any) => {
        const subjectId = p.lessons?.subject_id;
        if (subjectId) {
          const current = completedLessonsBySubject.get(subjectId) || 0;
          completedLessonsBySubject.set(subjectId, current + 1);
        }
      });

      // Calculate activity completion (>=70% correct per activity)
      const activityIds = new Set(allActivities.map(a => a.id));
      const activityAnswersByActivity = new Map<string, { total: number; correct: number }>();
      allActivityAnswers.forEach(a => {
        if (activityIds.has(a.activity_id)) {
          const existing = activityAnswersByActivity.get(a.activity_id) || { total: 0, correct: 0 };
          existing.total++;
          if (a.is_correct) existing.correct++;
          activityAnswersByActivity.set(a.activity_id, existing);
        }
      });

      const passedActivities = new Set<string>();
      activityAnswersByActivity.forEach((stats, activityId) => {
        const percentage = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
        if (percentage >= 70) {
          passedActivities.add(activityId);
        }
      });

      // Count activities per subject and completed
      const activitiesBySubject = new Map<string, string[]>();
      allActivities.forEach(activity => {
        if (activity.subject_id) {
          const current = activitiesBySubject.get(activity.subject_id) || [];
          current.push(activity.id);
          activitiesBySubject.set(activity.subject_id, current);
        }
      });

      // Passed exams set
      const passedExamIds = new Set(passedExamAttempts.map(a => a.exam_id));

      // Count exams per subject
      const examsBySubject = new Map<string, string[]>();
      allExams.forEach(exam => {
        if (exam.subject_id) {
          const current = examsBySubject.get(exam.subject_id) || [];
          current.push(exam.id);
          examsBySubject.set(exam.subject_id, current);
        }
      });

      // Graded assignments set
      const gradedAssignmentIds = new Set(gradedSubmissions.map(s => s.assignment_id));

      // Count assignments per subject
      const assignmentsBySubject = new Map<string, string[]>();
      allAssignments.forEach(assignment => {
        if (assignment.subject_id) {
          const current = assignmentsBySubject.get(assignment.subject_id) || [];
          current.push(assignment.id);
          assignmentsBySubject.set(assignment.subject_id, current);
        }
      });

      // Calculate progress for each subject
      const subjectsWithProgress: SubjectWithProgress[] = subjectsData.map((subject) => {
        const lessonsCount = lessonsBySubject.get(subject.id) || 0;
        const completedLessonsCount = completedLessonsBySubject.get(subject.id) || 0;

        // Check if all activities are completed
        const subjectActivities = activitiesBySubject.get(subject.id) || [];
        const allActivitiesCompleted = subjectActivities.length === 0 || 
          subjectActivities.every(id => passedActivities.has(id));

        // Check if all exams are passed
        const subjectExams = examsBySubject.get(subject.id) || [];
        const allExamsPassed = subjectExams.length === 0 || 
          subjectExams.every(id => passedExamIds.has(id));

        // Check if all assignments are graded
        const subjectAssignments = assignmentsBySubject.get(subject.id) || [];
        const allAssignmentsGraded = subjectAssignments.length === 0 || 
          subjectAssignments.every(id => gradedAssignmentIds.has(id));

        // A subject is fully completed when ALL components are done
        const allLessonsCompleted = lessonsCount === 0 || completedLessonsCount === lessonsCount;
        const isFullyCompleted = allLessonsCompleted && allActivitiesCompleted && allExamsPassed && allAssignmentsGraded;

        return {
          ...subject,
          lessonsCount,
          completedLessonsCount,
          isFullyCompleted,
        };
      });

      return subjectsWithProgress;
    },
    enabled: !!courseId && !!user?.id,
    staleTime: 30 * 1000, // Cache for 30 seconds to show updates faster
  });

  // Get release status for all subjects
  const { data: releaseStatusMap } = useAllSubjectsReleaseStatus(courseId);

  // Check if user has passed all exams - optimized with batch query
  const { data: examStatus } = useQuery({
    queryKey: ['student-course-exam-status', courseId, user?.id],
    queryFn: async () => {
      if (!user?.id) return { hasExams: false, passedAll: true };

      // Get all exams for this course
      const { data: exams } = await supabase
        .from('exams')
        .select('id')
        .eq('course_id', courseId)
        .eq('is_active', true);

      if (!exams || exams.length === 0) {
        return { hasExams: false, passedAll: true };
      }

      const examIds = exams.map(e => e.id);

      // Batch fetch: Get all passed attempts for all exams at once
      const { data: passedAttempts } = await supabase
        .from('exam_attempts')
        .select('exam_id')
        .in('exam_id', examIds)
        .eq('user_id', user.id)
        .eq('passed', true);

      // Check if user passed each exam
      const passedExamIds = new Set(passedAttempts?.map(a => a.exam_id) || []);
      const passedAll = exams.every(exam => passedExamIds.has(exam.id));

      return { hasExams: true, passedAll };
    },
    enabled: !!courseId && !!user?.id,
    staleTime: 1000 * 60 * 2,
  });

  // Check if user already has certificate
  const { data: certificate } = useQuery({
    queryKey: ['student-course-certificate', courseId, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('certificates')
        .select('id')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!courseId && !!user?.id,
  });

  // Calculate overall progress
  const totalLessons = subjects?.reduce((acc, s) => acc + s.lessonsCount, 0) || 0;
  const completedLessons = subjects?.reduce((acc, s) => acc + s.completedLessonsCount, 0) || 0;
  const progressPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // Check if course category allows certificate
  const isProfessional = course?.category?.toLowerCase() === 'profissional';

  const welcomeVideoUrl = course?.welcome_video_url?.trim() || null;

  return (
    <DashboardLayout
      title={course?.title || 'Carregando...'}
      subtitle="Selecione uma matéria para começar"
    >
      <div className="flex items-center mb-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/student/courses')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Cursos
        </Button>
      </div>

      {/* Certificate Generator - Only for Professional courses */}
      {isProfessional && (
        <div className="mb-6">
          <CertificateGenerator
            courseId={courseId!}
            progress={progressPercentage}
            hasPassedExams={examStatus?.passedAll ?? true}
            hasCertificate={!!certificate}
          />
        </div>
      )}

      {/* Welcome Video */}
      {welcomeVideoUrl && (
        <div className="mb-6 w-4/5 mx-auto">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Play className="h-5 w-5 text-primary" />
                Vídeo de Boas-vindas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmbedVideoPlayer videoUrl={welcomeVideoUrl} title="Vídeo de Boas-vindas" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Progress Overview */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progresso do Curso</span>
            <span className="text-sm text-muted-foreground">
              {completedLessons} de {totalLessons} aulas concluídas
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </CardContent>
      </Card>

      {/* Subjects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <Skeleton className="w-5 h-5 rounded" />
                  </div>
                  <Skeleton className="w-5 h-5" />
                </div>
                <Skeleton className="h-5 w-3/4 mt-2" />
                <Skeleton className="h-3 w-1/2 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3 mb-3" />
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </CardContent>
            </Card>
          ))
        ) : subjects && subjects.length > 0 ? (
          subjects.map((subject, index) => (
            <LazySubjectCard
              key={subject.id}
              subject={subject}
              index={index}
              courseId={courseId!}
              releaseStatusMap={releaseStatusMap}
              navigate={navigate}
              courseCategory={course?.category}
            />
          ))
        ) : (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhuma matéria disponível</h3>
              <p className="text-muted-foreground">
                Este curso ainda não possui matérias cadastradas.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

    </DashboardLayout>
  );
}
