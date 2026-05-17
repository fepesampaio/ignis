import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const brazilianStates = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const formSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  wallet_id: z.string().min(10, 'Wallet ID inválido'),
  city: z.string().optional(),
  state: z.string().optional(),
  is_active: z.boolean().default(true),
});

type FormData = z.infer<typeof formSchema>;

interface PoloFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  polo?: {
    id: string;
    name: string;
    wallet_id: string;
    city: string | null;
    state: string | null;
    is_active: boolean;
  } | null;
}

export function PoloFormDialog({ open, onOpenChange, polo }: PoloFormDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!polo;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      wallet_id: '',
      city: '',
      state: '',
      is_active: true,
    },
  });

  useEffect(() => {
    if (polo) {
      form.reset({
        name: polo.name,
        wallet_id: polo.wallet_id,
        city: polo.city || '',
        state: polo.state || '',
        is_active: polo.is_active,
      });
    } else {
      form.reset({
        name: '',
        wallet_id: '',
        city: '',
        state: '',
        is_active: true,
      });
    }
  }, [polo, form]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (isEditing) {
        const { error } = await supabase
          .from('polos')
          .update({
            name: data.name,
            wallet_id: data.wallet_id,
            city: data.city || null,
            state: data.state || null,
            is_active: data.is_active,
          })
          .eq('id', polo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('polos')
          .insert({
            name: data.name,
            wallet_id: data.wallet_id,
            city: data.city || null,
            state: data.state || null,
            is_active: data.is_active,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-polos'] });
      toast.success(isEditing ? 'Polo atualizado com sucesso!' : 'Polo criado com sucesso!');
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao salvar polo');
    },
  });

  const handleSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Polo' : 'Novo Polo'}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Atualize os dados do polo'
              : 'Cadastre um novo polo com seu Wallet ID para receber splits de pagamento'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Polo *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Polo São Paulo Centro" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="wallet_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Wallet ID (Asaas) *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: wal_xxxxxxxxxxxxxxxx" {...field} />
                  </FormControl>
                  <FormDescription>
                    ID da carteira do Asaas que receberá os splits
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input placeholder="Cidade" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {brazilianStates.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Polo Ativo</FormLabel>
                    <FormDescription>
                      Polos inativos não aparecem na seleção de matrícula
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {isEditing ? 'Salvar' : 'Criar Polo'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
