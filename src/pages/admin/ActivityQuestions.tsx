import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useBasePath } from "@/hooks/useBasePath";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Trash2, GripVertical, CheckCircle2 } from "lucide-react";
import { ActivityQuestionFormDialog } from "@/components/admin/ActivityQuestionFormDialog";
import { DeleteQuestionDialog } from "@/components/admin/DeleteQuestionDialog";
import { toast } from "sonner";

interface Option {
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
  options: Option[];
}

export default function ActivityQuestions() {
  const { courseId, subjectId, activityId } = useParams<{ 
    courseId: string; 
    subjectId: string;
    activityId: string;
  }>();
  const navigate = useNavigate();
  const { basePath } = useBasePath();
  const queryClient = useQueryClient();
  
  const [questionFormOpen, setQuestionFormOpen] = useState(false);
  const [questionDeleteOpen, setQuestionDeleteOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);

  const { data: activity } = useQuery({
    queryKey: ["activity", activityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*, subjects(title, courses(title))")
        .eq("id", activityId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!activityId,
  });

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["activity-questions", activityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*, question_options(*)")
        .eq("activity_id", activityId!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data.map((q: any) => ({
        ...q,
        options: q.question_options?.sort((a: Option, b: Option) => a.order_index - b.order_index) || [],
      })) as Question[];
    },
    enabled: !!activityId,
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => {
      const { error } = await supabase.from("questions").delete().eq("id", questionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-questions", activityId] });
      toast.success("Questão excluída!");
      setQuestionDeleteOpen(false);
    },
    onError: () => {
      toast.error("Erro ao excluir questão");
    },
  });

  const handleEdit = (question: Question) => {
    setSelectedQuestion(question);
    setQuestionFormOpen(true);
  };

  const handleDelete = (question: Question) => {
    setSelectedQuestion(question);
    setQuestionDeleteOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`${basePath}/courses/${courseId}/subjects/${subjectId}`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Questões do Exercício</h1>
            <p className="text-muted-foreground">
              {activity?.title} • {(activity as any)?.subjects?.courses?.title}
            </p>
          </div>
          <Button onClick={() => { setSelectedQuestion(null); setQuestionFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Questão
          </Button>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Carregando questões...
            </CardContent>
          </Card>
        ) : questions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma questão cadastrada neste exercício.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {questions.map((question, index) => (
              <Card key={question.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-4">
                    <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1 cursor-move" />
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm flex-shrink-0">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-base">{question.question_text}</CardTitle>
                      </div>
                      <Badge variant="outline">{question.points} ponto{question.points > 1 ? 's' : ''}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(question)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(question)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="ml-16 space-y-2">
                    {question.options.map((option, optIndex) => (
                      <div
                        key={option.id}
                        className={`flex items-center gap-2 p-2 rounded-md ${
                          option.is_correct ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' : 'bg-muted/50'
                        }`}
                      >
                        <span className="font-medium w-6">{String.fromCharCode(65 + optIndex)})</span>
                        <span className="flex-1">{option.option_text}</span>
                        {option.is_correct && (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ActivityQuestionFormDialog
        open={questionFormOpen}
        onOpenChange={setQuestionFormOpen}
        activityId={activityId!}
        question={selectedQuestion}
      />

      <DeleteQuestionDialog
        open={questionDeleteOpen}
        onOpenChange={setQuestionDeleteOpen}
        onConfirm={() => selectedQuestion && deleteQuestionMutation.mutate(selectedQuestion.id)}
        isDeleting={deleteQuestionMutation.isPending}
      />
    </DashboardLayout>
  );
}
