import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Link2, Layers, BookOpen, Unlink, Wand2, ArrowRight, CheckCircle2 } from "lucide-react";

interface Activity {
  id: string;
  title: string;
  lesson_id: string | null;
}

interface Lesson {
  id: string;
  title: string;
}

interface BulkLinkActivitiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activities: Activity[];
  lessons: Lesson[];
  subjectId: string;
}

// Extract numbers from a string
function extractNumbers(text: string): number[] {
  const matches = text.match(/\d+/g);
  return matches ? matches.map(Number) : [];
}

// Find the best matching lesson for an activity based on numbers
function findMatchingLesson(activity: Activity, lessons: Lesson[]): Lesson | null {
  const activityNumbers = extractNumbers(activity.title);
  
  if (activityNumbers.length === 0) return null;
  
  // Try to find a lesson with matching numbers
  for (const num of activityNumbers) {
    const matchingLesson = lessons.find((lesson) => {
      const lessonNumbers = extractNumbers(lesson.title);
      return lessonNumbers.includes(num);
    });
    
    if (matchingLesson) return matchingLesson;
  }
  
  // Also try matching by order (e.g., "Exercício 1" -> first lesson)
  const firstNumber = activityNumbers[0];
  if (firstNumber >= 1 && firstNumber <= lessons.length) {
    return lessons[firstNumber - 1]; // 1-indexed to 0-indexed
  }
  
  return null;
}

export function BulkLinkActivitiesDialog({
  open,
  onOpenChange,
  activities,
  lessons,
  subjectId,
}: BulkLinkActivitiesDialogProps) {
  const queryClient = useQueryClient();
  const [isLinking, setIsLinking] = useState(false);

  // Calculate automatic matches
  const autoMatches = useMemo(() => {
    return activities.map((activity) => {
      const matchingLesson = findMatchingLesson(activity, lessons);
      return {
        activity,
        matchingLesson,
        currentLesson: lessons.find((l) => l.id === activity.lesson_id) || null,
        willChange: matchingLesson && matchingLesson.id !== activity.lesson_id,
      };
    });
  }, [activities, lessons]);

  const matchesToApply = autoMatches.filter((m) => m.willChange && m.matchingLesson);
  const alreadyLinked = autoMatches.filter((m) => m.matchingLesson && m.matchingLesson.id === m.activity.lesson_id);
  const noMatch = autoMatches.filter((m) => !m.matchingLesson);

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (matchesToApply.length === 0) {
        throw new Error("Nenhuma vinculação para aplicar");
      }

      // Update each activity with its matching lesson
      for (const match of matchesToApply) {
        if (match.matchingLesson) {
          const { error } = await supabase
            .from("activities")
            .update({ lesson_id: match.matchingLesson.id })
            .eq("id", match.activity.id);

          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities", subjectId] });
      toast.success(`${matchesToApply.length} exercício(s) vinculados automaticamente!`);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao vincular exercícios");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Vinculação Automática de Exercícios
          </DialogTitle>
          <DialogDescription>
            Os exercícios serão vinculados automaticamente às aulas com base no número presente no título.
            <br />
            <span className="text-xs text-muted-foreground">
              Ex: "Exercício 1" → "Aula 1", "Atividade 3" → "Aula 3"
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <Link2 className="h-4 w-4" />
                <span className="font-medium">{matchesToApply.length}</span>
              </div>
              <p className="text-xs text-green-600 dark:text-green-500 mt-1">Serão vinculados</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">{alreadyLinked.length}</span>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">Já vinculados corretamente</p>
            </div>
            <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <Unlink className="h-4 w-4" />
                <span className="font-medium">{noMatch.length}</span>
              </div>
              <p className="text-xs text-orange-600 dark:text-orange-500 mt-1">Sem correspondência</p>
            </div>
          </div>

          {/* Preview list */}
          <ScrollArea className="h-[350px] border rounded-md">
            <div className="p-4 space-y-2">
              {/* Activities that will be linked */}
              {matchesToApply.length > 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Serão vinculados:
                  </p>
                  {matchesToApply.map(({ activity, matchingLesson, currentLesson }) => (
                    <div
                      key={activity.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                    >
                      <Layers className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="font-medium truncate">{activity.title}</span>
                        {currentLesson && (
                          <Badge variant="secondary" className="text-xs line-through">
                            {currentLesson.title}
                          </Badge>
                        )}
                        <ArrowRight className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <Badge variant="default" className="bg-green-600">
                          <BookOpen className="h-3 w-3 mr-1" />
                          {matchingLesson?.title}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Activities already linked correctly */}
              {alreadyLinked.length > 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Já vinculados corretamente:
                  </p>
                  {alreadyLinked.map(({ activity, matchingLesson }) => (
                    <div
                      key={activity.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 opacity-70"
                    >
                      <Layers className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="font-medium truncate">{activity.title}</span>
                        <ArrowRight className="h-4 w-4 text-blue-400 flex-shrink-0" />
                        <Badge variant="outline" className="text-xs">
                          <BookOpen className="h-3 w-3 mr-1" />
                          {matchingLesson?.title}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Activities without match */}
              {noMatch.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-400 flex items-center gap-2">
                    <Unlink className="h-4 w-4" />
                    Sem correspondência automática:
                  </p>
                  {noMatch.map(({ activity }) => (
                    <div
                      key={activity.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 opacity-70"
                    >
                      <Layers className="h-4 w-4 text-orange-600 flex-shrink-0" />
                      <span className="font-medium truncate">{activity.title}</span>
                      <Badge variant="secondary" className="text-xs ml-auto">
                        Nenhum número encontrado
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {activities.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum exercício disponível nesta matéria.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => linkMutation.mutate()}
            disabled={linkMutation.isPending || matchesToApply.length === 0}
          >
            {linkMutation.isPending ? (
              "Vinculando..."
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Vincular {matchesToApply.length} exercício(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
