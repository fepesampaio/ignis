import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle } from "lucide-react";

interface AIWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIWarningDialog({ open, onOpenChange }: AIWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Uso de Inteligência Artificial nas Atividades do Curso
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            O uso de Inteligência Artificial para responder atividades, provas e trabalhos 
            pode parecer uma solução rápida, mas <strong className="text-foreground">não compensa</strong> e 
            traz várias desvantagens para o seu aprendizado.
          </p>

          <p>
            Quando as respostas são feitas por IA, não há construção real de conhecimento, 
            pois o conteúdo não foi resultado do seu esforço, estudo ou compreensão. Ao final 
            do curso, o aluno pode até ter concluído as atividades, mas não terá desenvolvido 
            as competências e habilidades necessárias, o que compromete sua formação e seu 
            desempenho profissional.
          </p>

          <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="font-medium text-foreground mb-2">Além disso:</p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                O aprendizado se torna superficial e temporário
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                Há dificuldade em provas presenciais ou avaliações práticas
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                O aluno perde a oportunidade de evoluir intelectualmente
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                O certificado perde valor quando não é acompanhado de conhecimento real
              </li>
            </ul>
          </div>

          <p>
            O objetivo do EAD não é apenas concluir tarefas, mas <strong className="text-foreground">aprender de verdade</strong>, 
            desenvolver autonomia, senso crítico e preparo para o mercado de trabalho.
          </p>

          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="font-medium text-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              Use a tecnologia como apoio para estudar, pesquisar e compreender melhor os 
              conteúdos — não como substituição do seu esforço.
            </p>
          </div>

          <p className="text-center font-medium text-foreground pt-2">
            Seu aprendizado é o maior patrimônio que você pode levar deste curso.
          </p>
        </div>

        <div className="flex justify-center pt-4">
          <Button onClick={() => onOpenChange(false)}>
            Entendi, vou me dedicar!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
