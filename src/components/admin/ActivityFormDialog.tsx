import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface Activity {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  order_index: number;
  is_active: boolean;
  subject_id: string;
  lesson_id?: string | null;
}

const formSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  content: z.string().optional(),
  lesson_id: z.string().optional(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface ActivityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: Activity | null;
  subjectId: string;
  nextOrderIndex: number;
}

export function ActivityFormDialog({
  open,
  onOpenChange,
  activity,
  subjectId,
  nextOrderIndex,
}: ActivityFormDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!activity;

  // Fetch lessons for this subject
  const { data: lessons = [] } = useQuery({
    queryKey: ["lessons", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id, title, order_index")
        .eq("subject_id", subjectId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!subjectId && open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      content: "",
      lesson_id: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (activity) {
      form.reset({
        title: activity.title,
        description: activity.description || "",
        content: activity.content || "",
        lesson_id: activity.lesson_id || "",
        is_active: activity.is_active,
      });
    } else {
      form.reset({
        title: "",
        description: "",
        content: "",
        lesson_id: "",
        is_active: true,
      });
    }
  }, [activity, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEditing) {
        const { error } = await supabase
          .from("activities")
          .update({
            title: values.title,
            description: values.description || null,
            content: values.content || null,
            lesson_id: values.lesson_id || null,
            is_active: values.is_active,
          })
          .eq("id", activity.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("activities")
          .insert([{
            title: values.title,
            description: values.description || null,
            content: values.content || null,
            lesson_id: values.lesson_id || null,
            is_active: values.is_active,
            subject_id: subjectId,
            order_index: nextOrderIndex,
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities", subjectId] });
      toast.success(isEditing ? "Exercício atualizado!" : "Exercício criado!");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao salvar exercício");
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Exercício" : "Novo Exercício"}</DialogTitle>
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
                    <Input placeholder="Nome do exercício" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lesson_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vincular à Aula</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(val === "none" ? "" : val)}
                    value={field.value || "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma aula (opcional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma (exercício geral)</SelectItem>
                      {lessons.map((lesson) => (
                        <SelectItem key={lesson.id} value={lesson.id}>
                          Aula {lesson.order_index + 1}: {lesson.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Vincule o exercício a uma aula específica para aparecer logo após ela
                  </FormDescription>
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
                    <Textarea
                      placeholder="Descrição breve do exercício"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conteúdo do Exercício</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Instruções ou exercícios..."
                      rows={6}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Pode incluir perguntas, exercícios ou instruções para o aluno
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Exercício Ativo</FormLabel>
                    <FormDescription>
                      Exercícios inativos não aparecem para alunos
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
