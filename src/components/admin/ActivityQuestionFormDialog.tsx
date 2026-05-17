import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

const questionSchema = z.object({
  question_text: z.string().min(1, 'Enunciado é obrigatório'),
  points: z.coerce.number().min(1, 'Mínimo 1 ponto'),
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface Option {
  id?: string;
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
  options?: Option[];
}

interface ActivityQuestionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityId: string;
  question?: Question | null;
}

export function ActivityQuestionFormDialog({ open, onOpenChange, activityId, question }: ActivityQuestionFormDialogProps) {
  const queryClient = useQueryClient();
  const [options, setOptions] = useState<Option[]>([
    { option_text: '', is_correct: true, order_index: 0 },
    { option_text: '', is_correct: false, order_index: 1 },
    { option_text: '', is_correct: false, order_index: 2 },
    { option_text: '', is_correct: false, order_index: 3 },
  ]);
  const [correctIndex, setCorrectIndex] = useState(0);

  const form = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      question_text: '',
      points: 1,
    },
  });

  useEffect(() => {
    if (question) {
      form.reset({
        question_text: question.question_text,
        points: question.points,
      });
      if (question.options && question.options.length > 0) {
        setOptions(question.options);
        const correctIdx = question.options.findIndex(o => o.is_correct);
        setCorrectIndex(correctIdx >= 0 ? correctIdx : 0);
      }
    } else {
      form.reset({
        question_text: '',
        points: 1,
      });
      setOptions([
        { option_text: '', is_correct: true, order_index: 0 },
        { option_text: '', is_correct: false, order_index: 1 },
        { option_text: '', is_correct: false, order_index: 2 },
        { option_text: '', is_correct: false, order_index: 3 },
      ]);
      setCorrectIndex(0);
    }
  }, [question, form]);

  const mutation = useMutation({
    mutationFn: async (data: QuestionFormData) => {
      // Validate options
      const filledOptions = options.filter(o => o.option_text.trim());
      if (filledOptions.length < 2) {
        throw new Error('Adicione pelo menos 2 alternativas');
      }

      // Get current max order_index for this activity
      const { data: existingQuestions } = await supabase
        .from('questions')
        .select('order_index')
        .eq('activity_id', activityId)
        .order('order_index', { ascending: false })
        .limit(1);

      const maxOrderIndex = existingQuestions?.[0]?.order_index ?? -1;

      let questionId: string;

      if (question) {
        // Update question
        const { error } = await supabase
          .from('questions')
          .update({
            question_text: data.question_text,
            points: data.points,
          })
          .eq('id', question.id);
        if (error) throw error;
        questionId = question.id;

        // Delete old options
        await supabase.from('question_options').delete().eq('question_id', question.id);
      } else {
        // Create question linked to activity
        const { data: newQuestion, error } = await supabase
          .from('questions')
          .insert({
            activity_id: activityId,
            question_text: data.question_text,
            question_type: 'multiple_choice',
            points: data.points,
            order_index: maxOrderIndex + 1,
          })
          .select('id')
          .single();
        if (error) throw error;
        questionId = newQuestion.id;
      }

      // Insert options
      const optionsToInsert = filledOptions.map((opt, idx) => ({
        question_id: questionId,
        option_text: opt.option_text,
        is_correct: idx === correctIndex,
        order_index: idx,
      }));

      const { error: optionsError } = await supabase
        .from('question_options')
        .insert(optionsToInsert);
      if (optionsError) throw optionsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-questions', activityId] });
      toast.success(question ? 'Questão atualizada!' : 'Questão criada!');
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error saving question:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar questão');
    },
  });

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index].option_text = value;
    setOptions(newOptions);
  };

  const addOption = () => {
    if (options.length < 6) {
      setOptions([...options, { option_text: '', is_correct: false, order_index: options.length }]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
      if (correctIndex === index) {
        setCorrectIndex(0);
      } else if (correctIndex > index) {
        setCorrectIndex(correctIndex - 1);
      }
    }
  };

  const onSubmit = (data: QuestionFormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{question ? 'Editar Questão' : 'Nova Questão'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="question_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Enunciado</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Digite o enunciado da questão..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="points"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pontuação</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} className="w-32" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Alternativas (selecione a correta)</Label>
                {options.length < 6 && (
                  <Button type="button" variant="outline" size="sm" onClick={addOption}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                )}
              </div>

              <RadioGroup
                value={correctIndex.toString()}
                onValueChange={(v) => setCorrectIndex(parseInt(v))}
              >
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <RadioGroupItem value={index.toString()} id={`activity-option-${index}`} />
                    <Label htmlFor={`activity-option-${index}`} className="w-8">
                      {String.fromCharCode(65 + index)})
                    </Label>
                    <Input
                      value={option.option_text}
                      onChange={(e) => handleOptionChange(index, e.target.value)}
                      placeholder={`Alternativa ${String.fromCharCode(65 + index)}`}
                      className="flex-1"
                    />
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOption(index)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                Marque o botão ao lado da alternativa correta
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Salvando...' : question ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
