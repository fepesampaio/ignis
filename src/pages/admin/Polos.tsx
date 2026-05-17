import { useEffect, useMemo, useState } from 'react';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { useDebounce } from '@/hooks/useDebounce';

const PAGE_SIZE = 5;
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  MapPin, 
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Building,
  Wallet,
  KeyRound,
  User,
  Copy,
  Check,
  RotateCcw,
  Loader2,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PoloFormDialog } from '@/components/admin/PoloFormDialog';

type PoloUser = {
  user_id: string;
  email: string;
  full_name: string;
  cpf: string | null;
};

type Polo = {
  id: string;
  name: string;
  wallet_id: string;
  city: string | null;
  state: string | null;
  is_active: boolean;
  created_at: string;
  generated_password: string | null;
  polo_user?: PoloUser | null;
};

export default function AdminPolos() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [page, setPage] = useState(1);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingPolo, setEditingPolo] = useState<Polo | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [poloToDelete, setPoloToDelete] = useState<Polo | null>(null);
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [selectedPoloCredentials, setSelectedPoloCredentials] = useState<Polo | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  const generateRandomPassword = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const { data: polos, isLoading } = useQuery({
    queryKey: ['admin-polos'],
    queryFn: async () => {
      // Fetch polos
      const { data: polosData, error: polosError } = await supabase
        .from('polos')
        .select('*')
        .order('name');
      if (polosError) throw polosError;

      // Fetch polo_users with profile data
      const { data: poloUsersData, error: poloUsersError } = await supabase
        .from('polo_users')
        .select('polo_id, user_id');
      if (poloUsersError) throw poloUsersError;

      // Fetch profiles for polo users
      const userIds = poloUsersData?.map(pu => pu.user_id) || [];
      let profilesMap = new Map<string, { email: string; full_name: string; cpf: string | null }>();
      
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, email, full_name, cpf')
          .in('user_id', userIds);
        if (profilesError) throw profilesError;
        
        profilesData?.forEach(p => {
          profilesMap.set(p.user_id, { email: p.email, full_name: p.full_name, cpf: p.cpf });
        });
      }

      // Map polo_users to polos
      const poloUserMap = new Map<string, PoloUser>();
      poloUsersData?.forEach(pu => {
        const profile = profilesMap.get(pu.user_id);
        if (profile) {
          poloUserMap.set(pu.polo_id, {
            user_id: pu.user_id,
            email: profile.email,
            full_name: profile.full_name,
            cpf: profile.cpf,
          });
        }
      });

      return polosData?.map(polo => ({
        ...polo,
        polo_user: poloUserMap.get(polo.id) || null,
      })) as Polo[];
    },
  });

  const deletePoloMutation = useMutation({
    mutationFn: async (poloId: string) => {
      const { error } = await supabase
        .from('polos')
        .delete()
        .eq('id', poloId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-polos'] });
      toast.success('Polo excluído com sucesso');
      setDeleteDialogOpen(false);
      setPoloToDelete(null);
    },
    onError: () => {
      toast.error('Erro ao excluir polo');
    },
  });

  const handleEdit = (polo: Polo) => {
    setEditingPolo(polo);
    setFormDialogOpen(true);
  };

  const handleDeleteClick = (polo: Polo) => {
    setPoloToDelete(polo);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (poloToDelete) {
      deletePoloMutation.mutate(poloToDelete.id);
    }
  };

  const handleFormClose = () => {
    setFormDialogOpen(false);
    setEditingPolo(null);
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success('Copiado para a área de transferência');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('Erro ao copiar');
    }
  };

  const handleResetPassword = async () => {
    if (!selectedPoloCredentials?.polo_user) {
      toast.error('Nenhum usuário vinculado a este polo.');
      return;
    }

    const newPassword = generateRandomPassword();

    setIsResettingPassword(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('update-user-access', {
        body: {
          userId: selectedPoloCredentials.polo_user.user_id,
          newPassword: newPassword,
        },
      });

      if (error) throw error;

      if (!result?.success) {
        throw new Error(result?.error || 'Erro ao resetar senha');
      }

      // Save password to database
      const { error: updateError } = await supabase
        .from('polos')
        .update({ generated_password: newPassword })
        .eq('id', selectedPoloCredentials.id);

      if (updateError) throw updateError;

      setGeneratedPassword(newPassword);
      setSelectedPoloCredentials({ ...selectedPoloCredentials, generated_password: newPassword });
      queryClient.invalidateQueries({ queryKey: ['admin-polos'] });
      toast.success('Nova senha gerada e salva com sucesso!');
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast.error(error.message || 'Erro ao resetar senha');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleGenerateAllPasswords = async () => {
    const polosWithUsers = polos?.filter(p => p.polo_user) || [];
    
    if (polosWithUsers.length === 0) {
      toast.error('Nenhum polo com usuário vinculado encontrado.');
      return;
    }

    setIsGeneratingAll(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const polo of polosWithUsers) {
        const newPassword = generateRandomPassword();
        
        try {
          // Update user password
          const { data: result, error } = await supabase.functions.invoke('update-user-access', {
            body: {
              userId: polo.polo_user!.user_id,
              newPassword: newPassword,
            },
          });

          if (error || !result?.success) {
            errorCount++;
            continue;
          }

          // Save password to database
          const { error: updateError } = await supabase
            .from('polos')
            .update({ generated_password: newPassword })
            .eq('id', polo.id);

          if (updateError) {
            errorCount++;
            continue;
          }

          successCount++;
        } catch {
          errorCount++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['admin-polos'] });
      
      if (errorCount === 0) {
        toast.success(`Senhas geradas para ${successCount} polos com sucesso!`);
      } else {
        toast.warning(`${successCount} senhas geradas, ${errorCount} erros.`);
      }
    } catch (error: any) {
      console.error('Error generating all passwords:', error);
      toast.error('Erro ao gerar senhas em lote');
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleViewCredentials = (polo: Polo) => {
    setSelectedPoloCredentials(polo);
    setGeneratedPassword(polo.generated_password);
    setCredentialsDialogOpen(true);
  };

  const filteredPolos = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return polos?.filter(polo =>
      polo.name.toLowerCase().includes(term) ||
      polo.city?.toLowerCase().includes(term) ||
      polo.state?.toLowerCase().includes(term)
    );
  }, [polos, debouncedSearch]);

  const totalPolos = filteredPolos?.length || 0;
  const paginatedPolos = useMemo(
    () => filteredPolos?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredPolos, page]
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const stats = {
    total: polos?.length || 0,
    active: polos?.filter(p => p.is_active).length || 0,
    inactive: polos?.filter(p => !p.is_active).length || 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Gerenciar Polos
            </h1>
            <p className="text-muted-foreground">
              Configure os polos e suas carteiras para split de pagamentos
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={handleGenerateAllPasswords}
              disabled={isGeneratingAll || !polos?.some(p => p.polo_user)}
            >
              {isGeneratingAll ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 mr-2" />
                  Gerar Senhas para Todos
                </>
              )}
            </Button>
            <Button onClick={() => setFormDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Polo
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.active}</p>
                  <p className="text-xs text-muted-foreground">Ativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.inactive}</p>
                  <p className="text-xs text-muted-foreground">Inativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, cidade ou estado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Polo</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Wallet ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <div className="h-12 bg-muted animate-pulse rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredPolos?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Building className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">Nenhum polo encontrado</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPolos?.map((polo) => (
                    <TableRow key={polo.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building className="w-5 h-5 text-primary" />
                          </div>
                          <span className="font-medium">{polo.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {polo.city && polo.state ? (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="w-4 h-4" />
                            {polo.city} - {polo.state}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-muted-foreground" />
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {polo.wallet_id.substring(0, 20)}...
                          </code>
                        </div>
                      </TableCell>
                      <TableCell>
                        {polo.is_active ? (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
                            Inativo
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
                              onClick={() => handleViewCredentials(polo)}
                              disabled={!polo.polo_user}
                            >
                              <KeyRound className="w-4 h-4 mr-2" />
                              Ver Credenciais
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(polo)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteClick(polo)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {!isLoading && totalPolos > 0 && (
              <AdminPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={totalPolos}
                onPageChange={setPage}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <PoloFormDialog
        open={formDialogOpen}
        onOpenChange={handleFormClose}
        polo={editingPolo}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o polo{' '}
              <strong>{poloToDelete?.name}</strong>?
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
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Credentials Dialog */}
      <Dialog open={credentialsDialogOpen} onOpenChange={setCredentialsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Credenciais de Acesso
            </DialogTitle>
            <DialogDescription>
              Credenciais do usuário vinculado ao polo <strong>{selectedPoloCredentials?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          {selectedPoloCredentials?.polo_user ? (
            <div className="space-y-4 py-4">
              {/* User Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Usuário
                </label>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="font-medium">{selectedPoloCredentials.polo_user.full_name}</span>
                </div>
              </div>

              {/* Email (Login) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Email (Login)
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm">
                    {selectedPoloCredentials.polo_user.email}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(selectedPoloCredentials.polo_user!.email, 'email')}
                  >
                    {copiedField === 'email' ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Generated Password or Generate Button */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Senha
                </label>
                {generatedPassword ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-3 bg-green-500/10 border border-green-500/20 rounded-lg font-mono text-lg font-bold text-green-600 text-center">
                        {generatedPassword}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(generatedPassword, 'password')}
                      >
                        {copiedField === 'password' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-green-600 font-medium">
                      ✓ Senha salva no sistema. Você pode visualizá-la a qualquer momento.
                    </p>
                  </>
                ) : (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <p className="text-sm text-amber-600">
                      Nenhuma senha gerada ainda. Clique no botão abaixo para gerar.
                    </p>
                  </div>
                )}
              </div>

              {/* Reset Password Button */}
              <div className="pt-2 border-t">
                <Button
                  variant={generatedPassword ? "outline" : "default"}
                  className="w-full"
                  onClick={handleResetPassword}
                  disabled={isResettingPassword}
                >
                  {isResettingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4 mr-2" />
                      {generatedPassword ? 'Gerar Nova Senha' : 'Gerar Senha de 6 Dígitos'}
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Uma senha numérica de 6 dígitos será gerada aleatoriamente
                </p>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <User className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                Nenhum usuário vinculado a este polo.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
