import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useBasePath } from '@/hooks/useBasePath';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Edit, Trash2, CheckCircle, Circle, Upload } from 'lucide-react';
import { QuestionFormDialog } from '@/components/admin/QuestionFormDialog';
import { DeleteQuestionDialog } from '@/components/admin/DeleteQuestionDialog';
import { ImportMoodleQuestionsDialog } from '@/components/admin/ImportMoodleQuestionsDialog';
import { RichTextDisplay } from '@/components/ui/rich-text-display';

interface QuestionOption {
  id: string;
  option_text: string;
  is_correct: boolean;
  order_index: number;
}

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  points: number;
  order_index: number;
  options?: QuestionOption[];
}

export default function AdminExamQuestions() {
  const { courseId, examId } = useParams<{ courseId: string; examId: string }>();
  const navigate = useNavigate();
  const { basePath } = useBasePath();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);

  // Fetch exam
  const { data: exam } = useQuery({
    queryKey: ['admin-exam', examId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!examId,
  });

  // Fetch questions with options in a single query
  const { data: questions, isLoading } = useQuery({
    queryKey: ['admin-exam-questions', examId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questions')
        .select(`
          *,
          question_options (
            id,
            option_text,
            is_correct,
            order_index
          )
        `)
        .eq('exam_id', examId)
        .order('order_index');
      if (error) throw error;

      // Map and sort options
      return (data || []).map((question) => ({
        ...question,
        options: (question.question_options || []).sort(
          (a: QuestionOption, b: QuestionOption) => a.order_index - b.order_index
        ),
      })) as Question[];
    },
    enabled: !!examId,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (questionId: string) => {
      await supabase.from('question_options').delete().eq('question_id', questionId);
      const { error } = await supabase.from('questions').delete().eq('id', questionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-exam-questions', examId] });
      toast.success('Questão excluída com sucesso!');
      setIsDeleteOpen(false);
      setSelectedQuestion(null);
    },
    onError: (error) => {
      console.error('Error deleting question:', error);
      toast.error('Erro ao excluir questão');
    },
  });

  const handleEdit = (question: Question) => {
    setSelectedQuestion(question);
    setIsFormOpen(true);
  };

  const handleDelete = (question: Question) => {
    setSelectedQuestion(question);
    setIsDeleteOpen(true);
  };

  return (
    <DashboardLayout
      title={`Questões - ${exam?.title || 'Carregando...'}`}
      subtitle="Gerencie as questões da prova"
    >
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate(`${basePath}/courses/${courseId}/subjects/${exam?.subject_id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Matéria
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar do Moodle
          </Button>
          <Button onClick={() => { setSelectedQuestion(null); setIsFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Questão
          </Button>
        </div>
      </div>

      {/* Stats */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between text-sm">
            <span>Total de questões: <strong>{questions?.length || 0}</strong></span>
            <span>
              Pontuação total: <strong>{questions?.reduce((acc, q) => acc + q.points, 0) || 0} pontos</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : questions && questions.length > 0 ? (
        <div className="space-y-4">
          {questions.map((question, index) => (
            <Card key={question.id} className="card-elevated">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">Questão {index + 1}</Badge>
                      <Badge variant="secondary">{question.points} ponto(s)</Badge>
                    </div>
                    <RichTextDisplay content={question.question_text} className="text-base font-semibold" />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(question)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(question)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-2">Alternativas:</p>
                  {question.options?.map((option, optIndex) => (
                    <div
                      key={option.id}
                      className={`flex items-center gap-2 p-2 rounded-md ${
                        option.is_correct ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800' : 'bg-muted'
                      }`}
                    >
                      {option.is_correct ? (
                        <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-sm flex items-start gap-1">
                        <span>{String.fromCharCode(65 + optIndex)})</span>
                        <RichTextDisplay content={option.option_text} className="inline [&_p]:mb-0" />
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Plus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma questão cadastrada</h3>
            <p className="text-muted-foreground mb-4">
              Comece adicionando questões à prova.
            </p>
            <Button onClick={() => { setSelectedQuestion(null); setIsFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Questão
            </Button>
          </CardContent>
        </Card>
      )}

      <QuestionFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        examId={examId!}
        question={selectedQuestion}
      />

      <DeleteQuestionDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onConfirm={() => selectedQuestion && deleteMutation.mutate(selectedQuestion.id)}
        isDeleting={deleteMutation.isPending}
      />

      <ImportMoodleQuestionsDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        examId={examId!}
      />
    </DashboardLayout>
  );
}
