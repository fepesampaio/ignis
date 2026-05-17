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

interface DeleteExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examTitle: string;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteExamDialog({
  open,
  onOpenChange,
  examTitle,
  onConfirm,
  isDeleting,
}: DeleteExamDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Prova</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir a prova "{examTitle}"? 
            Todas as questões e tentativas dos alunos serão perdidas. 
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Excluindo...' : 'Excluir'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
