import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Save, User, Clock, FileText, Brain, Copy, Printer, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { RichTextDisplay } from '@/components/ui/rich-text-display';

function getWordCount(htmlContent: string): number {
  const textContent = htmlContent.replace(/<[^>]*>/g, '').trim();
  if (!textContent) return 0;
  return textContent.split(/\s+/).filter(Boolean).length;
}

interface SubmissionWithDetails {
  id: string;
  content: string;
  submitted_at: string;
  score: number | null;
  feedback: string | null;
  graded_at: string | null;
  user_id: string;
  assignment: {
    id: string;
    title: string;
    max_score: number;
    due_date: string | null;
    course: { id: string; title: string };
    subject: { id: string; title: string } | null;
  };
  profile: { full_name: string; email: string };
}

interface AIEvaluation {
  wordCount: number;
  clareza: number;
  analise: number;
  gramatica: number;
  originalidade: number;
  notaFinal: number;
  situacao: string;
  feedback: string;
}

interface GradeSubmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: SubmissionWithDetails | null;
}

function CriteriaBar({ label, weight, value }: { label: string; weight: string; value: number }) {
  const percentage = (value / 10) * 100;
  const color = value >= 7 ? 'bg-green-500' : value >= 5 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label} <span className="text-muted-foreground">({weight})</span></span>
        <span className="font-bold">{value.toFixed(1)}/10</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function GradeSubmissionDialog({ open, onOpenChange, submission }: GradeSubmissionDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [score, setScore] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [aiEvaluation, setAiEvaluation] = useState<AIEvaluation | null>(null);
  const [rejectionFeedback, setRejectionFeedback] = useState<string | null>(null);

  const isGraded = !!submission?.graded_at;

  useEffect(() => {
    if (submission) {
      setScore(submission.score?.toString() || '');
      setFeedback(submission.feedback || '');
      setAiEvaluation(null);
      setRejectionFeedback(null);
    }
  }, [submission, open]);

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      if (!submission) throw new Error('Sem submissão');
      const { data, error } = await supabase.functions.invoke('evaluate-paper', {
        body: { text: submission.content },
      });
      if (error) throw error;
      if (data?.error === 'word_count_invalid') {
        setRejectionFeedback(data.rejectionFeedback);
        throw new Error(data.rejectionFeedback);
      }
      if (data?.error) throw new Error(data.error);
      return data as AIEvaluation;
    },
    onSuccess: (data) => {
      setAiEvaluation(data);
      // Convert AI score (0-10) to assignment max_score scale
      const maxScore = submission?.assignment.max_score || 100;
      const scaledScore = ((data.notaFinal / 10) * maxScore).toFixed(2);
      setScore(scaledScore);
      setFeedback(
        `<p><strong>[Avaliação por IA]</strong></p>` +
        `<p>Clareza: ${data.clareza.toFixed(1)}/10 | Análise: ${data.analise.toFixed(1)}/10 | Gramática: ${data.gramatica.toFixed(1)}/10 | Originalidade: ${data.originalidade.toFixed(1)}/10</p>` +
        `<p>${data.feedback}</p>`
      );
      toast.success('Avaliação por IA concluída!');
    },
    onError: (error) => {
      if (!rejectionFeedback) {
        toast.error(error instanceof Error ? error.message : 'Erro na avaliação por IA');
      }
    },
  });

  const gradeMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !submission) throw new Error('Dados inválidos');
      const numScore = parseFloat(score);
      if (isNaN(numScore) || numScore < 0 || numScore > submission.assignment.max_score) {
        throw new Error(`A nota deve estar entre 0 e ${submission.assignment.max_score}`);
      }
      const { error } = await supabase
        .from('assignment_submissions')
        .update({
          score: numScore,
          feedback: feedback || null,
          graded_at: new Date().toISOString(),
          graded_by: user.id,
        })
        .eq('id', submission.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professor-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['student-assignment-submissions'] });
      toast.success('Trabalho corrigido com sucesso!');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao corrigir trabalho');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    gradeMutation.mutate();
  };

  const copyFeedback = (text: string) => {
    navigator.clipboard.writeText(text.replace(/<[^>]*>/g, ''));
    toast.success('Feedback copiado!');
  };

  if (!submission) return null;

  const wordCount = getWordCount(submission.content);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {submission.assignment.title}
          </DialogTitle>
          <DialogDescription>
            {submission.assignment.course.title}
            {submission.assignment.subject && ` • ${submission.assignment.subject.title}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Student Info */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{submission.profile.full_name}</p>
                <p className="text-sm text-muted-foreground">{submission.profile.email}</p>
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Enviado {format(new Date(submission.submitted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </div>
              {submission.assignment.due_date && (
                <div>Prazo: {format(new Date(submission.assignment.due_date), 'dd/MM/yyyy', { locale: ptBR })}</div>
              )}
            </div>
          </div>

          <Separator />

          {/* Student's Submission */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Resposta do Aluno</Label>
              <Badge variant={wordCount >= 500 && wordCount <= 1000 ? 'default' : 'destructive'} className="text-xs">
                {wordCount} palavras
              </Badge>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg min-h-[150px] max-h-[300px] overflow-y-auto border">
              <RichTextDisplay content={submission.content} />
            </div>
          </div>

          {/* AI Evaluate Button */}
          {!isGraded && (
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => evaluateMutation.mutate()}
                disabled={evaluateMutation.isPending}
              >
                {evaluateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="h-4 w-4" />
                )}
                Avaliar com IA
              </Button>
            </div>
          )}

          {/* Rejection Card */}
          {rejectionFeedback && (
            <Card className="border-destructive">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-medium text-destructive">Trabalho fora dos critérios</p>
                    <p className="text-sm text-muted-foreground">{rejectionFeedback}</p>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => copyFeedback(rejectionFeedback)}>
                      <Copy className="h-3 w-3" /> Copiar feedback para enviar ao aluno
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI Evaluation Results */}
          {aiEvaluation && (
            <div className="space-y-4">
              <Separator />
              <h3 className="font-semibold flex items-center gap-2">
                <Brain className="h-4 w-4" /> Resultado da Avaliação por IA
              </h3>

              {/* Criteria Scores */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Notas por Critério</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CriteriaBar label="Clareza" weight="30%" value={aiEvaluation.clareza} />
                  <CriteriaBar label="Análise Crítica" weight="40%" value={aiEvaluation.analise} />
                  <CriteriaBar label="Gramática" weight="20%" value={aiEvaluation.gramatica} />
                  <CriteriaBar label="Originalidade" weight="10%" value={aiEvaluation.originalidade} />
                </CardContent>
              </Card>

              {/* Final Score */}
              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Nota Final Ponderada</p>
                    <p className="text-3xl font-bold">{aiEvaluation.notaFinal.toFixed(2)}<span className="text-lg text-muted-foreground">/10</span></p>
                  </div>
                  <Badge
                    variant={aiEvaluation.situacao === 'Aprovado' ? 'default' : 'destructive'}
                    className={`text-sm px-3 py-1 ${aiEvaluation.situacao === 'Aprovado' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  >
                    {aiEvaluation.situacao === 'Aprovado' ? <CheckCircle className="h-4 w-4 mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                    {aiEvaluation.situacao}
                  </Badge>
                </CardContent>
              </Card>

              {/* AI Feedback */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm font-medium">Feedback da IA</p>
                  <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground">
                    {aiEvaluation.feedback}
                  </blockquote>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => copyFeedback(aiEvaluation.feedback)}>
                      <Copy className="h-3 w-3" /> Copiar feedback
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => window.print()}>
                      <Printer className="h-3 w-3" /> Exportar PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Separator />

          {/* Manual Grading Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="font-semibold">Correção {aiEvaluation ? '(ajuste manual)' : 'Manual'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="score">Nota *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="score"
                    type="number"
                    min={0}
                    max={submission.assignment.max_score}
                    step={0.1}
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder="0"
                    disabled={gradeMutation.isPending}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">/ {submission.assignment.max_score} pontos</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback">Feedback para o Aluno</Label>
              <RichTextEditor
                value={feedback}
                onChange={setFeedback}
                placeholder="Escreva um feedback construtivo para o aluno..."
                disabled={gradeMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                O feedback será visível para o aluno após a correção.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={gradeMutation.isPending}>
                {gradeMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {isGraded ? 'Atualizar Correção' : 'Salvar Correção'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
