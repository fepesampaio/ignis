import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  GraduationCap, 
  Search,
  UserPlus,
  Users,
  BookOpen,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Calendar,
  Trash2,
  Building2,
  Eye,
  Pencil,
  RefreshCw,
  FileDown,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { CreateStudentDialog } from '@/components/admin/CreateStudentDialog';
import { EnrollStudentDialog } from '@/components/admin/EnrollStudentDialog';
import { StudentDetailsDialog } from '@/components/admin/StudentDetailsDialog';
import { EditStudentDialog } from '@/components/admin/EditStudentDialog';
import { ReprocessPaymentsDialog } from '@/components/admin/ReprocessPaymentsDialog';
import { generateTranscriptPDF } from '@/lib/generateTranscript';

type EnrollmentWithDetails = {
  id: string;
  user_id: string;
  course_id: string;
  polo_id: string | null;
  is_active: boolean;
  enrolled_at: string;
  completed_at: string | null;
  contract_status: string | null;
  payment_status: string | null;
  profile: {
    full_name: string;
    email: string;
    avatar_url: string | null;
    cpf: string | null;
    phone: string | null;
    whatsapp: string | null;
    birth_date: string | null;
    sex: string | null;
    address_cep: string | null;
    address_street: string | null;
    address_number: string | null;
    address_neighborhood: string | null;
    address_city: string | null;
    address_state: string | null;
  } | null;
  course: {
    title: string;
  } | null;
  polo: {
    id: string;
    name: string;
  } | null;
};

const PAGE_SIZE = 5;

