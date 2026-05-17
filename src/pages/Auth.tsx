import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Mail, Lock, ArrowRight, Eye, EyeOff, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const { signIn, updatePassword, requestPasswordReset, isRecoveryMode } = useAuth();
  const { settings } = useSystemSettings();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isRecoveryMode) {
        if (password.length < 6) {
          toast.error('A senha deve ter pelo menos 6 caracteres');
          return;
        }

        if (password !== confirmPassword) {
          toast.error('As senhas nao coincidem');
          return;
        }

        const { error } = await updatePassword(password);
        if (error) {
          toast.error(error.message || 'Erro ao redefinir senha');
        } else {
          toast.success('Senha alterada com sucesso');
          navigate('/dashboard');
        }
        return;
      }

      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message || 'Erro ao fazer login');
      } else {
        toast.success('Login realizado com sucesso');
        navigate('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error('Informe seu e-mail para receber o link de recuperacao');
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await requestPasswordReset(email);
      if (error) {
        toast.error(error.message || 'Erro ao solicitar recuperacao de senha');
        return;
      }

      setResetDialogOpen(false);
      toast.success('Enviamos o link de recuperacao para seu e-mail');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="text-center">
            <img
              src={settings.platform_logo_url || 'https://i.ibb.co/wF8KhQCN/sem-fundo.png'}
              alt={settings.platform_name || 'Logo'}
              className="w-20 h-20 rounded-2xl object-contain mx-auto mb-6"
            />
            <h1 className="text-3xl font-display font-bold text-foreground">
              {isRecoveryMode ? 'Defina sua nova senha' : 'Bem-vindo de volta'}
            </h1>
            <p className="text-muted-foreground mt-2">
              {isRecoveryMode ? 'Digite a nova senha para concluir a recuperacao' : 'Acesse sua conta para continuar'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {!isRecoveryMode && (
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 input-focus"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">{isRecoveryMode ? 'Nova senha' : 'Senha'}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 input-focus"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {isRecoveryMode && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="********"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10 input-focus"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full btn-animate" disabled={loading}>
              {loading ? 'Carregando...' : isRecoveryMode ? 'Salvar nova senha' : 'Entrar'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          {!isRecoveryMode && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setResetDialogOpen(true)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Esqueceu a senha?
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-gradient-hero items-center justify-center p-12">
        <div className="max-w-lg text-white text-center">
          <h2 className="text-4xl font-display font-bold mb-6">
            Transforme seu futuro com educacao de qualidade
          </h2>
          <p className="text-white/80 text-lg">
            Acesse cursos de EJA e tecnicos, acompanhe seu progresso e conquiste seus certificados.
          </p>
        </div>
      </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recuperar senha</AlertDialogTitle>
            <AlertDialogDescription>
              Vamos enviar um link de recuperacao para o e-mail informado no campo de login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleForgotPassword();
              }}
              disabled={resetLoading}
            >
              {resetLoading ? 'Enviando...' : 'Enviar link'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
