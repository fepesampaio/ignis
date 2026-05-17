import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, BookOpen, Layers, FileText, ClipboardList, Copy, CheckCircle } from "lucide-react";

interface CopyCourseContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceCourseId: string;
  sourceCourseTitle: string;
}

interface Subject {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_active: boolean;
  release_after_days: number;
  handout_url: string | null;
  is_certificate_instructions: boolean;
  welcome_video_url: string | null;
  custom_title: string | null;
  html_content: string | null;
  require_previous_exam: boolean;
}

export function CopyCourseContentDialog({
  open,
  onOpenChange,
  sourceCourseId,
  sourceCourseTitle,
}: CopyCourseContentDialogProps) {
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [copyOptions, setCopyOptions] = useState({
    subjects: true,
    lessons: true,
    activities: true,
    exams: true,
    assignments: true,
  });
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");

  // Fetch all courses except the current one
  const { data: courses = [] } = useQuery({
    queryKey: ["all-courses-for-copy-course"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title")
        .neq("id", sourceCourseId)
        .order("title");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch subjects from source course
  const { data: sourceSubjects = [] } = useQuery({
    queryKey: ["source-course-subjects", sourceCourseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("course_id", sourceCourseId)
        .order("order_index");
      if (error) throw error;
      return data as Subject[];
    },
    enabled: open,
  });

  // Get content counts from source course
  const { data: sourceContent } = useQuery({
    queryKey: ["source-course-content-counts", sourceCourseId],
    queryFn: async () => {
      const subjectIds = sourceSubjects.map(s => s.id);
      if (subjectIds.length === 0) {
        return { subjects: 0, lessons: 0, activities: 0, exams: 0, assignments: 0 };
      }

      const [lessonsResult, activitiesResult, examsResult, assignmentsResult] = await Promise.all([
        supabase.from("lessons").select("id", { count: 'exact', head: true }).in("subject_id", subjectIds),
        supabase.from("activities").select("id", { count: 'exact', head: true }).in("subject_id", subjectIds),
        supabase.from("exams").select("id", { count: 'exact', head: true }).in("subject_id", subjectIds),
        supabase.from("assignments").select("id", { count: 'exact', head: true }).in("subject_id", subjectIds),
      ]);
      
      return {
        subjects: sourceSubjects.length,
        lessons: lessonsResult.count || 0,
        activities: activitiesResult.count || 0,
        exams: examsResult.count || 0,
        assignments: assignmentsResult.count || 0,
      };
    },
    enabled: open && sourceSubjects.length > 0,
  });

  // Helper function to copy content to a target subject
  const copyContentToSubject = async (
    sourceSubjectId: string,
    targetSubjectId: string,
    targetCourseId: string
  ) => {
    // Copy lessons
    if (copyOptions.lessons) {
      const { data: sourceLessons, error: lessonsError } = await supabase
        .from("lessons")
        .select("*")
        .eq("subject_id", sourceSubjectId)
        .order("order_index");
      
      if (lessonsError) throw lessonsError;

      if (sourceLessons && sourceLessons.length > 0) {
        const newLessons = sourceLessons.map((lesson) => ({
          title: lesson.title,
          description: lesson.description,
          content: lesson.content,
          video_url: lesson.video_url,
          youtube_url: lesson.youtube_url,
          order_index: lesson.order_index,
          is_active: lesson.is_active,
          release_after_days: lesson.release_after_days,
          course_id: targetCourseId,
          subject_id: targetSubjectId,
        }));

        const { error: insertError } = await supabase
          .from("lessons")
          .insert(newLessons);
        
        if (insertError) throw insertError;
      }
    }

    // Copy activities with their questions
    if (copyOptions.activities) {
      const { data: sourceActivities, error: activitiesError } = await supabase
        .from("activities")
        .select("*")
        .eq("subject_id", sourceSubjectId)
        .order("order_index");
      
      if (activitiesError) throw activitiesError;

      if (sourceActivities && sourceActivities.length > 0) {
        for (const activity of sourceActivities) {
          const { data: newActivity, error: insertError } = await supabase
            .from("activities")
            .insert({
              title: activity.title,
              description: activity.description,
              content: activity.content,
              order_index: activity.order_index,
              is_active: activity.is_active,
              subject_id: targetSubjectId,
            })
            .select()
            .single();
          
          if (insertError) throw insertError;

          // Copy questions and options
          const { data: sourceQuestions, error: questionsError } = await supabase
            .from("questions")
            .select("*, question_options(*)")
            .eq("activity_id", activity.id)
            .order("order_index");
          
          if (questionsError) throw questionsError;

          if (sourceQuestions && sourceQuestions.length > 0) {
            for (const question of sourceQuestions) {
              const { data: newQuestion, error: qError } = await supabase
                .from("questions")
                .insert({
                  question_text: question.question_text,
                  question_type: question.question_type,
                  points: question.points,
                  order_index: question.order_index,
                  activity_id: newActivity.id,
                })
                .select()
                .single();
              
              if (qError) throw qError;

              if (question.question_options && question.question_options.length > 0) {
                const newOptions = question.question_options.map((opt: any) => ({
                  question_id: newQuestion.id,
                  option_text: opt.option_text,
                  is_correct: opt.is_correct,
                  order_index: opt.order_index,
                }));

                const { error: optError } = await supabase
                  .from("question_options")
                  .insert(newOptions);
                
                if (optError) throw optError;
              }
            }
          }
        }
      }
    }

    // Copy exams with their questions
    if (copyOptions.exams) {
      const { data: sourceExams, error: examsError } = await supabase
        .from("exams")
        .select("*")
        .eq("subject_id", sourceSubjectId);
      
      if (examsError) throw examsError;

      if (sourceExams && sourceExams.length > 0) {
        for (const exam of sourceExams) {
          const { data: newExam, error: insertError } = await supabase
            .from("exams")
            .insert({
              title: exam.title,
              description: exam.description,
              passing_score: exam.passing_score,
              time_limit_minutes: exam.time_limit_minutes,
              max_attempts: exam.max_attempts,
              is_active: exam.is_active,
              course_id: targetCourseId,
              subject_id: targetSubjectId,
            })
            .select()
            .single();
          
          if (insertError) throw insertError;

          // Copy questions and options
          const { data: sourceQuestions, error: questionsError } = await supabase
            .from("questions")
            .select("*, question_options(*)")
            .eq("exam_id", exam.id)
            .order("order_index");
          
          if (questionsError) throw questionsError;

          if (sourceQuestions && sourceQuestions.length > 0) {
            for (const question of sourceQuestions) {
              const { data: newQuestion, error: qError } = await supabase
                .from("questions")
                .insert({
                  question_text: question.question_text,
                  question_type: question.question_type,
                  points: question.points,
                  order_index: question.order_index,
                  exam_id: newExam.id,
                })
                .select()
                .single();
              
              if (qError) throw qError;

              if (question.question_options && question.question_options.length > 0) {
                const newOptions = question.question_options.map((opt: any) => ({
                  question_id: newQuestion.id,
                  option_text: opt.option_text,
                  is_correct: opt.is_correct,
                  order_index: opt.order_index,
                }));

                const { error: optError } = await supabase
                  .from("question_options")
                  .insert(newOptions);
                
                if (optError) throw optError;
              }
            }
          }
        }
      }
    }

    // Copy assignments
    if (copyOptions.assignments) {
      const { data: sourceAssignments, error: assignmentsError } = await supabase
        .from("assignments")
        .select("*")
        .eq("subject_id", sourceSubjectId);
      
      if (assignmentsError) throw assignmentsError;

      if (sourceAssignments && sourceAssignments.length > 0) {
        const newAssignments = sourceAssignments.map(assignment => ({
          title: assignment.title,
          description: assignment.description,
          max_score: assignment.max_score,
          is_active: assignment.is_active,
          course_id: targetCourseId,
          subject_id: targetSubjectId,
        }));

        const { error: insertError } = await supabase
          .from("assignments")
          .insert(newAssignments);
        
        if (insertError) throw insertError;
      }
    }
  };

  const copyMutation = useMutation({
    mutationFn: async () => {
      if (!copyOptions.subjects) {
        throw new Error("Selecione pelo menos as matérias para copiar");
      }

      const totalSubjects = sourceSubjects.length;
      let completedSubjects = 0;

      for (const sourceSubject of sourceSubjects) {
        setCurrentStep(`Copiando: ${sourceSubject.title}`);
        
        // Create new subject in target course
        const { data: newSubject, error: subjectError } = await supabase
          .from("subjects")
          .insert({
            title: sourceSubject.title,
            description: sourceSubject.description,
            order_index: sourceSubject.order_index,
            is_active: sourceSubject.is_active,
            release_after_days: sourceSubject.release_after_days,
            handout_url: sourceSubject.handout_url,
            is_certificate_instructions: sourceSubject.is_certificate_instructions,
            welcome_video_url: sourceSubject.welcome_video_url,
            custom_title: sourceSubject.custom_title,
            html_content: sourceSubject.html_content,
            require_previous_exam: sourceSubject.require_previous_exam,
            course_id: selectedCourseId,
          })
          .select()
          .single();

        if (subjectError) throw subjectError;

        // Copy content to the new subject
        await copyContentToSubject(sourceSubject.id, newSubject.id, selectedCourseId);

        completedSubjects++;
        setProgress(Math.round((completedSubjects / totalSubjects) * 100));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Curso copiado com sucesso!");
      handleClose();
    },
    onError: (error) => {
      console.error("Error copying course:", error);
      toast.error("Erro ao copiar curso");
    },
  });

  const handleClose = () => {
    setSelectedCourseId("");
    setCopyOptions({
      subjects: true,
      lessons: true,
      activities: true,
      exams: true,
      assignments: true,
    });
    setProgress(0);
    setCurrentStep("");
    onOpenChange(false);
  };

  const handleCopy = () => {
    if (!selectedCourseId) {
      toast.error("Selecione o curso de destino");
      return;
    }
    if (!sourceSubjects.length) {
      toast.error("O curso de origem não possui matérias");
      return;
    }
    copyMutation.mutate();
  };

  const hasContent = sourceContent && sourceContent.subjects > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copiar Curso Inteiro
          </DialogTitle>
          <DialogDescription>
            Copiar todo o conteúdo de "{sourceCourseTitle}" para outro curso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Source content info */}
          <div className="grid grid-cols-5 gap-2 p-3 bg-muted rounded-lg">
            <div className="text-center">
              <Layers className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-semibold">{sourceContent?.subjects || 0}</p>
              <p className="text-xs text-muted-foreground">Matérias</p>
            </div>
            <div className="text-center">
              <BookOpen className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-semibold">{sourceContent?.lessons || 0}</p>
              <p className="text-xs text-muted-foreground">Aulas</p>
            </div>
            <div className="text-center">
              <Layers className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-semibold">{sourceContent?.activities || 0}</p>
              <p className="text-xs text-muted-foreground">Exercícios</p>
            </div>
            <div className="text-center">
              <FileText className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-semibold">{sourceContent?.exams || 0}</p>
              <p className="text-xs text-muted-foreground">Provas</p>
            </div>
            <div className="text-center">
              <ClipboardList className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-semibold">{sourceContent?.assignments || 0}</p>
              <p className="text-xs text-muted-foreground">Trabalhos</p>
            </div>
          </div>

          {/* Target course selection */}
          <div className="space-y-2">
            <Label>Curso de destino</Label>
            <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o curso de destino" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Copy options */}
          <div className="space-y-3">
            <Label>Opções de cópia</Label>
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copy-subjects"
                  checked={copyOptions.subjects}
                  disabled
                />
                <label htmlFor="copy-subjects" className="text-sm font-medium">
                  Matérias ({sourceContent?.subjects || 0})
                </label>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <Checkbox
                  id="copy-lessons"
                  checked={copyOptions.lessons}
                  onCheckedChange={(checked) =>
                    setCopyOptions((prev) => ({ ...prev, lessons: !!checked }))
                  }
                />
                <label htmlFor="copy-lessons" className="text-sm">
                  Aulas ({sourceContent?.lessons || 0})
                </label>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <Checkbox
                  id="copy-activities"
                  checked={copyOptions.activities}
                  onCheckedChange={(checked) =>
                    setCopyOptions((prev) => ({ ...prev, activities: !!checked }))
                  }
                />
                <label htmlFor="copy-activities" className="text-sm">
                  Exercícios com questões ({sourceContent?.activities || 0})
                </label>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <Checkbox
                  id="copy-exams"
                  checked={copyOptions.exams}
                  onCheckedChange={(checked) =>
                    setCopyOptions((prev) => ({ ...prev, exams: !!checked }))
                  }
                />
                <label htmlFor="copy-exams" className="text-sm">
                  Provas com questões ({sourceContent?.exams || 0})
                </label>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <Checkbox
                  id="copy-assignments"
                  checked={copyOptions.assignments}
                  onCheckedChange={(checked) =>
                    setCopyOptions((prev) => ({ ...prev, assignments: !!checked }))
                  }
                />
                <label htmlFor="copy-assignments" className="text-sm">
                  Trabalhos ({sourceContent?.assignments || 0})
                </label>
              </div>
            </div>
          </div>

          {/* Progress bar during copy */}
          {copyMutation.isPending && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{currentStep}</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={copyMutation.isPending}>
            Cancelar
          </Button>
          <Button 
            onClick={handleCopy} 
            disabled={!selectedCourseId || !hasContent || copyMutation.isPending}
          >
            {copyMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Copiando...
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copiar Curso
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
