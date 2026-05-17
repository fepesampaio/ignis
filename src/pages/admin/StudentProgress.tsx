import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { 
  Search, 
  User, 
  BookOpen, 
  FileText, 
  CheckCircle2, 
  Circle,
  Loader2,
  GraduationCap,
  ClipboardList,
  Save,
  RefreshCw,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface StudentEnrollment {
  id: string;
  course_id: string;
  user_id: string;
  is_migrated: boolean;
  enrolled_at: string;
  courses: {
    id: string;
    title: string;
  };
}

interface ProgressItem {
  id: string;
  title: string;
  type: 'lesson' | 'activity' | 'exam' | 'assignment';
  completed: boolean;
  subject_id: string;
  subject_title: string;
}

export default function StudentProgress() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string; email: string } | null>(null);
  const [selectedEnrollment, setSelectedEnrollment] = useState<StudentEnrollment | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Search students with enrollment count
  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ['admin-students-search', searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];

      // Search profiles
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, cpf')
        .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,cpf.ilike.%${searchTerm}%`)
        .limit(20);

      if (error) throw error;
      if (!profiles || profiles.length === 0) return [];

      // Get enrollment count for each student in parallel
      const userIds = profiles.map(p => p.user_id);
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('user_id, course_id')
        .in('user_id', userIds)
        .eq('is_active', true);

      // Count enrollments per user
      const enrollmentCountMap = new Map<string, number>();
      enrollments?.forEach(e => {
        const count = enrollmentCountMap.get(e.user_id) || 0;
        enrollmentCountMap.set(e.user_id, count + 1);
      });

      // Merge enrollment count into profiles
      return profiles.map(p => ({
        ...p,
        enrollmentCount: enrollmentCountMap.get(p.user_id) || 0,
      }));
    },
    enabled: searchTerm.length >= 2,
  });

  // Fetch student enrollments
  const { data: enrollments, isLoading: loadingEnrollments } = useQuery({
    queryKey: ['student-enrollments', selectedStudent?.id],
    queryFn: async () => {
      if (!selectedStudent) return [];

      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          id,
          course_id,
          user_id,
          is_migrated,
          enrolled_at,
          courses (id, title)
        `)
        .eq('user_id', selectedStudent.id)
        .eq('is_active', true);

      if (error) throw error;
      return data as unknown as StudentEnrollment[];
    },
    enabled: !!selectedStudent,
  });

  // Fetch course content (subjects, lessons, activities, exams, assignments)
  const { data: courseContent, isLoading: loadingContent } = useQuery({
    queryKey: ['course-content-for-progress', selectedEnrollment?.course_id],
    queryFn: async () => {
      if (!selectedEnrollment) return null;

      const courseId = selectedEnrollment.course_id;

      // Fetch all in parallel
      const [subjectsRes, lessonsRes, activitiesRes, examsRes, assignmentsRes] = await Promise.all([
        supabase.from('subjects').select('id, title, order_index').eq('course_id', courseId).eq('is_active', true).eq('is_certificate_instructions', false).order('order_index'),
        supabase.from('lessons').select('id, title, subject_id, order_index').eq('course_id', courseId).eq('is_active', true).order('order_index'),
        supabase.from('activities').select('id, title, subject_id, order_index').order('order_index'),
        supabase.from('exams').select('id, title, subject_id').eq('course_id', courseId).eq('is_active', true),
        supabase.from('assignments').select('id, title, subject_id').eq('course_id', courseId).eq('is_active', true),
      ]);

      // Filter activities by subject IDs in this course
      const subjectIds = subjectsRes.data?.map(s => s.id) || [];
      const filteredActivities = activitiesRes.data?.filter(a => a.subject_id && subjectIds.includes(a.subject_id)) || [];

      return {
        subjects: subjectsRes.data || [],
        lessons: lessonsRes.data || [],
        activities: filteredActivities,
        exams: examsRes.data || [],
        assignments: assignmentsRes.data || [],
      };
    },
    enabled: !!selectedEnrollment,
  });

  // Fetch current progress
  const { data: currentProgress, isLoading: loadingProgress, refetch: refetchProgress } = useQuery({
    queryKey: ['student-progress', selectedStudent?.id, selectedEnrollment?.course_id],
    queryFn: async () => {
      if (!selectedStudent || !selectedEnrollment) return null;

      const userId = selectedStudent.id;

      // Fetch all progress in parallel
      const [lessonProgressRes, activityAnswersRes, examAttemptsRes, assignmentSubmissionsRes] = await Promise.all([
        supabase.from('lesson_progress').select('lesson_id, completed').eq('user_id', userId),
        supabase.from('activity_answers').select('activity_id, is_correct').eq('user_id', userId),
        supabase.from('exam_attempts').select('exam_id, passed, completed_at').eq('user_id', userId),
        supabase.from('assignment_submissions').select('assignment_id, score').eq('user_id', userId),
      ]);

      // Build lookup maps
      const lessonCompleted = new Set(
        lessonProgressRes.data?.filter(p => p.completed).map(p => p.lesson_id) || []
      );
      
      // For activities, we need to check if ALL questions were answered correctly (>=70%)
      // Group answers by activity_id and check completion status
      const activityAnswersByActivity = new Map<string, { total: number; correct: number }>();
      activityAnswersRes.data?.forEach(a => {
        const existing = activityAnswersByActivity.get(a.activity_id) || { total: 0, correct: 0 };
        existing.total++;
        if (a.is_correct) existing.correct++;
        activityAnswersByActivity.set(a.activity_id, existing);
      });
      
      // An activity is "completed" only if the user has answered AND achieved >=70%
      const activityCompleted = new Set<string>();
      activityAnswersByActivity.forEach((stats, activityId) => {
        const percentage = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
        if (percentage >= 70) {
          activityCompleted.add(activityId);
        }
      });
      
      const examPassed = new Set(
        examAttemptsRes.data?.filter(e => e.passed && e.completed_at).map(e => e.exam_id) || []
      );
      
      const assignmentSubmitted = new Set(
        assignmentSubmissionsRes.data?.filter(s => s.score !== null).map(s => s.assignment_id) || []
      );

      return {
        lessonCompleted,
        activityCompleted,
        examPassed,
        assignmentSubmitted,
      };
    },
    enabled: !!selectedStudent && !!selectedEnrollment,
  });

  // Build progress items grouped by subject
  const progressBySubject = useMemo(() => {
    if (!courseContent || !currentProgress) return {};

    const subjectMap: Record<string, {
      title: string;
      items: ProgressItem[];
    }> = {};

    // Initialize subjects
    for (const subject of courseContent.subjects) {
      subjectMap[subject.id] = {
        title: subject.title,
        items: [],
      };
    }

    // Add lessons
    for (const lesson of courseContent.lessons) {
      if (lesson.subject_id && subjectMap[lesson.subject_id]) {
        const isCompleted = pendingChanges[`lesson_${lesson.id}`] !== undefined 
          ? pendingChanges[`lesson_${lesson.id}`] 
          : currentProgress.lessonCompleted.has(lesson.id);
        
        subjectMap[lesson.subject_id].items.push({
          id: lesson.id,
          title: lesson.title,
          type: 'lesson',
          completed: isCompleted,
          subject_id: lesson.subject_id,
          subject_title: subjectMap[lesson.subject_id].title,
        });
      }
    }

    // Add activities
    for (const activity of courseContent.activities) {
      if (activity.subject_id && subjectMap[activity.subject_id]) {
        const isCompleted = pendingChanges[`activity_${activity.id}`] !== undefined 
          ? pendingChanges[`activity_${activity.id}`] 
          : currentProgress.activityCompleted.has(activity.id);
        
        subjectMap[activity.subject_id].items.push({
          id: activity.id,
          title: activity.title,
          type: 'activity',
          completed: isCompleted,
          subject_id: activity.subject_id,
          subject_title: subjectMap[activity.subject_id].title,
        });
      }
    }

    // Add exams
    for (const exam of courseContent.exams) {
      if (exam.subject_id && subjectMap[exam.subject_id]) {
        const isCompleted = pendingChanges[`exam_${exam.id}`] !== undefined 
          ? pendingChanges[`exam_${exam.id}`] 
          : currentProgress.examPassed.has(exam.id);
        
        subjectMap[exam.subject_id].items.push({
          id: exam.id,
          title: exam.title,
          type: 'exam',
          completed: isCompleted,
          subject_id: exam.subject_id,
          subject_title: subjectMap[exam.subject_id].title,
        });
      }
    }

    // Add assignments
    for (const assignment of courseContent.assignments) {
      if (assignment.subject_id && subjectMap[assignment.subject_id]) {
        const isCompleted = pendingChanges[`assignment_${assignment.id}`] !== undefined 
          ? pendingChanges[`assignment_${assignment.id}`] 
          : currentProgress.assignmentSubmitted.has(assignment.id);
        
        subjectMap[assignment.subject_id].items.push({
          id: assignment.id,
          title: assignment.title,
          type: 'assignment',
          completed: isCompleted,
          subject_id: assignment.subject_id,
          subject_title: subjectMap[assignment.subject_id].title,
        });
      }
    }

    return subjectMap;
  }, [courseContent, currentProgress, pendingChanges]);

  const handleToggleProgress = (type: string, id: string, currentValue: boolean) => {
    const key = `${type}_${id}`;
    setPendingChanges(prev => ({
      ...prev,
      [key]: !currentValue,
    }));
  };

  // Toggle all items in a subject and save immediately
  const handleToggleSubject = async (subjectId: string, markAsCompleted: boolean) => {
    const subject = progressBySubject[subjectId];
    if (!subject || !selectedStudent || !selectedEnrollment) return;

    // Build changes for all items in this subject
    const newChanges: Record<string, boolean> = {};
    for (const item of subject.items) {
      const key = `${item.type}_${item.id}`;
      newChanges[key] = markAsCompleted;
    }

    // Add to pending changes and save immediately
    setPendingChanges(prev => ({
      ...prev,
      ...newChanges,
    }));

    // Save immediately with the new changes
    setIsSaving(true);
    const userId = selectedStudent.id;
    const enrollmentId = selectedEnrollment.id;

    try {
      for (const item of subject.items) {
        const completed = markAsCompleted;
        const itemId = item.id;
        const type = item.type;

        if (type === 'lesson') {
          if (completed) {
            await supabase.from('lesson_progress').upsert({
              user_id: userId,
              lesson_id: itemId,
              completed: true,
              completed_at: new Date().toISOString(),
            }, { onConflict: 'user_id,lesson_id' });
          } else {
            await supabase.from('lesson_progress')
              .update({ completed: false, completed_at: null })
              .eq('user_id', userId)
              .eq('lesson_id', itemId);
          }
        } else if (type === 'activity') {
          if (completed) {
            const { data: questions } = await supabase
              .from('questions')
              .select('id')
              .eq('activity_id', itemId);

            if (questions && questions.length > 0) {
              const questionIds = questions.map(q => q.id);
              
              const { data: correctOptions } = await supabase
                .from('question_options')
                .select('id, question_id')
                .in('question_id', questionIds)
                .eq('is_correct', true);

              if (correctOptions && correctOptions.length > 0) {
                await supabase.from('activity_answers')
                  .delete()
                  .eq('user_id', userId)
                  .eq('activity_id', itemId);

                const activityAnswers = correctOptions.map(opt => ({
                  user_id: userId,
                  activity_id: itemId,
                  question_id: opt.question_id,
                  selected_option_id: opt.id,
                  is_correct: true,
                  answered_at: new Date().toISOString(),
                }));

                await supabase.from('activity_answers').insert(activityAnswers);
              }
            }
          } else {
            await supabase.from('activity_answers')
              .delete()
              .eq('user_id', userId)
              .eq('activity_id', itemId);
          }
        } else if (type === 'exam') {
          if (completed) {
            const { data: exam } = await supabase
              .from('exams')
              .select('id, passing_score')
              .eq('id', itemId)
              .single();

            if (exam) {
              const { data: attemptData } = await supabase.from('exam_attempts').insert({
                user_id: userId,
                exam_id: itemId,
                score: 100,
                passed: true,
                started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                completed_at: new Date().toISOString(),
              }).select('id').single();

              if (attemptData) {
                const { data: questions } = await supabase
                  .from('questions')
                  .select('id')
                  .eq('exam_id', itemId);

                if (questions && questions.length > 0) {
                  const questionIds = questions.map(q => q.id);
                  const { data: correctOptions } = await supabase
                    .from('question_options')
                    .select('id, question_id')
                    .in('question_id', questionIds)
                    .eq('is_correct', true);

                  if (correctOptions && correctOptions.length > 0) {
                    const examAnswers = correctOptions.map(opt => ({
                      attempt_id: attemptData.id,
                      question_id: opt.question_id,
                      selected_option_id: opt.id,
                      is_correct: true,
                    }));

                    await supabase.from('exam_answers').insert(examAnswers);
                  }
                }
              }
            }
          } else {
            const { data: attempts } = await supabase
              .from('exam_attempts')
              .select('id')
              .eq('user_id', userId)
              .eq('exam_id', itemId);

            if (attempts && attempts.length > 0) {
              const attemptIds = attempts.map(a => a.id);
              await supabase.from('exam_answers').delete().in('attempt_id', attemptIds);
            }

            await supabase.from('exam_attempts')
              .delete()
              .eq('user_id', userId)
              .eq('exam_id', itemId);
          }
        } else if (type === 'assignment') {
          if (completed) {
            const { data: assignment } = await supabase
              .from('assignments')
              .select('id, max_score')
              .eq('id', itemId)
              .single();

            if (assignment) {
              await supabase.from('assignment_submissions').upsert({
                user_id: userId,
                assignment_id: itemId,
                content: 'Migrado do Moodle',
                score: assignment.max_score || 10,
                graded_at: new Date().toISOString(),
                feedback: 'Progresso importado da plataforma anterior',
              }, { onConflict: 'user_id,assignment_id' });
            }
          } else {
            await supabase.from('assignment_submissions')
              .delete()
              .eq('user_id', userId)
              .eq('assignment_id', itemId);
          }
        }
      }

      // Create or update bypass override for this subject if marking as completed
      if (markAsCompleted) {
        const { data: existingOverride } = await supabase
          .from('enrollment_subject_overrides')
          .select('id, bypass_exam_requirement')
          .eq('enrollment_id', enrollmentId)
          .eq('subject_id', subjectId)
          .maybeSingle();

        if (existingOverride) {
          if (!existingOverride.bypass_exam_requirement) {
            await supabase
              .from('enrollment_subject_overrides')
              .update({ 
                bypass_exam_requirement: true,
                notes: 'Bypass ativado automaticamente ao marcar matéria como concluída'
              })
              .eq('id', existingOverride.id);
          }
        } else {
          await supabase
            .from('enrollment_subject_overrides')
            .insert({
              enrollment_id: enrollmentId,
              subject_id: subjectId,
              bypass_exam_requirement: true,
              release_after_days: 0,
              notes: 'Bypass ativado automaticamente ao marcar matéria como concluída'
            });
        }
      }

      toast.success(markAsCompleted 
        ? `Matéria "${subject.title}" marcada como concluída!` 
        : `Progresso da matéria "${subject.title}" removido!`
      );
      
      // Clear pending changes for this subject
      setPendingChanges(prev => {
        const updated = { ...prev };
        for (const item of subject.items) {
          const key = `${item.type}_${item.id}`;
          delete updated[key];
        }
        return updated;
      });
      
      refetchProgress();
    } catch (error) {
      console.error('Error saving subject progress:', error);
      toast.error('Erro ao salvar progresso da matéria');
    } finally {
      setIsSaving(false);
    }
  };

  // Check if all items in a subject are completed
  const isSubjectCompleted = (subjectId: string): boolean => {
    const subject = progressBySubject[subjectId];
    if (!subject || subject.items.length === 0) return false;
    return subject.items.every(item => item.completed);
  };

  // Check if subject has partial completion
  const isSubjectPartial = (subjectId: string): boolean => {
    const subject = progressBySubject[subjectId];
    if (!subject || subject.items.length === 0) return false;
    const completedCount = subject.items.filter(i => i.completed).length;
    return completedCount > 0 && completedCount < subject.items.length;
  };

  const handleSaveChanges = async () => {
    if (!selectedStudent || !selectedEnrollment || Object.keys(pendingChanges).length === 0) return;

    setIsSaving(true);
    const userId = selectedStudent.id;
    const enrollmentId = selectedEnrollment.id;

    try {
      // Track which subjects have all items completed to create bypass overrides
      const subjectsToBypass = new Set<string>();
      
      // First, collect all subjects that will be fully completed after this save
      for (const [subjectId, subject] of Object.entries(progressBySubject)) {
        const allItemsCompleted = subject.items.every(item => {
          const key = `${item.type}_${item.id}`;
          // If there's a pending change, use it; otherwise use current state
          return pendingChanges[key] !== undefined ? pendingChanges[key] : item.completed;
        });
        if (allItemsCompleted && subject.items.length > 0) {
          subjectsToBypass.add(subjectId);
        }
      }

      for (const [key, completed] of Object.entries(pendingChanges)) {
        const [type] = key.split('_');
        const itemId = key.substring(type.length + 1);

        if (type === 'lesson') {
          if (completed) {
            // Mark lesson as completed
            await supabase.from('lesson_progress').upsert({
              user_id: userId,
              lesson_id: itemId,
              completed: true,
              completed_at: new Date().toISOString(),
            }, { onConflict: 'user_id,lesson_id' });
          } else {
            // Mark as incomplete
            await supabase.from('lesson_progress')
              .update({ completed: false, completed_at: null })
              .eq('user_id', userId)
              .eq('lesson_id', itemId);
          }
        } else if (type === 'activity') {
          if (completed) {
            // Get activity questions with their correct options
            const { data: questions } = await supabase
              .from('questions')
              .select('id')
              .eq('activity_id', itemId);

            if (questions && questions.length > 0) {
              const questionIds = questions.map(q => q.id);
              
              // Get all correct options at once
              const { data: correctOptions } = await supabase
                .from('question_options')
                .select('id, question_id')
                .in('question_id', questionIds)
                .eq('is_correct', true);

              if (correctOptions && correctOptions.length > 0) {
                // First, delete any existing answers for this activity to avoid duplicates
                await supabase.from('activity_answers')
                  .delete()
                  .eq('user_id', userId)
                  .eq('activity_id', itemId);

                // Insert all correct answers at once
                const activityAnswers = correctOptions.map(opt => ({
                  user_id: userId,
                  activity_id: itemId,
                  question_id: opt.question_id,
                  selected_option_id: opt.id,
                  is_correct: true,
                  answered_at: new Date().toISOString(),
                }));

                await supabase.from('activity_answers').insert(activityAnswers);
              }
            }
          } else {
            // Remove activity answers
            await supabase.from('activity_answers')
              .delete()
              .eq('user_id', userId)
              .eq('activity_id', itemId);
          }
        } else if (type === 'exam') {
          if (completed) {
            // Get exam info and questions with correct options
            const { data: exam } = await supabase
              .from('exams')
              .select('id, passing_score')
              .eq('id', itemId)
              .single();

            if (exam) {
              // Create passed attempt
              const { data: attemptData } = await supabase.from('exam_attempts').insert({
                user_id: userId,
                exam_id: itemId,
                score: 100,
                passed: true,
                started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                completed_at: new Date().toISOString(),
              }).select('id').single();

              if (attemptData) {
                // Get all questions for this exam with their correct options
                const { data: questions } = await supabase
                  .from('questions')
                  .select('id')
                  .eq('exam_id', itemId);

                if (questions && questions.length > 0) {
                  // Get correct options for all questions
                  const questionIds = questions.map(q => q.id);
                  const { data: correctOptions } = await supabase
                    .from('question_options')
                    .select('id, question_id')
                    .in('question_id', questionIds)
                    .eq('is_correct', true);

                  if (correctOptions && correctOptions.length > 0) {
                    // Insert exam answers for each question
                    const examAnswers = correctOptions.map(opt => ({
                      attempt_id: attemptData.id,
                      question_id: opt.question_id,
                      selected_option_id: opt.id,
                      is_correct: true,
                    }));

                    await supabase.from('exam_answers').insert(examAnswers);
                  }
                }
              }
            }
          } else {
            // Delete exam attempts and answers
            const { data: attempts } = await supabase
              .from('exam_attempts')
              .select('id')
              .eq('user_id', userId)
              .eq('exam_id', itemId);

            if (attempts && attempts.length > 0) {
              const attemptIds = attempts.map(a => a.id);
              await supabase.from('exam_answers').delete().in('attempt_id', attemptIds);
            }

            await supabase.from('exam_attempts')
              .delete()
              .eq('user_id', userId)
              .eq('exam_id', itemId);
          }
        } else if (type === 'assignment') {
          if (completed) {
            // Get assignment info
            const { data: assignment } = await supabase
              .from('assignments')
              .select('id, max_score')
              .eq('id', itemId)
              .single();

            if (assignment) {
              // Create graded submission
              await supabase.from('assignment_submissions').upsert({
                user_id: userId,
                assignment_id: itemId,
                content: 'Migrado do Moodle',
                score: assignment.max_score || 10,
                graded_at: new Date().toISOString(),
                feedback: 'Progresso importado da plataforma anterior',
              }, { onConflict: 'user_id,assignment_id' });
            }
          } else {
            // Delete submission
            await supabase.from('assignment_submissions')
              .delete()
              .eq('user_id', userId)
              .eq('assignment_id', itemId);
          }
        }
      }

      // Create bypass overrides for all completed subjects to unlock progression
      for (const subjectId of subjectsToBypass) {
        // Check if override already exists
        const { data: existingOverride } = await supabase
          .from('enrollment_subject_overrides')
          .select('id, bypass_exam_requirement')
          .eq('enrollment_id', enrollmentId)
          .eq('subject_id', subjectId)
          .maybeSingle();

        if (existingOverride) {
          // Update existing override to enable bypass
          if (!existingOverride.bypass_exam_requirement) {
            await supabase
              .from('enrollment_subject_overrides')
              .update({ 
                bypass_exam_requirement: true,
                notes: 'Bypass ativado automaticamente ao marcar matéria como concluída'
              })
              .eq('id', existingOverride.id);
          }
        } else {
          // Create new override with bypass enabled
          await supabase
            .from('enrollment_subject_overrides')
            .insert({
              enrollment_id: enrollmentId,
              subject_id: subjectId,
              bypass_exam_requirement: true,
              release_after_days: 0,
              notes: 'Bypass ativado automaticamente ao marcar matéria como concluída'
            });
        }
      }

      toast.success('Progresso atualizado com sucesso!');
      setPendingChanges({});
      refetchProgress();
    } catch (error) {
      console.error('Error saving progress:', error);
      toast.error('Erro ao salvar progresso');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectStudent = (student: { user_id: string; full_name: string; email: string }) => {
    setSelectedStudent({
      id: student.user_id,
      name: student.full_name,
      email: student.email,
    });
    setSelectedEnrollment(null);
    setPendingChanges({});
  };

  const handleSelectEnrollment = (enrollment: StudentEnrollment) => {
    setSelectedEnrollment(enrollment);
    setPendingChanges({});
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'lesson': return <BookOpen className="w-4 h-4" />;
      case 'activity': return <ClipboardList className="w-4 h-4" />;
      case 'exam': return <GraduationCap className="w-4 h-4" />;
      case 'assignment': return <FileText className="w-4 h-4" />;
      default: return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'lesson': return 'Aula';
      case 'activity': return 'Atividade';
      case 'exam': return 'Prova';
      case 'assignment': return 'Trabalho';
      default: return type;
    }
  };

  const pendingCount = Object.keys(pendingChanges).length;

  // Reset progress mutation
  const handleResetProgress = async () => {
    if (!selectedStudent || !selectedEnrollment) return;

    setIsResetting(true);
    const userId = selectedStudent.id;
    const courseId = selectedEnrollment.course_id;

    try {
      // 1. Delete certificate for this course
      const { error: certError } = await supabase
        .from('certificates')
        .delete()
        .eq('user_id', userId)
        .eq('course_id', courseId);

      if (certError) {
        console.error('Error deleting certificate:', certError);
      }

      // 2. Get all lessons, activities, exams, assignments for this course
      const [lessonsRes, activitiesRes, examsRes, assignmentsRes] = await Promise.all([
        supabase.from('lessons').select('id').eq('course_id', courseId),
        supabase.from('activities').select('id, subject_id'),
        supabase.from('exams').select('id').eq('course_id', courseId),
        supabase.from('assignments').select('id').eq('course_id', courseId),
      ]);

      // Get subject IDs for this course to filter activities
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id')
        .eq('course_id', courseId);

      const subjectIds = subjects?.map(s => s.id) || [];
      const courseActivityIds = activitiesRes.data
        ?.filter(a => a.subject_id && subjectIds.includes(a.subject_id))
        .map(a => a.id) || [];

      const lessonIds = lessonsRes.data?.map(l => l.id) || [];
      const examIds = examsRes.data?.map(e => e.id) || [];
      const assignmentIds = assignmentsRes.data?.map(a => a.id) || [];

      // 3. Delete all progress records
      if (lessonIds.length > 0) {
        await supabase.from('lesson_progress')
          .delete()
          .eq('user_id', userId)
          .in('lesson_id', lessonIds);
      }

      if (courseActivityIds.length > 0) {
        await supabase.from('activity_answers')
          .delete()
          .eq('user_id', userId)
          .in('activity_id', courseActivityIds);
      }

      if (examIds.length > 0) {
        // First get attempt IDs to delete answers
        const { data: attempts } = await supabase
          .from('exam_attempts')
          .select('id')
          .eq('user_id', userId)
          .in('exam_id', examIds);

        const attemptIds = attempts?.map(a => a.id) || [];

        if (attemptIds.length > 0) {
          await supabase.from('exam_answers')
            .delete()
            .in('attempt_id', attemptIds);
        }

        await supabase.from('exam_attempts')
          .delete()
          .eq('user_id', userId)
          .in('exam_id', examIds);
      }

      if (assignmentIds.length > 0) {
        await supabase.from('assignment_submissions')
          .delete()
          .eq('user_id', userId)
          .in('assignment_id', assignmentIds);
      }

      // 4. Reset enrollment completed_at
      await supabase
        .from('enrollments')
        .update({ completed_at: null })
        .eq('id', selectedEnrollment.id);

      toast.success('Progresso zerado com sucesso! O aluno pode refazer o curso.');
      setPendingChanges({});
      refetchProgress();
      setShowResetDialog(false);
    } catch (error) {
      console.error('Error resetting progress:', error);
      toast.error('Erro ao zerar progresso');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Gerenciar Progresso do Aluno</h1>
          <p className="text-muted-foreground">
            Marque manualmente o progresso de alunos migrados do Moodle
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Student Search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Buscar Aluno
              </CardTitle>
              <CardDescription>
                Pesquise por nome, email ou CPF
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="search">Busca</Label>
                <Input
                  id="search"
                  placeholder="Digite o nome, email ou CPF..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {loadingStudents && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}

              {students && students.length > 0 && (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {students.map((student) => (
                      <button
                        key={student.user_id}
                        onClick={() => handleSelectStudent(student)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedStudent?.id === student.user_id
                            ? 'bg-primary/10 border-primary'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{student.full_name}</span>
                          </div>
                          {student.enrollmentCount > 0 ? (
                            <Badge variant="secondary" className="text-xs">
                              {student.enrollmentCount} curso{student.enrollmentCount > 1 ? 's' : ''}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Sem matrículas
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {student.email}
                        </div>
                        {student.cpf && (
                          <div className="text-xs text-muted-foreground">
                            CPF: {student.cpf}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {searchTerm.length >= 2 && !loadingStudents && (!students || students.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum aluno encontrado
                </p>
              )}
            </CardContent>
          </Card>

          {/* Enrollments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5" />
                Matrículas
              </CardTitle>
              <CardDescription>
                {selectedStudent ? `Cursos de ${selectedStudent.name}` : 'Selecione um aluno'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedStudent && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Selecione um aluno para ver suas matrículas
                </p>
              )}

              {loadingEnrollments && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}

              {enrollments && enrollments.length > 0 && (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {enrollments.map((enrollment) => (
                      <button
                        key={enrollment.id}
                        onClick={() => handleSelectEnrollment(enrollment)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedEnrollment?.id === enrollment.id
                            ? 'bg-primary/10 border-primary'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{enrollment.courses.title}</span>
                          {enrollment.is_migrated && (
                            <Badge variant="secondary" className="text-xs">
                              Migrado
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Matrícula: {new Date(enrollment.enrolled_at).toLocaleDateString('pt-BR')}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {selectedStudent && !loadingEnrollments && (!enrollments || enrollments.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma matrícula encontrada
                </p>
              )}
            </CardContent>
          </Card>

          {/* Progress Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Progresso
              </CardTitle>
              <CardDescription>
                {selectedEnrollment 
                  ? `Gerenciar progresso em ${selectedEnrollment.courses.title}`
                  : 'Selecione uma matrícula'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingCount > 0 && (
                <Alert className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {pendingCount} alteração(ões) pendente(s)
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleSaveChanges}
                  disabled={pendingCount === 0 || isSaving}
                  className="flex-1"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar Alterações
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPendingChanges({});
                    refetchProgress();
                  }}
                  disabled={isSaving}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              {selectedEnrollment && (
                <>
                  <Separator />
                  <Button
                    variant="destructive"
                    onClick={() => setShowResetDialog(true)}
                    disabled={isResetting}
                    className="w-full"
                  >
                    {isResetting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Zerar Progresso do Curso
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Remove todo o progresso, certificado e permite refazer o curso
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Content Progress */}
        {selectedEnrollment && (
          <Card>
            <CardHeader>
              <CardTitle>Conteúdo do Curso</CardTitle>
              <CardDescription>
                Marque os itens que o aluno já concluiu na plataforma anterior
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(loadingContent || loadingProgress) && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              )}

              {courseContent && currentProgress && (
                <Accordion type="multiple" className="w-full">
                  {Object.entries(progressBySubject).map(([subjectId, subject]) => {
                    const completedCount = subject.items.filter(i => i.completed).length;
                    const totalCount = subject.items.length;
                    const allCompleted = isSubjectCompleted(subjectId);
                    const partialCompleted = isSubjectPartial(subjectId);
                    
                    return (
                      <AccordionItem key={subjectId} value={subjectId}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center justify-between w-full pr-4">
                            <div className="flex items-center gap-3">
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSubject(subjectId, !allCompleted);
                                }}
                                className="cursor-pointer"
                              >
                                <Checkbox
                                  checked={allCompleted}
                                  className={partialCompleted ? 'data-[state=unchecked]:bg-primary/30' : ''}
                                />
                              </div>
                              <span>{subject.title}</span>
                            </div>
                            <Badge variant={completedCount === totalCount ? 'default' : 'secondary'}>
                              {completedCount}/{totalCount}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            {subject.items.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                Nenhum conteúdo nesta matéria
                              </p>
                            ) : (
                              subject.items.map((item) => (
                                <div
                                  key={`${item.type}_${item.id}`}
                                  className="flex items-center justify-between p-3 rounded-lg border"
                                >
                                  <div className="flex items-center gap-3">
                                    <Checkbox
                                      checked={item.completed}
                                      onCheckedChange={() => handleToggleProgress(item.type, item.id, item.completed)}
                                    />
                                    <div className="flex items-center gap-2">
                                      {getTypeIcon(item.type)}
                                      <span className="font-medium">{item.title}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      {getTypeLabel(item.type)}
                                    </Badge>
                                    {item.completed ? (
                                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    ) : (
                                      <Circle className="w-5 h-5 text-muted-foreground" />
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}

              {courseContent && Object.keys(progressBySubject).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum conteúdo encontrado para este curso
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reset Progress Dialog */}
        <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Zerar Progresso do Curso</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação irá remover <strong>permanentemente</strong>:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Todo o progresso em aulas</li>
                  <li>Todas as respostas de atividades</li>
                  <li>Todas as tentativas de provas</li>
                  <li>Todos os trabalhos enviados</li>
                  <li>O certificado do curso (se houver)</li>
                </ul>
                <p className="mt-3">
                  O aluno <strong>{selectedStudent?.name}</strong> poderá refazer o curso 
                  <strong> {selectedEnrollment?.courses.title}</strong> do zero e emitir um novo certificado após concluir.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isResetting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleResetProgress}
                disabled={isResetting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isResetting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Zerar Progresso
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
