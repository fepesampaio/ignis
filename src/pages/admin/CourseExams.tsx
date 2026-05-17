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
import { ArrowLeft, Plus, Edit, Trash2, FileText, ClipboardList } from 'lucide-react';
import { ExamFormDialog } from '@/components/admin/ExamFormDialog';
import { DeleteExamDialog } from '@/components/admin/DeleteExamDialog';

interface Exam {
  id: string;
  title: string;
  description: string | null;
  passing_score: number;
  time_limit_minutes: number | null;
  max_attempts: number | null;
  is_active: boolean;
  lesson_id: string | null;
  questions_count?: number;
}

export default function AdminCourseExams() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { basePath } = useBasePath();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);

  // Fetch course
  const { data: course } = useQuery({
    queryKey: ['admin-course', courseId],
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

  // Fetch exams
  const { data: exams, isLoading } = useQuery({
    queryKey: ['admin-course-exams', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Get questions count for each exam
      const examsWithCount = await Promise.all(
        (data || []).map(async (exam) => {
          const { count } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('exam_id', exam.id);
          return { ...exam, questions_count: count || 0 };
        })
      );

      return examsWithCount as Exam[];
    },
    enabled: !!courseId,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (examId: string) => {
      // Delete questions and options first (cascading should handle this, but being safe)
      const { data: questions } = await supabase
        .from('questions')
        .select('id')
        .eq('exam_id', examId);

      if (questions && questions.length > 0) {
        const questionIds = questions.map(q => q.id);
        await supabase.from('question_options').delete().in('question_id', questionIds);
        await supabase.from('questions').delete().eq('exam_id', examId);
      }

      const { error } = await supabase.from('exams').delete().eq('id', examId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-course-exams', courseId] });
      toast.success('Prova excluída com sucesso!');
      setIsDeleteOpen(false);
      setSelectedExam(null);
    },
    onError: (error) => {
      console.error('Error deleting exam:', error);
      toast.error('Erro ao excluir prova');
    },
  });

  const handleEdit = (exam: Exam) => {
    setSelectedExam(exam);
    setIsFormOpen(true);
  };

  const handleDelete = (exam: Exam) => {
    setSelectedExam(exam);
    setIsDeleteOpen(true);
  };

  const handleManageQuestions = (examId: string) => {
    navigate(`${basePath}/courses/${courseId}/exams/${examId}/questions`);
  };

  return (
    <DashboardLayout
      title={`Provas - ${course?.title || 'Carregando...'}`}
      subtitle="Gerencie as provas e avaliações do curso"
    >
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate(`${basePath}/courses/${courseId}/lessons`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Aulas
        </Button>
        <Button onClick={() => { setSelectedExam(null); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Prova
        </Button>
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
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : exams && exams.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((exam) => (
            <Card key={exam.id} className="card-elevated">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant={exam.is_active ? 'default' : 'secondary'}>
                    {exam.is_active ? 'Ativa' : 'Inativa'}
                  </Badge>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(exam)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(exam)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-lg">{exam.title}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {exam.description || 'Sem descrição'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Nota mínima:</span>
                    <p className="font-medium">{exam.passing_score}%</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tempo limite:</span>
                    <p className="font-medium">
                      {exam.time_limit_minutes ? `${exam.time_limit_minutes} min` : 'Sem limite'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tentativas:</span>
                    <p className="font-medium">
                      {exam.max_attempts || 'Ilimitadas'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Questões:</span>
                    <p className="font-medium">{exam.questions_count}</p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleManageQuestions(exam.id)}
                >
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Gerenciar Questões
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma prova cadastrada</h3>
            <p className="text-muted-foreground mb-4">
              Comece criando a primeira prova para este curso.
            </p>
            <Button onClick={() => { setSelectedExam(null); setIsFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Prova
            </Button>
          </CardContent>
        </Card>
      )}

      <ExamFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        courseId={courseId!}
        exam={selectedExam}
      />

      <DeleteExamDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        examTitle={selectedExam?.title || ''}
        onConfirm={() => selectedExam && deleteMutation.mutate(selectedExam.id)}
        isDeleting={deleteMutation.isPending}
      />
    </DashboardLayout>
  );
}
