import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateDeclarationPDF } from '@/lib/generateDeclaration';

interface StudentResult {
  userId: string;
  fullName: string;
  email: string;
  cpf: string | null;
  enrollments: {
    id: string;
    courseId: string;
    courseTitle: string;
    courseCategory: string | null;
    workloadHours: number;
    enrolledAt: string;
  }[];
}

interface DeclarationInfoResponse {
  lastPaymentDueDate: string;
  source: 'payments' | 'asaas' | 'fallback';
}

const calculateDefaultConclusionDate = (enrolledAt: string) => {
  const baseDate = new Date(enrolledAt);

  if (Number.isNaN(baseDate.getTime())) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()).toISOString();
  }

  return new Date(baseDate.getFullYear(), baseDate.getMonth() + 6, baseDate.getDate()).toISOString();
};

export default function EnrollmentDeclaration() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  const handleSearch = async () => {
    const term = search.trim();
    if (!term) return;

    setLoading(true);
    try {
      // Search profiles by name or CPF
      let query = supabase
        .from('profiles')
        .select('user_id, full_name, email, cpf')
        .limit(20);

      // Check if search looks like CPF (digits only)
      const cleanedTerm = term.replace(/\D/g, '');
      if (cleanedTerm.length >= 3 && cleanedTerm.length <= 14) {
        query = query.or(`full_name.ilike.%${term}%,cpf.ilike.%${cleanedTerm}%`);
      } else {
        query = query.ilike('full_name', `%${term}%`);
      }

      const { data: profiles, error } = await query;
      if (error) throw error;
      if (!profiles || profiles.length === 0) {
        setResults([]);
        toast.info('Nenhum aluno encontrado.');
        return;
      }

      // Fetch enrollments for found users
      const userIds = profiles.map(p => p.user_id);
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('id, user_id, course_id, enrolled_at, courses(title, category, workload_hours)')
        .in('user_id', userIds)
        .eq('is_active', true);

      const studentResults: StudentResult[] = profiles.map(p => ({
        userId: p.user_id,
        fullName: p.full_name,
        email: p.email,
        cpf: p.cpf,
        enrollments: (enrollments || [])
          .filter(e => e.user_id === p.user_id)
          .map(e => ({
            id: e.id,
            courseId: e.course_id,
            courseTitle: (e.courses as any)?.title || '',
            courseCategory: (e.courses as any)?.category || null,
            workloadHours: (e.courses as any)?.workload_hours || 0,
            enrolledAt: e.enrolled_at,
          })),
      })).filter(s => s.enrollments.length > 0);

      setResults(studentResults);
      if (studentResults.length === 0) {
        toast.info('Nenhum aluno com matrícula ativa encontrado.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao pesquisar alunos.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (student: StudentResult, enrollment: StudentResult['enrollments'][0]) => {
    const key = `${student.userId}-${enrollment.id}`;
    setGenerating(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      let lastDueDate = calculateDefaultConclusionDate(enrollment.enrolledAt);

      if (session) {
        const { data: declarationInfo, error: declarationError } = await supabase.functions.invoke<DeclarationInfoResponse>(
          'get-enrollment-declaration-data',
          {
            body: {
              userId: student.userId,
              courseId: enrollment.courseId,
              enrollmentId: enrollment.id,
            },
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (declarationError) {
          console.warn('Erro ao buscar data final da declaração, usando fallback:', declarationError);
        } else if (declarationInfo?.lastPaymentDueDate) {
          lastDueDate = declarationInfo.lastPaymentDueDate;
        }
      }

      await generateDeclarationPDF({
        studentName: student.fullName,
        studentCpf: student.cpf,
        courseName: enrollment.courseTitle,
        courseCategory: enrollment.courseCategory,
        workloadHours: enrollment.workloadHours,
        enrollmentId: enrollment.id,
        enrolledAt: enrollment.enrolledAt,
        lastPaymentDueDate: lastDueDate,
      });

      toast.success('Declaração gerada com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar declaração.');
    } finally {
      setGenerating(null);
    }
  };

  const formatCpf = (cpf: string | null) => {
    if (!cpf) return '-';
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return cpf;
    return `${clean.slice(0,3)}.${clean.slice(3,6)}.${clean.slice(6,9)}-${clean.slice(9)}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Declaração de Matrícula</h1>
          <p className="text-muted-foreground">Pesquise um aluno e gere a declaração de matrícula em PDF.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pesquisar Aluno</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou CPF..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              <Button onClick={handleSearch} disabled={loading || !search.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {results.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aluno</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Curso</TableHead>
                    <TableHead>Carga Horária</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.flatMap(student =>
                    student.enrollments.map(enrollment => (
                      <TableRow key={`${student.userId}-${enrollment.id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{student.fullName}</p>
                            <p className="text-xs text-muted-foreground">{student.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-foreground">{formatCpf(student.cpf)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-foreground">{enrollment.courseTitle}</span>
                            {enrollment.courseCategory && (
                              <Badge variant="secondary" className="text-xs">{enrollment.courseCategory}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-foreground">{enrollment.workloadHours}h</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => handleGenerate(student, enrollment)}
                            disabled={generating === `${student.userId}-${enrollment.id}`}
                          >
                            {generating === `${student.userId}-${enrollment.id}` ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                              <FileText className="w-4 h-4 mr-2" />
                            )}
                            Gerar Declaração
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
