import { useState } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBasePath } from "@/hooks/useBasePath";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Pencil, Trash2, BookOpen, Layers, ClipboardList, FileText, Video, GripVertical, Upload, ExternalLink, FileArchive, Youtube, Type, Code, Save, Copy, Link2 } from "lucide-react";
import { LessonFormDialog } from "@/components/admin/LessonFormDialog";
import { DeleteLessonDialog } from "@/components/admin/DeleteLessonDialog";
import { ActivityFormDialog } from "@/components/admin/ActivityFormDialog";
import { DeleteActivityDialog } from "@/components/admin/DeleteActivityDialog";
import { ExamFormDialog } from "@/components/admin/ExamFormDialog";
import { DeleteExamDialog } from "@/components/admin/DeleteExamDialog";
import { AssignmentFormDialog } from "@/components/admin/AssignmentFormDialog";
import { DeleteAssignmentDialog } from "@/components/admin/DeleteAssignmentDialog";
import { ImportBunnyVideosDialog } from "@/components/admin/ImportBunnyVideosDialog";
import { ImportVimeoVideosDialog } from "@/components/admin/ImportVimeoVideosDialog";
import { ImportMoodleBackupDialog } from "@/components/admin/ImportMoodleBackupDialog";
import { BulkLinkActivitiesDialog } from "@/components/admin/BulkLinkActivitiesDialog";
import { CopySubjectContentDialog } from "@/components/admin/CopySubjectContentDialog";
import { EmbedVideoPlayer } from "@/components/student/EmbedVideoPlayer";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Lesson = Tables<"lessons">;

interface Activity {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  order_index: number;
  is_active: boolean;
  subject_id: string;
  lesson_id?: string | null;
}

interface Exam {
  id: string;
  title: string;
  description: string | null;
  passing_score: number;
  time_limit_minutes: number | null;
  max_attempts: number | null;
  is_active: boolean;
  course_id: string;
  subject_id: string | null;
  lesson_id: string | null;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number;
  is_active: boolean;
  course_id: string;
  subject_id: string | null;
}