export default function AdminEnrollments() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createStudentOpen, setCreateStudentOpen] = useState(false);
  const [enrollStudentOpen, setEnrollStudentOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [enrollmentToDelete, setEnrollmentToDelete] = useState<EnrollmentWithDetails | null>(null);
  const [poloFilter, setPoloFilter] = useState<string>('all');
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<EnrollmentWithDetails | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [enrollmentToEdit, setEnrollmentToEdit] = useState<EnrollmentWithDetails | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [reprocessDialogOpen, setReprocessDialogOpen] = useState(false);
  const [enrollmentToReprocess, setEnrollmentToReprocess] = useState<EnrollmentWithDetails | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, courseFilter, statusFilter, poloFilter]);

  const { data: courses } = useQuery({
    queryKey: ['admin-courses-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title')
        .eq('is_active', true)
        .order('title');
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });

  const { data: polos } = useQuery({
    queryKey: ['admin-polos-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('polos')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });

  // Lightweight stats
  const { data: enrollmentStats } = useQuery({
    queryKey: ['admin-enrollments-stats'],
    queryFn: async () => {
      const [{ count: total }, { count: active }, { count: inactive }, completedRes] = await Promise.all([
        supabase.from('enrollments').select('*', { count: 'exact', head: true }),
        supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('is_active', false),
        supabase.from('enrollments').select('*', { count: 'exact', head: true }).not('completed_at', 'is', null),
      ]);
      return {
        total: total || 0,
        active: active || 0,
        inactive: inactive || 0,
        completed: completedRes.count || 0,
      };
    },
    staleTime: 60_000,
  });

  const { data: pageData, isFetching: isLoading } = useQuery({
    queryKey: ['admin-enrollments', { search: debouncedSearch, courseFilter, statusFilter, poloFilter, page }],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let userIdMatch: string[] | null = null;
      let courseIdMatch: string[] | null = null;
      let poloIdMatch: string[] | null = null;
      if (debouncedSearch.trim()) {
        const term = `%${debouncedSearch.trim()}%`;
        const [profilesRes, coursesRes, polosRes] = await Promise.all([
          supabase.from('profiles').select('user_id').or(`full_name.ilike.${term},email.ilike.${term}`).limit(500),
          supabase.from('courses').select('id').ilike('title', term).limit(200),
          supabase.from('polos').select('id').ilike('name', term).limit(100),
        ]);
        userIdMatch = (profilesRes.data || []).map((p) => p.user_id);
        courseIdMatch = (coursesRes.data || []).map((c) => c.id);
        poloIdMatch = (polosRes.data || []).map((p) => p.id);
        if (!userIdMatch.length && !courseIdMatch.length && !poloIdMatch.length) {
          return { rows: [] as EnrollmentWithDetails[], total: 0 };
        }
      }

      let query = supabase
        .from('enrollments')
        .select('*', { count: 'exact' })
        .order('enrolled_at', { ascending: false })
        .range(from, to);

      if (courseFilter !== 'all') query = query.eq('course_id', courseFilter);
      if (statusFilter === 'active') query = query.eq('is_active', true);
      else if (statusFilter === 'inactive') query = query.eq('is_active', false);
      else if (statusFilter === 'completed') query = query.not('completed_at', 'is', null);

      if (poloFilter === 'with_polo') query = query.not('polo_id', 'is', null);
      else if (poloFilter === 'without_polo') query = query.is('polo_id', null);
      else if (poloFilter !== 'all') query = query.eq('polo_id', poloFilter);

      if (debouncedSearch.trim()) {
        const orParts: string[] = [];
        if (userIdMatch?.length) orParts.push(`user_id.in.(${userIdMatch.join(',')})`);
        if (courseIdMatch?.length) orParts.push(`course_id.in.(${courseIdMatch.join(',')})`);
        if (poloIdMatch?.length) orParts.push(`polo_id.in.(${poloIdMatch.join(',')})`);
        if (orParts.length) query = query.or(orParts.join(','));
      }

      const { data: enrollmentData, error: enrollmentError, count } = await query;
      if (enrollmentError) throw enrollmentError;

      const userIds = [...new Set((enrollmentData || []).map((e) => e.user_id))];
      const courseIds = [...new Set((enrollmentData || []).map((e) => e.course_id))];
      const poloIds = [...new Set((enrollmentData || []).map((e) => e.polo_id).filter(Boolean))] as string[];

      const [profilesRes, coursesRes, polosRes] = await Promise.all([
        userIds.length
          ? supabase
              .from('profiles')
              .select(
                'user_id, full_name, email, avatar_url, cpf, phone, whatsapp, birth_date, sex, address_cep, address_street, address_number, address_neighborhood, address_city, address_state'
              )
              .in('user_id', userIds)
          : Promise.resolve({ data: [], error: null } as any),
        courseIds.length
          ? supabase.from('courses').select('id, title').in('id', courseIds)
          : Promise.resolve({ data: [], error: null } as any),
        poloIds.length
          ? supabase.from('polos').select('id, name').in('id', poloIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
      const coursesMap = new Map((coursesRes.data || []).map((c: any) => [c.id, c]));
      const polosMap = new Map((polosRes.data || []).map((p: any) => [p.id, p]));

      const rows = (enrollmentData || []).map((enrollment) => ({
        ...enrollment,
        profile: profilesMap.get(enrollment.user_id) || null,
        course: coursesMap.get(enrollment.course_id) || null,
        polo: enrollment.polo_id ? polosMap.get(enrollment.polo_id) || null : null,
      })) as EnrollmentWithDetails[];

      return { rows, total: count || 0 };
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const enrollments = pageData?.rows;
  const totalCount = pageData?.total || 0;

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('enrollments')
        .update({ is_active: !isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-enrollments'] });
      toast.success('Status da matrícula atualizado');
    },
    onError: () => {
      toast.error('Erro ao atualizar matrícula');
    },
  });

  const deleteEnrollmentMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase
        .from('enrollments')
        .delete()
        .eq('id', enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-enrollments'] });
      toast.success('Matrícula excluída com sucesso');
      setDeleteDialogOpen(false);
      setEnrollmentToDelete(null);
    },
    onError: () => {
      toast.error('Erro ao excluir matrícula');
    },
  });

  const handleDeleteClick = (enrollment: EnrollmentWithDetails) => {
    setEnrollmentToDelete(enrollment);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (enrollmentToDelete) {
      deleteEnrollmentMutation.mutate(enrollmentToDelete.id);
    }
  };

  const handleOpenReprocessDialog = (enrollment: EnrollmentWithDetails) => {
    setEnrollmentToReprocess(enrollment);
    setReprocessDialogOpen(true);
  };

  const handleReprocessPayments = async (firstDueDate: string, customValue?: number, customInstallments?: number) => {
    if (!enrollmentToReprocess) return;
    
    setReprocessingId(enrollmentToReprocess.id);
    try {
      const body: Record<string, unknown> = { 
        enrollmentId: enrollmentToReprocess.id, 
        deleteExisting: true,
        firstDueDate 
      };

      // Add custom values if provided
      if (customValue !== undefined && customInstallments !== undefined) {
        body.customValue = customValue;
        body.customInstallments = customInstallments;
      }

      const { data, error } = await supabase.functions.invoke('reprocess-enrollment-payments', {
        body
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Boletos recriados com sucesso! ${data.details?.created} parcelas criadas com ${data.details?.splitPercentage}% de split para ${data.details?.polo}`);
        queryClient.invalidateQueries({ queryKey: ['admin-enrollments'] });
        setReprocessDialogOpen(false);
        setEnrollmentToReprocess(null);
      } else {
        toast.error(data?.error || 'Erro ao reprocessar boletos');
      }
    } catch (err) {
      console.error('Error reprocessing payments:', err);
      toast.error('Erro ao reprocessar boletos');
    } finally {
      setReprocessingId(null);
    }
  };

  // Server-side already filtered & paginated
  const filteredEnrollments = enrollments;

  const stats = {
    total: enrollmentStats?.total ?? 0,
    active: enrollmentStats?.active ?? 0,
    completed: enrollmentStats?.completed ?? 0,
    inactive: enrollmentStats?.inactive ?? 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Gerenciar Matrículas
            </h1>
            <p className="text-muted-foreground">
              Cadastre alunos e gerencie matrículas nos cursos
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEnrollStudentOpen(true)}>
              <Users className="w-4 h-4 mr-2" />
              Matricular Existente
            </Button>
            <Button onClick={() => setCreateStudentOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Novo Aluno
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('all')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('active')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.active}</p>
                  <p className="text-xs text-muted-foreground">Ativas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('completed')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.completed}</p>
                  <p className="text-xs text-muted-foreground">Concluídas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('inactive')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.inactive}</p>
                  <p className="text-xs text-muted-foreground">Inativas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, curso ou polo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por curso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cursos</SelectItem>
              {courses?.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={poloFilter} onValueChange={setPoloFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por polo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os polos</SelectItem>
              <SelectItem value="with_polo">Com polo vinculado</SelectItem>
              <SelectItem value="without_polo">Sem polo</SelectItem>
              {polos?.map((polo) => (
                <SelectItem key={polo.id} value={polo.id}>
                  {polo.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="inactive">Inativas</SelectItem>
              <SelectItem value="completed">Concluídas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Curso</TableHead>
                  <TableHead>Polo</TableHead>
                  <TableHead>Data Matrícula</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <div className="h-12 bg-muted animate-pulse rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredEnrollments?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">Nenhuma matrícula encontrada</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEnrollments?.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={enrollment.profile?.avatar_url || undefined} />
                            <AvatarFallback>
                              {enrollment.profile?.full_name?.charAt(0).toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{enrollment.profile?.full_name || 'N/A'}</p>
                            <p className="text-sm text-muted-foreground">
                              {enrollment.profile?.email || 'N/A'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-muted-foreground" />
                          {enrollment.course?.title || 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {enrollment.polo ? (
                          <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20">
                            <Building2 className="w-3 h-3 mr-1" />
                            {enrollment.polo.name}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Interno</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {new Date(enrollment.enrolled_at).toLocaleDateString('pt-BR')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {enrollment.completed_at ? (
                          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                            Concluído
                          </Badge>
                        ) : enrollment.is_active ? (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                            Ativa
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
                            Inativa
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedEnrollment(enrollment);
                                setDetailsDialogOpen(true);
                              }}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setEnrollmentToEdit(enrollment);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="w-4 h-4 mr-2" />
                              Editar dados
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={async () => {
                                try {
                                  toast.info('Gerando histórico escolar...');
                                  await generateTranscriptPDF(enrollment.user_id, enrollment.course_id, enrollment.id);
                                  toast.success('Histórico escolar gerado com sucesso!');
                                } catch (err) {
                                  console.error(err);
                                  toast.error('Erro ao gerar histórico escolar');
                                }
                              }}
                            >
                              <FileDown className="w-4 h-4 mr-2" />
                              Gerar Histórico Escolar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => toggleStatusMutation.mutate({
                                id: enrollment.id,
                                isActive: enrollment.is_active,
                              })}
                            >
                              {enrollment.is_active ? 'Desativar' : 'Ativar'} matrícula
                            </DropdownMenuItem>
                            {enrollment.polo_id && enrollment.contract_status === 'signed' && (
                              <DropdownMenuItem
                                onClick={() => handleOpenReprocessDialog(enrollment)}
                                disabled={reprocessingId === enrollment.id}
                              >
                                <RefreshCw className={`w-4 h-4 mr-2 ${reprocessingId === enrollment.id ? 'animate-spin' : ''}`} />
                                {reprocessingId === enrollment.id ? 'Reprocessando...' : 'Recriar boletos com split'}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteClick(enrollment)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir matrícula
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={totalCount}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      </div>

      <CreateStudentDialog
        open={createStudentOpen}
        onOpenChange={setCreateStudentOpen}
      />

      <EnrollStudentDialog
        open={enrollStudentOpen}
        onOpenChange={setEnrollStudentOpen}
      />

      <StudentDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        enrollment={selectedEnrollment}
      />

      <EditStudentDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        userId={enrollmentToEdit?.user_id || null}
        profile={enrollmentToEdit?.profile || null}
      />

      <ReprocessPaymentsDialog
        open={reprocessDialogOpen}
        onOpenChange={setReprocessDialogOpen}
        onConfirm={handleReprocessPayments}
        isLoading={reprocessingId !== null}
        studentName={enrollmentToReprocess?.profile?.full_name || ''}
        courseName={enrollmentToReprocess?.course?.title || ''}
        courseId={enrollmentToReprocess?.course_id || ''}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a matrícula de{' '}
              <strong>{enrollmentToDelete?.profile?.full_name}</strong> no curso{' '}
              <strong>{enrollmentToDelete?.course?.title}</strong>?
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEnrollmentMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
