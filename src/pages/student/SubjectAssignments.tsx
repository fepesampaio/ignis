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
import { 
  ArrowLeft, 
  ClipboardList,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  Send
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SubmitAssignmentDialog } from '@/components/student/SubmitAssignmentDialog';
import { RichTextDisplay } from '@/components/ui/rich-text-display';
import { cn } from '@/lib/utils';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number;
  is_active: boolean;
  course_id: string;
}

interface Submission {
  id: string;
  assignment_id: string;
  content: string;
  submitted_at: string;
  score: number | null;
  feedback: string | null;
  graded_at: string | null;
}

export default function StudentSubjectAssignments() {
  const { courseId, subjectId } = useParams<{ courseId: string; subjectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  // Fetch subject details
  const { data: subject } = useQuery({
    queryKey: ['student-subject', subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subjects')
        .select('*, courses(title)')
        .eq('id', subjectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!subjectId,
  });

  // Fetch assignments for this subject
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['student-subject-assignments', subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignments')
        .select('id, title, description, due_date, max_score, is_active, course_id')
        .eq('subject_id', subjectId)
        .eq('is_active', true)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as Assignment[];
    },
    enabled: !!subjectId,
  });

  // Fetch user's submissions
  const { data: submissions } = useQuery({
    queryKey: ['student-assignment-submissions', user?.id, subjectId],
    queryFn: async () => {
      if (!user?.id || !assignments) return [];
      
      const assignmentIds = assignments.map(a => a.id);
      if (assignmentIds.length === 0) return [];

      const { data, error } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('user_id', user.id)
        .in('assignment_id', assignmentIds);
      if (error) throw error;
      return data as Submission[];
    },
    enabled: !!user?.id && !!assignments && assignments.length > 0,
  });

  const getSubmissionForAssignment = (assignmentId: string) => {
    return submissions?.find(s => s.assignment_id === assignmentId);
  };

  const getAssignmentStatus = (assignment: Assignment) => {
    const submission = getSubmissionForAssignment(assignment.id);
    const now = new Date();
    const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
    const isPastDue = dueDate && dueDate < now;

    if (submission?.graded_at) {
      if (submission.score !== null && submission.score < 7) {
        return { status: 'failed', label: 'Reprovado', variant: 'destructive' as const };
      }
      return { status: 'graded', label: 'Aprovado', variant: 'default' as const };
    }
    if (submission) {
      return { status: 'submitted', label: 'Enviado', variant: 'secondary' as const };
    }
    if (isPastDue) {
      return { status: 'overdue', label: 'Atrasado', variant: 'destructive' as const };
    }
    return { status: 'pending', label: 'Pendente', variant: 'outline' as const };
  };

  const handleSubmit = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setSubmitDialogOpen(true);
  };

  return (
    <DashboardLayout
      title="Trabalhos"
      subtitle={subject?.title}
    >
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          onClick={() => navigate(`/student/courses/${courseId}/subjects/${subjectId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Matéria
        </Button>
      </div>

      {/* Grading deadline notice */}
      <Card className="mb-6 border-amber-500 bg-amber-50 dark:bg-amber-950">
        <CardContent className="py-4 flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <span className="font-medium">Prazo de correção:</span> Os trabalhos serão corrigidos em até 7 dias a partir da data de envio.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : assignments && assignments.length > 0 ? (
        <div className="space-y-4">
          {assignments.map((assignment) => {
            const submission = getSubmissionForAssignment(assignment.id);
            const statusInfo = getAssignmentStatus(assignment);

            return (
              <Card key={assignment.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ClipboardList className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-lg">{assignment.title}</CardTitle>
                        {assignment.due_date && (
                          <CardDescription className="flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" />
                            Entrega até {format(new Date(assignment.due_date), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {assignment.description && (
                    <RichTextDisplay 
                      content={assignment.description} 
                      className="text-sm text-foreground"
                    />
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Valor: {assignment.max_score} pontos
                    </span>

                    {submission?.graded_at ? (
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className={cn("text-sm font-medium", statusInfo.status === 'failed' ? 'text-destructive' : '')}>
                            Nota: {submission.score}/{assignment.max_score}
                          </p>
                          {submission.feedback && (
                            <p className="text-xs text-muted-foreground">
                              Com feedback do professor
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSubmit(assignment)}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Ver Detalhes
                        </Button>
                      </div>
                    ) : submission ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Enviado em {format(new Date(submission.submitted_at), "dd/MM 'às' HH:mm")}
                      </div>
                    ) : (
                      <Button onClick={() => handleSubmit(assignment)}>
                        <Send className="h-4 w-4 mr-2" />
                        Enviar Trabalho
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum trabalho disponível</h3>
            <p className="text-muted-foreground">
              Esta matéria ainda não possui trabalhos cadastrados.
            </p>
          </CardContent>
        </Card>
      )}

      <SubmitAssignmentDialog
        open={submitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        assignment={selectedAssignment}
        existingSubmission={selectedAssignment ? getSubmissionForAssignment(selectedAssignment.id) : undefined}
      />
    </DashboardLayout>
  );
}
