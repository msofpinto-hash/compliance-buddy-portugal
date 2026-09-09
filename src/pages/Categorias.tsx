import { IDTopNav } from "@/components/client/IDTopNav";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { CategoriasPanel } from "@/components/client/CategoriasPanel";
import { FolderTree } from "lucide-react";

export default function Categorias() {
  return (
    <div className="min-h-screen bg-background">
      <RouteSeo />
      <IDTopNav />

      <main className="container mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold">
            <FolderTree className="h-6 w-6 text-primary" />
            Categorias
          </h1>
          <p className="text-sm text-muted-foreground">
            Organize os diplomas por tema, descritor e subdescritor.
          </p>
        </header>

        <CategoriasPanel />
      </main>
    </div>
  );
}
