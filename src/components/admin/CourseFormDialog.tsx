import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

const courseSchema = z.object({
  title: z.string().trim().min(1, 'Título é obrigatório').max(200, 'Título muito longo'),
  description: z.string().trim().max(2000, 'Descrição muito longa').optional(),
  category: z.string().trim().max(100, 'Categoria muito longa').optional(),
  workload_hours: z.number().min(1, 'Carga horária mínima: 1h').max(10000, 'Carga horária muito alta'),
  is_active: z.boolean(),
  welcome_video_url: z.string().trim().max(5000, 'Conteúdo muito longo').optional(),
  installment_price: z.number().min(0, 'Valor deve ser positivo').nullable(),
  installment_count: z.number().min(1, 'Mínimo 1 parcela').max(48, 'Máximo 48 parcelas').nullable(),
});

type CourseFormData = z.infer<typeof courseSchema>;

interface Course {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  workload_hours: number;
  is_active: boolean;
  thumbnail_url: string | null;
  welcome_video_url: string | null;
  installment_price: number | null;
  installment_count: number | null;
}

interface CourseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: Course | null;
}

export function CourseFormDialog({ open, onOpenChange, course }: CourseFormDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!course;

  const [formData, setFormData] = useState<CourseFormData>({
    title: '',
    description: '',
    category: '',
    workload_hours: 40,
    is_active: true,
    welcome_video_url: '',
    installment_price: null,
    installment_count: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (course) {
      setFormData({
        title: course.title,
        description: course.description || '',
        category: course.category || '',
        workload_hours: course.workload_hours,
        is_active: course.is_active,
        welcome_video_url: course.welcome_video_url || '',
        installment_price: course.installment_price,
        installment_count: course.installment_count,
      });
    } else {
      setFormData({
        title: '',
        description: '',
        category: '',
        workload_hours: 40,
        is_active: true,
        welcome_video_url: '',
        installment_price: null,
        installment_count: null,
      });
    }
    setErrors({});
  }, [course, open]);

  const createMutation = useMutation({
    mutationFn: async (data: CourseFormData) => {
      // Create the course
      const { data: newCourse, error } = await supabase.from('courses').insert({
        title: data.title,
        description: data.description || null,
        category: data.category || null,
        workload_hours: data.workload_hours,
        is_active: data.is_active,
        welcome_video_url: data.welcome_video_url || null,
        installment_price: data.installment_price,
        installment_count: data.installment_count,
        created_by: user?.id,
      }).select().single();
      if (error) throw error;

      // If not Professional, create automatic certificate instructions module
      const category = data.category?.toLowerCase();
      if (category === 'eja' || category === 'técnico') {
        // Get max order_index for this course
        const { data: existingSubjects } = await supabase
          .from('subjects')
          .select('order_index')
          .eq('course_id', newCourse.id)
          .order('order_index', { ascending: false })
          .limit(1);

        const nextOrderIndex = (existingSubjects?.[0]?.order_index ?? -1) + 1;

        const { error: subjectError } = await supabase.from('subjects').insert({
          course_id: newCourse.id,
          title: 'Instruções para Solicitação do Certificado',
          description: 'Neste módulo você encontrará todas as informações necessárias para solicitar seu certificado oficial.',
          order_index: nextOrderIndex,
          is_active: true,
          is_certificate_instructions: true,
        });
        if (subjectError) throw subjectError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] });
      toast.success('Curso criado com sucesso!');
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error creating course:', error);
      toast.error('Erro ao criar curso');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CourseFormData) => {
      const { error } = await supabase
        .from('courses')
        .update({
          title: data.title,
          description: data.description || null,
          category: data.category || null,
          workload_hours: data.workload_hours,
          is_active: data.is_active,
          welcome_video_url: data.welcome_video_url || null,
          installment_price: data.installment_price,
          installment_count: data.installment_count,
        })
        .eq('id', course!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] });
      toast.success('Curso atualizado com sucesso!');
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error updating course:', error);
      toast.error('Erro ao atualizar curso');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = courseSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    if (isEditing) {
      updateMutation.mutate(result.data);
    } else {
      createMutation.mutate(result.data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Curso' : 'Novo Curso'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Nome do curso"
              disabled={isLoading}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descrição do curso"
              rows={3}
              disabled={isLoading}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                disabled={isLoading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Selecione...</option>
                <option value="Profissional">Profissional</option>
                <option value="EJA">EJA</option>
                <option value="Técnico">Técnico</option>
                <option value="Competência">Competência</option>
              </select>
              {errors.category && (
                <p className="text-sm text-destructive">{errors.category}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="workload_hours">Carga Horária (h)</Label>
              <Input
                id="workload_hours"
                type="number"
                min={1}
                value={formData.workload_hours}
                onChange={(e) => setFormData({ ...formData, workload_hours: parseInt(e.target.value) || 1 })}
                disabled={isLoading}
              />
              {errors.workload_hours && (
                <p className="text-sm text-destructive">{errors.workload_hours}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="installment_price">Valor da Parcela (R$)</Label>
              <Input
                id="installment_price"
                type="number"
                step="0.01"
                min={0}
                value={formData.installment_price ?? ''}
                onChange={(e) => setFormData({ ...formData, installment_price: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="Ex: 150.00"
                disabled={isLoading}
              />
              {errors.installment_price && (
                <p className="text-sm text-destructive">{errors.installment_price}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="installment_count">Nº de Parcelas</Label>
              <Input
                id="installment_count"
                type="number"
                min={1}
                max={48}
                value={formData.installment_count ?? ''}
                onChange={(e) => setFormData({ ...formData, installment_count: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="Ex: 12"
                disabled={isLoading}
              />
              {errors.installment_count && (
                <p className="text-sm text-destructive">{errors.installment_count}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Configure o parcelamento que será gerado no Asaas para matrículas neste curso
          </p>

          <div className="space-y-2">
            <Label htmlFor="welcome_video_url">Vídeo de Boas-vindas (Embed)</Label>
            <Input
              id="welcome_video_url"
              value={formData.welcome_video_url}
              onChange={(e) => setFormData({ ...formData, welcome_video_url: e.target.value })}
              placeholder="https://www.youtube.com/watch?v=... ou URL de embed"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Cole um link do YouTube, Vimeo, Bunny, Panda ou qualquer URL de embed
            </p>
            {errors.welcome_video_url && (
              <p className="text-sm text-destructive">{errors.welcome_video_url}</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">Curso Ativo</Label>
              <p className="text-sm text-muted-foreground">
                Cursos inativos não aparecem para alunos
              </p>
            </div>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              disabled={isLoading}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditing ? 'Salvar' : 'Criar Curso'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
