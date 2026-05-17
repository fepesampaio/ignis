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

interface ImportBunnyVideosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  courseId: string;
  currentLessonCount: number;
}

export function ImportBunnyVideosDialog({
  open,
  onOpenChange,
  subjectId,
  courseId,
  currentLessonCount,
}: ImportBunnyVideosDialogProps) {
  const queryClient = useQueryClient();
  const [collectionId, setCollectionId] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);

  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await supabase.functions.invoke("import-bunny-videos", {
        body: {
          collectionId,
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
    if (!collectionId.trim()) {
      toast.error("Informe o ID da Collection");
      return;
    }
    setImportResult(null);
    importMutation.mutate();
  };

  const handleClose = () => {
    setCollectionId("");
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Importar Vídeos do Bunny
          </DialogTitle>
          <DialogDescription>
            Importe todos os vídeos de uma collection do Bunny Stream como aulas.
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
              <Label htmlFor="collectionId">Collection ID</Label>
              <Input
                id="collectionId"
                placeholder="Ex: a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Encontre o ID da collection no painel do Bunny Stream. 
                Todos os vídeos serão importados como aulas ordenadas alfabeticamente.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={importMutation.isPending || !collectionId.trim()}
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
