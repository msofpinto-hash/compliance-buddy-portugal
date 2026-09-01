import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "id-ai-literacy-ack-v1";

/**
 * Literacia em IA (Regulamento (UE) 2024/1689, art.º 4).
 * Mostrado uma vez a administradores no primeiro acesso.
 */
export function AILiteracyNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const acknowledge = () => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : acknowledge())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-terracotta/10">
            <Sparkles className="h-5 w-5 text-terracotta" aria-hidden="true" />
          </div>
          <DialogTitle>Utilização de IA nesta plataforma</DialogTitle>
          <DialogDescription>
            Informação obrigatória de literacia em IA (art.º 4.º do Regulamento (UE) 2024/1689).
          </DialogDescription>
        </DialogHeader>

        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            A IA é usada para <strong>sugerir</strong> categorias, requisitos e relações entre
            diplomas — nunca para decidir.
          </li>
          <li>
            Os resultados podem conter erros ou omissões. <strong>Valide sempre</strong> antes de
            aprovar.
          </li>
          <li>Todo o conteúdo assistido por IA está identificado com a etiqueta “Sugerido por IA”.</li>
          <li>Cada operação de IA fica registada para efeitos de auditoria.</li>
          <li>Não são enviados dados pessoais de clientes para modelos de IA.</li>
        </ul>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" asChild>
            <Link to="/politica-ia" target="_blank" rel="noopener noreferrer">
              Ler a política completa
            </Link>
          </Button>
          <Button onClick={acknowledge}>Compreendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
