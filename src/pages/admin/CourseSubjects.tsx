import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBasePath } from "@/hooks/useBasePath";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, GripVertical, Pencil, Trash2, BookOpen, FileText, ClipboardList, Award, Layers, Clock, Users, Copy, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { SubjectFormDialog } from "@/components/admin/SubjectFormDialog";
import { DeleteSubjectDialog } from "@/components/admin/DeleteSubjectDialog";
import { SubjectReleaseOverrideDialog } from "@/components/admin/SubjectReleaseOverrideDialog";
import { CopySubjectContentDialog } from "@/components/admin/CopySubjectContentDialog";

interface Subject {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_active: boolean;
  is_certificate_instructions: boolean;
  course_id: string;
  release_after_days: number;
}

export default function CourseSubjects() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { basePath } = useBasePath();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
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

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["subjects", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("course_id", courseId!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data as Subject[];
    },
    enabled: !!courseId,
  });

  // Get counts for each subject
  const { data: subjectCounts = {} } = useQuery({
    queryKey: ["subject-counts", courseId],
    queryFn: async () => {
      const counts: Record<string, { lessons: number; activities: number; exams: number; assignments: number }> = {};
      
      for (const subject of subjects) {
        const [lessonsResult, activitiesResult, examsResult, assignmentsResult] = await Promise.all([
          supabase.from("lessons").select("id", { count: 'exact', head: true }).eq("subject_id", subject.id),
          supabase.from("activities").select("id", { count: 'exact', head: true }).eq("subject_id", subject.id),
          supabase.from("exams").select("id", { count: 'exact', head: true }).eq("subject_id", subject.id),
          supabase.from("assignments").select("id", { count: 'exact', head: true }).eq("subject_id", subject.id),
        ]);
        
        counts[subject.id] = {
          lessons: lessonsResult.count || 0,
          activities: activitiesResult.count || 0,
          exams: examsResult.count || 0,
          assignments: assignmentsResult.count || 0,
        };
      }
      
      return counts;
    },
    enabled: subjects.length > 0,
  });

  const reorderMutation = useMutation({
    mutationFn: async (reorderedSubjects: Subject[]) => {
      const updates = reorderedSubjects.map((subject, index) =>
        supabase
          .from("subjects")
          .update({ order_index: index })
          .eq("id", subject.id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects", courseId] });
      toast.success("Ordem atualizada!");
    },
    onError: () => {
      toast.error("Erro ao reordenar matérias");
    },
  });

  const filteredSubjects = subjects.filter((subject) =>
    subject.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSubjects = [...filteredSubjects];
    const draggedItem = newSubjects[draggedIndex];
    newSubjects.splice(draggedIndex, 1);
    newSubjects.splice(index, 0, draggedItem);

    setDraggedIndex(index);
    reorderMutation.mutate(newSubjects);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const moveSubject = (currentIndex: number, newIndex: number) => {
    if (newIndex < 0 || newIndex >= filteredSubjects.length) return;
    
    const newSubjects = [...filteredSubjects];
    const [movedItem] = newSubjects.splice(currentIndex, 1);
    newSubjects.splice(newIndex, 0, movedItem);
    reorderMutation.mutate(newSubjects);
  };

  const moveToTop = (currentIndex: number) => {
    if (currentIndex === 0) return;
    moveSubject(currentIndex, 0);
  };

  const moveToBottom = (currentIndex: number) => {
    if (currentIndex === filteredSubjects.length - 1) return;
    moveSubject(currentIndex, filteredSubjects.length - 1);
  };

  const handleEdit = (subject: Subject) => {
    setSelectedSubject(subject);
    setFormOpen(true);
  };

  const handleDelete = (subject: Subject) => {
    setSelectedSubject(subject);
    setDeleteOpen(true);
  };

  const handleNewSubject = () => {
    setSelectedSubject(null);
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
            <h1 className="text-2xl font-bold">Matérias do Curso</h1>
            <p className="text-muted-foreground">{course?.title}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <Input
            placeholder="Buscar matérias..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={handleNewSubject}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Matéria
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : filteredSubjects.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {search ? "Nenhuma matéria encontrada" : "Nenhuma matéria cadastrada. Clique em 'Nova Matéria' para começar."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredSubjects.map((subject, index) => (
              <Card
                key={subject.id}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`transition-all duration-200 ${
                  draggedIndex === index ? "opacity-50 scale-[0.98] ring-2 ring-primary" : ""
                } ${subject.is_certificate_instructions ? "border-amber-500" : "hover:shadow-md"}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {!subject.is_certificate_instructions && (
                      <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === 0 || reorderMutation.isPending}
                          onClick={() => moveSubject(index, index - 1)}
                          title="Mover para cima"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 cursor-grab active:cursor-grabbing"
                              draggable
                              onDragStart={() => handleDragStart(index)}
                              onDragEnd={handleDragEnd}
                            >
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem 
                              onClick={() => moveToTop(index)}
                              disabled={index === 0}
                            >
                              <ChevronUp className="h-4 w-4 mr-2" />
                              Mover para o início
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => moveToBottom(index)}
                              disabled={index === filteredSubjects.length - 1}
                            >
                              <ChevronDown className="h-4 w-4 mr-2" />
                              Mover para o final
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => moveSubject(index, index - 1)}
                              disabled={index === 0}
                            >
                              <ArrowUpDown className="h-4 w-4 mr-2" />
                              Mover 1 posição acima
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => moveSubject(index, index + 1)}
                              disabled={index === filteredSubjects.length - 1}
                            >
                              <ArrowUpDown className="h-4 w-4 mr-2" />
                              Mover 1 posição abaixo
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === filteredSubjects.length - 1 || reorderMutation.isPending}
                          onClick={() => moveSubject(index, index + 1)}
                          title="Mover para baixo"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm flex-shrink-0">
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{subject.title}</h3>
                        <Badge variant={subject.is_active ? "default" : "secondary"}>
                          {subject.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                        {subject.is_certificate_instructions && (
                          <Badge variant="outline" className="border-amber-500 text-amber-700">
                            <Award className="h-3 w-3 mr-1" />
                            Instruções
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {subject.description || "Sem descrição"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1" title="Aulas">
                        <BookOpen className="h-4 w-4" />
                        <span>{subjectCounts[subject.id]?.lessons || 0}</span>
                      </div>
                      <div className="flex items-center gap-1" title="Atividades">
                        <Layers className="h-4 w-4" />
                        <span>{subjectCounts[subject.id]?.activities || 0}</span>
                      </div>
                      <div className="flex items-center gap-1" title="Trabalhos">
                        <ClipboardList className="h-4 w-4" />
                        <span>{subjectCounts[subject.id]?.assignments || 0}</span>
                      </div>
                      <div className="flex items-center gap-1" title="Provas">
                        <FileText className="h-4 w-4" />
                        <span>{subjectCounts[subject.id]?.exams || 0}</span>
                      </div>
                      {!subject.is_certificate_instructions && (
                        <div className="flex items-center gap-1" title="Liberação após dias">
                          <Clock className="h-4 w-4" />
                          <span>{subject.release_after_days}d</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(`${basePath}/courses/${courseId}/subjects/${subject.id}`)}
                      >
                        Gerenciar
                      </Button>
                      {!subject.is_certificate_instructions && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Copiar conteúdo para outro curso"
                          onClick={() => {
                            setSelectedSubject(subject);
                            setCopyOpen(true);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                      {!subject.is_certificate_instructions && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Liberações individuais"
                          onClick={() => {
                            setSelectedSubject(subject);
                            setOverrideOpen(true);
                          }}
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(subject)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(subject)}>
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

      <SubjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        subject={selectedSubject}
        courseId={courseId!}
        nextOrderIndex={subjects.length}
      />

      <DeleteSubjectDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        subject={selectedSubject ? { ...selectedSubject, course_id: courseId! } : null}
      />

      {selectedSubject && (
        <SubjectReleaseOverrideDialog
          open={overrideOpen}
          onOpenChange={setOverrideOpen}
          subjectId={selectedSubject.id}
          subjectTitle={selectedSubject.title}
          courseId={courseId!}
          defaultReleaseAfterDays={selectedSubject.release_after_days}
        />
      )}

      {selectedSubject && (
        <CopySubjectContentDialog
          open={copyOpen}
          onOpenChange={setCopyOpen}
          sourceSubjectId={selectedSubject.id}
          sourceSubjectTitle={selectedSubject.title}
          sourceCourseId={courseId!}
        />
      )}
    </DashboardLayout>
  );
}