export default function SubjectContent() {
  const { courseId, subjectId } = useParams<{ courseId: string; subjectId: string }>();
  const navigate = useNavigate();
  const { basePath } = useBasePath();
  const queryClient = useQueryClient();
  
  // Lesson state
  const [lessonFormOpen, setLessonFormOpen] = useState(false);
  const [lessonDeleteOpen, setLessonDeleteOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  
  // Activity state
  const [activityFormOpen, setActivityFormOpen] = useState(false);
  const [activityDeleteOpen, setActivityDeleteOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  
  // Exam state
  const [examFormOpen, setExamFormOpen] = useState(false);
  const [examDeleteOpen, setExamDeleteOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);

  // Assignment state
  const [assignmentFormOpen, setAssignmentFormOpen] = useState(false);
  const [assignmentDeleteOpen, setAssignmentDeleteOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

  // Import state
  const [importBunnyOpen, setImportBunnyOpen] = useState(false);
  const [importVimeoOpen, setImportVimeoOpen] = useState(false);
  const [importMoodleOpen, setImportMoodleOpen] = useState(false);
  const [copySubjectOpen, setCopySubjectOpen] = useState(false);
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false);

  // Customization state
  const [welcomeVideoUrl, setWelcomeVideoUrl] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [htmlContent, setHtmlContent] = useState("");

  const deleteExamMutation = useMutation({
    mutationFn: async (examId: string) => {
      const { error } = await supabase.from('exams').delete().eq('id', examId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subject-exams', subjectId] });
      toast.success('Prova excluída!');
      setExamDeleteOpen(false);
    },
    onError: () => {
      toast.error('Erro ao excluir prova');
    },
  });

  const { data: subject, isSuccess: subjectLoaded } = useQuery({
    queryKey: ["subject", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("*, courses(title)")
        .eq("id", subjectId!)
        .single();
      if (error) throw error;
      // Initialize customization state
      setWelcomeVideoUrl((data as any).welcome_video_url || "");
      setCustomTitle((data as any).custom_title || "");
      setHtmlContent((data as any).html_content || "");
      return data;
    },
    enabled: !!subjectId,
  });

  const saveCustomizationMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("subjects")
        .update({
          welcome_video_url: welcomeVideoUrl || null,
          custom_title: customTitle || null,
          html_content: htmlContent || null,
        })
        .eq("id", subjectId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subject", subjectId] });
      toast.success("Personalização salva!");
    },
    onError: () => {
      toast.error("Erro ao salvar personalização");
    },
  });

  const { data: lessons = [] } = useQuery({
    queryKey: ["lessons", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("*")
        .eq("subject_id", subjectId!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!subjectId,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["activities", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("subject_id", subjectId!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data as unknown as Activity[];
    },
    enabled: !!subjectId,
  });

  const { data: exams = [] } = useQuery({
    queryKey: ["subject-exams", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("*")
        .eq("subject_id", subjectId!);
      if (error) throw error;
      return data as Exam[];
    },
    enabled: !!subjectId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["subject-assignments", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .eq("subject_id", subjectId!);
      if (error) throw error;
      return data as Assignment[];
    },
    enabled: !!subjectId,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`${basePath}/courses/${courseId}/subjects`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{subject?.title}</h1>
            <p className="text-muted-foreground">{(subject as any)?.courses?.title}</p>
          </div>
          <Button variant="outline" onClick={() => setCopySubjectOpen(true)}>
            <Copy className="h-4 w-4 mr-2" />
            Copiar para outro curso
          </Button>
        </div>

        {/* Apostila Section */}
        {(subject as any)?.handout_url && (
          <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <FileText className="h-5 w-5 text-blue-600" />
                <div className="flex-1">
                  <h3 className="font-medium">Apostila da Matéria</h3>
                  <p className="text-sm text-muted-foreground">Material de apoio em PDF</p>
                </div>
                <Button variant="outline" asChild>
                  <a href={(subject as any).handout_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visualizar Apostila
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Show customization only for certificate instruction subjects */}
        {(subject as any)?.is_certificate_instructions ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Type className="h-5 w-5" />
                Personalização da Matéria
              </CardTitle>
              <CardDescription>
                Configure o visual personalizado para esta matéria de instruções de certificado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* YouTube Video */}
              <div className="space-y-2">
                <Label htmlFor="welcome-video" className="flex items-center gap-2">
                  <Youtube className="h-4 w-4 text-red-500" />
                  Vídeo de Boas-vindas (Embed)
                </Label>
                <Input
                  id="welcome-video"
                  placeholder="URL do vídeo ou código <iframe ...> de qualquer player"
                  value={welcomeVideoUrl}
                  onChange={(e) => setWelcomeVideoUrl(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Aceita YouTube, Vimeo, Bunny ou código embed (iframe) de qualquer plataforma
                </p>
                {welcomeVideoUrl && (
                  <div className="mt-4 max-w-md">
                    <EmbedVideoPlayer videoUrl={welcomeVideoUrl} title="Vídeo de Boas-vindas" />
                  </div>
                )}
              </div>

              {/* Custom Title */}
              <div className="space-y-2">
                <Label htmlFor="custom-title" className="flex items-center gap-2">
                  <Type className="h-4 w-4" />
                  Título Personalizado
                </Label>
                <Input
                  id="custom-title"
                  placeholder="Ex: 🎉 Parabéns! Você concluiu o curso"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Título grande exibido na página da matéria
                </p>
              </div>

              {/* HTML Content */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="html-content" className="flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Conteúdo HTML
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {htmlContent.length.toLocaleString('pt-BR')} caracteres
                  </span>
                </div>
                <Textarea
                  id="html-content"
                  placeholder="<h2>Título</h2><p>Conteúdo em HTML...</p>"
                  rows={10}
                  className="font-mono text-sm"
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  HTML personalizado exibido na página. Suporta iframes do YouTube, imagens, etc.
                </p>
              </div>

              {/* Preview */}
              {(customTitle || htmlContent) && (
                <div className="space-y-2">
                  <Label>Prévia</Label>
                  <Card className="bg-muted/50">
                    <CardContent className="pt-6 space-y-4">
                      {customTitle && (
                        <h2 className="text-2xl font-bold text-center">{customTitle}</h2>
                      )}
                      {htmlContent && (
                        <div 
                          className="prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }} 
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button 
                  onClick={() => saveCustomizationMutation.mutate()}
                  disabled={saveCustomizationMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveCustomizationMutation.isPending ? "Salvando..." : "Salvar Personalização"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="lessons" className="space-y-4">
            <TabsList className="grid grid-cols-5 w-full max-w-3xl">
              <TabsTrigger value="lessons" className="gap-2">
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Aulas</span> ({lessons.length})
              </TabsTrigger>
              <TabsTrigger value="activities" className="gap-2">
                <Layers className="h-4 w-4" />
                <span className="hidden sm:inline">Exercícios</span> ({activities.length})
              </TabsTrigger>
              <TabsTrigger value="assignments" className="gap-2">
                <ClipboardList className="h-4 w-4" />
                <span className="hidden sm:inline">Trabalhos</span> ({assignments.length})
              </TabsTrigger>
              <TabsTrigger value="exams" className="gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Provas</span> ({exams.length})
              </TabsTrigger>
              <TabsTrigger value="customization" className="gap-2">
                <Type className="h-4 w-4" />
                <span className="hidden sm:inline">Personalização</span>
              </TabsTrigger>
            </TabsList>

          {/* Lessons Tab */}
          <TabsContent value="lessons" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportVimeoOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Importar do Vimeo
              </Button>
              <Button variant="outline" onClick={() => setImportBunnyOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Importar do Bunny
              </Button>
              <Button onClick={() => { setSelectedLesson(null); setLessonFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Aula
              </Button>
            </div>
            
            {lessons.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhuma aula cadastrada nesta matéria.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {lessons.map((lesson, index) => {
                  const lessonActivities = activities.filter(a => a.lesson_id === lesson.id);
                  return (
                    <div key={lesson.id} className="space-y-1">
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0 cursor-move" />
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
                            {lesson.video_url && <Video className="h-4 w-4 text-muted-foreground" />}
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" onClick={() => { setSelectedLesson(lesson); setLessonFormOpen(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => { setSelectedLesson(lesson); setLessonDeleteOpen(true); }}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      {/* Show linked activities/exercises */}
                      {lessonActivities.map((activity) => (
                        <Card key={activity.id} className="ml-12 border-l-4 border-l-blue-400">
                          <CardContent className="p-3">
                            <div className="flex items-center gap-3">
                              <Layers className="h-4 w-4 text-blue-500" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{activity.title}</span>
                                  <Badge variant="outline" className="text-xs">Exercício</Badge>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedActivity(activity); setActivityFormOpen(true); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Activities/Exercises Tab */}
          <TabsContent value="activities" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkLinkOpen(true)}>
                <Link2 className="h-4 w-4 mr-2" />
                Vincular em Lote
              </Button>
              <Button variant="outline" onClick={() => setImportMoodleOpen(true)}>
                <FileArchive className="h-4 w-4 mr-2" />
                Importar do Moodle
              </Button>
              <Button onClick={() => { setSelectedActivity(null); setActivityFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Exercício
              </Button>
            </div>
            
            {activities.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum exercício cadastrado nesta matéria.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {activities.map((activity, index) => {
                  const linkedLesson = lessons.find(l => l.id === activity.lesson_id);
                  return (
                    <Card key={activity.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm flex-shrink-0 dark:bg-blue-900 dark:text-blue-300">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium truncate">{activity.title}</h3>
                              <Badge variant={activity.is_active ? "default" : "secondary"}>
                                {activity.is_active ? "Ativo" : "Inativo"}
                              </Badge>
                              {linkedLesson && (
                                <Badge variant="outline" className="text-xs">
                                  Aula: {linkedLesson.title}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {activity.description || "Sem descrição"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => navigate(`${basePath}/courses/${courseId}/subjects/${subjectId}/activities/${activity.id}/questions`)}
                            >
                              Questões
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedActivity(activity); setActivityFormOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedActivity(activity); setActivityDeleteOpen(true); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Assignments Tab */}
          <TabsContent value="assignments" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => { setSelectedAssignment(null); setAssignmentFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Trabalho
              </Button>
            </div>
            
            {assignments.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum trabalho cadastrado nesta matéria.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {assignments.map((assignment) => (
                  <Card key={assignment.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <ClipboardList className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium truncate">{assignment.title}</h3>
                            <Badge variant={assignment.is_active ? "default" : "secondary"}>
                              {assignment.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Nota máxima: {assignment.max_score} pontos
                            {assignment.due_date && ` • Entrega: ${new Date(assignment.due_date).toLocaleDateString('pt-BR')}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedAssignment(assignment); setAssignmentFormOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedAssignment(assignment); setAssignmentDeleteOpen(true); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Exams Tab */}
          <TabsContent value="exams" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => { setSelectedExam(null); setExamFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Prova
              </Button>
            </div>
            
            {exams.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhuma prova cadastrada nesta matéria.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {exams.map((exam) => (
                  <Card key={exam.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium truncate">{exam.title}</h3>
                            <Badge variant={exam.is_active ? "default" : "secondary"}>
                              {exam.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Nota mínima: {exam.passing_score}%
                            {exam.time_limit_minutes && ` • ${exam.time_limit_minutes} min`}
                            {exam.max_attempts && ` • ${exam.max_attempts} tentativas`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => navigate(`${basePath}/courses/${courseId}/exams/${exam.id}/questions`)}
                          >
                            Questões
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedExam(exam); setExamFormOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedExam(exam); setExamDeleteOpen(true); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Customization Tab */}
          <TabsContent value="customization" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Type className="h-5 w-5" />
                  Personalização da Matéria
                </CardTitle>
                <CardDescription>
                  Configure o visual personalizado para esta matéria. Útil para matérias de instruções de certificado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* YouTube Video */}
                <div className="space-y-2">
                  <Label htmlFor="welcome-video" className="flex items-center gap-2">
                    <Youtube className="h-4 w-4 text-red-500" />
                    Vídeo de Boas-vindas (Embed)
                  </Label>
                  <Input
                    id="welcome-video"
                    placeholder="URL do vídeo ou código <iframe ...> de qualquer player"
                    value={welcomeVideoUrl}
                    onChange={(e) => setWelcomeVideoUrl(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Aceita YouTube, Vimeo, Bunny ou código embed (iframe) de qualquer plataforma
                  </p>
                  {welcomeVideoUrl && (
                    <div className="mt-4 max-w-md">
                      <EmbedVideoPlayer videoUrl={welcomeVideoUrl} title="Vídeo de Boas-vindas" />
                    </div>
                  )}
                </div>

                {/* Custom Title */}
                <div className="space-y-2">
                  <Label htmlFor="custom-title" className="flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    Título Personalizado
                  </Label>
                  <Input
                    id="custom-title"
                    placeholder="Ex: 🎉 Parabéns! Você concluiu o curso"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Título grande exibido na página da matéria
                  </p>
                </div>

                {/* HTML Content */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="html-content" className="flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      Conteúdo HTML
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {htmlContent.length.toLocaleString('pt-BR')} caracteres
                    </span>
                  </div>
                  <Textarea
                    id="html-content"
                    placeholder="<h2>Título</h2><p>Conteúdo em HTML...</p>"
                    rows={10}
                    className="font-mono text-sm"
                    value={htmlContent}
                    onChange={(e) => setHtmlContent(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    HTML personalizado exibido na página. Suporta iframes do YouTube, imagens, etc.
                  </p>
                </div>

                {/* Preview */}
                {(customTitle || htmlContent) && (
                  <div className="space-y-2">
                    <Label>Prévia</Label>
                    <Card className="bg-muted/50">
                      <CardContent className="pt-6 space-y-4">
                        {customTitle && (
                          <h2 className="text-2xl font-bold text-center">{customTitle}</h2>
                        )}
                        {htmlContent && (
                          <div 
                            className="prose prose-sm max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }} 
                          />
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={() => saveCustomizationMutation.mutate()}
                    disabled={saveCustomizationMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saveCustomizationMutation.isPending ? "Salvando..." : "Salvar Personalização"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        )}
      </div>

      {/* Dialogs */}
      <LessonFormDialog
        open={lessonFormOpen}
        onOpenChange={setLessonFormOpen}
        lesson={selectedLesson}
        courseId={courseId!}
        subjectId={subjectId!}
        nextOrderIndex={lessons.length}
      />

      <DeleteLessonDialog
        open={lessonDeleteOpen}
        onOpenChange={setLessonDeleteOpen}
        lesson={selectedLesson}
      />

      <ActivityFormDialog
        open={activityFormOpen}
        onOpenChange={setActivityFormOpen}
        activity={selectedActivity}
        subjectId={subjectId!}
        nextOrderIndex={activities.length}
      />

      <DeleteActivityDialog
        open={activityDeleteOpen}
        onOpenChange={setActivityDeleteOpen}
        activity={selectedActivity ? { ...selectedActivity, subject_id: subjectId! } : null}
      />

      <ExamFormDialog
        open={examFormOpen}
        onOpenChange={setExamFormOpen}
        exam={selectedExam}
        courseId={courseId!}
        subjectId={subjectId!}
      />

      <DeleteExamDialog
        open={examDeleteOpen}
        onOpenChange={setExamDeleteOpen}
        examTitle={selectedExam?.title || ''}
        onConfirm={() => selectedExam && deleteExamMutation.mutate(selectedExam.id)}
        isDeleting={deleteExamMutation.isPending}
      />

      <AssignmentFormDialog
        open={assignmentFormOpen}
        onOpenChange={setAssignmentFormOpen}
        assignment={selectedAssignment}
        courseId={courseId!}
        subjectId={subjectId!}
      />

      <DeleteAssignmentDialog
        open={assignmentDeleteOpen}
        onOpenChange={setAssignmentDeleteOpen}
        assignment={selectedAssignment}
      />

      <ImportBunnyVideosDialog
        open={importBunnyOpen}
        onOpenChange={setImportBunnyOpen}
        subjectId={subjectId!}
        courseId={courseId!}
        currentLessonCount={lessons.length}
      />

      <ImportVimeoVideosDialog
        open={importVimeoOpen}
        onOpenChange={setImportVimeoOpen}
        subjectId={subjectId!}
        courseId={courseId!}
        currentLessonCount={lessons.length}
      />

      <ImportMoodleBackupDialog
        open={importMoodleOpen}
        onOpenChange={setImportMoodleOpen}
        subjectId={subjectId!}
        courseId={courseId!}
        lessons={lessons.map(l => ({ id: l.id, title: l.title }))}
        activities={activities.map(a => ({ id: a.id, title: a.title, lesson_id: a.lesson_id }))}
      />

      <CopySubjectContentDialog
        open={copySubjectOpen}
        onOpenChange={setCopySubjectOpen}
        sourceSubjectId={subjectId!}
        sourceSubjectTitle={subject?.title || ""}
        sourceCourseId={courseId!}
      />

      <BulkLinkActivitiesDialog
        open={bulkLinkOpen}
        onOpenChange={setBulkLinkOpen}
        activities={activities.map(a => ({ id: a.id, title: a.title, lesson_id: a.lesson_id }))}
        lessons={lessons.map(l => ({ id: l.id, title: l.title }))}
        subjectId={subjectId!}
      />
    </DashboardLayout>
  );
}
