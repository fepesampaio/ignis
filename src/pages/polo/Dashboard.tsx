import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, Users, Building, Calendar, RotateCcw, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
export default function PoloDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  // Demo polo ID for the "Gestor" polo
  const DEMO_POLO_ID = 'aee37a07-2f47-4f6f-ba50-0ccde1617b21';

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

  // Fetch enrollments for this polo
  const { data: enrollments, isLoading: loadingEnrollments } = useQuery({
    queryKey: ['polo-enrollments', poloInfo?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('id, is_active, enrolled_at, completed_at')
        .eq('polo_id', poloInfo?.id);

      if (error) throw error;
      return data;
    },
    enabled: !!poloInfo?.id,
  });

  const stats = {
    total: enrollments?.length || 0,
    active: enrollments?.filter(e => e.is_active && !e.completed_at).length || 0,
    completed: enrollments?.filter(e => e.completed_at).length || 0,
    thisMonth: enrollments?.filter(e => {
      const enrolledDate = new Date(e.enrolled_at);
      const now = new Date();
      return enrolledDate.getMonth() === now.getMonth() && 
             enrolledDate.getFullYear() === now.getFullYear();
    }).length || 0,
  };

  const isLoading = loadingPolo || loadingEnrollments;
  const isDemoPolo = poloInfo?.id === DEMO_POLO_ID;

  const handleResetDemoData = async () => {
    setIsResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-demo-polo');
      
      if (error) throw error;
      
      toast.success(data.message || 'Dados resetados com sucesso!');
      
      // Refresh all queries
      queryClient.invalidateQueries({ queryKey: ['polo-enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['polo-students'] });
      queryClient.invalidateQueries({ queryKey: ['polo-commissions'] });
      queryClient.invalidateQueries({ queryKey: ['polo-student-payments'] });
    } catch (error: unknown) {
      console.error('Error resetting demo data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao resetar dados';
      toast.error(errorMessage);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-display font-bold text-foreground">
            Dashboard do Polo
          </h1>
          {loadingPolo ? (
            <Skeleton className="h-5 w-48" />
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building className="w-4 h-4" />
              <span>{poloInfo?.name}</span>
              {poloInfo?.city && (
                <span className="text-sm">- {poloInfo.city}/{poloInfo.state}</span>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">Total de Matrículas</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.active}</p>
                    <p className="text-xs text-muted-foreground">Alunos Ativos</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.completed}</p>
                    <p className="text-xs text-muted-foreground">Concluídos</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.thisMonth}</p>
                    <p className="text-xs text-muted-foreground">Este Mês</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Use o menu lateral para acessar a página de matrículas e cadastrar novos alunos.
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Cadastre novos alunos através do formulário de matrícula</li>
              <li>Os alunos cadastrados serão automaticamente vinculados a este polo</li>
              <li>Acompanhe as matrículas realizadas pelo polo na página de matrículas</li>
            </ul>
          </CardContent>
        </Card>

        {/* Demo Mode Card - Only for Gestor polo */}
        {isDemoPolo && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Modo Demonstração
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Este é um polo de demonstração para fins de treinamento. Os dados exibidos são 
                fictícios e podem ser resetados a qualquer momento.
              </p>
              <div className="flex items-center gap-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                      disabled={isResetting}
                    >
                      <RotateCcw className={`w-4 h-4 mr-2 ${isResetting ? 'animate-spin' : ''}`} />
                      {isResetting ? 'Resetando...' : 'Resetar Dados de Demonstração'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Resetar Dados de Demonstração?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação irá apagar todos os alunos e matrículas de teste e criar 
                        novos dados fictícios. Use este recurso para reiniciar o ambiente 
                        de treinamento.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleResetDemoData}>
                        Confirmar Reset
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <span className="text-xs text-muted-foreground">
                  5 alunos de teste serão criados
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}