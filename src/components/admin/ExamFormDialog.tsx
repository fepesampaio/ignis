import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const examSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional(),
  passing_score: z.coerce.number().min(0).max(100),
  time_limit_minutes: z.coerce.number().min(0).optional().nullable(),
  is_active: z.boolean(),
});

type ExamFormData = z.infer<typeof examSchema>;

interface ExamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  subjectId?: string;
  exam?: {
    id: string;
    title: string;
    description: string | null;
    passing_score: number;
    time_limit_minutes: number | null;
    is_active: boolean;
  } | null;
}

export function ExamFormDialog({ open, onOpenChange, courseId, subjectId, exam }: ExamFormDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<ExamFormData>({
    resolver: zodResolver(examSchema),
    defaultValues: {
      title: '',
      description: '',
      passing_score: 70,
      time_limit_minutes: null,
      is_active: true,
    },
  });

  useEffect(() => {
    if (exam) {
      form.reset({
        title: exam.title,
        description: exam.description || '',
        passing_score: exam.passing_score,
        time_limit_minutes: exam.time_limit_minutes,
        is_active: exam.is_active,
      });
    } else {
      form.reset({
        title: '',
        description: '',
        passing_score: 70,
        time_limit_minutes: null,
        is_active: true,
      });
    }
  }, [exam, form]);

  const mutation = useMutation({
    mutationFn: async (data: ExamFormData) => {
      const examData = {
        title: data.title,
        description: data.description || null,
        passing_score: data.passing_score,
        time_limit_minutes: data.time_limit_minutes || null,
        max_attempts: null, // Unlimited attempts until passed
        is_active: data.is_active,
        lesson_id: null,
        course_id: courseId,
        subject_id: subjectId || null,
      };

      if (exam) {
        const { error } = await supabase
          .from('exams')
          .update(examData)
          .eq('id', exam.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('exams').insert(examData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-course-exams', courseId] });
      queryClient.invalidateQueries({ queryKey: ['subject-exams', subjectId] });
      queryClient.invalidateQueries({ queryKey: ['admin-subject-content', subjectId] });
      toast.success(exam ? 'Prova atualizada!' : 'Prova criada!');
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error saving exam:', error);
      toast.error('Erro ao salvar prova');
    },
  });

  const onSubmit = (data: ExamFormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{exam ? 'Editar Prova' : 'Nova Prova'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Prova Final" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descrição da prova..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="passing_score"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nota Mínima (%)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time_limit_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tempo Limite (min)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Sem limite"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Prova Ativa</FormLabel>
                    <FormDescription>Provas ativas ficam disponíveis para os alunos</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Salvando...' : exam ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
