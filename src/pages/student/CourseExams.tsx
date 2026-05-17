import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, FileText, Clock, Target, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface Exam {
  id: string;
  title: string;
  description: string | null;
  passing_score: number;
  time_limit_minutes: number | null;
  max_attempts: number | null;
  questions_count: number;
}

interface ExamAttempt {
  id: string;
  score: number | null;
  passed: boolean | null;
  completed_at: string | null;
  started_at: string;
}

export default function StudentCourseExams() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch course
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

  // Fetch exams with questions count and attempts
  const { data: exams, isLoading } = useQuery({
    queryKey: ['student-course-exams', courseId, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_active', true)
        .order('created_at');

      if (error) throw error;

      // Get questions count and attempts for each exam
      const examsWithData = await Promise.all(
        (data || []).map(async (exam) => {
          const { count } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('exam_id', exam.id);

          const { data: attempts } = await supabase
            .from('exam_attempts')
            .select('*')
            .eq('exam_id', exam.id)
            .eq('user_id', user.id)
            .order('started_at', { ascending: false });

          return {
            ...exam,
            questions_count: count || 0,
            attempts: attempts || [],
          };
        })
      );

      return examsWithData as (Exam & { attempts: ExamAttempt[] })[];
    },
    enabled: !!courseId && !!user?.id,
  });

  const getAttemptStatus = (exam: Exam & { attempts: ExamAttempt[] }) => {
    const completedAttempts = exam.attempts.filter(a => a.completed_at);
    const passedAttempt = completedAttempts.find(a => a.passed);
    const attemptsUsed = completedAttempts.length;
    const remainingAttempts = exam.max_attempts ? exam.max_attempts - attemptsUsed : null;

    return { passedAttempt, attemptsUsed, remainingAttempts, completedAttempts };
  };

  return (
    <DashboardLayout
      title={`Provas - ${course?.title || 'Carregando...'}`}
      subtitle="Realize as provas disponíveis para o curso"
    >
      <Button
        variant="ghost"
        onClick={() => navigate(`/student/courses/${courseId}/lessons`)}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar para Aulas
      </Button>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : exams && exams.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((exam) => {
            const { passedAttempt, attemptsUsed, remainingAttempts, completedAttempts } = getAttemptStatus(exam);
            const canTakeExam = !passedAttempt && (remainingAttempts === null || remainingAttempts > 0);
            const bestScore = completedAttempts.length > 0 
              ? Math.max(...completedAttempts.map(a => a.score || 0)) 
              : null;

            return (
              <Card key={exam.id} className="card-elevated">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    {passedAttempt ? (
                      <Badge className="bg-green-500">Aprovado</Badge>
                    ) : completedAttempts.length > 0 ? (
                      <Badge variant="destructive">Reprovado</Badge>
                    ) : (
                      <Badge variant="secondary">Pendente</Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg">{exam.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {exam.description || 'Sem descrição'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>{exam.questions_count} questões</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span>Mínimo {exam.passing_score}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{exam.time_limit_minutes ? `${exam.time_limit_minutes} min` : 'Sem limite'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {exam.max_attempts 
                          ? `${attemptsUsed}/${exam.max_attempts} tentativas` 
                          : `${attemptsUsed} tentativa(s)`}
                      </span>
                    </div>
                  </div>

                  {bestScore !== null && (
                    <div className={`p-3 rounded-lg ${passedAttempt ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'}`}>
                      <div className="flex items-center gap-2">
                        {passedAttempt ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                        <span className="font-medium">
                          Melhor nota: {bestScore.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {canTakeExam ? (
                    <Button
                      className="w-full"
                      onClick={() => navigate(`/student/courses/${courseId}/exams/${exam.id}`)}
                    >
                      {completedAttempts.length > 0 ? 'Tentar Novamente' : 'Iniciar Prova'}
                    </Button>
                  ) : (
                    <Button className="w-full" disabled>
                      {passedAttempt ? 'Prova Concluída' : 'Sem tentativas restantes'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma prova disponível</h3>
            <p className="text-muted-foreground">
              Este curso ainda não possui provas cadastradas.
            </p>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
