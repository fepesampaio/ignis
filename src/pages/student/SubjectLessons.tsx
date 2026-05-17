import { useState, useEffect, useRef, useCallback } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

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
  Award,
  ClipboardList,
  ClipboardPen,
  ChevronRight,
  FileText,
  AlertCircle
} from 'lucide-react';
import { BunnyVideoPlayer } from '@/components/student/BunnyVideoPlayer';
import { YouTubeVideoPlayer } from '@/components/student/YouTubeVideoPlayer';
import { EmbedVideoPlayer } from '@/components/student/EmbedVideoPlayer';
import { useSubjectExamUnlock } from '@/hooks/useSubjectExamUnlock';

// Helper function to remove file extensions from lesson titles
const removeFileExtension = (title: string): string => {
  return title.replace(/\.(mp4|wmv|avi|mkv|mov|flv|webm|m4v|3gp)$/i, '');
};

// Strip the legacy "Exercícios - " prefix (added by Moodle import) so only
// the custom activity title is shown to the student.
const cleanActivityTitle = (title: string): string => {
  return title.replace(/^\s*exerc[ií]cios?\s*[-–—:]\s*/i, '').trim();
};

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  video_url: string | null;
  youtube_url: string | null;
  order_index: number;
  release_after_days: number;
  is_active: boolean;
}

interface Activity {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  lesson_id: string | null;
  order_index: number;
  is_active: boolean;
}

interface ActivityWithStatus extends Activity {
  isPassed: boolean;
}

interface LessonWithProgress extends Lesson {
  isCompleted: boolean;
  isLocked: boolean;
  daysUntilUnlock: number;
  activity?: ActivityWithStatus | null;
}
// Virtualized lesson list – only renders items near the viewport
const ITEM_HEIGHT = 64;
const OVERSCAN = 5;

