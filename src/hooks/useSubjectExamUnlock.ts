import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ActivityStatus {
  id: string;
  title: string;
  lessonTitle: string | null;
  questionsCount: number;
  correctCount: number;
  percentage: number;
  passed: boolean;
}

interface SubjectExamUnlockStatus {
  isLoading: boolean;
  canTakeExam: boolean;
  activitiesStatus: ActivityStatus[];
  completedActivities: number;
  totalActivities: number;
  message: string | null;
}

export function useSubjectExamUnlock(subjectId: string | undefined): SubjectExamUnlockStatus {
  const { user } = useAuth();
  const PASSING_PERCENTAGE = 70;

  const { data, isLoading } = useQuery({
    queryKey: ['subject-exam-unlock', subjectId, user?.id],
    queryFn: async () => {
      if (!user?.id || !subjectId) {
        return { activities: [], status: [] };
      }

      // Fetch all activities for this subject
      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('id, title, lesson_id, lessons(title)')
        .eq('subject_id', subjectId)
        .eq('is_active', true);

      if (activitiesError) throw activitiesError;

      if (!activities || activities.length === 0) {
        return { activities: [], status: [] };
      }

      const activityIds = activities.map(a => a.id);

      // Batch fetch: questions count and user answers in parallel
      const [questionsResult, answersResult] = await Promise.all([
        // Get all questions for all activities at once
        supabase
          .from('questions')
          .select('id, activity_id')
          .in('activity_id', activityIds),
        // Get all user answers for all activities at once
        supabase
          .from('activity_answers')
          .select('activity_id, is_correct')
          .in('activity_id', activityIds)
          .eq('user_id', user.id)
      ]);

      const allQuestions = questionsResult.data || [];
      const allAnswers = answersResult.data || [];

      // Build lookup maps for O(1) access
      const questionCountByActivity = new Map<string, number>();
      allQuestions.forEach(q => {
        if (q.activity_id) {
          const current = questionCountByActivity.get(q.activity_id) || 0;
          questionCountByActivity.set(q.activity_id, current + 1);
        }
      });

      const answersByActivity = new Map<string, { total: number; correct: number }>();
      allAnswers.forEach(a => {
        const existing = answersByActivity.get(a.activity_id) || { total: 0, correct: 0 };
        existing.total++;
        if (a.is_correct) existing.correct++;
        answersByActivity.set(a.activity_id, existing);
      });

      // Calculate status for each activity using the lookup maps
      const activitiesStatus: ActivityStatus[] = activities.map((activity) => {
        const questionsCount = questionCountByActivity.get(activity.id) || 0;
        const answers = answersByActivity.get(activity.id) || { total: 0, correct: 0 };
        const percentage = answers.total > 0 ? Math.round((answers.correct / answers.total) * 100) : 0;
        const passed = answers.total > 0 && percentage >= PASSING_PERCENTAGE;

        return {
          id: activity.id,
          title: activity.title,
          lessonTitle: (activity.lessons as { title: string } | null)?.title || null,
          questionsCount,
          correctCount: answers.correct,
          percentage,
          passed,
        };
      });

      return { activities, status: activitiesStatus };
    },
    enabled: !!subjectId && !!user?.id,
    staleTime: 30000, // Cache for 30 seconds
  });

  const activitiesStatus = data?.status || [];
  const totalActivities = activitiesStatus.length;
  const completedActivities = activitiesStatus.filter(a => a.passed).length;
  const canTakeExam = totalActivities === 0 || completedActivities === totalActivities;

  let message: string | null = null;
  if (totalActivities > 0 && !canTakeExam) {
    const remaining = totalActivities - completedActivities;
    message = `Complete ${remaining} exercício${remaining > 1 ? 's' : ''} com aprovação (≥70%) para liberar a prova`;
  }

  return {
    isLoading,
    canTakeExam,
    activitiesStatus,
    completedActivities,
    totalActivities,
    message,
  };
}
