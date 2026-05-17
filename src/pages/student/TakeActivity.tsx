import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  CheckCircle, 
  XCircle,
  ChevronRight,
  ChevronLeft,
  FileQuestion,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  points: number;
  order_index: number;
  options: QuestionOption[];
}

interface QuestionOption {
  id: string;
  option_text: string;
  is_correct: boolean;
  order_index: number;
}

interface Answer {
  question_id: string;
  selected_option_id: string | null;
  is_correct: boolean | null;
}

export default function StudentTakeActivity() {
  const { courseId, subjectId, activityId } = useParams<{ 
    courseId: string; 
    subjectId: string;
    activityId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [showResults, setShowResults] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState<Answer[]>([]);
  const [hasAcceptedAIWarning, setHasAcceptedAIWarning] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(true);

  // Fetch all activity data in parallel for faster loading
  const { data: activityData, isLoading: questionsLoading } = useQuery({
    queryKey: ['student-activity-full', activityId, user?.id],
    queryFn: async () => {
      // Fetch activity, questions, and previous answers in parallel
      const [activityResult, questionsResult, answersResult] = await Promise.all([
        // Activity details
        supabase
          .from('activities')
          .select('*, lessons(title)')
          .eq('id', activityId)
          .single(),
        // Questions
        supabase
          .from('questions')
          .select('*')
          .eq('activity_id', activityId)
          .order('order_index'),
        // Previous answers (if user exists)
        user?.id 
          ? supabase
              .from('activity_answers')
              .select('*')
              .eq('activity_id', activityId)
              .eq('user_id', user.id)
          : Promise.resolve({ data: [], error: null })
      ]);

      if (activityResult.error) throw activityResult.error;
      if (questionsResult.error) throw questionsResult.error;

      const questionsData = questionsResult.data || [];
      const questionIds = questionsData.map(q => q.id);

      // Fetch options only if we have questions
      let optionsData: any[] = [];
      if (questionIds.length > 0) {
        const { data: options } = await supabase
          .from('question_options')
          .select('*')
          .in('question_id', questionIds)
          .order('order_index');
        optionsData = options || [];
      }

      // Build questions with options using Map for O(1) lookups
      const optionsByQuestion = new Map<string, QuestionOption[]>();
      optionsData.forEach(option => {
        const existing = optionsByQuestion.get(option.question_id) || [];
        existing.push(option);
        optionsByQuestion.set(option.question_id, existing);
      });

      const questionsWithOptions: Question[] = questionsData.map(q => ({
        ...q,
        options: optionsByQuestion.get(q.id) || []
      }));

      return {
        activity: activityResult.data,
        questions: questionsWithOptions,
        previousAnswers: answersResult.data || []
      };
    },
    enabled: !!activityId,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Extract data for easier access
  const activity = activityData?.activity;
  const questions = activityData?.questions;
  const previousAnswers = activityData?.previousAnswers;

  // Check if activity was already completed
  const hasCompletedActivity = previousAnswers && previousAnswers.length > 0;

  // Submit answers mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !questions) throw new Error('Dados inválidos');

      const answersToInsert = questions.map(question => {
        const selectedOptionId = answers.get(question.id);
        const selectedOption = question.options.find(o => o.id === selectedOptionId);
        
        return {
          activity_id: activityId!,
          question_id: question.id,
          user_id: user.id,
          selected_option_id: selectedOptionId || null,
          is_correct: selectedOption?.is_correct || false,
        };
      });

      const { data, error } = await supabase
        .from('activity_answers')
        .insert(answersToInsert)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSavedAnswers(data);
      setShowResults(true);
      queryClient.invalidateQueries({ queryKey: ['student-activity-full', activityId] });
      queryClient.invalidateQueries({ queryKey: ['subject-exam-unlock'] });
      queryClient.invalidateQueries({ queryKey: ['student-subject-lessons'] });
      toast.success('Exercício finalizado!');
    },
    onError: (error) => {
      console.error('Error submitting activity:', error);
      toast.error('Erro ao enviar respostas');
    },
  });

  // Reset activity mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('activity_answers')
        .delete()
        .eq('activity_id', activityId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      setAnswers(new Map());
      setShowResults(false);
      setSavedAnswers([]);
      setCurrentQuestionIndex(0);
      queryClient.invalidateQueries({ queryKey: ['student-activity-full', activityId] });
      queryClient.invalidateQueries({ queryKey: ['subject-exam-unlock'] });
      toast.success('Exercício reiniciado!');
    },
    onError: (error) => {
      console.error('Error resetting activity:', error);
      toast.error('Erro ao reiniciar exercício');
    },
  });

  const handleSelectOption = (questionId: string, optionId: string) => {
    if (showResults || hasCompletedActivity) return;
    setAnswers(new Map(answers.set(questionId, optionId)));
  };

  const handleNext = () => {
    if (questions && currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = () => {
    submitMutation.mutate();
  };

  const handleReset = () => {
    resetMutation.mutate();
  };

  const currentQuestion = questions?.[currentQuestionIndex];
  const totalQuestions = questions?.length || 0;
  const answeredCount = answers.size;
  const allAnswered = answeredCount === totalQuestions;

  // Calculate results
  const getResults = () => {
    const answersToCheck = hasCompletedActivity ? previousAnswers : savedAnswers;
    if (!answersToCheck || !questions) return { correct: 0, total: 0, percentage: 0 };
    
    const correct = answersToCheck.filter(a => a.is_correct).length;
    const total = questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    
    return { correct, total, percentage };
  };

  const results = getResults();

  // Handle start activity
  const handleStartActivity = () => {
    if (!hasAcceptedAIWarning) {
      toast.error('Você precisa aceitar as orientações sobre uso de IA para continuar');
      return;
    }
    setShowStartScreen(false);
  };

  // Show start screen with AI warning checkbox (only for new activities)
  if (showStartScreen && !hasCompletedActivity && !showResults) {
    return (
      <DashboardLayout
        title={(activity?.title ? activity.title.replace(/^\s*[Ee]xerc[ií]cios?\s*[-–—:]\s*/, '').trim() : 'Carregando...')}
        subtitle={activity?.lessons?.title}
      >
        <Button
          variant="ghost"
          onClick={() => navigate(`/student/courses/${courseId}/subjects/${subjectId}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Matéria
        </Button>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              Conduta acadêmica
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">

              <div className="flex items-start space-x-3 p-4 border rounded-lg">
                <Checkbox
                  id="ai-warning-activity"
                  checked={hasAcceptedAIWarning}
                  onCheckedChange={(checked) => setHasAcceptedAIWarning(checked === true)}
                />
                <label
                  htmlFor="ai-warning-activity"
                  className="text-sm font-medium leading-relaxed cursor-pointer"
                >
                  Declaro que esta atividade será respondida com base no meu próprio estudo. Estou ciente de que o uso de Inteligência Artificial para gerar respostas é proibido e não reflete um aprendizado real.
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => navigate(`/student/courses/${courseId}/subjects/${subjectId}`)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <Button
                onClick={handleStartActivity}
                disabled={!hasAcceptedAIWarning}
                className="flex-1"
              >
                Iniciar Exercício
              </Button>
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  // If activity was already completed, show results
  if (hasCompletedActivity && !showResults) {
    return (
      <DashboardLayout
        title={(activity?.title ? activity.title.replace(/^\s*[Ee]xerc[ií]cios?\s*[-–—:]\s*/, '').trim() : 'Carregando...')}
        subtitle={activity?.lessons?.title}
      >
        <Button
          variant="ghost"
          onClick={() => navigate(`/student/courses/${courseId}/subjects/${subjectId}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Matéria
        </Button>

        <Card className="max-w-2xl mx-auto mb-6">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Exercício Concluído</CardTitle>
            <CardDescription>Você já completou este exercício</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">{results.percentage}%</div>
              <p className="text-muted-foreground">
                {results.correct} de {results.total} questões corretas
              </p>
            </div>
            
            <Progress value={results.percentage} className="h-3" />

            <div className="flex justify-center gap-4">
              {results.percentage < 70 && (
                <Button variant="outline" onClick={handleReset} disabled={resetMutation.isPending}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Refazer Exercício
                </Button>
              )}
              <Button onClick={() => navigate(`/student/courses/${courseId}/subjects/${subjectId}`)}>
                Voltar para Aulas
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Results per Question */}
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-lg">Resultado por Questão</CardTitle>
            <CardDescription>
              Veja quais questões você acertou e quais errou
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {questions?.map((question, index) => {
                const answer = previousAnswers?.find(a => a.question_id === question.id);
                const isCorrect = answer?.is_correct;
                
                return (
                  <div
                    key={question.id}
                    className={`flex items-center gap-3 p-4 rounded-lg border ${
                      isCorrect 
                        ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' 
                        : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isCorrect 
                        ? 'bg-green-100 dark:bg-green-900' 
                        : 'bg-red-100 dark:bg-red-900'
                    }`}>
                      {isCorrect ? (
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="flex-shrink-0">
                          Questão {index + 1}
                        </Badge>
                        <span className={`text-sm font-medium ${
                          isCorrect 
                            ? 'text-green-700 dark:text-green-400' 
                            : 'text-red-700 dark:text-red-400'
                        }`}>
                          {isCorrect ? 'Correta' : 'Incorreta'}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {question.question_text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  // Show results after submission
  if (showResults) {
    const answersToCheck = savedAnswers;
    
    return (
      <DashboardLayout
        title={(activity?.title ? activity.title.replace(/^\s*[Ee]xerc[ií]cios?\s*[-–—:]\s*/, '').trim() : 'Carregando...')}
        subtitle={activity?.lessons?.title}
      >
        <Button
          variant="ghost"
          onClick={() => navigate(`/student/courses/${courseId}/subjects/${subjectId}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Matéria
        </Button>

        <Card className="max-w-2xl mx-auto mb-6">
          <CardHeader className="text-center">
            <div className={`mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center ${
              results.percentage >= 70 ? 'bg-green-100 dark:bg-green-900' : 'bg-amber-100 dark:bg-amber-900'
            }`}>
              {results.percentage >= 70 ? (
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              )}
            </div>
            <CardTitle>
              {results.percentage >= 70 ? 'Parabéns!' : 'Continue Praticando!'}
            </CardTitle>
            <CardDescription>
              {results.percentage >= 70 
                ? 'Você teve um ótimo desempenho neste exercício!' 
                : 'Revise o conteúdo e tente novamente.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <div className={`text-4xl font-bold mb-2 ${
                results.percentage >= 70 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
              }`}>
                {results.percentage}%
              </div>
              <p className="text-muted-foreground">
                {results.correct} de {results.total} questões corretas
              </p>
            </div>
            
            <Progress 
              value={results.percentage} 
              className={`h-3 ${results.percentage >= 70 ? '[&>div]:bg-green-600' : '[&>div]:bg-amber-600'}`} 
            />

            <div className="flex justify-center gap-4">
              {results.percentage < 70 && (
                <Button variant="outline" onClick={handleReset} disabled={resetMutation.isPending}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Refazer Exercício
                </Button>
              )}
              <Button onClick={() => navigate(`/student/courses/${courseId}/subjects/${subjectId}`)}>
                Voltar para Aulas
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Results per Question */}
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-lg">Resultado por Questão</CardTitle>
            <CardDescription>
              Veja quais questões você acertou e quais errou
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {questions?.map((question, index) => {
                const answer = answersToCheck.find(a => a.question_id === question.id);
                const isCorrect = answer?.is_correct;
                
                return (
                  <div
                    key={question.id}
                    className={`flex items-center gap-3 p-4 rounded-lg border ${
                      isCorrect 
                        ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' 
                        : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isCorrect 
                        ? 'bg-green-100 dark:bg-green-900' 
                        : 'bg-red-100 dark:bg-red-900'
                    }`}>
                      {isCorrect ? (
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="flex-shrink-0">
                          Questão {index + 1}
                        </Badge>
                        <span className={`text-sm font-medium ${
                          isCorrect 
                            ? 'text-green-700 dark:text-green-400' 
                            : 'text-red-700 dark:text-red-400'
                        }`}>
                          {isCorrect ? 'Correta' : 'Incorreta'}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {question.question_text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={(activity?.title ? activity.title.replace(/^\s*[Ee]xerc[ií]cios?\s*[-–—:]\s*/, '').trim() : 'Carregando...')}
      subtitle={activity?.lessons?.title}
    >
      <Button
        variant="ghost"
        onClick={() => navigate(`/student/courses/${courseId}/subjects/${subjectId}`)}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar para Matéria
      </Button>

      {/* Progress Bar */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <FileQuestion className="h-4 w-4" />
              Questão {currentQuestionIndex + 1} de {totalQuestions}
            </span>
            <span className="text-sm text-muted-foreground">
              {answeredCount} de {totalQuestions} respondidas
            </span>
          </div>
          <Progress value={(answeredCount / totalQuestions) * 100} className="h-2" />
        </CardContent>
      </Card>

      {questionsLoading ? (
        <Card>
          <CardContent className="py-8">
            <Skeleton className="h-6 w-3/4 mb-4" />
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </CardContent>
        </Card>
      ) : currentQuestion ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{currentQuestion.question_text}</CardTitle>
            <CardDescription>
              Selecione a resposta correta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={answers.get(currentQuestion.id) || ''}
              onValueChange={(value) => handleSelectOption(currentQuestion.id, value)}
            >
              {currentQuestion.options.map((option, index) => (
                <div
                  key={option.id}
                  className={`flex items-center space-x-3 p-4 border rounded-lg transition-colors ${
                    answers.get(currentQuestion.id) === option.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value={option.id} id={option.id} />
                  <Label htmlFor={option.id} className="flex-1 cursor-pointer">
                    <span className="font-medium mr-2">
                      {String.fromCharCode(65 + index)}.
                    </span>
                    {option.option_text}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentQuestionIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Anterior
              </Button>

              {currentQuestionIndex === totalQuestions - 1 ? (
                <Button
                  onClick={handleSubmit}
                  disabled={!allAnswered || submitMutation.isPending}
                >
                  {submitMutation.isPending ? 'Enviando...' : 'Finalizar'}
                  <CheckCircle className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleNext}>
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileQuestion className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma questão encontrada</h3>
            <p className="text-muted-foreground">
              Este exercício ainda não possui questões cadastradas.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Question Navigator */}
      {questions && questions.length > 1 && (
        <Card className="mt-6">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Navegação Rápida</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex flex-wrap gap-2">
              {questions.map((q, index) => {
                const isAnswered = answers.has(q.id);
                const isCurrent = index === currentQuestionIndex;
                
                return (
                  <Button
                    key={q.id}
                    variant={isCurrent ? 'default' : isAnswered ? 'secondary' : 'outline'}
                    size="sm"
                    className="w-10 h-10"
                    onClick={() => setCurrentQuestionIndex(index)}
                  >
                    {index + 1}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}