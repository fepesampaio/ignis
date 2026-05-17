import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ParsedQuestion {
  questionText: string;
  points: number;
  options: { text: string; isCorrect: boolean }[];
}

interface ImportMoodleQuestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
}

export function ImportMoodleQuestionsDialog({ open, onOpenChange, examId }: ImportMoodleQuestionsDialogProps) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const parseXML = (xmlString: string): ParsedQuestion[] => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    // Check for parse errors
    const parseErrors = xmlDoc.getElementsByTagName('parsererror');
    if (parseErrors.length > 0) {
      throw new Error('Erro ao analisar o arquivo XML. Verifique se o formato está correto.');
    }

    const questions: ParsedQuestion[] = [];
    const questionElements = xmlDoc.querySelectorAll('question[type="multichoice"]');

    questionElements.forEach((questionEl) => {
      // Get question text
      const questionTextEl = questionEl.querySelector('questiontext text');
      let questionText = questionTextEl?.textContent || '';
      
      // Clean up CDATA and basic HTML
      questionText = questionText.trim();

      // Get points (defaultgrade)
      const defaultGradeEl = questionEl.querySelector('defaultgrade');
      const points = Math.max(1, Math.round(parseFloat(defaultGradeEl?.textContent || '1')));

      // Get options
      const answerElements = questionEl.querySelectorAll('answer');
      const options: { text: string; isCorrect: boolean }[] = [];

      answerElements.forEach((answerEl) => {
        const fraction = parseFloat(answerEl.getAttribute('fraction') || '0');
        const textEl = answerEl.querySelector('text');
        let optionText = textEl?.textContent || '';
        optionText = optionText.trim();

        // If no text found, try to get from CDATA or direct content
        if (!optionText) {
          const answerTextNode = answerEl.querySelector('text');
          if (answerTextNode) {
            // Try getting innerHTML for CDATA content
            optionText = answerTextNode.innerHTML?.trim() || answerTextNode.textContent?.trim() || '';
          }
        }

        if (optionText) {
          options.push({
            text: optionText,
            // Consider correct if fraction > 0 (handles both 1, 50, 100 formats)
            isCorrect: fraction > 0,
          });
        }
      });

      // Only add questions with at least 2 options
      if (questionText && options.length >= 2) {
        questions.push({
          questionText,
          points,
          options,
        });
      }
    });

    return questions;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.xml')) {
      setParseError('Por favor, selecione um arquivo XML do Moodle.');
      setFile(null);
      setParsedQuestions([]);
      return;
    }

    setFile(selectedFile);
    setParseError(null);

    try {
      const content = await selectedFile.text();
      const questions = parseXML(content);
      
      if (questions.length === 0) {
        setParseError('Nenhuma questão de múltipla escolha encontrada no arquivo.');
        setParsedQuestions([]);
      } else {
        setParsedQuestions(questions);
      }
    } catch (error) {
      console.error('Error parsing XML:', error);
      setParseError(error instanceof Error ? error.message : 'Erro ao analisar o arquivo.');
      setParsedQuestions([]);
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (parsedQuestions.length === 0) {
        throw new Error('Nenhuma questão para importar');
      }

      // Get current max order_index
      const { data: existingQuestions } = await supabase
        .from('questions')
        .select('order_index')
        .eq('exam_id', examId)
        .order('order_index', { ascending: false })
        .limit(1);

      let currentOrderIndex = (existingQuestions?.[0]?.order_index ?? -1) + 1;

      // Insert questions one by one to get their IDs
      for (const q of parsedQuestions) {
        const { data: newQuestion, error: questionError } = await supabase
          .from('questions')
          .insert({
            exam_id: examId,
            question_text: q.questionText,
            question_type: 'multiple_choice',
            points: q.points,
            order_index: currentOrderIndex,
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

        currentOrderIndex++;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-exam-questions', examId] });
      toast.success(`${parsedQuestions.length} questões importadas com sucesso!`);
      handleClose();
    },
    onError: (error) => {
      console.error('Error importing questions:', error);
      toast.error('Erro ao importar questões. Tente novamente.');
    },
  });

  const handleClose = () => {
    setFile(null);
    setParsedQuestions([]);
    setParseError(null);
    onOpenChange(false);
  };

  // Helper function to strip HTML tags for preview
  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Questões do Moodle
          </DialogTitle>
          <DialogDescription>
            Selecione um arquivo XML exportado do Moodle com questões de múltipla escolha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* File Input */}
          <div className="space-y-2">
            <Label htmlFor="xml-file">Arquivo XML do Moodle</Label>
            <Input
              id="xml-file"
              type="file"
              accept=".xml"
              onChange={handleFileChange}
              className="cursor-pointer"
            />
          </div>

          {/* Parse Error */}
          {parseError && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-md">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Parsed Questions Preview */}
          {parsedQuestions.length > 0 && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-2">
                <CheckCircle className="h-4 w-4" />
                <span>{parsedQuestions.length} questões encontradas</span>
              </div>
              
              <ScrollArea className="flex-1 border rounded-md p-3">
                <div className="space-y-3">
                  {parsedQuestions.map((q, index) => (
                    <div key={index} className="p-3 bg-muted rounded-md">
                      <div className="flex items-start gap-2 mb-2">
                        <FileText className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium mb-1">
                            Questão {index + 1} ({q.points} ponto{q.points > 1 ? 's' : ''})
                          </p>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {stripHtml(q.questionText)}
                          </p>
                        </div>
                      </div>
                      <div className="ml-6 space-y-1">
                        {q.options.map((opt, optIdx) => (
                          <div
                            key={optIdx}
                            className={`text-xs px-2 py-1 rounded ${
                              opt.isCorrect
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                : 'bg-background'
                            }`}
                          >
                            {String.fromCharCode(65 + optIdx)}) {stripHtml(opt.text).substring(0, 60)}
                            {stripHtml(opt.text).length > 60 ? '...' : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={parsedQuestions.length === 0 || importMutation.isPending}
          >
            {importMutation.isPending ? 'Importando...' : `Importar ${parsedQuestions.length} Questões`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
