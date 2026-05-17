import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from '@/components/ui/accordion';
import { 
  BookOpen, 
  FileQuestion, 
  FileText, 
  ClipboardCheck,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CourseGrades {
  courseId: string;
  courseTitle: string;
  subjects: SubjectGrades[];
}

interface SubjectGrades {
  subjectId: string;
  subjectTitle: string;
  activities: ActivityGrade[];
  exams: ExamGrade[];
  assignments: AssignmentGrade[];
}

interface ActivityGrade {
  id: string;
  title: string;
  totalQuestions: number;
  correctAnswers: number;
  score: number; // nota de 0 a 10
  answeredAt: string;
}

interface ExamGrade {
  id: string;
  title: string;
  score: number | null;
  passingScore: number;
  passed: boolean | null;
  completedAt: string | null;
  attempts: number;
}

interface AssignmentGrade {
  id: string;
  title: string;
  score: number | null;
  maxScore: number;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
}

export default function StudentGrades() {
  const { user } = useAuth();

  const { data: gradesData, isLoading } = useQuery({
    queryKey: ['student-grades', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Single query to get all enrollments with courses
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select('course_id, courses(id, title)')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (enrollmentsError) throw enrollmentsError;
      if (!enrollments || enrollments.length === 0) return [];

      const courseIds = enrollments.map(e => (e.courses as any)?.id).filter(Boolean);
      if (courseIds.length === 0) return [];

      // Step 1: Get subjects for enrolled courses
      const { data: subjects, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, title, course_id, order_index')
        .in('course_id', courseIds)
        .eq('is_active', true)
        .eq('is_certificate_instructions', false)
        .order('order_index');

      if (subjectsError) throw subjectsError;
      if (!subjects || subjects.length === 0) return [];

      const subjectIds = subjects.map(s => s.id);

      // Step 2: Fetch remaining data in parallel with proper filters
      const [
        activitiesResult,
        activityAnswersResult,
        examsResult,
        examAttemptsResult,
        assignmentsResult,
        assignmentSubmissionsResult
      ] = await Promise.all([
        // Activities only for our subjects (with question count via join)
        supabase
          .from('activities')
          .select('id, title, subject_id, questions(id)')
          .in('subject_id', subjectIds)
          .eq('is_active', true),
        
        // User's activity answers
        supabase
          .from('activity_answers')
          .select('activity_id, is_correct, answered_at')
          .eq('user_id', user.id),
        
        // All exams for courses
        supabase
          .from('exams')
          .select('id, title, passing_score, course_id, subject_id')
          .in('course_id', courseIds)
          .eq('is_active', true),
        
        // User's exam attempts
        supabase
          .from('exam_attempts')
          .select('exam_id, score, passed, completed_at')
          .eq('user_id', user.id)
          .not('completed_at', 'is', null),
        
        // All assignments for courses
        supabase
          .from('assignments')
          .select('id, title, max_score, course_id, subject_id')
          .in('course_id', courseIds)
          .eq('is_active', true),
        
        // User's assignment submissions
        supabase
          .from('assignment_submissions')
          .select('assignment_id, score, feedback, submitted_at, graded_at')
          .eq('user_id', user.id)
      ]);

      const activities = activitiesResult.data || [];
      const activityAnswers = activityAnswersResult.data || [];
      const exams = examsResult.data || [];
      const examAttempts = examAttemptsResult.data || [];
      const assignments = assignmentsResult.data || [];
      const assignmentSubmissions = assignmentSubmissionsResult.data || [];

      // Build lookup maps for fast access
      const activityIds = activities.map(a => a.id);
      
      // Questions count per activity (from the joined data)
      const questionsPerActivity = new Map<string, number>();
      activities.forEach(activity => {
        const questionCount = Array.isArray(activity.questions) ? activity.questions.length : 0;
        questionsPerActivity.set(activity.id, questionCount);
      });
      
      // Activity answers grouped by activity
      const answersPerActivity = new Map<string, typeof activityAnswers>();
      activityAnswers.forEach(a => {
        if (!answersPerActivity.has(a.activity_id)) {
          answersPerActivity.set(a.activity_id, []);
        }
        answersPerActivity.get(a.activity_id)!.push(a);
      });
      
      // Exam attempts grouped by exam
      const attemptsPerExam = new Map<string, typeof examAttempts>();
      examAttempts.forEach(a => {
        if (!attemptsPerExam.has(a.exam_id)) {
          attemptsPerExam.set(a.exam_id, []);
        }
        attemptsPerExam.get(a.exam_id)!.push(a);
      });
      
      // Assignment submissions grouped by assignment (keep latest)
      const submissionPerAssignment = new Map<string, (typeof assignmentSubmissions)[0]>();
      assignmentSubmissions
        .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
        .forEach(s => {
          if (!submissionPerAssignment.has(s.assignment_id)) {
            submissionPerAssignment.set(s.assignment_id, s);
          }
        });

      // Build grades structure
      const courseGrades: CourseGrades[] = [];

      for (const enrollment of enrollments) {
        const course = enrollment.courses as any;
        if (!course) continue;

        const courseSubjects = subjects.filter(s => s.course_id === course.id);
        const subjectGrades: SubjectGrades[] = [];

        for (const subject of courseSubjects) {
          // Activities for this subject
          const subjectActivities = activities.filter(a => a.subject_id === subject.id);
          const activityGrades: ActivityGrade[] = [];

          for (const activity of subjectActivities) {
            const answers = answersPerActivity.get(activity.id);
            if (answers && answers.length > 0) {
              const totalQuestions = questionsPerActivity.get(activity.id) || 0;
              const correctAnswers = answers.filter(a => a.is_correct).length;
              const score = totalQuestions ? (correctAnswers / totalQuestions) * 10 : 0;

              activityGrades.push({
                id: activity.id,
                title: activity.title,
                totalQuestions,
                correctAnswers,
                score,
                answeredAt: answers[0].answered_at,
              });
            }
          }

          // Exams for this subject or course-level
          const subjectExams = exams.filter(e => 
            e.course_id === course.id && (e.subject_id === subject.id || e.subject_id === null)
          );
          const examGrades: ExamGrade[] = [];

          for (const exam of subjectExams) {
            const attempts = attemptsPerExam.get(exam.id);
            if (attempts && attempts.length > 0) {
              const bestAttempt = attempts.reduce((best, current) => 
                (current.score || 0) > (best.score || 0) ? current : best
              );

              examGrades.push({
                id: exam.id,
                title: exam.title,
                score: bestAttempt.score,
                passingScore: exam.passing_score,
                passed: bestAttempt.passed,
                completedAt: bestAttempt.completed_at,
                attempts: attempts.length,
              });
            }
          }

          // Assignments for this subject or course-level
          const subjectAssignments = assignments.filter(a => 
            a.course_id === course.id && (a.subject_id === subject.id || a.subject_id === null)
          );
          const assignmentGrades: AssignmentGrade[] = [];

          for (const assignment of subjectAssignments) {
            const submission = submissionPerAssignment.get(assignment.id);
            if (submission) {
              assignmentGrades.push({
                id: assignment.id,
                title: assignment.title,
                score: submission.score,
                maxScore: assignment.max_score,
                feedback: submission.feedback,
                submittedAt: submission.submitted_at,
                gradedAt: submission.graded_at,
              });
            }
          }

          if (activityGrades.length > 0 || examGrades.length > 0 || assignmentGrades.length > 0) {
            subjectGrades.push({
              subjectId: subject.id,
              subjectTitle: subject.title,
              activities: activityGrades,
              exams: examGrades,
              assignments: assignmentGrades,
            });
          }
        }

        if (subjectGrades.length > 0) {
          courseGrades.push({
            courseId: course.id,
            courseTitle: course.title,
            subjects: subjectGrades,
          });
        }
      }

      return courseGrades;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <DashboardLayout title="Minhas Notas" subtitle="Acompanhe seu desempenho em cada matéria">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  if (!gradesData || gradesData.length === 0) {
    return (
      <DashboardLayout title="Minhas Notas" subtitle="Acompanhe seu desempenho em cada matéria">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center">
              Você ainda não possui notas registradas.
              <br />
              Complete atividades, provas e trabalhos para ver suas notas aqui.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Minhas Notas" subtitle="Acompanhe seu desempenho em cada matéria">
      <Accordion type="multiple" className="space-y-4">
        {gradesData.map((course) => (
          <AccordionItem key={course.courseId} value={course.courseId} className="border rounded-lg bg-card">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <span className="font-semibold text-lg">{course.courseTitle}</span>
                <Badge variant="secondary" className="ml-2">
                  {course.subjects.length} matéria{course.subjects.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <Accordion type="multiple" className="space-y-2">
                {course.subjects.map((subject) => {
                  const totalItems = subject.activities.length + subject.exams.length + subject.assignments.length;
                  const avgScore = (() => {
                    const scores: number[] = [];
                    subject.activities.forEach(a => scores.push(a.score));
                    subject.exams.forEach(e => e.score !== null && scores.push(e.score / 10));
                    subject.assignments.forEach(a => a.score !== null && scores.push((a.score / a.maxScore) * 10));
                    return scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
                  })();

                  return (
                    <AccordionItem key={subject.subjectId} value={subject.subjectId} className="border rounded-lg bg-muted/30">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-2">
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{subject.subjectTitle}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {totalItems} {totalItems === 1 ? 'item' : 'itens'}
                            </Badge>
                            {avgScore !== null && (
                              <Badge 
                                variant={avgScore >= 7 ? 'default' : 'destructive'}
                                className="font-mono text-xs"
                              >
                                Média: {avgScore.toFixed(1)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-3">
                        <div className="space-y-3">
                          {/* Activities */}
                          {subject.activities.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <FileQuestion className="h-4 w-4" />
                                <span>Atividades ({subject.activities.length})</span>
                              </div>
                              <div className="space-y-1.5 pl-6">
                                {subject.activities.map((activity) => (
                                  <div 
                                    key={activity.id} 
                                    className="flex items-center justify-between p-2 rounded-md bg-background/50"
                                  >
                                    <div>
                                      <p className="font-medium text-sm">{activity.title}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {activity.correctAnswers}/{activity.totalQuestions} corretas
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge 
                                        variant={activity.score >= 7 ? 'default' : 'destructive'}
                                        className="font-mono text-xs"
                                      >
                                        {activity.score.toFixed(1)}
                                      </Badge>
                                      {activity.score >= 7 ? (
                                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                      ) : (
                                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Assignments - antes das provas */}
                          {subject.assignments.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <FileText className="h-4 w-4" />
                                <span>Trabalhos ({subject.assignments.length})</span>
                              </div>
                              <div className="space-y-1.5 pl-6">
                                {subject.assignments.map((assignment) => (
                                  <div 
                                    key={assignment.id} 
                                    className="flex items-center justify-between p-2 rounded-md bg-background/50"
                                  >
                                    <div>
                                      <p className="font-medium text-sm">{assignment.title}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {assignment.gradedAt ? (
                                          <>Corrigido em {format(new Date(assignment.gradedAt), "dd/MM/yyyy", { locale: ptBR })}</>
                                        ) : (
                                          <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" /> Aguardando correção
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {assignment.score !== null ? (
                                        <>
                                          <Badge 
                                            variant={(assignment.score / assignment.maxScore) >= 0.7 ? 'default' : 'destructive'}
                                            className="font-mono text-xs"
                                          >
                                            {assignment.score}/{assignment.maxScore}
                                          </Badge>
                                          {(assignment.score / assignment.maxScore) >= 0.7 ? (
                                            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                          ) : (
                                            <XCircle className="h-3.5 w-3.5 text-destructive" />
                                          )}
                                        </>
                                      ) : (
                                        <Badge variant="outline" className="font-mono text-xs">
                                          Pendente
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Exams - depois dos trabalhos */}
                          {subject.exams.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <ClipboardCheck className="h-4 w-4" />
                                <span>Provas ({subject.exams.length})</span>
                              </div>
                              <div className="space-y-1.5 pl-6">
                                {subject.exams.map((exam) => {
                                  const examScore = exam.score !== null ? (exam.score / 10) : null;
                                  return (
                                    <div 
                                      key={exam.id} 
                                      className="flex items-center justify-between p-2 rounded-md bg-background/50"
                                    >
                                      <div>
                                        <p className="font-medium text-sm">{exam.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {exam.attempts} tentativa{exam.attempts !== 1 ? 's' : ''} • Mín: {(exam.passingScore / 10).toFixed(1)}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Badge 
                                          variant={exam.passed ? 'default' : 'destructive'}
                                          className="font-mono text-xs"
                                        >
                                          {examScore?.toFixed(1) ?? '—'}
                                        </Badge>
                                        {exam.passed ? (
                                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                        ) : (
                                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </DashboardLayout>
  );
}
