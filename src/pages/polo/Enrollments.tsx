import { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { PaginationControls } from '@/components/ui/pagination-controls';

const PAGE_SIZE = 5;
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
  BookOpen,
  CheckCircle,
  XCircle,
  Calendar,
  Building,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PoloCreateStudentDialog } from '@/components/polo/PoloCreateStudentDialog';

type EnrollmentWithDetails = {
  id: string;
  user_id: string;
  course_id: string;
  is_active: boolean;
  enrolled_at: string;
  completed_at: string | null;
  profile: {
    full_name: string;
    email: string;
    avatar_url: string | null;
  } | null;
  course: {
    title: string;
  } | null;
};

export default function PoloEnrollments() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createStudentOpen, setCreateStudentOpen] = useState(false);
  const [page, setPage] = useState(1);

  // Debounce search and reset page on any filter change
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, courseFilter, statusFilter]);

  // Fetch polo info for current user
  const { data: poloInfo, isLoading: loadingPolo } = useQuery({
    queryKey: ['polo-user-info', user?.id],
    queryFn: async () => {
      const { data: poloUser, error: poloUserError } = await supabase
        .from('polo_users')
        .select('polo_id')
        .eq('user_id', user?.id)
        .single();

      if (poloUserError) throw poloUserError;

      const { data: polo, error: poloError } = await supabase
        .from('polos')
        .select('*')
        .eq('id', poloUser.polo_id)
        .single();

      if (poloError) throw poloError;
      return polo;
    },
    enabled: !!user?.id,
  });

  const { data: courses } = useQuery({
    queryKey: ['polo-courses-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title')
        .eq('is_active', true)
        .order('title');
      if (error) throw error;
      return data;
    },
  });

  // Stats query (counts only — runs once per polo)
  const { data: stats } = useQuery({
    queryKey: ['polo-enrollments-stats', poloInfo?.id],
    queryFn: async () => {
      if (!poloInfo?.id) return { total: 0, active: 0, completed: 0, inactive: 0 };
      const totalQ = supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('polo_id', poloInfo.id);
      const activeQ = supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('polo_id', poloInfo.id).eq('is_active', true).is('completed_at', null);
      const completedQ = supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('polo_id', poloInfo.id).not('completed_at', 'is', null);
      const inactiveQ = supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('polo_id', poloInfo.id).eq('is_active', false);
      const [t, a, c, i] = await Promise.all([totalQ, activeQ, completedQ, inactiveQ]);
      return {
        total: t.count || 0,
        active: a.count || 0,
        completed: c.count || 0,
        inactive: i.count || 0,
      };
    },
    enabled: !!poloInfo?.id,
  });

  // If user is searching by name/email, first resolve matching profile user_ids
  const { data: searchUserIds } = useQuery({
    queryKey: ['polo-enrollments-search-userids', poloInfo?.id, debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id')
        .or(`full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`)
        .limit(500);
      if (error) {
        console.error('Profile search error:', error);
        return [] as string[];
      }
      return (data || []).map((p) => p.user_id);
    },
    enabled: !!poloInfo?.id && !!debouncedSearch,
  });

  // Paginated enrollments query (server-side via .range())
  const enrollmentsQueryEnabled =
    !!poloInfo?.id && (!debouncedSearch || searchUserIds !== undefined);

  const { data: paginated, isLoading: loadingEnrollments, refetch } = useQuery({
    queryKey: [
      'polo-enrollments-list',
      poloInfo?.id,
      page,
      courseFilter,
      statusFilter,
      debouncedSearch,
      searchUserIds?.join(',') ?? '',
    ],
    queryFn: async () => {
      if (!poloInfo?.id) return { rows: [] as EnrollmentWithDetails[], total: 0 };

      let query = supabase
        .from('enrollments')
        .select('*', { count: 'exact' })
        .eq('polo_id', poloInfo.id)
        .order('enrolled_at', { ascending: false });

      if (courseFilter !== 'all') {
        query = query.eq('course_id', courseFilter);
      }
      if (statusFilter === 'active') {
        query = query.eq('is_active', true).is('completed_at', null);
      } else if (statusFilter === 'inactive') {
        query = query.eq('is_active', false);
      } else if (statusFilter === 'completed') {
        query = query.not('completed_at', 'is', null);
      }

      if (debouncedSearch) {
        const ids = searchUserIds || [];
        if (ids.length === 0) {
          return { rows: [], total: 0 };
        }
        query = query.in('user_id', ids);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data: enrollmentData, count, error } = await query.range(from, to);

      if (error) throw error;
      if (!enrollmentData || enrollmentData.length === 0) {
        return { rows: [], total: count || 0 };
      }

      const userIds = [...new Set(enrollmentData.map((e) => e.user_id))];
      const courseIds = [...new Set(enrollmentData.map((e) => e.course_id))];

      const [profilesRes, coursesRes] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, email, avatar_url').in('user_id', userIds),
        supabase.from('courses').select('id, title').in('id', courseIds),
      ]);

      const profilesMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
      const coursesMap = new Map((coursesRes.data || []).map((c) => [c.id, c]));

      const rows = enrollmentData.map((enrollment) => ({
        ...enrollment,
        profile: profilesMap.get(enrollment.user_id) || null,
        course: coursesMap.get(enrollment.course_id) || null,
      })) as EnrollmentWithDetails[];

      return { rows, total: count || 0 };
    },
    enabled: enrollmentsQueryEnabled,
    placeholderData: keepPreviousData,
  });

  const filteredEnrollments = paginated?.rows ?? [];
  const total = paginated?.total ?? 0;
  const statsView = stats || { total: 0, active: 0, completed: 0, inactive: 0 };

  const isLoading = loadingPolo || loadingEnrollments;


  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Matrículas do Polo
            </h1>
            {loadingPolo ? (
              <Skeleton className="h-5 w-48 mt-1" />
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <Building className="w-4 h-4" />
                <span>{poloInfo?.name}</span>
                {poloInfo?.city && (
                  <span className="text-sm">- {poloInfo.city}/{poloInfo.state}</span>
                )}
              </div>
            )}
          </div>
          <Button onClick={() => setCreateStudentOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Novo Aluno
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('all')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{statsView.total}</p>
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
                  <p className="text-2xl font-bold">{statsView.active}</p>
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
                  <p className="text-2xl font-bold">{statsView.completed}</p>
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
                  <p className="text-2xl font-bold">{statsView.inactive}</p>
                  <p className="text-xs text-muted-foreground">Inativas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou curso..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
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
                  <TableHead>Data Matrícula</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={4}>
                        <div className="h-12 bg-muted animate-pulse rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredEnrollments?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">Nenhuma matrícula encontrada</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Clique em "Novo Aluno" para cadastrar o primeiro aluno
                      </p>
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <PaginationControls
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
              className="border-t"
            />
          </CardContent>
        </Card>
      </div>

      <PoloCreateStudentDialog
        open={createStudentOpen}
        onOpenChange={setCreateStudentOpen}
        poloInfo={poloInfo}
        onSuccess={() => refetch()}
      />
    </DashboardLayout>
  );
}
