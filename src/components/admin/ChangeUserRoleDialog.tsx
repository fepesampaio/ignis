import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Shield, BookOpen, GraduationCap, UserCog, Building2 } from "lucide-react";

interface ChangeUserRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    user_id: string;
    full_name: string;
    email: string;
    role: 'admin' | 'professor' | 'aluno' | 'polo';
  } | null;
  onSuccess: () => void;
}

export function ChangeUserRoleDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: ChangeUserRoleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(user?.role || 'aluno');

  // Update selected role when user changes
  useState(() => {
    if (user?.role) {
      setSelectedRole(user.role);
    }
  });

  const handleSubmit = async () => {
    if (!user || selectedRole === user.role) {
      onOpenChange(false);
      return;
    }

    setIsSubmitting(true);
    try {
      // Update role via edge function
      const { data: result, error } = await supabase.functions.invoke("update-user-role", {
        body: {
          userId: user.user_id,
          newRole: selectedRole,
        },
      });

      if (error) throw error;

      if (!result?.success) {
        throw new Error(result?.error || "Erro ao alterar perfil");
      }

      toast.success("Perfil alterado com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error changing role:", error);
      toast.error(error.message || "Erro ao alterar perfil");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-4 h-4 text-red-500" />;
      case 'professor':
        return <BookOpen className="w-4 h-4 text-blue-500" />;
      case 'polo':
        return <Building2 className="w-4 h-4 text-purple-500" />;
      default:
        return <GraduationCap className="w-4 h-4 text-green-500" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'professor':
        return 'Professor';
      case 'polo':
        return 'Polo';
      default:
        return 'Aluno';
    }
  };

  // Reset selected role when dialog opens with new user
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && user) {
      setSelectedRole(user.role);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Alterar Perfil
          </DialogTitle>
          <DialogDescription>
            Altere o perfil de acesso de <strong>{user?.full_name}</strong>.
            <br />
            <span className="text-muted-foreground text-xs">
              Perfil atual: {user && getRoleLabel(user.role)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Novo Perfil</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aluno">
                  <div className="flex items-center gap-2">
                    {getRoleIcon('aluno')}
                    Aluno
                  </div>
                </SelectItem>
                <SelectItem value="polo">
                  <div className="flex items-center gap-2">
                    {getRoleIcon('polo')}
                    Polo
                  </div>
                </SelectItem>
                <SelectItem value="professor">
                  <div className="flex items-center gap-2">
                    {getRoleIcon('professor')}
                    Professor
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    {getRoleIcon('admin')}
                    Administrador
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedRole !== user?.role && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-medium mb-1">Atenção:</p>
              {selectedRole === 'admin' && (
                <p className="text-muted-foreground">
                  Administradores têm acesso total ao sistema, incluindo gerenciamento de usuários, cursos e pagamentos.
                </p>
              )}
              {selectedRole === 'professor' && (
                <p className="text-muted-foreground">
                  Professores podem visualizar todos os cursos e corrigir trabalhos dos alunos.
                </p>
              )}
              {selectedRole === 'polo' && (
                <p className="text-muted-foreground">
                  Usuários Polo podem matricular alunos e acompanhar pagamentos vinculados à sua unidade.
                </p>
              )}
              {selectedRole === 'aluno' && (
                <p className="text-muted-foreground">
                  Alunos precisam estar matriculados para acessar os cursos.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || selectedRole === user?.role}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Alterações"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
