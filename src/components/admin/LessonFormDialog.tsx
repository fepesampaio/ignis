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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Lesson = Tables<"lessons">;

const formSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  content: z.string().optional(),
  video_url: z.string().url("URL inválida").optional().or(z.literal("")),
  youtube_url: z.string().url("URL inválida").optional().or(z.literal("")),
  release_after_days: z.coerce.number().min(0, "Mínimo 0 dias"),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface LessonFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: Lesson | null;
  courseId: string;
  subjectId?: string;
  nextOrderIndex: number;
}

export function LessonFormDialog({
  open,
  onOpenChange,
  lesson,
  courseId,
  subjectId,
  nextOrderIndex,
}: LessonFormDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!lesson;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      content: "",
      video_url: "",
      youtube_url: "",
      release_after_days: 0,
      is_active: true,
    },
  });

  useEffect(() => {
    if (lesson) {
      form.reset({
        title: lesson.title,
        description: lesson.description || "",
        content: lesson.content || "",
        video_url: lesson.video_url || "",
        youtube_url: (lesson as any).youtube_url || "",
        release_after_days: lesson.release_after_days,
        is_active: lesson.is_active,
      });
    } else {
      form.reset({
        title: "",
        description: "",
        content: "",
        video_url: "",
        youtube_url: "",
        release_after_days: 0,
        is_active: true,
      });
    }
  }, [lesson, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEditing) {
        const { error } = await supabase
          .from("lessons")
          .update({
            title: values.title,
            description: values.description || null,
            content: values.content || null,
            video_url: values.video_url || null,
            youtube_url: values.youtube_url || null,
            release_after_days: values.release_after_days,
            is_active: values.is_active,
          } as any)
          .eq("id", lesson.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("lessons")
          .insert([{
            title: values.title,
            description: values.description || null,
            content: values.content || null,
            video_url: values.video_url || null,
            youtube_url: values.youtube_url || null,
            release_after_days: values.release_after_days,
            is_active: values.is_active,
            course_id: courseId,
            subject_id: subjectId || null,
            order_index: nextOrderIndex,
          } as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons", courseId] });
      queryClient.invalidateQueries({ queryKey: ["lessons", subjectId] });
      toast.success(isEditing ? "Aula atualizada!" : "Aula criada!");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao salvar aula");
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Aula" : "Nova Aula"}</DialogTitle>
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
                    <Input placeholder="Título da aula" {...field} />
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
                    <Textarea
                      placeholder="Descrição breve da aula"
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
              name="video_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL do Vídeo (Bunny)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://iframe.mediadelivery.net/embed/..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Cole a URL de embed do Bunny Stream (ex: https://iframe.mediadelivery.net/embed/...)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="youtube_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL do Vídeo (YouTube)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://www.youtube.com/watch?v=... ou https://youtu.be/..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Cole a URL do vídeo do YouTube (suporta links normais e encurtados)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conteúdo da Aula</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Conteúdo em texto, HTML ou Markdown..."
                      rows={6}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Material complementar, anotações ou conteúdo textual da aula
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="release_after_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Liberar após (dias)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormDescription>
                      Dias após matrícula para liberar
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
                      <FormLabel className="text-base">Aula Ativa</FormLabel>
                      <FormDescription>
                        Aulas inativas não aparecem para alunos
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
            </div>

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
