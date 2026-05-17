import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number;
  is_active: boolean;
  course_id: string;
  subject_id: string | null;
}

const formSchema = z.object({
  title: z.string().min(1, "Título é obrigatório").max(200, "Título muito longo"),
  description: z.string().max(50000, "Descrição muito longa").optional(),
  due_date: z.string().optional(),
  max_score: z.coerce.number().min(1, "Nota mínima é 1").max(1000, "Nota máxima é 1000"),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface AssignmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: Assignment | null;
  courseId: string;
  subjectId: string;
}

export function AssignmentFormDialog({
  open,
  onOpenChange,
  assignment,
  courseId,
  subjectId,
}: AssignmentFormDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!assignment;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      due_date: "",
      max_score: 100,
      is_active: true,
    },
  });

  useEffect(() => {
    if (assignment) {
      form.reset({
        title: assignment.title,
        description: assignment.description || "",
        due_date: assignment.due_date ? assignment.due_date.slice(0, 16) : "",
        max_score: assignment.max_score,
        is_active: assignment.is_active,
      });
    } else {
      form.reset({
        title: "",
        description: "",
        due_date: "",
        max_score: 100,
        is_active: true,
      });
    }
  }, [assignment, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        title: values.title.trim(),
        description: values.description?.trim() || null,
        due_date: values.due_date ? new Date(values.due_date).toISOString() : null,
        max_score: values.max_score,
        is_active: values.is_active,
      };

      if (isEditing) {
        const { error } = await supabase
          .from("assignments")
          .update(payload)
          .eq("id", assignment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("assignments")
          .insert([{
            ...payload,
            course_id: courseId,
            subject_id: subjectId,
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subject-assignments", subjectId] });
      toast.success(isEditing ? "Trabalho atualizado!" : "Trabalho criado!");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao salvar trabalho");
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Trabalho" : "Novo Trabalho"}</DialogTitle>
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
                    <Input placeholder="Nome do trabalho" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => {
                const charCount = (field.value || "").length;
                const maxChars = 50000;
                const remaining = maxChars - charCount;
                return (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <RichTextEditor
                        value={field.value || ""}
                        onChange={field.onChange}
                        placeholder="Instruções e detalhes do trabalho... (suporta HTML)"
                      />
                    </FormControl>
                    <div className="flex justify-between items-center">
                      <FormDescription>
                        Suporta HTML e formatação rica
                      </FormDescription>
                      <span className={`text-xs ${remaining < 1000 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {remaining.toLocaleString('pt-BR')} caracteres restantes
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="max_score"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nota Máxima</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" max="1000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prazo de Entrega</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
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
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Trabalho Ativo</FormLabel>
                    <FormDescription>
                      Trabalhos inativos não aparecem para alunos
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Salvando..." : isEditing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
