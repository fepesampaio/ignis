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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2, BookOpen, Layers, FileText, ClipboardList, FolderPlus, FolderInput } from "lucide-react";

interface CopySubjectContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceSubjectId: string;
  sourceSubjectTitle: string;
  sourceCourseId: string;
}

interface SourceSubject {
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
}

export function CopySubjectContentDialog({
  open,
  onOpenChange,
  sourceSubjectId,
  sourceSubjectTitle,
  sourceCourseId,
}: CopySubjectContentDialogProps) {
  const queryClient = useQueryClient();
  const [copyMode, setCopyMode] = useState<"new" | "existing">("new");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [copyOptions, setCopyOptions] = useState({
    lessons: true,
    activities: true,
    exams: true,
    assignments: true,
  });

  // Fetch source subject details
  const { data: sourceSubject } = useQuery({
    queryKey: ["source-subject-details", sourceSubjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, title, description, order_index, is_active, release_after_days, handout_url, is_certificate_instructions, welcome_video_url, custom_title, html_content")
        .eq("id", sourceSubjectId)
        .single();
      if (error) throw error;
      return data as SourceSubject;
    },
    enabled: open,
  });

  // Fetch all courses except the current one
  const { data: courses = [] } = useQuery({
    queryKey: ["all-courses-for-copy"],
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

  // Fetch subjects of selected course
  const { data: targetSubjects = [] } = useQuery({
    queryKey: ["subjects-for-copy", selectedCourseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, title, order_index")
        .eq("course_id", selectedCourseId)
        .order("order_index");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCourseId,
  });

  // Get content counts from source subject
  const { data: sourceContent } = useQuery({
    queryKey: ["source-content-counts", sourceSubjectId],
    queryFn: async () => {
      const [lessonsResult, activitiesResult, examsResult, assignmentsResult] = await Promise.all([
        supabase.from("lessons").select("id", { count: 'exact', head: true }).eq("subject_id", sourceSubjectId),
        supabase.from("activities").select("id", { count: 'exact', head: true }).eq("subject_id", sourceSubjectId),
        supabase.from("exams").select("id", { count: 'exact', head: true }).eq("subject_id", sourceSubjectId),
        supabase.from("assignments").select("id", { count: 'exact', head: true }).eq("subject_id", sourceSubjectId),
      ]);
      
      return {
        lessons: lessonsResult.count || 0,
        activities: activitiesResult.count || 0,
        exams: examsResult.count || 0,
        assignments: assignmentsResult.count || 0,
      };
    },
    enabled: open,
  });

  // Helper function to copy content to a target subject
  const copyContentToSubject = async (targetSubjectId: string, targetCourseId: string) => {
    // Copy lessons
    if (copyOptions.lessons) {
      const { data: sourceLessons, error: lessonsError } = await supabase
        .from("lessons")
        .select("*")
        .eq("subject_id", sourceSubjectId)
        .order("order_index");
      
      if (lessonsError) throw lessonsError;

      // Get current max order_index in target subject
      const { data: existingLessons } = await supabase
        .from("lessons")
        .select("order_index")
        .eq("subject_id", targetSubjectId)
        .order("order_index", { ascending: false })
        .limit(1);
      
      const startOrderIndex = existingLessons && existingLessons.length > 0 
        ? existingLessons[0].order_index + 1 
        : 0;

      if (sourceLessons && sourceLessons.length > 0) {
        const newLessons = sourceLessons.map((lesson, index) => ({
          title: lesson.title,
          description: lesson.description,
          content: lesson.content,
          video_url: lesson.video_url,
          order_index: startOrderIndex + index,
          is_active: lesson.is_active,
          release_after_days: 0,
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

      const { data: existingActivities } = await supabase
        .from("activities")
        .select("order_index")
        .eq("subject_id", targetSubjectId)
        .order("order_index", { ascending: false })
        .limit(1);
      
      const startOrderIndex = existingActivities && existingActivities.length > 0 
        ? existingActivities[0].order_index + 1 
        : 0;

      if (sourceActivities && sourceActivities.length > 0) {
        for (let i = 0; i < sourceActivities.length; i++) {
          const activity = sourceActivities[i];
          
          const { data: newActivity, error: insertError } = await supabase
            .from("activities")
            .insert({
              title: activity.title,
              description: activity.description,
              content: activity.content,
              order_index: startOrderIndex + i,
              is_active: activity.is_active,
              subject_id: targetSubjectId,
            })
            .select()
            .single();
          
          if (insertError) throw insertError;

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
      if (copyMode === "new") {
        // Create new subject in target course
        if (!sourceSubject) throw new Error("Matéria de origem não encontrada");

        // Get next order_index in target course
        const nextOrderIndex = targetSubjects.length > 0 
          ? Math.max(...targetSubjects.map(s => s.order_index)) + 1 
          : 0;

        const { data: newSubject, error: subjectError } = await supabase
          .from("subjects")
          .insert({
            title: sourceSubject.title,
            description: sourceSubject.description,
            order_index: nextOrderIndex,
            is_active: sourceSubject.is_active,
            release_after_days: sourceSubject.release_after_days,
            handout_url: sourceSubject.handout_url,
            is_certificate_instructions: sourceSubject.is_certificate_instructions,
            welcome_video_url: sourceSubject.welcome_video_url,
            custom_title: sourceSubject.custom_title,
            html_content: sourceSubject.html_content,
            course_id: selectedCourseId,
          })
          .select()
          .single();

        if (subjectError) throw subjectError;

        // Now copy content to the new subject
        await copyContentToSubject(newSubject.id, selectedCourseId);
      } else {
        // Copy to existing subject
        const targetSubject = targetSubjects.find(s => s.id === selectedSubjectId);
        if (!targetSubject) throw new Error("Matéria de destino não encontrada");

        await copyContentToSubject(selectedSubjectId, selectedCourseId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      queryClient.invalidateQueries({ queryKey: ["subject-counts"] });
      toast.success(copyMode === "new" 
        ? "Matéria copiada com sucesso!" 
        : "Conteúdo copiado com sucesso!");
      handleClose();
    },
    onError: (error) => {
      console.error("Error copying:", error);
      toast.error("Erro ao copiar");
    },
  });

  const handleClose = () => {
    setCopyMode("new");
    setSelectedCourseId("");
    setSelectedSubjectId("");
    setCopyOptions({
      lessons: true,
      activities: true,
      exams: true,
      assignments: true,
    });
    onOpenChange(false);
  };

  const handleCopy = () => {
    if (!selectedCourseId) {
      toast.error("Selecione o curso de destino");
      return;
    }
    if (copyMode === "existing" && !selectedSubjectId) {
      toast.error("Selecione a matéria de destino");
      return;
    }
    if (!copyOptions.lessons && !copyOptions.activities && !copyOptions.exams && !copyOptions.assignments) {
      toast.error("Selecione pelo menos um tipo de conteúdo para copiar");
      return;
    }
    copyMutation.mutate();
  };

  const hasContent = sourceContent && (
    (copyOptions.lessons && sourceContent.lessons > 0) ||
    (copyOptions.activities && sourceContent.activities > 0) ||
    (copyOptions.exams && sourceContent.exams > 0) ||
    (copyOptions.assignments && sourceContent.assignments > 0)
  );

  const canCopy = copyMode === "new" 
    ? selectedCourseId && hasContent
    : selectedSubjectId && hasContent;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Copiar Matéria</DialogTitle>
          <DialogDescription>
            Copiar "{sourceSubjectTitle}" para outro curso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Source content info */}
          <div className="grid grid-cols-4 gap-2 p-3 bg-muted rounded-lg">
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

          {/* Copy mode selection */}
          <div className="space-y-3">
            <Label>Modo de cópia</Label>
            <RadioGroup value={copyMode} onValueChange={(value) => {
              setCopyMode(value as "new" | "existing");
              setSelectedSubjectId("");
            }}>
              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="new" id="mode-new" />
                <FolderPlus className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <label htmlFor="mode-new" className="font-medium cursor-pointer">
                    Criar nova matéria
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Cria a matéria "{sourceSubjectTitle}" no curso de destino com todo o conteúdo
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="existing" id="mode-existing" />
                <FolderInput className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <label htmlFor="mode-existing" className="font-medium cursor-pointer">
                    Copiar para matéria existente
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Adiciona o conteúdo a uma matéria que já existe no curso de destino
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Select course */}
          <div className="space-y-2">
            <Label>Curso de destino</Label>
            <Select value={selectedCourseId} onValueChange={(value) => {
              setSelectedCourseId(value);
              setSelectedSubjectId("");
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o curso" />
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

          {/* Select subject (only for existing mode) */}
          {copyMode === "existing" && selectedCourseId && (
            <div className="space-y-2">
              <Label>Matéria de destino</Label>
              <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a matéria" />
                </SelectTrigger>
                <SelectContent>
                  {targetSubjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {targetSubjects.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Este curso não possui matérias cadastradas.
                </p>
              )}
            </div>
          )}

          {/* Copy options */}
          <div className="space-y-3">
            <Label>O que copiar?</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copy-lessons"
                  checked={copyOptions.lessons}
                  onCheckedChange={(checked) => 
                    setCopyOptions(prev => ({ ...prev, lessons: !!checked }))
                  }
                  disabled={!sourceContent?.lessons}
                />
                <label htmlFor="copy-lessons" className="text-sm">
                  Aulas ({sourceContent?.lessons || 0})
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copy-activities"
                  checked={copyOptions.activities}
                  onCheckedChange={(checked) => 
                    setCopyOptions(prev => ({ ...prev, activities: !!checked }))
                  }
                  disabled={!sourceContent?.activities}
                />
                <label htmlFor="copy-activities" className="text-sm">
                  Exercícios com questões ({sourceContent?.activities || 0})
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copy-exams"
                  checked={copyOptions.exams}
                  onCheckedChange={(checked) => 
                    setCopyOptions(prev => ({ ...prev, exams: !!checked }))
                  }
                  disabled={!sourceContent?.exams}
                />
                <label htmlFor="copy-exams" className="text-sm">
                  Provas com questões ({sourceContent?.exams || 0})
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copy-assignments"
                  checked={copyOptions.assignments}
                  onCheckedChange={(checked) => 
                    setCopyOptions(prev => ({ ...prev, assignments: !!checked }))
                  }
                  disabled={!sourceContent?.assignments}
                />
                <label htmlFor="copy-assignments" className="text-sm">
                  Trabalhos ({sourceContent?.assignments || 0})
                </label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleCopy} 
            disabled={!canCopy || copyMutation.isPending}
          >
            {copyMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Copiando...
              </>
            ) : copyMode === "new" ? (
              "Criar e Copiar"
            ) : (
              "Copiar Conteúdo"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
