import { useEffect, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FileText, Settings, Palette, Youtube } from "lucide-react";

interface Subject {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_active: boolean;
  is_certificate_instructions: boolean;
  handout_url?: string | null;
  release_after_days?: number;
  require_previous_exam?: boolean;
  custom_title?: string | null;
  welcome_video_url?: string | null;
  html_content?: string | null;
}

const formSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  handout_url: z.string().url("URL inválida").optional().or(z.literal("")),
  release_after_days: z.coerce.number().min(0, "Deve ser 0 ou mais"),
  is_active: z.boolean(),
  require_previous_exam: z.boolean(),
  is_certificate_instructions: z.boolean(),
  custom_title: z.string().optional(),
  welcome_video_url: z.string().trim().max(5000, "Conteúdo muito longo").optional().or(z.literal("")),
  html_content: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface SubjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: Subject | null;
  courseId: string;
  nextOrderIndex: number;
}

export function SubjectFormDialog({
  open,
  onOpenChange,
  subject,
  courseId,
  nextOrderIndex,
}: SubjectFormDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!subject;
  const [activeTab, setActiveTab] = useState("general");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      handout_url: "",
      release_after_days: 0,
      is_active: true,
      require_previous_exam: true,
      is_certificate_instructions: false,
      custom_title: "",
      welcome_video_url: "",
      html_content: "",
    },
  });

  const isCertificateInstructions = form.watch("is_certificate_instructions");

  useEffect(() => {
    if (subject) {
      form.reset({
        title: subject.title,
        description: subject.description || "",
        handout_url: subject.handout_url || "",
        release_after_days: subject.release_after_days || 0,
        is_active: subject.is_active,
        require_previous_exam: subject.require_previous_exam ?? true,
        is_certificate_instructions: subject.is_certificate_instructions || false,
        custom_title: subject.custom_title || "",
        welcome_video_url: subject.welcome_video_url || "",
        html_content: subject.html_content || "",
      });
    } else {
      form.reset({
        title: "",
        description: "",
        handout_url: "",
        release_after_days: 0,
        is_active: true,
        require_previous_exam: true,
        is_certificate_instructions: false,
        custom_title: "",
        welcome_video_url: "",
        html_content: "",
      });
    }
  }, [subject, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEditing) {
        const { error } = await supabase
          .from("subjects")
          .update({
            title: values.title,
            description: values.description || null,
            handout_url: values.handout_url || null,
            release_after_days: values.release_after_days,
            is_active: values.is_active,
            require_previous_exam: values.require_previous_exam,
            is_certificate_instructions: values.is_certificate_instructions,
            custom_title: values.custom_title || null,
            welcome_video_url: values.welcome_video_url || null,
            html_content: values.html_content || null,
          })
          .eq("id", subject.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("subjects")
          .insert([{
            title: values.title,
            description: values.description || null,
            handout_url: values.handout_url || null,
            release_after_days: values.release_after_days,
            is_active: values.is_active,
            require_previous_exam: values.require_previous_exam,
            is_certificate_instructions: values.is_certificate_instructions,
            custom_title: values.custom_title || null,
            welcome_video_url: values.welcome_video_url || null,
            html_content: values.html_content || null,
            course_id: courseId,
            order_index: nextOrderIndex,
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects", courseId] });
      toast.success(isEditing ? "Matéria atualizada!" : "Matéria criada!");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao salvar matéria");
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Matéria" : "Nova Matéria"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Geral
                </TabsTrigger>
                <TabsTrigger value="customization" className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Personalização
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome da matéria" {...field} />
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
                          placeholder="Descrição breve da matéria"
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
                  name="handout_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Link da Apostila (Google Drive)
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://drive.google.com/file/d/..."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Cole o link de visualização do Google Drive. O aluno poderá visualizar diretamente.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="release_after_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Liberar após (dias)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Número de dias após a matrícula para liberar esta matéria (0 = liberada imediatamente)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="require_previous_exam"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Exigir Aprovação na Prova Anterior</FormLabel>
                        <FormDescription>
                          Se desativado, exige apenas a conclusão das aulas da matéria anterior
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

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Matéria Ativa</FormLabel>
                        <FormDescription>
                          Matérias inativas não aparecem para alunos
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
              </TabsContent>

              <TabsContent value="customization" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="is_certificate_instructions"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-muted/50">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base flex items-center gap-2">
                          <Palette className="h-4 w-4" />
                          Matéria com Conteúdo Personalizado
                        </FormLabel>
                        <FormDescription>
                          Quando ativado, exibe apenas o título, vídeo e HTML personalizados, sem mostrar progresso ou lista de aulas
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

                {isCertificateInstructions && (
                  <>
                    <FormField
                      control={form.control}
                      name="custom_title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Título Personalizado</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Ex: Parabéns pela conclusão!" 
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>
                            Título que aparecerá em destaque para o aluno
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="welcome_video_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Youtube className="h-4 w-4 text-red-500" />
                            Vídeo de Boas-vindas (Embed)
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="URL do vídeo ou código <iframe ...> de qualquer player"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Aceita link do YouTube, Vimeo, Bunny, ou código embed (iframe) de qualquer plataforma
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="html_content"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Conteúdo HTML</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="<h2>Parabéns!</h2><p>Você concluiu o curso...</p>"
                              rows={8}
                              className="font-mono text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            HTML que será renderizado abaixo do vídeo. Suporta tags como h2, p, ul, li, strong, etc.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {!isCertificateInstructions && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Palette className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Ative "Matéria com Conteúdo Personalizado" acima para configurar título, vídeo e HTML personalizados.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

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
