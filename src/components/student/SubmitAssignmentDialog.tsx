import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, Send, CheckCircle, MessageSquare, Star, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { RichTextDisplay } from '@/components/ui/rich-text-display';
import { cn } from '@/lib/utils';

function getWordCount(htmlContent: string): number {
  const textContent = htmlContent.replace(/<[^>]*>/g, '').trim();
  if (!textContent) return 0;
  return textContent.split(/\s+/).filter(Boolean).length;
}

function WordCounter({ content, maxWords }: { content: string; maxWords: number }) {
  const wordCount = getWordCount(content);
  const isOverLimit = wordCount > maxWords;
  
  return (
    <span className={cn(
      "text-xs",
      isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"
    )}>
      {wordCount}/{maxWords} palavras
    </span>
  );
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number;
  course_id?: string;
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

interface SubmitAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: Assignment | null;
  existingSubmission?: Submission;
}

export function SubmitAssignmentDialog({
  open,
  onOpenChange,
  assignment,
  existingSubmission,
}: SubmitAssignmentDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');

  const isGraded = !!existingSubmission?.graded_at;
  const isSubmitted = !!existingSubmission;
  const hasFailed = isGraded && existingSubmission?.score !== null && existingSubmission.score < 7;
  const [isRedoing, setIsRedoing] = useState(false);


  useEffect(() => {
    if (open) {
      setIsRedoing(false);
      if (existingSubmission && !isRedoing) {
        setContent(existingSubmission.content);
      } else if (!existingSubmission) {
        setContent('');
      }
    }
  }, [existingSubmission, open]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !assignment) throw new Error('Dados inválidos');

      // Strip HTML tags for validation
      const textContent = content.replace(/<[^>]*>/g, '').trim();
      if (!textContent) {
        throw new Error('O conteúdo do trabalho não pode estar vazio');
      }

      const words = textContent.split(/\s+/).filter(Boolean);
      if (words.length > 1000) {
        throw new Error('O trabalho não pode ter mais de 1000 palavras');
      }

      let submissionId: string;

      if (existingSubmission) {
        const updateData: Record<string, unknown> = {
          content,
          submitted_at: new Date().toISOString(),
        };
        // Reset grading when redoing after failure
        if (isRedoing) {
          updateData.score = null;
          updateData.feedback = null;
          updateData.graded_at = null;
          updateData.graded_by = null;
        }
        const { error } = await supabase
          .from('assignment_submissions')
          .update(updateData)
          .eq('id', existingSubmission.id);
        if (error) throw error;
        submissionId = existingSubmission.id;
      } else {
        // Create new submission
        const { data, error } = await supabase
          .from('assignment_submissions')
          .insert({
            assignment_id: assignment.id,
            user_id: user.id,
            content,
          })
          .select('id')
          .single();
        if (error) throw error;
        submissionId = data.id;

        // Notification is now handled by database trigger (notify_professors_on_submission)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-assignment-submissions'] });
      toast.success(existingSubmission ? 'Trabalho atualizado!' : 'Trabalho enviado com sucesso!');
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error submitting assignment:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar trabalho');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate();
  };

  if (!assignment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{assignment.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Assignment Info */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
            <span className="text-muted-foreground">
              Valor: <strong>{assignment.max_score} pontos</strong>
            </span>
            {assignment.due_date && (
              <span className="text-muted-foreground">
                Entrega: <strong>{format(new Date(assignment.due_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</strong>
              </span>
            )}
          </div>

          {/* Graded Feedback Section */}
          {isGraded && existingSubmission && (
            <>
              <Separator />
              <div className={cn(
                "space-y-4 p-4 rounded-lg border",
                hasFailed 
                  ? "bg-destructive/10 border-destructive/30" 
                  : "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
              )}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {hasFailed ? (
                      <>
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <span className="font-semibold text-destructive">Trabalho Reprovado</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span className="font-semibold text-green-800 dark:text-green-200">Trabalho Aprovado</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className={cn("h-4 w-4", hasFailed ? "text-destructive fill-destructive" : "text-yellow-500 fill-yellow-500")} />
                    <Badge className={cn("text-lg px-3 py-1", hasFailed ? "bg-destructive" : "bg-green-600")}>
                      {existingSubmission.score}/{assignment.max_score}
                    </Badge>
                  </div>
                </div>
                
                {existingSubmission.feedback && (
                  <div className="space-y-2">
                    <div className={cn("flex items-center gap-2 text-sm", hasFailed ? "text-destructive" : "text-green-700 dark:text-green-300")}>
                      <MessageSquare className="h-4 w-4" />
                      <span className="font-medium">Feedback do Professor:</span>
                    </div>
                    <div className={cn(
                      "text-sm p-4 rounded-md border",
                      hasFailed 
                        ? "text-destructive bg-background border-destructive/20" 
                        : "text-green-800 dark:text-green-200 bg-white dark:bg-green-900/50 border-green-200 dark:border-green-700"
                    )}>
                      <RichTextDisplay content={existingSubmission.feedback} />
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <p className={cn("text-xs", hasFailed ? "text-destructive/70" : "text-green-600 dark:text-green-400")}>
                    Corrigido em {format(new Date(existingSubmission.graded_at!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                  {hasFailed && !isRedoing && (
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => {
                        setIsRedoing(true);
                        setContent('');
                      }}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Refazer Trabalho
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Submission Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="content">
                  {isGraded && !isRedoing ? 'Seu Trabalho (somente leitura)' : isRedoing ? 'Novo Conteúdo do Trabalho' : 'Conteúdo do Trabalho'}
                </Label>
                <WordCounter content={content} maxWords={1000} />
              </div>
              
              {isGraded && !isRedoing ? (
                <div className="p-4 bg-muted/30 rounded-lg border min-h-[200px]">
                  <RichTextDisplay content={content} />
                </div>
              ) : (
                <>
                  <RichTextEditor
                    value={content}
                    onChange={setContent}
                    placeholder="Digite aqui o conteúdo do seu trabalho. Use a barra de ferramentas para formatar o texto..."
                    disabled={submitMutation.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use negrito, itálico, listas e títulos. Limite: 1000 palavras.
                  </p>
                </>
              )}
            </div>

            {isSubmitted && !isGraded && (
              <p className="text-sm text-muted-foreground">
                Enviado em {format(new Date(existingSubmission!.submitted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                . Você pode atualizar sua resposta.
              </p>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {isGraded && !isRedoing ? 'Fechar' : 'Cancelar'}
              </Button>
              {(!isGraded || isRedoing) && (
                <Button type="submit" disabled={submitMutation.isPending}>
                  {submitMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {isRedoing ? 'Reenviar Trabalho' : isSubmitted ? 'Atualizar' : 'Enviar Trabalho'}
                </Button>
              )}
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
