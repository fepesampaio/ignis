import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GroupedCourseSelect } from '@/components/ui/grouped-course-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, Percent, X } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

const formSchema = z.object({
  userId: z.string().min(1, 'Selecione um aluno'),
  courseId: z.string().min(1, 'Selecione um curso'),
  secondCourseId: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface Course {
  id: string;
  title: string;
  category: string | null;
  subjectsCount: number;
}

interface EnrollStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCourseId?: string;
}

export function EnrollStudentDialog({ open, onOpenChange, defaultCourseId }: EnrollStudentDialogProps) {
  const queryClient = useQueryClient();
  const [enableSecondCourse, setEnableSecondCourse] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userId: '',
      courseId: defaultCourseId || '',
      secondCourseId: '',
    },
  });

  // Reset second course when checkbox is disabled
  useEffect(() => {
    if (!enableSecondCourse) {
      form.setValue('secondCourseId', '');
    }
  }, [enableSecondCourse, form]);

  // Fetch students (users with role 'aluno')
  const { data: students } = useQuery({
    queryKey: ['students-for-enrollment'],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'aluno');

      if (rolesError) throw rolesError;

      const studentIds = roles.map(r => r.user_id);

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', studentIds)
        .order('full_name');

      if (profilesError) throw profilesError;
      return profiles;
    },
  });

  // Fetch courses with subject count and category
  const { data: courses } = useQuery({
    queryKey: ['courses-for-enrollment-with-subjects'],
    queryFn: async () => {
      const { data: coursesData, error } = await supabase
        .from('courses')
        .select('id, title, category')
        .eq('is_active', true)
        .order('title');

      if (error) throw error;

      // Get subject count for each course
      const coursesWithSubjects = await Promise.all(
        (coursesData || []).map(async (course) => {
          const { count } = await supabase
            .from('subjects')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', course.id)
            .eq('is_active', true);
          return { ...course, subjectsCount: count || 0 } as Course;
        })
      );

      return coursesWithSubjects;
    },
  });

  // Get selected courses
  const selectedCourseId = form.watch('courseId');
  const secondCourseId = form.watch('secondCourseId');
  
  const selectedCourse = courses?.find(c => c.id === selectedCourseId);
  const secondCourse = courses?.find(c => c.id === secondCourseId);
  
  const hasNoSubjects = selectedCourse && selectedCourse.subjectsCount === 0;
  const secondHasNoSubjects = secondCourse && secondCourse.subjectsCount === 0;

  // Check if EJA + Técnico combination for discount
  const discountInfo = useMemo(() => {
    if (!selectedCourse || !secondCourse) return null;

    const categories = [
      selectedCourse.category?.toLowerCase() || '',
      secondCourse.category?.toLowerCase() || ''
    ];

    const hasEJA = categories.some(c => c.includes('eja'));
    const hasTecnico = categories.some(c => c.includes('técnico') || c.includes('tecnico'));

    if (hasEJA && hasTecnico) {
      return {
        percentage: 8,
        message: 'Desconto de 8% aplicado automaticamente para combinação EJA + Técnico'
      };
    }

    return null;
  }, [selectedCourse, secondCourse]);

  // Filter available courses for second select (exclude first course)
  const availableSecondCourses = useMemo(() => {
    return courses?.filter(c => c.id !== selectedCourseId) || [];
  }, [courses, selectedCourseId]);

  const enrollMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const coursesToEnroll = [data.courseId];
      if (enableSecondCourse && data.secondCourseId) {
        coursesToEnroll.push(data.secondCourseId);
      }

      // Check if already enrolled in any of the courses
      for (const courseId of coursesToEnroll) {
        const { data: existing } = await supabase
          .from('enrollments')
          .select('id')
          .eq('user_id', data.userId)
          .eq('course_id', courseId)
          .single();

        if (existing) {
          const course = courses?.find(c => c.id === courseId);
          throw new Error(`Este aluno já está matriculado no curso: ${course?.title}`);
        }
      }

      // Create enrollments
      for (const courseId of coursesToEnroll) {
        const { error } = await supabase
          .from('enrollments')
          .insert({
            user_id: data.userId,
            course_id: courseId,
            is_active: true,
          });

        if (error) throw error;
      }

      return { 
        coursesCount: coursesToEnroll.length,
        hasDiscount: discountInfo !== null
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-enrollments'] });
      
      if (result.coursesCount > 1) {
        if (result.hasDiscount) {
          toast.success(`Matrícula em ${result.coursesCount} cursos realizada com desconto de 8%!`);
        } else {
          toast.success(`Matrícula em ${result.coursesCount} cursos realizada com sucesso!`);
        }
      } else {
        toast.success('Matrícula realizada com sucesso!');
      }
      
      form.reset();
      setEnableSecondCourse(false);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (data: FormData) => {
    enrollMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    setEnableSecondCourse(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Matricular Aluno Existente</DialogTitle>
          <DialogDescription>
            Selecione um aluno já cadastrado e o(s) curso(s) para matriculá-lo
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aluno *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um aluno" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {students?.filter(student => student.user_id).map((student) => (
                        <SelectItem key={student.user_id} value={student.user_id}>
                          {student.full_name} ({student.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="courseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Curso Principal *</FormLabel>
                  <FormControl>
                    <GroupedCourseSelect
                      courses={courses}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Selecione um curso"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {hasNoSubjects && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Atenção:</strong> Este curso não possui matérias cadastradas. 
                  O aluno não terá conteúdo disponível após a matrícula.
                </AlertDescription>
              </Alert>
            )}

            {/* Second Course Option */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enableSecondCourse"
                  checked={enableSecondCourse}
                  onCheckedChange={(checked) => setEnableSecondCourse(checked === true)}
                />
                <label
                  htmlFor="enableSecondCourse"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Matricular em 2 cursos
                </label>
              </div>

              {enableSecondCourse && (
                <>
                  <FormField
                    control={form.control}
                    name="secondCourseId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Segundo Curso</FormLabel>
                        <FormControl>
                          <GroupedCourseSelect
                            courses={availableSecondCourses}
                            value={field.value || ''}
                            onValueChange={field.onChange}
                            placeholder="Selecione o segundo curso"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {secondHasNoSubjects && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Atenção:</strong> O segundo curso não possui matérias cadastradas.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </div>

            {/* Discount Alert */}
            {discountInfo && (
              <Alert className="bg-green-500/10 border-green-500/20">
                <Percent className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  <strong>Desconto Automático!</strong> {discountInfo.message}
                </AlertDescription>
              </Alert>
            )}

            {/* Selected Courses Summary */}
            {(selectedCourse || secondCourse) && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <p className="text-sm font-medium">Cursos selecionados:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedCourse && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      {selectedCourse.title}
                      {selectedCourse.category && (
                        <span className="text-muted-foreground">({selectedCourse.category})</span>
                      )}
                    </Badge>
                  )}
                  {secondCourse && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      {secondCourse.title}
                      {secondCourse.category && (
                        <span className="text-muted-foreground">({secondCourse.category})</span>
                      )}
                      <button 
                        type="button"
                        onClick={() => form.setValue('secondCourseId', '')}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  )}
                </div>
                {discountInfo && (
                  <p className="text-sm text-green-600 font-medium">
                    💰 Desconto de {discountInfo.percentage}% será aplicado nas cobranças
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enrollMutation.isPending}>
                {enrollMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {enableSecondCourse && secondCourseId ? 'Matricular em 2 Cursos' : 'Matricular'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