function VirtualizedLessonList({
  lessons,
  selectedLesson,
  isLoading,
  onSelectLesson,
}: {
  lessons: LessonWithProgress[];
  selectedLesson: LessonWithProgress | null;
  isLoading: boolean;
  onSelectLesson: (l: LessonWithProgress) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const containerHeight = 480; // fixed playlist height

  // Auto-scroll to selected lesson on mount
  useEffect(() => {
    if (!containerRef.current || !selectedLesson || !lessons.length) return;
    const idx = lessons.findIndex(l => l.id === selectedLesson.id);
    if (idx >= 0) {
      const targetScroll = Math.max(0, idx * ITEM_HEIGHT - containerHeight / 2 + ITEM_HEIGHT / 2);
      containerRef.current.scrollTop = targetScroll;
      setScrollTop(targetScroll);
    }
  }, [selectedLesson?.id, lessons.length]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!lessons.length) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Nenhuma aula disponível
      </div>
    );
  }

  const totalHeight = lessons.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    lessons.length,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN
  );

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="overflow-y-auto"
      style={{ height: containerHeight }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {lessons.slice(startIndex, endIndex).map((lesson, i) => {
          const index = startIndex + i;
          const isActive = selectedLesson?.id === lesson.id;
          return (
            <button
              key={lesson.id}
              onClick={() => onSelectLesson(lesson)}
              disabled={lesson.isLocked}
              className={`absolute left-0 right-0 flex items-center gap-2 px-4 text-left transition-colors border-b border-border ${
                isActive ? 'bg-muted' : 'hover:bg-muted/50'
              } ${lesson.isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{ top: index * ITEM_HEIGHT, height: ITEM_HEIGHT }}
            >
              <div className="flex-shrink-0">
                {lesson.isLocked ? (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                ) : lesson.isCompleted ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : isActive ? (
                  <PlayCircle className="h-4 w-4 text-primary" />
                ) : (
                  <PlayCircle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate font-medium">
                  {index + 1}. {removeFileExtension(lesson.title)}
                </p>
                {lesson.isLocked && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {lesson.daysUntilUnlock}d
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Extracted lesson content component to avoid duplication
function LessonContent({
  selectedLesson,
  lessons,
  courseId,
  subjectId,
  markCompletedMutation,
  handleMarkCompleted,
  handleNextLesson,
  navigate,
}: {
  selectedLesson: LessonWithProgress | null;
  lessons: LessonWithProgress[];
  courseId: string;
  subjectId: string;
  markCompletedMutation: { isPending: boolean };
  handleMarkCompleted: () => void;
  handleNextLesson: () => void;
  navigate: (path: string) => void;
}) {
  if (!selectedLesson) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <PlayCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Selecione uma aula</h3>
          <p className="text-muted-foreground">
            Escolha uma aula na lista para começar a assistir
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{removeFileExtension(selectedLesson.title)}</CardTitle>
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
        {selectedLesson.video_url ? (
          <BunnyVideoPlayer videoUrl={selectedLesson.video_url} />
        ) : selectedLesson.youtube_url ? (
          <YouTubeVideoPlayer videoUrl={selectedLesson.youtube_url} />
        ) : (
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <PlayCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Vídeo não disponível para esta aula</p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-between gap-2 pt-4 border-t">
          <Button
            className={`w-full sm:w-auto ${selectedLesson.isCompleted ? 'bg-blue-400 hover:bg-blue-500 text-white' : ''}`}
            onClick={handleMarkCompleted}
            disabled={markCompletedMutation.isPending}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {selectedLesson.isCompleted ? 'Aula Concluída ✅' : 'Marcar como Concluída'}
          </Button>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleNextLesson}
            disabled={
              !lessons.length ||
              lessons.findIndex(l => l.id === selectedLesson.id) === lessons.length - 1 ||
              lessons[lessons.findIndex(l => l.id === selectedLesson.id) + 1]?.isLocked
            }
          >
            Próxima Aula
          </Button>
        </div>

        {selectedLesson.content && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedLesson.content) }} />
          </div>
        )}

        {selectedLesson.activity && (
          <Card
            className={`border-primary/30 bg-primary/5 ${selectedLesson.activity.isPassed ? 'cursor-default' : ''}`}
            onClick={() => {
              if (selectedLesson.activity?.isPassed) {
                toast.info('Você já atingiu a nota de aprovação neste exercício');
              }
            }}
          >
            <CardHeader className="py-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ClipboardPen className="h-6 w-6 text-primary flex-shrink-0" />
                  <CardTitle className="text-lg font-semibold leading-tight">{cleanActivityTitle(selectedLesson.activity.title)}</CardTitle>
                </div>
                {selectedLesson.activity.isPassed ? (
                  <Badge
                    className="w-full sm:w-auto justify-center bg-green-600 hover:bg-green-600 text-white border-transparent gap-1 px-3 py-1.5"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Concluído
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/student/courses/${courseId}/subjects/${subjectId}/activities/${selectedLesson.activity!.id}`);
                    }}
                  >
                    Fazer Exercício
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </CardHeader>
            {selectedLesson.activity.description && (
              <CardContent className="pt-0 pb-3">
                <p className="text-sm text-muted-foreground">{selectedLesson.activity.description}</p>
              </CardContent>
            )}
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

export default function StudentSubjectLessons() {
  const { courseId, subjectId } = useParams<{ courseId: string; subjectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedLesson, setSelectedLesson] = useState<LessonWithProgress | null>(null);

  // Fetch subject details - independent query with caching
  const { data: subject } = useQuery({
    queryKey: ['student-subject', subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, title, description, handout_url, is_certificate_instructions, custom_title, welcome_video_url, html_content, courses(title, category)')
        .eq('id', subjectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!subjectId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch enrollment to get enrolled_at date - independent query with caching
  const { data: enrollment } = useQuery({
    queryKey: ['student-enrollment', courseId, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('enrollments')
        .select('enrolled_at, is_active')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId && !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch lessons with progress - OPTIMIZED: parallel queries
  const { data: lessons, isLoading } = useQuery({
    queryKey: ['student-subject-lessons', subjectId, user?.id, enrollment?.enrolled_at],
    queryFn: async () => {
      if (!user?.id || !enrollment) return [];

      // Run all three queries in parallel
      const [lessonsResult, activitiesResult, progressResult] = await Promise.all([
        supabase
          .from('lessons')
          .select('id, title, description, content, video_url, youtube_url, order_index, release_after_days, is_active')
          .eq('subject_id', subjectId)
          .eq('is_active', true)
          .order('order_index'),
        supabase
          .from('activities')
          .select('id, title, description, content, lesson_id, order_index, is_active')
          .eq('subject_id', subjectId)
          .eq('is_active', true)
          .not('lesson_id', 'is', null),
        supabase
          .from('lesson_progress')
          .select('lesson_id, completed, completed_at')
          .eq('user_id', user.id)
      ]);

      if (lessonsResult.error) throw lessonsResult.error;

      const lessonsData = lessonsResult.data || [];
      const lessonIds = new Set(lessonsData.map(l => l.id));
      
      // Filter progress to only relevant lessons
      const progressData = (progressResult.data || []).filter(p => lessonIds.has(p.lesson_id));

      const activitiesList = activitiesResult.data || [];
      const activityIds = activitiesList.map(a => a.id);

      // Fetch question counts and user answers for all activities in parallel
      const [questionsCountResult, answersResult] = await Promise.all([
        activityIds.length
          ? supabase
              .from('questions')
              .select('id, activity_id')
              .in('activity_id', activityIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        activityIds.length
          ? supabase
              .from('activity_answers')
              .select('activity_id, is_correct')
              .eq('user_id', user.id)
              .in('activity_id', activityIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      const questionCountByActivity = new Map<string, number>();
      (questionsCountResult.data || []).forEach((q: any) => {
        questionCountByActivity.set(q.activity_id, (questionCountByActivity.get(q.activity_id) || 0) + 1);
      });

      const correctByActivity = new Map<string, number>();
      (answersResult.data || []).forEach((a: any) => {
        if (a.is_correct) {
          correctByActivity.set(a.activity_id, (correctByActivity.get(a.activity_id) || 0) + 1);
        }
      });

      const activitiesMap = new Map<string, ActivityWithStatus>(
        activitiesList.map(a => {
          const total = questionCountByActivity.get(a.id) || 0;
          const correct = correctByActivity.get(a.id) || 0;
          const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
          return [a.lesson_id!, { ...a, isPassed: percentage >= 70 && total > 0 }];
        })
      );

      const progressMap = new Map(
        progressData.map(p => [p.lesson_id, p.completed])
      );

      // Determine the most recently completed lesson (for auto-resume)
      const completedSorted = [...progressData]
        .filter(p => p.completed && p.completed_at && lessonIds.has(p.lesson_id))
        .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());
      const lastCompletedLessonId = completedSorted[0]?.lesson_id || null;
      (lessonsData as any).__lastCompletedLessonId = lastCompletedLessonId;

      const enrolledAt = new Date(enrollment.enrolled_at);
      const now = new Date();
      const daysSinceEnrollment = Math.floor(
        (now.getTime() - enrolledAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      const lessonsWithProgress: LessonWithProgress[] = lessonsData.map(lesson => {
        const isLocked = lesson.release_after_days > daysSinceEnrollment;
        const daysUntilUnlock = lesson.release_after_days - daysSinceEnrollment;

        return {
          ...lesson,
          isCompleted: progressMap.get(lesson.id) || false,
          isLocked,
          daysUntilUnlock: isLocked ? daysUntilUnlock : 0,
          activity: activitiesMap.get(lesson.id) || null,
        };
      });

      (lessonsWithProgress as any).__lastCompletedLessonId = lastCompletedLessonId;
      return lessonsWithProgress;
    },
    enabled: !!subjectId && !!user?.id && !!enrollment,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  // Fetch subject exams - OPTIMIZED: single query with all attempts at once
  const { data: subjectExams } = useQuery({
    queryKey: ['student-subject-exams', subjectId, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Fetch exams and all user attempts in parallel
      const [examsResult, attemptsResult] = await Promise.all([
        supabase
          .from('exams')
          .select('id, title, description, passing_score, time_limit_minutes, is_active')
          .eq('subject_id', subjectId)
          .eq('is_active', true)
          .order('created_at'),
        supabase
          .from('exam_attempts')
          .select('id, exam_id, score, passed, completed_at')
          .eq('user_id', user.id)
          .not('completed_at', 'is', null)
      ]);

      if (examsResult.error) throw examsResult.error;

      const exams = examsResult.data || [];
      const examIds = new Set(exams.map(e => e.id));
      
      // Filter attempts to only relevant exams and group by exam_id
      const attemptsMap = new Map<string, typeof attemptsResult.data>();
      (attemptsResult.data || []).forEach(attempt => {
        if (examIds.has(attempt.exam_id)) {
          const existing = attemptsMap.get(attempt.exam_id) || [];
          existing.push(attempt);
          attemptsMap.set(attempt.exam_id, existing);
        }
      });

      return exams.map(exam => {
        const attempts = attemptsMap.get(exam.id) || [];
        const passedAttempt = attempts.find(a => a.passed);
        const bestScore = attempts.length ? Math.max(...attempts.map(a => a.score || 0)) : null;

        return {
          ...exam,
          attempts,
          passed: !!passedAttempt,
          bestScore,
        };
      });
    },
    enabled: !!subjectId && !!user?.id,
    staleTime: 60 * 1000, // Cache for 1 minute
  });

  // Fetch subject assignments - OPTIMIZED: single query with all submissions at once
  const { data: subjectAssignments } = useQuery({
    queryKey: ['student-subject-assignments', subjectId, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Fetch assignments and all user submissions in parallel
      const [assignmentsResult, submissionsResult] = await Promise.all([
        supabase
          .from('assignments')
          .select('id, title, description, max_score, due_date, is_active')
          .eq('subject_id', subjectId)
          .eq('is_active', true)
          .order('created_at'),
        supabase
          .from('assignment_submissions')
          .select('id, assignment_id, score, submitted_at, graded_at')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false })
      ]);

      if (assignmentsResult.error) throw assignmentsResult.error;

      const assignments = assignmentsResult.data || [];
      const assignmentIds = new Set(assignments.map(a => a.id));
      
      // Group submissions by assignment_id, keeping only the latest
      const submissionsMap = new Map<string, (typeof submissionsResult.data)[0]>();
      (submissionsResult.data || []).forEach(sub => {
        if (assignmentIds.has(sub.assignment_id) && !submissionsMap.has(sub.assignment_id)) {
          submissionsMap.set(sub.assignment_id, sub);
        }
      });

      return assignments.map(assignment => {
        const submission = submissionsMap.get(assignment.id) || null;

        return {
          ...assignment,
          submission,
          hasSubmission: !!submission,
          isGraded: !!submission?.graded_at,
        };
      });
    },
    enabled: !!subjectId && !!user?.id,
    staleTime: 60 * 1000, // Cache for 1 minute
  });


  // Check if exams are unlocked
  const examUnlockStatus = useSubjectExamUnlock(subjectId);

  // Calculate progress
  const completedCount = lessons?.filter(l => l.isCompleted).length || 0;
  const totalCount = lessons?.length || 0;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Auto-resume: prefer the lesson AFTER the most recently completed one,
  // falling back to the first uncompleted/unlocked lesson.
  useEffect(() => {
    if (lessons && lessons.length > 0 && !selectedLesson) {
      const lastCompletedId = (lessons as any).__lastCompletedLessonId as string | null;
      let resumeLesson: LessonWithProgress | undefined;

      if (lastCompletedId) {
        const idx = lessons.findIndex(l => l.id === lastCompletedId);
        if (idx >= 0) {
          // Try the next unlocked lesson after the last completed one
          for (let i = idx + 1; i < lessons.length; i++) {
            if (!lessons[i].isLocked) {
              resumeLesson = lessons[i];
              break;
            }
          }
          // If no next available, stay on the last completed lesson
          if (!resumeLesson && !lessons[idx].isLocked) {
            resumeLesson = lessons[idx];
          }
        }
      }

      const firstUncompletedUnlocked = lessons.find(l => !l.isCompleted && !l.isLocked);
      const firstUnlocked = lessons.find(l => !l.isLocked);
      setSelectedLesson(resumeLesson || firstUncompletedUnlocked || firstUnlocked || null);
    }
  }, [lessons, selectedLesson]);

  // Mark lesson as completed
  const markCompletedMutation = useMutation({
    mutationFn: async ({ lessonId, completed }: { lessonId: string; completed: boolean }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { data: existing } = await supabase
        .from('lesson_progress')
        .select('id')
        .eq('lesson_id', lessonId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('lesson_progress')
          .update({ completed, completed_at: completed ? new Date().toISOString() : null })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('lesson_progress')
          .insert({
            lesson_id: lessonId,
            user_id: user.id,
            completed,
            completed_at: completed ? new Date().toISOString() : null,
          });
        if (error) throw error;
      }
      return completed;
    },
    onSuccess: (completed) => {
      queryClient.invalidateQueries({ queryKey: ['student-subject-lessons', subjectId] });
      queryClient.invalidateQueries({ queryKey: ['student-course-subjects', courseId] });
      if (selectedLesson) {
        setSelectedLesson({ ...selectedLesson, isCompleted: completed });
      }
      toast.success(completed ? 'Aula marcada como concluída!' : 'Conclusão removida');
    },
    onError: (error) => {
      console.error('Error updating lesson progress:', error);
      toast.error('Erro ao atualizar conclusão da aula');
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
      markCompletedMutation.mutate({ lessonId: selectedLesson.id, completed: !selectedLesson.isCompleted });
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

  const isCertificateInstructions = subject?.is_certificate_instructions;

  return (
    <DashboardLayout
      title={subject?.title || 'Carregando...'}
      subtitle={subject?.courses?.title}
    >
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          onClick={() => navigate(`/student/courses/${courseId}/subjects`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Matérias
        </Button>
      </div>

      {/* Handout Link */}
      {subject?.handout_url && (
        <Card className="mb-8 border-blue-500 bg-blue-50 dark:bg-blue-950">
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200">
                  Apostila da Matéria
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Material de apoio para estudo
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="w-full sm:w-auto border-blue-500 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900">
              <a href={subject.handout_url} target="_blank" rel="noopener noreferrer">
                Abrir Apostila
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progress Overview */}
      {!isCertificateInstructions && (
        <Card className="mb-8">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progresso da Matéria</span>
              <span className="text-sm text-muted-foreground">
                {completedCount} de {totalCount} aulas concluídas
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </CardContent>
        </Card>
      )}

      {isCertificateInstructions ? (
        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Custom Title */}
            {subject?.custom_title && (
              <h2 className="text-2xl font-bold text-center">
                {subject.custom_title}
              </h2>
            )}

            {/* Welcome Video (YouTube, Vimeo, Bunny, or any embed) */}
            {subject?.welcome_video_url && (
              <div className="w-full">
                <EmbedVideoPlayer videoUrl={subject.welcome_video_url} title="Vídeo da Matéria" />
              </div>
            )}

            {/* HTML Content */}
            {subject?.html_content && (
              <div 
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(subject.html_content) }} 
              />
            )}

            {/* Fallback to description if no custom fields */}
            {!subject?.custom_title && 
             !subject?.welcome_video_url && 
             !subject?.html_content && 
             subject?.description && (
              <div 
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(subject.description) }} 
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <>
        {/* Mobile: Select + Content stacked */}
        <div className="lg:hidden space-y-4">
          {/* Mobile Select */}
          {lessons && lessons.length > 0 && (
            <Card>
              <CardContent className="py-3 px-4">
                <label className="text-sm font-medium flex items-center gap-2 mb-2">
                  <BookOpen className="h-4 w-4" />
                  Aula ({completedCount}/{totalCount})
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  value={selectedLesson?.id || ''}
                  onChange={(e) => {
                    const lesson = lessons.find(l => l.id === e.target.value);
                    if (lesson) handleSelectLesson(lesson);
                  }}
                >
                  {lessons.map((lesson, index) => (
                    <option key={lesson.id} value={lesson.id} disabled={lesson.isLocked}>
                      {lesson.isCompleted ? '✓ ' : lesson.isLocked ? '🔒 ' : ''}{index + 1}. {removeFileExtension(lesson.title)}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          )}

          {/* Mobile Video/Content */}
          <LessonContent
            selectedLesson={selectedLesson}
            lessons={lessons || []}
            courseId={courseId!}
            subjectId={subjectId!}
            markCompletedMutation={markCompletedMutation}
            handleMarkCompleted={handleMarkCompleted}
            handleNextLesson={handleNextLesson}
            navigate={navigate}
          />
        </div>

        {/* Desktop: Two-column layout (Video 70% | Playlist 30%) */}
        <div className="hidden lg:flex gap-6">
          {/* Video Column */}
          <div className="flex-[7] min-w-0">
            <LessonContent
              selectedLesson={selectedLesson}
              lessons={lessons || []}
              courseId={courseId!}
              subjectId={subjectId!}
              markCompletedMutation={markCompletedMutation}
              handleMarkCompleted={handleMarkCompleted}
              handleNextLesson={handleNextLesson}
              navigate={navigate}
            />
          </div>

          {/* Playlist Column */}
          <div className="flex-[3] min-w-0">
            <Card className="sticky top-4">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Aulas
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {completedCount}/{totalCount}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <VirtualizedLessonList
                  lessons={lessons || []}
                  selectedLesson={selectedLesson}
                  isLoading={isLoading}
                  onSelectLesson={handleSelectLesson}
                />
              </CardContent>
            </Card>
          </div>
        </div>
        </>
      )}
      

      {/* Subject Assignments Section */}
      {!isCertificateInstructions && subjectAssignments && subjectAssignments.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Trabalhos da Matéria</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {subjectAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="p-4 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1">
                      <h4 className="font-medium">{assignment.title}</h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {assignment.isGraded && (
                          <Badge className="bg-green-500">
                            Nota: {assignment.submission?.score}
                          </Badge>
                        )}
                        {assignment.hasSubmission && !assignment.isGraded && (
                          <Badge variant="secondary">Enviado</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                        <span>Nota máxima: {assignment.max_score}</span>
                        {assignment.due_date && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Prazo: {new Date(assignment.due_date).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => navigate(`/student/courses/${courseId}/subjects/${subjectId}/assignments`)}
                    >
                      {assignment.hasSubmission ? 'Ver Envio' : 'Enviar Trabalho'}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subject Exams Section */}
      {!isCertificateInstructions && subjectExams && subjectExams.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Provas da Matéria</CardTitle>
              </div>
              {!examUnlockStatus.canTakeExam && (
                <Badge variant="secondary">
                  <Lock className="h-3 w-3 mr-1" />
                  Complete os exercícios primeiro
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Activities Progress */}
            {examUnlockStatus.totalActivities > 0 && (
              <div className="mb-4 p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Progresso dos Exercícios</span>
                  <span className="text-sm text-muted-foreground">
                    {examUnlockStatus.completedActivities} de {examUnlockStatus.totalActivities} aprovados
                  </span>
                </div>
                <Progress 
                  value={(examUnlockStatus.completedActivities / examUnlockStatus.totalActivities) * 100} 
                  className="h-2" 
                />
              </div>
            )}

            {/* Exams List */}
            <div className="space-y-3">
              {subjectExams.map((exam) => (
                <div
                  key={exam.id}
                  className={`p-4 border rounded-lg ${
                    examUnlockStatus.canTakeExam ? 'hover:bg-muted/50' : 'opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1">
                      <h4 className="font-medium">{exam.title}</h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {exam.passed && (
                          <Badge className="bg-green-500">Aprovado</Badge>
                        )}
                      </div>
                      {exam.description && (
                        <p className="text-sm text-muted-foreground mt-1">{exam.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                        <span>Mínimo: {exam.passing_score}%</span>
                        {exam.time_limit_minutes && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {exam.time_limit_minutes} min
                          </span>
                        )}
                        {exam.bestScore !== null && (
                          <span>Melhor nota: {exam.bestScore.toFixed(1)}%</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full sm:w-auto">
                      {examUnlockStatus.canTakeExam ? (
                        <Button
                          className="w-full sm:w-auto"
                          onClick={() => navigate(`/student/courses/${courseId}/subjects/${subjectId}/exams/${exam.id}`)}
                          disabled={exam.passed}
                        >
                          {exam.passed ? 'Aprovado' : exam.attempts.length > 0 ? 'Tentar Novamente' : 'Iniciar Prova'}
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      ) : (
                        <Button disabled variant="secondary" className="w-full sm:w-auto">
                          <Lock className="h-4 w-4 mr-2" />
                          Bloqueada
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
