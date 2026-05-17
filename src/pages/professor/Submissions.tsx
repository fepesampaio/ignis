import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  ClipboardList,
  CheckCircle,
  Clock,
  Search,
  User,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { GradeSubmissionDialog } from '@/components/professor/GradeSubmissionDialog';

interface SubmissionWithDetails {
  id: string;
  content: string;
  submitted_at: string;
  score: number | null;
  feedback: string | null;
  graded_at: string | null;
  graded_by: string | null;
  user_id: string;
  assignment: {
    id: string;
    title: string;
    max_score: number;
    due_date: string | null;
    course: {
      id: string;
      title: string;
    };
    subject: {
      id: string;
      title: string;
    } | null;
  };
  profile: {
    full_name: string;
    email: string;
  };
}

export default function ProfessorSubmissions() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionWithDetails | null>(null);
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false);

  // Fetch courses where professor is assigned
  const { data: professorCourses } = useQuery({
    queryKey: ['professor-courses', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('course_professors')
        .select('course_id')
        .eq('professor_id', user.id);
      if (error) throw error;
      return data.map(cp => cp.course_id);
    },
    enabled: !!user?.id,
  });

  // Fetch all submissions for professor's courses
  const { data: submissions, isLoading } = useQuery({
    queryKey: ['professor-submissions', professorCourses],
    queryFn: async () => {
      if (!professorCourses || professorCourses.length === 0) return [];

      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('assignments')
        .select('id, title, max_score, due_date, course_id, subject_id')
        .in('course_id', professorCourses)
        .eq('is_active', true);

      if (assignmentsError) throw assignmentsError;
      if (!assignmentsData || assignmentsData.length === 0) return [];

      const assignmentIds = assignmentsData.map(a => a.id);

      const { data: submissionsData, error: submissionsError } = await supabase
        .from('assignment_submissions')
        .select('*')
        .in('assignment_id', assignmentIds)
        .order('submitted_at', { ascending: false });

      if (submissionsError) throw submissionsError;
      if (!submissionsData || submissionsData.length === 0) return [];

      // Get user profiles
      const userIds = [...new Set(submissionsData.map(s => s.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);

      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Get courses and subjects
      const courseIds = [...new Set(assignmentsData.map(a => a.course_id))];
      const { data: courses } = await supabase
        .from('courses')
        .select('id, title')
        .in('id', courseIds);

      const coursesMap = new Map(courses?.map(c => [c.id, c]) || []);

      const subjectIds = assignmentsData.filter(a => a.subject_id).map(a => a.subject_id!);
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id, title')
        .in('id', subjectIds);

      const subjectsMap = new Map(subjects?.map(s => [s.id, s]) || []);

      // Build full submissions
      const assignmentsMap = new Map(assignmentsData.map(a => [a.id, a]));

      const fullSubmissions: SubmissionWithDetails[] = submissionsData.map(sub => {
        const assignment = assignmentsMap.get(sub.assignment_id)!;
        return {
          id: sub.id,
          content: sub.content,
          submitted_at: sub.submitted_at,
          score: sub.score,
          feedback: sub.feedback,
          graded_at: sub.graded_at,
          graded_by: sub.graded_by,
          user_id: sub.user_id,
          assignment: {
            id: assignment.id,
            title: assignment.title,
            max_score: assignment.max_score,
            due_date: assignment.due_date,
            course: coursesMap.get(assignment.course_id) || { id: '', title: 'Curso Desconhecido' },
            subject: assignment.subject_id ? subjectsMap.get(assignment.subject_id) || null : null,
          },
          profile: profilesMap.get(sub.user_id) || { full_name: 'Aluno', email: '' },
        };
      });

      return fullSubmissions;
    },
    enabled: !!professorCourses && professorCourses.length > 0,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const pendingSubmissions = submissions?.filter(s => !s.graded_at) || [];
  const gradedSubmissions = (submissions?.filter(s => s.graded_at) || [])
    .sort((a, b) => new Date(b.graded_at!).getTime() - new Date(a.graded_at!).getTime());

  const filterSubmissions = (subs: SubmissionWithDetails[]) => {
    if (!searchTerm) return subs;
    const term = searchTerm.toLowerCase();
    return subs.filter(s => 
      s.profile.full_name.toLowerCase().includes(term) ||
      s.assignment.title.toLowerCase().includes(term) ||
      s.assignment.course.title.toLowerCase().includes(term)
    );
  };

  const handleGrade = (submission: SubmissionWithDetails) => {
    setSelectedSubmission(submission);
    setGradeDialogOpen(true);
  };

  const SubmissionCard = ({ submission }: { submission: SubmissionWithDetails }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{submission.profile.full_name}</span>
              {submission.graded_at && (
                <>
                  <Badge variant="default" className="gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {submission.score}/{submission.assignment.max_score}
                  </Badge>
                  <Badge variant={submission.graded_by ? "secondary" : "outline"} className="gap-1 text-[10px]">
                    {submission.graded_by ? "Correção Manual" : "Correção IA"}
                  </Badge>
                </>
              )}
            </div>
            
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{submission.assignment.title}</span>
              <span className="mx-2">•</span>
              {submission.assignment.course.title}
              {submission.assignment.subject && (
                <>
                  <span className="mx-2">•</span>
                  {submission.assignment.subject.title}
                </>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Enviado {format(new Date(submission.submitted_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </span>
              {submission.graded_at && (
                <span>
                  Corrigido {format(new Date(submission.graded_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </span>
              )}
            </div>
          </div>

          <Button
            variant={submission.graded_at ? "outline" : "default"}
            size="sm"
            onClick={() => handleGrade(submission)}
          >
            <FileText className="h-4 w-4 mr-2" />
            {submission.graded_at ? 'Ver' : 'Corrigir'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout
      title="Correção de Trabalhos"
      subtitle="Visualize e corrija os trabalhos dos alunos"
    >
      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por aluno, trabalho ou curso..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pendentes ({pendingSubmissions.length})
          </TabsTrigger>
          <TabsTrigger value="graded" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Corrigidos ({Math.min(gradedSubmissions.length, 15)})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))
          ) : filterSubmissions(pendingSubmissions).length > 0 ? (
            filterSubmissions(pendingSubmissions).map((submission) => (
              <SubmissionCard key={submission.id} submission={submission} />
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-medium">Tudo em dia!</h3>
                <p className="text-muted-foreground">
                  Não há trabalhos pendentes de correção.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="graded" className="space-y-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))
          ) : filterSubmissions(gradedSubmissions).length > 0 ? (
            filterSubmissions(gradedSubmissions).slice(0, 15).map((submission) => (
              <SubmissionCard key={submission.id} submission={submission} />
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nenhum trabalho corrigido</h3>
                <p className="text-muted-foreground">
                  Os trabalhos corrigidos aparecerão aqui.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <GradeSubmissionDialog
        open={gradeDialogOpen}
        onOpenChange={setGradeDialogOpen}
        submission={selectedSubmission}
      />
    </DashboardLayout>
  );
}
