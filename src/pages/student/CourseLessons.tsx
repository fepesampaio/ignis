import { useState, useEffect } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  PlayCircle, 
  CheckCircle, 
  Lock, 
  Clock,
  BookOpen,
  FileText,
  Award
} from 'lucide-react';
import { BunnyVideoPlayer } from '@/components/student/BunnyVideoPlayer';
import { CertificateGenerator } from '@/components/student/CertificateGenerator';

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  video_url: string | null;
  order_index: number;
  release_after_days: number;
  is_active: boolean;
}

interface LessonWithProgress extends Lesson {
  isCompleted: boolean;
  isLocked: boolean;
  daysUntilUnlock: number;
}

export default function StudentCourseLessons() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedLesson, setSelectedLesson] = useState<LessonWithProgress | null>(null);

  // Fetch course details
  const { data: course } = useQuery({
    queryKey: ['student-course', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  // Fetch enrollment to get enrolled_at date
  const { data: enrollment } = useQuery({
    queryKey: ['student-enrollment', courseId, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('enrollments')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId && !!user?.id,
  });

  // Fetch lessons with progress
  const { data: lessons, isLoading } = useQuery({
    queryKey: ['student-course-lessons', courseId, user?.id],
    queryFn: async () => {
      if (!user?.id || !enrollment) return [];

      // Get all lessons
      const { data: lessonsData, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_active', true)
        .order('order_index');

      if (error) throw error;

      // Get user's progress
      const { data: progressData } = await supabase
        .from('lesson_progress')
        .select('lesson_id, completed')
        .eq('user_id', user.id)
        .in('lesson_id', lessonsData?.map(l => l.id) || []);

      const progressMap = new Map(
        progressData?.map(p => [p.lesson_id, p.completed]) || []
      );

      // Calculate days since enrollment
      const enrolledAt = new Date(enrollment.enrolled_at);
      const now = new Date();
      const daysSinceEnrollment = Math.floor(
        (now.getTime() - enrolledAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Map lessons with progress and lock status
      const lessonsWithProgress: LessonWithProgress[] = lessonsData?.map(lesson => {
        const isLocked = lesson.release_after_days > daysSinceEnrollment;
        const daysUntilUnlock = lesson.release_after_days - daysSinceEnrollment;

        return {
          ...lesson,
          isCompleted: progressMap.get(lesson.id) || false,
          isLocked,
          daysUntilUnlock: isLocked ? daysUntilUnlock : 0,
        };
      }) || [];

      return lessonsWithProgress;
    },
    enabled: !!courseId && !!user?.id && !!enrollment,
  });

  // Check if user has passed all exams
  const { data: examStatus } = useQuery({
    queryKey: ['student-course-exam-status', courseId, user?.id],
    queryFn: async () => {
      if (!user?.id) return { hasExams: false, passedAll: true };

      const { data: exams } = await supabase
        .from('exams')
        .select('id')
        .eq('course_id', courseId)
        .eq('is_active', true);

      if (!exams || exams.length === 0) {
        return { hasExams: false, passedAll: true };
      }

      let passedAll = true;
      for (const exam of exams) {
        const { data: attempts } = await supabase
          .from('exam_attempts')
          .select('passed')
          .eq('exam_id', exam.id)
          .eq('user_id', user.id)
          .eq('passed', true);

        if (!attempts || attempts.length === 0) {
          passedAll = false;
          break;
        }
      }

      return { hasExams: true, passedAll };
    },
    enabled: !!courseId && !!user?.id,
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

  // Calculate progress
  const completedCount = lessons?.filter(l => l.isCompleted).length || 0;
  const totalCount = lessons?.length || 0;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Auto-select first uncompleted lesson or first lesson
  useEffect(() => {
    if (lessons && lessons.length > 0 && !selectedLesson) {
      const firstUncompletedUnlocked = lessons.find(l => !l.isCompleted && !l.isLocked);
      const firstUnlocked = lessons.find(l => !l.isLocked);
      setSelectedLesson(firstUncompletedUnlocked || firstUnlocked || null);
    }
  }, [lessons, selectedLesson]);

  // Mark lesson as completed
  const markCompletedMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      // Check if progress record exists
      const { data: existing } = await supabase
        .from('lesson_progress')
        .select('id')
        .eq('lesson_id', lessonId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('lesson_progress')
          .update({ completed: true, completed_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('lesson_progress')
          .insert({
            lesson_id: lessonId,
            user_id: user.id,
            completed: true,
            completed_at: new Date().toISOString(),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-course-lessons', courseId] });
      toast.success('Aula marcada como concluída!');
    },
    onError: (error) => {
      console.error('Error marking lesson as completed:', error);
      toast.error('Erro ao marcar aula como concluída');
    },
  });

  const handleSelectLesson = (lesson: LessonWithProgress) => {
    if (lesson.isLocked) {
      toast.error(`Esta aula será liberada em ${lesson.daysUntilUnlock} dia(s)`);
      return;
    }
    setSelectedLesson(lesson);
  };

  const handleMarkCompleted = () => {
    if (selectedLesson) {
      markCompletedMutation.mutate(selectedLesson.id);
    }
  };

  const handleNextLesson = () => {
    if (!lessons || !selectedLesson) return;
    const currentIndex = lessons.findIndex(l => l.id === selectedLesson.id);
    const nextLesson = lessons[currentIndex + 1];
    if (nextLesson && !nextLesson.isLocked) {
      setSelectedLesson(nextLesson);
    }
  };

  return (
    <DashboardLayout
      title={course?.title || 'Carregando...'}
      subtitle="Assista às aulas e acompanhe seu progresso"
    >
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/student/courses')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Cursos
        </Button>
        <div className="flex gap-2">
          {examStatus?.hasExams && (
            <Button
              variant="outline"
              onClick={() => navigate(`/student/courses/${courseId}/exams`)}
            >
              <FileText className="h-4 w-4 mr-2" />
              Provas
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => navigate('/student/certificates')}
          >
            <Award className="h-4 w-4 mr-2" />
            Certificados
          </Button>
        </div>
      </div>

      {/* Certificate Generator */}
      <div className="mb-6">
        <CertificateGenerator
          courseId={courseId!}
          progress={progressPercentage}
          hasPassedExams={examStatus?.passedAll ?? true}
          hasCertificate={!!certificate}
        />
      </div>

      {/* Progress Overview */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progresso do Curso</span>
            <span className="text-sm text-muted-foreground">
              {completedCount} de {totalCount} aulas concluídas
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lessons List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Aulas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : lessons && lessons.length > 0 ? (
                  <div className="divide-y">
                    {lessons.map((lesson, index) => (
                      <button
                        key={lesson.id}
                        onClick={() => handleSelectLesson(lesson)}
                        disabled={lesson.isLocked}
                        className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${
                          selectedLesson?.id === lesson.id ? 'bg-muted' : ''
                        } ${lesson.isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {lesson.isLocked ? (
                              <Lock className="h-5 w-5 text-muted-foreground" />
                            ) : lesson.isCompleted ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <PlayCircle className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {index + 1}. {lesson.title}
                            </p>
                            {lesson.isLocked && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Libera em {lesson.daysUntilUnlock} dia(s)
                              </p>
                            )}
                            {lesson.isCompleted && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                Concluída
                              </Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    Nenhuma aula disponível
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Video Player and Content */}
        <div className="lg:col-span-2">
          {selectedLesson ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{selectedLesson.title}</CardTitle>
                    {selectedLesson.description && (
                      <CardDescription className="mt-1">
                        {selectedLesson.description}
                      </CardDescription>
                    )}
                  </div>
                  {selectedLesson.isCompleted && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Concluída
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Video Player */}
                {selectedLesson.video_url && (
                  <BunnyVideoPlayer videoUrl={selectedLesson.video_url} />
                )}

                {/* Lesson Content */}
                {selectedLesson.content && (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedLesson.content) }} />
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex gap-2">
                    {!selectedLesson.isCompleted && (
                      <Button
                        onClick={handleMarkCompleted}
                        disabled={markCompletedMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Marcar como Concluída
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleNextLesson}
                    disabled={
                      !lessons ||
                      lessons.findIndex(l => l.id === selectedLesson.id) === lessons.length - 1 ||
                      lessons[lessons.findIndex(l => l.id === selectedLesson.id) + 1]?.isLocked
                    }
                  >
                    Próxima Aula
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <PlayCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Selecione uma aula</h3>
                <p className="text-muted-foreground">
                  Escolha uma aula na lista para começar a assistir
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
