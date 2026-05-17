import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Video, CheckCircle } from "lucide-react";

interface ImportVimeoVideosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  courseId: string;
  currentLessonCount: number;
}

export function ImportVimeoVideosDialog({
  open,
  onOpenChange,
  subjectId,
  courseId,
  currentLessonCount,
}: ImportVimeoVideosDialogProps) {
  const queryClient = useQueryClient();
  const [folderId, setFolderId] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);

  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await supabase.functions.invoke("import-vimeo-videos", {
        body: {
          folderId,
          subjectId,
          courseId,
          startOrderIndex: currentLessonCount,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Erro ao importar vídeos");
      }

      if (!response.data.success) {
        throw new Error(response.data.error || "Erro ao importar vídeos");
      }

      return response.data;
    },
    onSuccess: (data) => {
      setImportResult({ imported: data.imported });
      queryClient.invalidateQueries({ queryKey: ["lessons", subjectId] });
      toast.success(data.message);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleImport = () => {
    if (!folderId.trim()) {
      toast.error("Informe o ID da Pasta (Folder)");
      return;
    }
    setImportResult(null);
    importMutation.mutate();
  };

  const handleClose = () => {
    setFolderId("");
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Importar Vídeos do Vimeo
          </DialogTitle>
          <DialogDescription>
            Importe todos os vídeos de uma pasta (folder/project) do Vimeo como aulas.
          </DialogDescription>
        </DialogHeader>

        {importResult ? (
          <div className="py-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <p className="text-lg font-medium">
                {importResult.imported} aulas importadas!
              </p>
              <p className="text-sm text-muted-foreground">
                As aulas foram adicionadas à matéria.
              </p>
            </div>
            <Button onClick={handleClose}>Fechar</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="folderId">Folder ID (Project ID)</Label>
              <Input
                id="folderId"
                placeholder="Ex: 12345678"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Encontre o ID da pasta na URL do Vimeo: vimeo.com/manage/folders/<strong>ID</strong>.
                Os vídeos serão importados em ordem alfabética.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={importMutation.isPending || !folderId.trim()}
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  "Importar Vídeos"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
