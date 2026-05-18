import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBasePath } from "@/hooks/useBasePath";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  BookOpen,
  FileText,
  ClipboardList,
  Award,
  Layers,
  Clock,
  Users,
  Copy,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react";
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

function reorderItems(items: Subject[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [movedItem] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, movedItem);
  return next;
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
  const [draggedSubjectId, setDraggedSubjectId] = useState<string | null>(null);
  const [orderedSubjects, setOrderedSubjects] = useState<Subject[]>([]);

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

  useEffect(() => {
    setOrderedSubjects(subjects);
  }, [subjects]);

  const { data: subjectCounts = {} } = useQuery({
    queryKey: ["subject-counts", courseId],
    queryFn: async () => {
      const counts: Record<string, { lessons: number; activities: number; exams: number; assignments: number }> = {};

      for (const subject of subjects) {
        const [lessonsResult, activitiesResult, examsResult, assignmentsResult] = await Promise.all([
          supabase.from("lessons").select("id", { count: "exact", head: true }).eq("subject_id", subject.id),
          supabase.from("activities").select("id", { count: "exact", head: true }).eq("subject_id", subject.id),
          supabase.from("exams").select("id", { count: "exact", head: true }).eq("subject_id", subject.id),
          supabase.from("assignments").select("id", { count: "exact", head: true }).eq("subject_id", subject.id),
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
    mutationFn: async (reordered: Subject[]) => {
      await Promise.all(
        reordered.map(async (subject, index) => {
          const { error } = await supabase
            .from("subjects")
            .update({ order_index: index })
            .eq("id", subject.id);

          if (error) throw error;
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects", courseId] });
      toast.success("Ordem atualizada!");
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects", courseId] });
      toast.error("Erro ao reordenar materias");
    },
  });

  const isReorderDisabled = !!search.trim();

  const filteredSubjects = useMemo(
    () => orderedSubjects.filter((subject) => subject.title.toLowerCase().includes(search.toLowerCase())),
    [orderedSubjects, search],
  );

  const saveOrder = (nextSubjects: Subject[]) => {
    setOrderedSubjects(nextSubjects);
    reorderMutation.mutate(nextSubjects);
  };

  const handleDragStart = (subjectId: string) => {
    if (isReorderDisabled || reorderMutation.isPending) return;
    setDraggedSubjectId(subjectId);
  };

  const handleDragOver = (e: React.DragEvent, targetSubjectId: string) => {
    e.preventDefault();
    if (isReorderDisabled || !draggedSubjectId || draggedSubjectId === targetSubjectId) return;

    setOrderedSubjects((current) => {
      const draggedIndex = current.findIndex((subject) => subject.id === draggedSubjectId);
      const targetIndex = current.findIndex((subject) => subject.id === targetSubjectId);

      if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
        return current;
      }

      return reorderItems(current, draggedIndex, targetIndex);
    });
  };

  const handleDragEnd = () => {
    if (!draggedSubjectId) return;

    const orderChanged = orderedSubjects.some((subject, index) => subject.id !== subjects[index]?.id);
    setDraggedSubjectId(null);

    if (orderChanged && !reorderMutation.isPending) {
      reorderMutation.mutate(orderedSubjects);
    }
  };

  const moveSubject = (subjectId: string, direction: "up" | "down" | "top" | "bottom") => {
    if (isReorderDisabled || reorderMutation.isPending) return;

    const currentIndex = orderedSubjects.findIndex((subject) => subject.id === subjectId);
    if (currentIndex === -1) return;

    let targetIndex = currentIndex;

    if (direction === "up") targetIndex = currentIndex - 1;
    if (direction === "down") targetIndex = currentIndex + 1;
    if (direction === "top") targetIndex = 0;
    if (direction === "bottom") targetIndex = orderedSubjects.length - 1;

    if (targetIndex < 0 || targetIndex >= orderedSubjects.length || targetIndex === currentIndex) return;

    saveOrder(reorderItems(orderedSubjects, currentIndex, targetIndex));
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
            <h1 className="text-2xl font-bold">Materias do Curso</h1>
            <p className="text-muted-foreground">{course?.title}</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          <Input
            placeholder="Buscar materias..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={handleNewSubject}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Materia
          </Button>
        </div>

        {isReorderDisabled && (
          <p className="text-sm text-muted-foreground">Limpe a busca para reordenar as materias.</p>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Carregando...</div>
        ) : filteredSubjects.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {search ? "Nenhuma materia encontrada" : "Nenhuma materia cadastrada. Clique em 'Nova Materia' para comecar."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredSubjects.map((subject, index) => (
              <Card
                key={subject.id}
                onDragOver={(e) => handleDragOver(e, subject.id)}
                onDragEnd={handleDragEnd}
                className={`transition-all duration-200 ${
                  draggedSubjectId === subject.id ? "scale-[0.98] opacity-50 ring-2 ring-primary" : ""
                } ${subject.is_certificate_instructions ? "border-amber-500" : "hover:shadow-md"}`}
              >
                <CardContent className="p-4">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      {!subject.is_certificate_instructions && (
                        <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={isReorderDisabled || index === 0 || reorderMutation.isPending}
                            onClick={() => moveSubject(subject.id, "up")}
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
                                disabled={isReorderDisabled || reorderMutation.isPending}
                                draggable={!isReorderDisabled && !reorderMutation.isPending}
                                onDragStart={() => handleDragStart(subject.id)}
                                onDragEnd={handleDragEnd}
                              >
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={() => moveSubject(subject.id, "top")}
                                disabled={isReorderDisabled || index === 0}
                              >
                                <ChevronUp className="mr-2 h-4 w-4" />
                                Mover para o inicio
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => moveSubject(subject.id, "bottom")}
                                disabled={isReorderDisabled || index === filteredSubjects.length - 1}
                              >
                                <ChevronDown className="mr-2 h-4 w-4" />
                                Mover para o final
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => moveSubject(subject.id, "up")}
                                disabled={isReorderDisabled || index === 0}
                              >
                                <ArrowUpDown className="mr-2 h-4 w-4" />
                                Mover 1 posicao acima
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => moveSubject(subject.id, "down")}
                                disabled={isReorderDisabled || index === filteredSubjects.length - 1}
                              >
                                <ArrowUpDown className="mr-2 h-4 w-4" />
                                Mover 1 posicao abaixo
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={isReorderDisabled || index === filteredSubjects.length - 1 || reorderMutation.isPending}
                            onClick={() => moveSubject(subject.id, "down")}
                            title="Mover para baixo"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      )}

                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {orderedSubjects.findIndex((item) => item.id === subject.id) + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-medium">{subject.title}</h3>
                          <Badge variant={subject.is_active ? "default" : "secondary"}>
                            {subject.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                          {subject.is_certificate_instructions && (
                            <Badge variant="outline" className="border-amber-500 text-amber-700">
                              <Award className="mr-1 h-3 w-3" />
                              Instrucoes
                            </Badge>
                          )}
                        </div>
                        <p className="line-clamp-1 text-sm text-muted-foreground">
                          {subject.description || "Sem descricao"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
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
                          <div className="flex items-center gap-1" title="Liberacao apos dias">
                            <Clock className="h-4 w-4" />
                            <span>{subject.release_after_days}d</span>
                          </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={() => navigate(`${basePath}/courses/${courseId}/subjects/${subject.id}`)}
                        >
                          Gerenciar
                        </Button>
                        {!subject.is_certificate_instructions && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Copiar conteudo para outro curso"
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
                            title="Liberacoes individuais"
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
