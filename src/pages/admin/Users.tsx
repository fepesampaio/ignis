import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
  Users,
  Search,
  UserPlus,
  Shield,
  GraduationCap,
  BookOpen,
  MoreHorizontal,
  Trash2,
  UserCog,
  KeyRound,
  Building2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteUserDialog } from '@/components/admin/DeleteUserDialog';
import { CreateEmployeeDialog } from '@/components/admin/CreateEmployeeDialog';
import { ChangeUserRoleDialog } from '@/components/admin/ChangeUserRoleDialog';
import { EditUserAccessDialog } from '@/components/admin/EditUserAccessDialog';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { useDebounce } from '@/hooks/useDebounce';

type UserRole = 'admin' | 'professor' | 'aluno' | 'polo';

type UserWithRole = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  role: UserRole;
};

const PAGE_SIZE = 5;

export default function AdminUsers() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createEmployeeDialogOpen, setCreateEmployeeDialogOpen] = useState(false);
  const [changeRoleDialogOpen, setChangeRoleDialogOpen] = useState(false);
  const [editAccessDialogOpen, setEditAccessDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const queryClient = useQueryClient();

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter]);

  // Lightweight stats: counts per role only
  const { data: stats } = useQuery({
    queryKey: ['admin-users-stats'],
    queryFn: async () => {
      const roles: UserRole[] = ['admin', 'professor', 'polo', 'aluno'];
      const [{ count: total }, ...counts] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        ...roles.map((r) =>
          supabase.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', r)
        ),
      ]);
      return {
        total: total || 0,
        admins: counts[0].count || 0,
        professors: counts[1].count || 0,
        polos: counts[2].count || 0,
        students: counts[3].count || 0,
      };
    },
    staleTime: 60_000,
  });

  // Paginated list
  const { data, isFetching } = useQuery({
    queryKey: ['admin-users', { search: debouncedSearch, role: roleFilter, page }],
    queryFn: async () => {
      // If filtering by role, get the user_ids first (small set)
      let roleUserIds: string[] | null = null;
      if (roleFilter !== 'all') {
        const { data: rolesData, error } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', roleFilter as UserRole);
        if (error) throw error;
        roleUserIds = (rolesData || []).map((r) => r.user_id);
        if (roleUserIds.length === 0) {
          return { users: [] as UserWithRole[], total: 0 };
        }
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (debouncedSearch.trim()) {
        const term = `%${debouncedSearch.trim()}%`;
        query = query.or(`full_name.ilike.${term},email.ilike.${term}`);
      }
      if (roleUserIds) {
        query = query.in('user_id', roleUserIds);
      }

      const { data: profiles, error, count } = await query;
      if (error) throw error;

      const userIds = (profiles || []).map((p) => p.user_id);
      let rolesMap = new Map<string, UserRole>();
      if (userIds.length > 0) {
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', userIds);
        rolesMap = new Map((rolesData || []).map((r) => [r.user_id, r.role as UserRole]));
      }

      const users = (profiles || []).map((p) => ({
        ...p,
        role: rolesMap.get(p.user_id) || 'aluno',
      })) as UserWithRole[];

      return { users, total: count || 0 };
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const users = data?.users || [];
  const totalCount = data?.total || 0;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Admin</Badge>;
      case 'professor':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Professor</Badge>;
      case 'polo':
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Polo</Badge>;
      default:
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Aluno</Badge>;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-4 h-4" />;
      case 'professor':
        return <BookOpen className="w-4 h-4" />;
      case 'polo':
        return <Building2 className="w-4 h-4" />;
      default:
        return <GraduationCap className="w-4 h-4" />;
    }
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    queryClient.invalidateQueries({ queryKey: ['admin-users-stats'] });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Gerenciar Usuários
            </h1>
            <p className="text-muted-foreground">
              Visualize e gerencie todos os usuários da plataforma
            </p>
          </div>
          <Button className="gap-2" onClick={() => setCreateEmployeeDialogOpen(true)}>
            <UserPlus className="w-4 h-4" />
            Novo Funcionário
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setRoleFilter('all')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.total ?? '–'}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setRoleFilter('admin')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.admins ?? '–'}</p>
                  <p className="text-xs text-muted-foreground">Admins</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setRoleFilter('professor')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.professors ?? '–'}</p>
                  <p className="text-xs text-muted-foreground">Professores</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setRoleFilter('polo')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.polos ?? '–'}</p>
                  <p className="text-xs text-muted-foreground">Polos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setRoleFilter('aluno')}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.students ?? '–'}</p>
                  <p className="text-xs text-muted-foreground">Alunos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuários..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['all', 'admin', 'professor', 'polo', 'aluno'].map((role) => (
              <Button
                key={role}
                variant={roleFilter === role ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRoleFilter(role)}
              >
                {role === 'all'
                  ? 'Todos'
                  : role === 'aluno'
                    ? 'Alunos'
                    : role === 'professor'
                      ? 'Professores'
                      : role === 'polo'
                        ? 'Polos'
                        : 'Admins'}
              </Button>
            ))}
          </div>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isFetching && users.length === 0 ? (
                  [...Array(8)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <div className="h-12 bg-muted animate-pulse rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Users className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">Nenhum usuário encontrado</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback>
                              {user.full_name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{user.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getRoleIcon(user.role)}
                          {getRoleBadge(user.role)}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
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
                                setSelectedUser(user);
                                setEditAccessDialogOpen(true);
                              }}
                            >
                              <KeyRound className="w-4 h-4 mr-2" />
                              Alterar acesso
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setChangeRoleDialogOpen(true);
                              }}
                            >
                              <UserCog className="w-4 h-4 mr-2" />
                              Alterar perfil
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setSelectedUser(user);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir usuário
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

      <DeleteUserDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        user={selectedUser}
        onSuccess={invalidateAll}
      />

      <CreateEmployeeDialog
        open={createEmployeeDialogOpen}
        onOpenChange={setCreateEmployeeDialogOpen}
        onSuccess={invalidateAll}
      />

      <ChangeUserRoleDialog
        open={changeRoleDialogOpen}
        onOpenChange={setChangeRoleDialogOpen}
        user={selectedUser}
        onSuccess={invalidateAll}
      />

      <EditUserAccessDialog
        open={editAccessDialogOpen}
        onOpenChange={setEditAccessDialogOpen}
        user={selectedUser}
        onSuccess={invalidateAll}
      />
    </DashboardLayout>
  );
}
