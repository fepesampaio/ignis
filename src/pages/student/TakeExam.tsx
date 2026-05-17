import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Clock, AlertTriangle, CheckCircle, XCircle, ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import { useSubjectExamUnlock } from '@/hooks/useSubjectExamUnlock';
import { RichTextDisplay } from '@/components/ui/rich-text-display';

interface QuestionOption {
  id: string;
  option_text: string;
  order_index: number;
}

interface Question {
  id: string;
  question_text: string;
  points: number;
  order_index: number;
  options: QuestionOption[];
}

interface ExamData {
  id: string;
  title: string;
  description: string | null;
  passing_score: number;
  time_limit_minutes: number | null;
  questions: Question[];
}

export default function StudentTakeExam() {
  const { courseId, subjectId, examId } = useParams<{ courseId: string; subjectId?: string; examId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [examResult, setExamResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [hasAcceptedAIWarning, setHasAcceptedAIWarning] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(true);

  // Check exam unlock status (only for subject-level exams)
  const examUnlockStatus = useSubjectExamUnlock(subjectId);

  // Check if user already passed this exam
  const { data: hasPassedExam, isLoading: isCheckingPassed } = useQuery({
    queryKey: ['exam-passed-check', examId, user?.id],
    queryFn: async () => {
      if (!user?.id || !examId) return false;
      
      const { data } = await supabase
        .from('exam_attempts')
        .select('id')
        .eq('exam_id', examId)
        .eq('user_id', user.id)
        .eq('passed', true)
        .limit(1);
      
      return (data?.length || 0) > 0;
    },
    enabled: !!examId && !!user?.id,
  });

  // Fetch exam with questions
  const { data: exam, isLoading } = useQuery({
    queryKey: ['student-take-exam', examId],
    queryFn: async () => {
      const { data: examData, error } = await supabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .single();
      if (error) throw error;

      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('id, question_text, points, order_index')
        .eq('exam_id', examId)
        .order('order_index');
      if (questionsError) throw questionsError;

      // Fetch options for each question (without is_correct for security)
      const questionsWithOptions = await Promise.all(
        (questions || []).map(async (q) => {
          const { data: options } = await supabase
            .from('question_options')
            .select('id, option_text, order_index')
            .eq('question_id', q.id)
            .order('order_index');
          return { ...q, options: options || [] };
        })
      );

      return { ...examData, questions: questionsWithOptions } as ExamData;
    },
    enabled: !!examId,
  });

  // Create attempt on mount
  const createAttemptMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !examId) throw new Error('Missing data');

      const { data, error } = await supabase
        .from('exam_attempts')
        .insert({
          exam_id: examId,
          user_id: user.id,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      setAttemptId(id);
      if (exam?.time_limit_minutes) {
        setTimeLeft(exam.time_limit_minutes * 60);
      }
    },
    onError: (error) => {
      console.error('Error creating attempt:', error);
      toast.error('Erro ao iniciar prova');
      navigate(`/student/courses/${courseId}/exams`);
    },
  });

  // Handle redirects for already passed or blocked exams
  useEffect(() => {
    // If already passed, redirect back
    if (!isCheckingPassed && hasPassedExam) {
      toast.error('Você já foi aprovado nesta prova');
      if (subjectId) {
        navigate(`/student/courses/${courseId}/subjects/${subjectId}`);
      } else {
        navigate(`/student/courses/${courseId}/exams`);
      }
      return;
    }

    // If this is a subject-level exam and activities are not completed, block
    if (subjectId && !examUnlockStatus.isLoading && !examUnlockStatus.canTakeExam) {
      toast.error('Complete todos os exercícios com aprovação para acessar esta prova');
      navigate(`/student/courses/${courseId}/subjects/${subjectId}`);
      return;
    }
  }, [isCheckingPassed, hasPassedExam, subjectId, examUnlockStatus.isLoading, examUnlockStatus.canTakeExam]);

  // Start exam attempt when user confirms
  const handleStartExam = () => {
    if (!hasAcceptedAIWarning) {
      toast.error('Você precisa aceitar as orientações sobre uso de IA para continuar');
      return;
    }
    setShowStartScreen(false);
    if (exam && !attemptId && !examResult && !isCheckingPassed && !hasPassedExam && (!subjectId || examUnlockStatus.canTakeExam)) {
      createAttemptMutation.mutate();
    }
  };

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || examResult) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, examResult]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const handleSubmit = useCallback(async () => {
    if (!attemptId || !exam || isSubmitting) return;
    setIsSubmitting(true);

    try {
      // Save all answers
      const answerEntries = Object.entries(answers);
      for (const [questionId, optionId] of answerEntries) {
        await supabase.from('exam_answers').insert({
          attempt_id: attemptId,
          question_id: questionId,
          selected_option_id: optionId,
        });
      }

      // Calculate score server-side by checking correct answers
      let correctPoints = 0;
      let totalPoints = 0;

      for (const question of exam.questions) {
        totalPoints += question.points;
        const selectedOptionId = answers[question.id];
        
        if (selectedOptionId) {
          // Check if selected option is correct
          const { data: option } = await supabase
            .from('question_options')
            .select('is_correct')
            .eq('id', selectedOptionId)
            .single();
          
          if (option?.is_correct) {
            correctPoints += question.points;

            // Update answer as correct
            await supabase
              .from('exam_answers')
              .update({ is_correct: true })
              .eq('attempt_id', attemptId)
              .eq('question_id', question.id);
          } else {
            await supabase
              .from('exam_answers')
              .update({ is_correct: false })
              .eq('attempt_id', attemptId)
              .eq('question_id', question.id);
          }
        }
      }

      const score = totalPoints > 0 ? (correctPoints / totalPoints) * 100 : 0;
      const passed = score >= exam.passing_score;

      // Update attempt with results
      await supabase
        .from('exam_attempts')
        .update({
          score,
          passed,
          completed_at: new Date().toISOString(),
        })
        .eq('id', attemptId);

      setExamResult({ score, passed });
      queryClient.invalidateQueries({ queryKey: ['student-course-exams', courseId] });
      queryClient.invalidateQueries({ queryKey: ['student-subject-exams', subjectId] });
      queryClient.invalidateQueries({ queryKey: ['subject-exam-unlock', subjectId] });
    } catch (error) {
      console.error('Error submitting exam:', error);
      toast.error('Erro ao enviar prova');
    } finally {
      setIsSubmitting(false);
    }
  }, [attemptId, exam, answers, isSubmitting, courseId, queryClient]);

  const currentQuestion = exam?.questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;
  const totalQuestions = exam?.questions.length || 0;
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  // Show loading or blocked state
  if (isLoading || isCheckingPassed || createAttemptMutation.isPending || (subjectId && examUnlockStatus.isLoading)) {
    return (
      <DashboardLayout title="Carregando..." subtitle="">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  // Show blocked screen if already passed
  if (hasPassedExam) {
    return (
      <DashboardLayout title="Prova Concluída" subtitle="">
        <Card className="max-w-lg mx-auto">
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-20 w-20 mx-auto text-green-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Você já foi aprovado!</h2>
            <p className="text-muted-foreground mb-6">
              Você já completou esta prova com aprovação e não pode refazê-la.
            </p>
            <Button onClick={() => {
              if (subjectId) {
                navigate(`/student/courses/${courseId}/subjects/${subjectId}`);
              } else {
                navigate(`/student/courses/${courseId}/exams`);
              }
            }}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  // Show blocked screen for subject exams (only if exam unlock status is loaded)
  if (subjectId && !examUnlockStatus.isLoading && !examUnlockStatus.canTakeExam) {
    return (
      <DashboardLayout title="Prova Bloqueada" subtitle="">
        <Card className="max-w-lg mx-auto">
          <CardContent className="py-12 text-center">
            <Lock className="h-20 w-20 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Prova Bloqueada</h2>
            <p className="text-muted-foreground mb-6">
              {examUnlockStatus.message || 'Complete todos os exercícios para liberar esta prova.'}
            </p>
            <div className="p-4 bg-muted rounded-lg mb-6">
              <p className="text-sm font-medium mb-2">Progresso dos Exercícios</p>
              <Progress 
                value={(examUnlockStatus.completedActivities / examUnlockStatus.totalActivities) * 100} 
                className="h-2 mb-2" 
              />
              <p className="text-sm text-muted-foreground">
                {examUnlockStatus.completedActivities} de {examUnlockStatus.totalActivities} aprovados (≥70%)
              </p>
            </div>
            <Button onClick={() => navigate(`/student/courses/${courseId}/subjects/${subjectId}`)}>
              Voltar para Matéria
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  // Show start screen with AI warning checkbox
  if (showStartScreen && !examResult) {
    return (
      <DashboardLayout
        title={exam?.title || 'Prova'}
        subtitle={exam?.description || ''}
      >
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              Iniciar Prova
            </CardTitle>
            <CardDescription>
              Leia as informações abaixo antes de começar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">Informações da Prova</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong>Total de questões:</strong> {exam?.questions.length || 0}</li>
                  {exam?.time_limit_minutes && (
                    <li>• <strong>Tempo limite:</strong> {exam.time_limit_minutes} minutos</li>
                  )}
                  <li>• <strong>Nota mínima para aprovação:</strong> {exam?.passing_score}%</li>
                </ul>
              </div>

              <div className="p-4 border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                <div className="flex items-start gap-2 text-yellow-800 dark:text-yellow-200">
                  <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold mb-1">Atenção</h4>
                    <p className="text-sm">
                      Uma vez iniciada, a prova não pode ser pausada. Certifique-se de ter tempo 
                      disponível para completá-la.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-4 border rounded-lg">
                <Checkbox
                  id="ai-warning"
                  checked={hasAcceptedAIWarning}
                  onCheckedChange={(checked) => setHasAcceptedAIWarning(checked === true)}
                />
                <label
                  htmlFor="ai-warning"
                  className="text-sm font-medium leading-relaxed cursor-pointer"
                >
                  Declaro que esta atividade será respondida com base no meu próprio estudo. Estou ciente de que o uso de Inteligência Artificial para gerar respostas é proibido e não reflete um aprendizado real.
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  if (subjectId) {
                    navigate(`/student/courses/${courseId}/subjects/${subjectId}`);
                  } else {
                    navigate(`/student/courses/${courseId}/exams`);
                  }
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <Button
                onClick={handleStartExam}
                disabled={!hasAcceptedAIWarning}
                className="flex-1"
              >
                Iniciar Prova
              </Button>
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  // Show result screen
  if (examResult) {
    return (
      <DashboardLayout
        title="Resultado da Prova"
        subtitle={exam?.title || ''}
      >
        <Card className="max-w-lg mx-auto">
          <CardContent className="py-12 text-center">
            {examResult.passed ? (
              <CheckCircle className="h-20 w-20 mx-auto text-green-500 mb-4" />
            ) : (
              <XCircle className="h-20 w-20 mx-auto text-red-500 mb-4" />
            )}
            
            <h2 className="text-2xl font-bold mb-2">
              {examResult.passed ? 'Parabéns!' : 'Não foi dessa vez'}
            </h2>
            
            <p className="text-muted-foreground mb-6">
              {examResult.passed 
                ? 'Você foi aprovado na prova!'
                : 'Você não atingiu a nota mínima para aprovação.'}
            </p>

            <div className="p-6 bg-muted rounded-lg mb-6">
              <p className="text-sm text-muted-foreground mb-1">Sua nota</p>
              <p className={`text-4xl font-bold ${examResult.passed ? 'text-green-600' : 'text-red-600'}`}>
                {examResult.score.toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Mínimo necessário: {exam?.passing_score}%
              </p>
            </div>

            <Button onClick={() => {
              if (subjectId) {
                navigate(`/student/courses/${courseId}/subjects/${subjectId}`);
              } else {
                navigate(`/student/courses/${courseId}/exams`);
              }
            }}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={exam?.title || 'Prova'}
      subtitle={exam?.description || ''}
    >
      {/* Header with timer and progress */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant="outline">
                Questão {currentQuestionIndex + 1} de {totalQuestions}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {answeredCount} de {totalQuestions} respondidas
              </span>
            </div>
            {timeLeft !== null && (
              <div className={`flex items-center gap-2 ${timeLeft < 300 ? 'text-red-500' : ''}`}>
                <Clock className="h-4 w-4" />
                <span className="font-mono font-medium">{formatTime(timeLeft)}</span>
              </div>
            )}
          </div>
          <Progress value={progress} className="mt-3 h-2" />
        </CardContent>
      </Card>

      {/* Question */}
      {currentQuestion && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge>{currentQuestion.points} ponto(s)</Badge>
            </div>
            <div className="mt-2">
              <RichTextDisplay content={currentQuestion.question_text} className="text-lg font-semibold" />
            </div>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={answers[currentQuestion.id] || ''}
              onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
            >
              {currentQuestion.options.map((option, index) => (
                <div
                  key={option.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                    answers[currentQuestion.id] === option.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted'
                  }`}
                >
                  <RadioGroupItem value={option.id} id={option.id} />
                  <Label htmlFor={option.id} className="flex-1 cursor-pointer flex items-start gap-1">
                    <span>{String.fromCharCode(65 + index)})</span>
                    <RichTextDisplay content={option.option_text} className="inline [&_p]:mb-0" />
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
          disabled={currentQuestionIndex === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Anterior
        </Button>

        <div className="flex gap-2">
          {/* Question indicators */}
          {exam?.questions.map((q, index) => (
            <button
              key={q.id}
              onClick={() => setCurrentQuestionIndex(index)}
              className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                index === currentQuestionIndex
                  ? 'bg-primary text-primary-foreground'
                  : answers[q.id]
                  ? 'bg-green-500 text-white'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {currentQuestionIndex < totalQuestions - 1 ? (
          <Button
            onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
          >
            Próxima
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSubmitting ? 'Enviando...' : 'Finalizar Prova'}
          </Button>
        )}
      </div>

      {/* Warning */}
      <Card className="mt-6 border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950">
        <CardContent className="py-3 flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">
            Certifique-se de responder todas as questões antes de finalizar.
          </span>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
