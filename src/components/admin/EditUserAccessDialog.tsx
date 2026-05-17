import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";

interface EditUserAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    user_id: string;
    full_name: string;
    email: string;
  } | null;
  onSuccess: () => void;
}

export function EditUserAccessDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: EditUserAccessDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
      onOpenChange(false);
      return;
    }

    if (!newEmail && !newPassword) {
      toast.error("Informe ao menos um campo para alterar");
      return;
    }

    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast.error("Email inválido");
      return;
    }

    if (newPassword && newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("update-user-access", {
        body: {
          userId: user.user_id,
          newEmail: newEmail || undefined,
          newPassword: newPassword || undefined,
        },
      });

      if (error) throw error;

      if (!result?.success) {
        throw new Error(result?.error || "Erro ao alterar dados de acesso");
      }

      toast.success("Dados de acesso alterados com sucesso!");
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error("Error updating access:", error);
      toast.error(error.message || "Erro ao alterar dados de acesso");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setNewEmail("");
    setNewPassword("");
    setShowPassword(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            Alterar Dados de Acesso
          </DialogTitle>
          <DialogDescription>
            Altere o email ou senha de <strong>{user?.full_name}</strong>.
            <br />
            <span className="text-muted-foreground text-xs">
              Email atual: {user?.email}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="newEmail">Novo Email (opcional)</Label>
            <Input
              id="newEmail"
              type="email"
              placeholder="novo.email@exemplo.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">Nova Senha (opcional)</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Mínimo de 6 caracteres
            </p>
          </div>

          <div className="p-3 bg-muted rounded-lg text-sm">
            <p className="font-medium mb-1">Importante:</p>
            <p className="text-muted-foreground">
              Deixe os campos em branco para manter os dados atuais. O usuário receberá um aviso sobre a alteração.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || (!newEmail && !newPassword)}
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
