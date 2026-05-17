import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SubjectReleaseStatus {
  isLoading: boolean;
  isLocked: boolean;
  daysUntilUnlock: number;
  releaseDate: Date | null;
  lockedByExam: boolean;
  lockedByCompletion: boolean;
  previousSubjectTitle?: string;
}

export function useSubjectRelease(
  subjectId: string | undefined,
  courseId: string | undefined
): SubjectReleaseStatus {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['subject-release-status', subjectId, courseId, user?.id],
    queryFn: async () => {
      if (!user?.id || !subjectId || !courseId) {
        return { isLocked: false, daysUntilUnlock: 0, releaseDate: null, lockedByExam: false, lockedByCompletion: false };
      }

      // Get all subjects to find the order (include certificate instruction subjects for proper ordering)
      const { data: allSubjects } = await supabase
        .from('subjects')
        .select('id, release_after_days, order_index, title, require_previous_exam, is_certificate_instructions')
        .eq('course_id', courseId)
        .eq('is_active', true)
        .order('order_index');

      const currentSubject = allSubjects?.find(s => s.id === subjectId);
      if (!currentSubject) {
        return { isLocked: true, daysUntilUnlock: 0, releaseDate: null, lockedByExam: false, lockedByCompletion: false };
      }

      // Get the user's enrollment
      const { data: enrollment, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('id, enrolled_at')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (enrollmentError || !enrollment) {
        return { isLocked: true, daysUntilUnlock: 0, releaseDate: null, lockedByExam: false, lockedByCompletion: false };
      }

      // Check for individual override
      const { data: override } = await supabase
        .from('enrollment_subject_overrides')
        .select('release_after_days, bypass_exam_requirement')
        .eq('enrollment_id', enrollment.id)
        .eq('subject_id', subjectId)
        .single();

      // Use override if exists, otherwise use subject default
      const releaseAfterDays = override?.release_after_days ?? currentSubject.release_after_days;
      const bypassExamRequirement = override?.bypass_exam_requirement ?? false;

      // Calculate if locked by date
      const enrolledAt = new Date(enrollment.enrolled_at);
      const now = new Date();
      const daysSinceEnrollment = Math.floor(
        (now.getTime() - enrolledAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      const isLockedByDate = releaseAfterDays > daysSinceEnrollment;
      const daysUntilUnlock = isLockedByDate ? releaseAfterDays - daysSinceEnrollment : 0;
      
      const releaseDate = new Date(enrolledAt);
      releaseDate.setDate(releaseDate.getDate() + releaseAfterDays);

      // If it's the first subject, no need to check previous exam or completion
      const currentIndex = allSubjects?.findIndex(s => s.id === subjectId) ?? 0;
      if (currentIndex === 0) {
        return { isLocked: isLockedByDate, daysUntilUnlock, releaseDate, lockedByExam: false, lockedByCompletion: false };
      }

      // Check if previous subject's requirements are met
      const previousSubject = allSubjects![currentIndex - 1];
      const requirePreviousExam = currentSubject.require_previous_exam ?? true;
      
      let lockedByExam = false;
      let lockedByCompletion = false;

      // Skip exam/completion check if bypass is enabled for this student
      if (!bypassExamRequirement) {
        if (requirePreviousExam) {
          // Get exams for the previous subject
          const { data: previousExams } = await supabase
            .from('exams')
            .select('id')
            .eq('subject_id', previousSubject.id)
            .eq('is_active', true);

          // If no exams in previous subject, not locked by exam
          if (previousExams && previousExams.length > 0) {
            // Check if user has passed all exams in the previous subject
            for (const exam of previousExams) {
              const { data: passedAttempts } = await supabase
                .from('exam_attempts')
                .select('id')
                .eq('exam_id', exam.id)
                .eq('user_id', user.id)
                .eq('passed', true)
                .limit(1);

              if (!passedAttempts || passedAttempts.length === 0) {
                lockedByExam = true;
                break;
              }
            }
          }
        } else {
          // Only require completion of all lessons in previous subject
          const { data: previousLessons } = await supabase
            .from('lessons')
            .select('id')
            .eq('subject_id', previousSubject.id)
            .eq('is_active', true);

          if (previousLessons && previousLessons.length > 0) {
            const lessonIds = previousLessons.map(l => l.id);
            const { data: completedLessons } = await supabase
              .from('lesson_progress')
              .select('lesson_id')
              .eq('user_id', user.id)
              .eq('completed', true)
              .in('lesson_id', lessonIds);

            const completedCount = completedLessons?.length || 0;
            if (completedCount < previousLessons.length) {
              lockedByCompletion = true;
            }
          }
        }
      }

      return { 
        isLocked: isLockedByDate || lockedByExam || lockedByCompletion, 
        daysUntilUnlock, 
        releaseDate, 
        lockedByExam,
        lockedByCompletion,
        previousSubjectTitle: (lockedByExam || lockedByCompletion) ? previousSubject.title : undefined
      };
    },
    enabled: !!subjectId && !!courseId && !!user?.id,
  });

  return {
    isLoading,
    isLocked: data?.isLocked ?? false,
    daysUntilUnlock: data?.daysUntilUnlock ?? 0,
    releaseDate: data?.releaseDate ?? null,
    lockedByExam: data?.lockedByExam ?? false,
    lockedByCompletion: data?.lockedByCompletion ?? false,
    previousSubjectTitle: data?.previousSubjectTitle,
  };
}

// Hook to get all subjects with their release status for a course
export function useAllSubjectsReleaseStatus(courseId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['all-subjects-release-status', courseId, user?.id, 'v3'],
    queryFn: async () => {
      const empty: Record<string, { isLocked: boolean; daysUntilUnlock: number; lockedByExam: boolean; lockedByCompletion: boolean; previousSubjectTitle?: string }> = {};
      if (!user?.id || !courseId) return empty;

      // Get enrollment
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('id, enrolled_at')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (!enrollment) return empty;

      // Get all subjects with their release_after_days, ordered (include certificate instruction subjects)
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id, release_after_days, order_index, title, require_previous_exam, is_certificate_instructions')
        .eq('course_id', courseId)
        .eq('is_active', true)
        .order('order_index');

      // Get all overrides for this enrollment
      const { data: overrides } = await supabase
        .from('enrollment_subject_overrides')
        .select('subject_id, release_after_days, bypass_exam_requirement')
        .eq('enrollment_id', enrollment.id);

      const overridesMap = new Map(
        overrides?.map((o) => [o.subject_id, { days: o.release_after_days, bypass: o.bypass_exam_requirement }]) || []
      );

      const enrolledAt = new Date(enrollment.enrolled_at);
      const now = new Date();
      const daysSinceEnrollment = Math.floor(
        (now.getTime() - enrolledAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Get all exams for subjects in this course
      const subjectIds = subjects?.map(s => s.id) || [];
      const { data: exams } = await supabase
        .from('exams')
        .select('id, subject_id')
        .in('subject_id', subjectIds)
        .eq('is_active', true);

      // Get all passed exam attempts for the user in this course
      const examIds = exams?.map(e => e.id) || [];
      const { data: passedAttempts } = examIds.length > 0 ? await supabase
        .from('exam_attempts')
        .select('exam_id')
        .in('exam_id', examIds)
        .eq('user_id', user.id)
        .eq('passed', true) : { data: [] };

      // Create a set of passed exam IDs
      const passedExamIds = new Set(passedAttempts?.map(a => a.exam_id) || []);

      // Create a map of subject_id to array of exam_ids
      const subjectExamsMap = new Map<string, string[]>();
      exams?.forEach(exam => {
        const existing = subjectExamsMap.get(exam.subject_id) || [];
        existing.push(exam.id);
        subjectExamsMap.set(exam.subject_id, existing);
      });

      // Get all lessons and lesson progress for completion-based unlock
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id, subject_id')
        .in('subject_id', subjectIds)
        .eq('is_active', true);

      const lessonIds = lessons?.map(l => l.id) || [];
      const { data: lessonProgress } = lessonIds.length > 0 ? await supabase
        .from('lesson_progress')
        .select('lesson_id')
        .in('lesson_id', lessonIds)
        .eq('user_id', user.id)
        .eq('completed', true) : { data: [] };

      const completedLessonIds = new Set(lessonProgress?.map(p => p.lesson_id) || []);

      // Create a map of subject_id to array of lesson_ids
      const subjectLessonsMap = new Map<string, string[]>();
      lessons?.forEach(lesson => {
        const existing = subjectLessonsMap.get(lesson.subject_id) || [];
        existing.push(lesson.id);
        subjectLessonsMap.set(lesson.subject_id, existing);
      });

      const statusMap: Record<string, { isLocked: boolean; daysUntilUnlock: number; lockedByExam: boolean; lockedByCompletion: boolean; previousSubjectTitle?: string }> = {};

      subjects?.forEach((subject, index) => {
        const override = overridesMap.get(subject.id);
        const releaseAfterDays = override?.days ?? subject.release_after_days;
        const bypassExamRequirement = override?.bypass ?? false;
        const isLockedByDate = releaseAfterDays > daysSinceEnrollment;
        const daysUntilUnlock = isLockedByDate ? releaseAfterDays - daysSinceEnrollment : 0;

        let lockedByExam = false;
        let lockedByCompletion = false;
        let previousSubjectTitle: string | undefined;

        if (index > 0 && !bypassExamRequirement) {
          const previousSubject = subjects[index - 1];
          const requirePreviousExam = subject.require_previous_exam ?? true;

          if (requirePreviousExam) {
            const previousSubjectExamIds = subjectExamsMap.get(previousSubject.id) || [];
            if (previousSubjectExamIds.length > 0) {
              const allExamsPassed = previousSubjectExamIds.every(examId => passedExamIds.has(examId));
              if (!allExamsPassed) {
                lockedByExam = true;
                previousSubjectTitle = previousSubject.title;
              }
            }
          } else {
            const previousSubjectLessonIds = subjectLessonsMap.get(previousSubject.id) || [];
            if (previousSubjectLessonIds.length > 0) {
              const allLessonsCompleted = previousSubjectLessonIds.every(lessonId => completedLessonIds.has(lessonId));
              if (!allLessonsCompleted) {
                lockedByCompletion = true;
                previousSubjectTitle = previousSubject.title;
              }
            }
          }
        }

        statusMap[subject.id] = {
          isLocked: isLockedByDate || lockedByExam || lockedByCompletion,
          daysUntilUnlock,
          lockedByExam,
          lockedByCompletion,
          previousSubjectTitle,
        };
      });

      return statusMap;
    },
    enabled: !!courseId && !!user?.id,
  });
}
