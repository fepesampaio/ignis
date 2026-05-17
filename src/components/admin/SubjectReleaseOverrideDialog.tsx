import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Clock, User, Trash2, Save, Unlock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SubjectReleaseOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectTitle: string;
  courseId: string;
  defaultReleaseAfterDays: number;
}

interface EnrollmentWithOverride {
  enrollmentId: string;
  userId: string;
  userName: string;
  userEmail: string;
  enrolledAt: string;
  override?: {
    id: string;
    release_after_days: number;
    notes: string | null;
    bypass_exam_requirement: boolean;
  };
}

export function SubjectReleaseOverrideDialog({
  open,
  onOpenChange,
  subjectId,
  subjectTitle,
  courseId,
  defaultReleaseAfterDays,
}: SubjectReleaseOverrideDialogProps) {
  const queryClient = useQueryClient();
  const [editingEnrollment, setEditingEnrollment] = useState<string | null>(null);
  const [editDays, setEditDays] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>("");
  const [editBypassExam, setEditBypassExam] = useState<boolean>(false);

  // Fetch enrollments with overrides
  const { data: enrollments, isLoading } = useQuery({
    queryKey: ["subject-release-overrides", subjectId, courseId],
    queryFn: async () => {
      // Get all enrollments for the course
      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from("enrollments")
        .select("id, user_id, enrolled_at")
        .eq("course_id", courseId)
        .eq("is_active", true);

      if (enrollmentsError) throw enrollmentsError;

      if (!enrollmentsData || enrollmentsData.length === 0) {
        return [];
      }

      // Get profiles for all users
      const userIds = enrollmentsData.map((e) => e.user_id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      const profilesMap = new Map(
        profilesData?.map((p) => [p.user_id, p]) || []
      );

      // Get overrides for this subject
      const { data: overridesData } = await supabase
        .from("enrollment_subject_overrides")
        .select("*")
        .eq("subject_id", subjectId);

      const overridesMap = new Map(
        overridesData?.map((o) => [o.enrollment_id, o]) || []
      );

      const result: EnrollmentWithOverride[] = enrollmentsData.map((e) => {
        const profile = profilesMap.get(e.user_id);
        return {
          enrollmentId: e.id,
          userId: e.user_id,
          userName: profile?.full_name || "Nome não disponível",
          userEmail: profile?.email || "Email não disponível",
          enrolledAt: e.enrolled_at,
          override: overridesMap.get(e.id),
        };
      });

      return result;
    },
    enabled: open && !!subjectId && !!courseId,
  });

  // Create/Update override mutation
  const upsertMutation = useMutation({
    mutationFn: async ({
      enrollmentId,
      releaseAfterDays,
      notes,
      bypassExamRequirement,
    }: {
      enrollmentId: string;
      releaseAfterDays: number;
      notes: string;
      bypassExamRequirement: boolean;
    }) => {
      const { error } = await supabase
        .from("enrollment_subject_overrides")
        .upsert(
          {
            enrollment_id: enrollmentId,
            subject_id: subjectId,
            release_after_days: releaseAfterDays,
            notes: notes || null,
            bypass_exam_requirement: bypassExamRequirement,
          },
          { onConflict: "enrollment_id,subject_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["subject-release-overrides", subjectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["all-subjects-release-status"],
      });
      queryClient.invalidateQueries({
        queryKey: ["subject-release-status"],
      });
      toast.success("Liberação individual salva!");
      setEditingEnrollment(null);
    },
    onError: () => {
      toast.error("Erro ao salvar");
    },
  });

  // Delete override mutation
  const deleteMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      const { error } = await supabase
        .from("enrollment_subject_overrides")
        .delete()
        .eq("id", overrideId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["subject-release-overrides", subjectId],
      });
      toast.success("Liberação individual removida!");
    },
    onError: () => {
      toast.error("Erro ao remover");
    },
  });

  const handleEdit = (enrollment: EnrollmentWithOverride) => {
    setEditingEnrollment(enrollment.enrollmentId);
    setEditDays(enrollment.override?.release_after_days ?? defaultReleaseAfterDays);
    setEditNotes(enrollment.override?.notes || "");
    setEditBypassExam(enrollment.override?.bypass_exam_requirement ?? false);
  };

  const handleSave = (enrollmentId: string) => {
    upsertMutation.mutate({
      enrollmentId,
      releaseAfterDays: editDays,
      notes: editNotes,
      bypassExamRequirement: editBypassExam,
    });
  };

  const handleCancel = () => {
    setEditingEnrollment(null);
    setEditDays(0);
    setEditNotes("");
    setEditBypassExam(false);
  };

  const calculateReleaseDate = (enrolledAt: string, days: number) => {
    const date = new Date(enrolledAt);
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString("pt-BR");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Liberação Individual - {subjectTitle}
          </DialogTitle>
          <DialogDescription>
            Configure liberações personalizadas para alunos específicos. O padrão é {defaultReleaseAfterDays} dia(s) após a matrícula.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : enrollments && enrollments.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aluno</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Liberação</TableHead>
                <TableHead>Ignorar Prova</TableHead>
                <TableHead>Observações</TableHead>
                <TableHead className="w-[120px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.map((enrollment) => {
                const isEditing = editingEnrollment === enrollment.enrollmentId;
                const currentDays = enrollment.override?.release_after_days ?? defaultReleaseAfterDays;
                const hasOverride = !!enrollment.override;
                const hasBypass = enrollment.override?.bypass_exam_requirement ?? false;

                return (
                  <TableRow key={enrollment.enrollmentId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{enrollment.userName}</p>
                          <p className="text-xs text-muted-foreground">{enrollment.userEmail}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(enrollment.enrolledAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min={0}
                          value={editDays}
                          onChange={(e) => setEditDays(Number(e.target.value))}
                          className="w-20"
                        />
                      ) : (
                        <span className={hasOverride ? "font-medium text-primary" : ""}>
                          {currentDays} dia(s)
                          {hasOverride && " *"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`bypass-${enrollment.enrollmentId}`}
                            checked={editBypassExam}
                            onCheckedChange={(checked) => setEditBypassExam(!!checked)}
                          />
                        </div>
                      ) : hasBypass ? (
                        <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                          <Unlock className="h-4 w-4" />
                          Sim
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">Não</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Motivo..."
                          rows={1}
                          className="min-h-[32px]"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {enrollment.override?.notes || "-"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSave(enrollment.enrollmentId)}
                            disabled={upsertMutation.isPending}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCancel}
                          >
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(enrollment)}
                          >
                            Editar
                          </Button>
                          {hasOverride && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(enrollment.override!.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum aluno matriculado neste curso.
          </div>
        )}

        <div className="text-xs text-muted-foreground mt-4 space-y-1">
          <p>* Indica liberação personalizada diferente do padrão</p>
          <p><strong>Ignorar Prova:</strong> Libera esta matéria mesmo sem aprovação na prova anterior</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
