import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, FileArchive, CheckCircle, AlertCircle, Loader2, BookOpen, Layers, Link2, ArrowRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface ParsedQuestion {
  questionText: string;
  points: number;
  options: { text: string; isCorrect: boolean }[];
  quizName?: string;
  quizId?: string;
}

interface QuizInfo {
  id: string;
  name: string;
  questionCount: number;
}

interface ParsedResult {
  quizzes: QuizInfo[];
  questions: ParsedQuestion[];
  totalQuestions: number;
}

interface Lesson {
  id: string;
  title: string;
}

interface Activity {
  id: string;
  title: string;
  lesson_id?: string | null;
}

interface QuizLessonMapping {
  quizId: string;
  quizName: string;
  lessonId: string | null;
  autoMatched: boolean;
}

interface ImportMoodleBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  courseId: string;
  lessons: Lesson[];
  activities: Activity[];
}

// Extract leading number from quiz name (e.g., "01" from "01 - Fixando o Aprendizado")
function extractLeadingNumber(str: string): number | null {
  const match = str.trim().match(/^(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

// Extract leading number from lesson title (e.g., "01" from "Aula 01 - Introdução" or "01 - Introdução")
function extractLessonNumber(title: string): number | null {
  // Try patterns: "01 - ...", "Aula 01", "Aula 01 -", etc.
  const patterns = [
    /^(\d+)\s*[-–:.]/, // "01 - ..." or "01: ..."
    /^aula\s*(\d+)/i,  // "Aula 01"
    /(\d+)/,           // Any number in the title
  ];
  
  for (const pattern of patterns) {
    const match = title.trim().match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}

interface LessonWithIndex extends Lesson {
  orderIndex?: number;
}

// Find best matching lesson for a quiz name based on leading number
function findBestMatch(quizName: string, lessons: LessonWithIndex[]): { lessonId: string | null; matched: boolean } {
  const quizNumber = extractLeadingNumber(quizName);
  
  if (quizNumber === null) {
    return { lessonId: null, matched: false };
  }
  
  // First, try to match by lesson title number
  for (const lesson of lessons) {
    const lessonNumber = extractLessonNumber(lesson.title);
    if (lessonNumber === quizNumber) {
      return { lessonId: lesson.id, matched: true };
    }
  }
  
  // Second, try to match by order_index (1-based: quiz "01" = lesson at index 0)
  const lessonByOrder = lessons.find(l => l.orderIndex === quizNumber - 1);
  if (lessonByOrder) {
    return { lessonId: lessonByOrder.id, matched: true };
  }
  
  return { lessonId: null, matched: false };
}

export function ImportMoodleBackupDialog({ 
  open, 
  onOpenChange, 
  subjectId, 
  courseId,
  lessons,
  activities 
}: ImportMoodleBackupDialogProps) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  
  // Quiz to lesson mappings
  const [mappings, setMappings] = useState<QuizLessonMapping[]>([]);

  // Auto-match quizzes to lessons when parsed result changes
  useEffect(() => {
    if (parsedResult && parsedResult.quizzes.length > 0) {
      // Need to fetch lessons with order_index for matching
      const fetchLessonsWithOrder = async () => {
        const { data: lessonsWithOrder } = await supabase
          .from('lessons')
          .select('id, title, order_index')
          .eq('subject_id', subjectId)
          .order('order_index');
        
        const lessonsData = lessonsWithOrder || lessons.map((l, idx) => ({ ...l, orderIndex: idx }));
        
        const newMappings: QuizLessonMapping[] = parsedResult.quizzes.map(quiz => {
          const match = findBestMatch(quiz.name, lessonsData.map(l => ({
            id: l.id,
            title: l.title,
            orderIndex: 'order_index' in l ? l.order_index : undefined,
          })));
          return {
            quizId: quiz.id,
            quizName: quiz.name,
            lessonId: match.lessonId,
            autoMatched: match.matched,
          };
        });
        setMappings(newMappings);
      };
      
      fetchLessonsWithOrder();
    }
  }, [parsedResult, lessons, subjectId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.mbz')) {
      setParseError('Por favor, selecione um arquivo .mbz (backup do Moodle).');
      setFile(null);
      setParsedResult(null);
      return;
    }

    setFile(selectedFile);
    setParseError(null);
    setIsParsing(true);
    setParsedResult(null);
    setMappings([]);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-moodle-backup`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: formData,
        }
      );

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao processar arquivo');
      }

      if (result.data.totalQuestions === 0) {
        setParseError('Nenhuma questão de múltipla escolha encontrada no arquivo.');
        setParsedResult(null);
      } else {
        setParsedResult(result.data);
      }
    } catch (error) {
      console.error('Error parsing MBZ file:', error);
      setParseError(error instanceof Error ? error.message : 'Erro ao analisar o arquivo.');
      setParsedResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  const updateMapping = (quizId: string, lessonId: string | null) => {
    setMappings(prev => prev.map(m => 
      m.quizId === quizId ? { ...m, lessonId, autoMatched: false } : m
    ));
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!parsedResult || parsedResult.questions.length === 0) {
        throw new Error('Nenhuma questão para importar');
      }

      // Get current max order_index for activities
      const { data: existingActivities } = await supabase
        .from('activities')
        .select('order_index')
        .eq('subject_id', subjectId)
        .order('order_index', { ascending: false })
        .limit(1);

      let activityOrderIndex = (existingActivities?.[0]?.order_index ?? -1) + 1;

      // Group questions by quiz
      const questionsByQuiz = new Map<string, ParsedQuestion[]>();
      for (const q of parsedResult.questions) {
        const quizId = q.quizId || 'unknown';
        if (!questionsByQuiz.has(quizId)) {
          questionsByQuiz.set(quizId, []);
        }
        questionsByQuiz.get(quizId)!.push(q);
      }

      let totalImported = 0;

      // Create an activity for each quiz and import its questions
      for (const [quizId, questions] of questionsByQuiz) {
        const mapping = mappings.find(m => m.quizId === quizId);
        const quizName = mapping?.quizName || questions[0]?.quizName || 'Exercícios Importados';
        const lessonId = mapping?.lessonId || null;

        // Create new activity
        const { data: newActivity, error: activityError } = await supabase
          .from('activities')
          .insert({
            subject_id: subjectId,
            title: `Exercícios - ${quizName}`,
            description: null,
            is_active: true,
            order_index: activityOrderIndex,
            lesson_id: lessonId,
          })
          .select('id')
          .single();

        if (activityError) throw activityError;
        activityOrderIndex++;

        // Insert questions for this activity
        let questionOrderIndex = 0;
        for (const q of questions) {
          const { data: newQuestion, error: questionError } = await supabase
            .from('questions')
            .insert({
              activity_id: newActivity.id,
              question_text: q.questionText,
              question_type: 'multiple_choice',
              points: q.points,
              order_index: questionOrderIndex,
            })
            .select('id')
            .single();

          if (questionError) throw questionError;

          // Insert options
          const optionsToInsert = q.options.map((opt, idx) => ({
            question_id: newQuestion.id,
            option_text: opt.text,
            is_correct: opt.isCorrect,
            order_index: idx,
          }));

          const { error: optionsError } = await supabase
            .from('question_options')
            .insert(optionsToInsert);

          if (optionsError) throw optionsError;

          questionOrderIndex++;
          totalImported++;
        }
      }

      return { 
        questionsCount: totalImported,
        activitiesCount: questionsByQuiz.size,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['activities', subjectId] });
      toast.success(`${data.questionsCount} questões importadas em ${data.activitiesCount} exercício(s)!`);
      handleClose();
    },
    onError: (error) => {
      console.error('Error importing questions:', error);
      toast.error('Erro ao importar questões. Tente novamente.');
    },
  });

  const handleClose = () => {
    setFile(null);
    setParsedResult(null);
    setParseError(null);
    setIsParsing(false);
    setMappings([]);
    onOpenChange(false);
  };

  // Helper function to strip HTML tags for preview
  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const matchedCount = mappings.filter(m => m.lessonId).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            Importar Backup do Moodle (.mbz)
          </DialogTitle>
          <DialogDescription>
            Faça upload de um arquivo .mbz para importar exercícios. Os quizzes serão automaticamente vinculados às aulas correspondentes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* File Input */}
          <div className="space-y-2">
            <Label htmlFor="mbz-file">Arquivo .mbz do Moodle</Label>
            <Input
              id="mbz-file"
              type="file"
              accept=".mbz"
              onChange={handleFileChange}
              className="cursor-pointer"
              disabled={isParsing}
            />
          </div>

          {/* Parsing indicator */}
          {isParsing && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm p-3 bg-muted rounded-md">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Analisando arquivo... Isso pode levar alguns segundos.</span>
            </div>
          )}

          {/* Parse Error */}
          {parseError && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-md">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Parsed Result */}
          {parsedResult && (
            <div className="flex-1 overflow-hidden flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span>{parsedResult.totalQuestions} questões em {parsedResult.quizzes.length} quiz(zes)</span>
                </div>
                {matchedCount > 0 && (
                  <Badge variant="outline" className="text-blue-600">
                    <Link2 className="h-3 w-3 mr-1" />
                    {matchedCount} vinculado(s) automaticamente
                  </Badge>
                )}
              </div>

              {/* Quiz to Lesson Mappings */}
              <div className="flex-1 overflow-hidden">
                <Label className="text-sm font-medium mb-2 block">
                  Mapeamento Quiz → Aula
                </Label>
                <ScrollArea className="h-64 border rounded-lg">
                  <div className="p-3 space-y-3">
                    {mappings.map((mapping) => {
                      const quiz = parsedResult.quizzes.find(q => q.id === mapping.quizId);
                      return (
                        <div 
                          key={mapping.quizId} 
                          className={`p-3 rounded-lg border ${mapping.autoMatched ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-muted/50'}`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Quiz Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <span className="font-medium truncate">{mapping.quizName}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {quiz?.questionCount || 0} questões
                                </Badge>
                              </div>
                            </div>

                            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

                            {/* Lesson Selector */}
                            <div className="w-64 flex-shrink-0">
                              <Select 
                                value={mapping.lessonId || 'none'} 
                                onValueChange={(value) => updateMapping(mapping.quizId, value === 'none' ? null : value)}
                              >
                                <SelectTrigger className={mapping.autoMatched ? 'border-blue-400' : ''}>
                                  <SelectValue placeholder="Selecione uma aula" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">
                                    <span className="text-muted-foreground">Sem vínculo</span>
                                  </SelectItem>
                                  {lessons.map((lesson) => (
                                    <SelectItem key={lesson.id} value={lesson.id}>
                                      <div className="flex items-center gap-2">
                                        <BookOpen className="h-3 w-3" />
                                        {lesson.title}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          {mapping.autoMatched && (
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 ml-6">
                              ✓ Vinculado automaticamente por similaridade de nome
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Summary */}
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p>
                  <strong>Resumo:</strong> Serão criados {parsedResult.quizzes.length} exercício(s) 
                  com {parsedResult.totalQuestions} questões no total.
                  {matchedCount > 0 && ` ${matchedCount} já vinculado(s) às aulas correspondentes.`}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={!parsedResult || parsedResult.questions.length === 0 || importMutation.isPending}
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              `Importar ${parsedResult?.totalQuestions || 0} Questões`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
