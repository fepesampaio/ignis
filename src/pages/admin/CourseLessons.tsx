import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useBasePath } from "@/hooks/useBasePath";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, GripVertical, Pencil, Trash2, Video, FileText, Clock } from "lucide-react";
import { toast } from "sonner";
import { LessonFormDialog } from "@/components/admin/LessonFormDialog";
import { DeleteLessonDialog } from "@/components/admin/DeleteLessonDialog";
import type { Tables } from "@/integrations/supabase/types";

type Lesson = Tables<"lessons">;

export default function CourseLessons() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { basePath } = useBasePath();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const { data: course } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ["lessons", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("*")
        .eq("course_id", courseId!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const reorderMutation = useMutation({
    mutationFn: async (reorderedLessons: Lesson[]) => {
      const updates = reorderedLessons.map((lesson, index) => 
        supabase
          .from("lessons")
          .update({ order_index: index })
          .eq("id", lesson.id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons", courseId] });
      toast.success("Ordem atualizada!");
    },
    onError: () => {
      toast.error("Erro ao reordenar aulas");
    },
  });

  const filteredLessons = lessons.filter((lesson) =>
    lesson.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newLessons = [...filteredLessons];
    const draggedItem = newLessons[draggedIndex];
    newLessons.splice(draggedIndex, 1);
    newLessons.splice(index, 0, draggedItem);

    setDraggedIndex(index);
    reorderMutation.mutate(newLessons);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleEdit = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setFormOpen(true);
  };

  const handleDelete = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setDeleteOpen(true);
  };

  const handleNewLesson = () => {
    setSelectedLesson(null);
    setFormOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`${basePath}/courses`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Aulas do Curso</h1>
            <p className="text-muted-foreground">{course?.title}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <Input
            placeholder="Buscar aulas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={handleNewLesson}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Aula
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : filteredLessons.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {search ? "Nenhuma aula encontrada" : "Nenhuma aula cadastrada. Clique em 'Nova Aula' para começar."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredLessons.map((lesson, index) => (
              <Card
                key={lesson.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`cursor-move transition-all ${
                  draggedIndex === index ? "opacity-50 scale-[0.98]" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm flex-shrink-0">
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{lesson.title}</h3>
                        <Badge variant={lesson.is_active ? "default" : "secondary"}>
                          {lesson.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {lesson.description || "Sem descrição"}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {lesson.video_url && (
                        <div className="flex items-center gap-1">
                          <Video className="h-4 w-4" />
                          <span className="hidden sm:inline">Vídeo</span>
                        </div>
                      )}
                      {lesson.content && (
                        <div className="flex items-center gap-1">
                          <FileText className="h-4 w-4" />
                          <span className="hidden sm:inline">Conteúdo</span>
                        </div>
                      )}
                      {lesson.release_after_days > 0 && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span className="hidden sm:inline">{lesson.release_after_days}d</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(lesson)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(lesson)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <LessonFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lesson={selectedLesson}
        courseId={courseId!}
        nextOrderIndex={lessons.length}
      />

      <DeleteLessonDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        lesson={selectedLesson}
      />
    </DashboardLayout>
  );
}
