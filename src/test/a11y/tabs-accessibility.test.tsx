import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookOpen, Upload, Building2, Users } from "lucide-react";

/**
 * Acessibilidade: Tabs com ícones devem ter um nome acessível
 * (texto visível ou .sr-only) para leitores de ecrã.
 */
describe("A11y: Tabs com ícones", () => {
  it("cada tab expõe um nome acessível mesmo com texto escondido visualmente", () => {
    render(
      <Tabs defaultValue="biblioteca">
        <TabsList>
          <TabsTrigger value="biblioteca">
            <BookOpen aria-hidden="true" />
            <span className="hidden sm:inline">Biblioteca</span>
            <span className="sr-only sm:hidden">Biblioteca</span>
          </TabsTrigger>
          <TabsTrigger value="carregar">
            <Upload aria-hidden="true" />
            <span className="hidden sm:inline">Carregar</span>
            <span className="sr-only sm:hidden">Carregar</span>
          </TabsTrigger>
          <TabsTrigger value="clients">
            <Building2 aria-hidden="true" />
            <span className="hidden sm:inline">Clientes</span>
            <span className="sr-only sm:hidden">Clientes</span>
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users aria-hidden="true" />
            <span className="hidden sm:inline">Utilizadores</span>
            <span className="sr-only sm:hidden">Utilizadores</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="biblioteca">conteudo</TabsContent>
      </Tabs>
    );

    for (const name of ["Biblioteca", "Carregar", "Clientes", "Utilizadores"]) {
      // Em jsdom, hidden/sr-only não escondem o texto: o nome acessível
      // pode conter o label duplicado. O importante é que NÃO esteja vazio.
      const tab = screen.getByRole("tab", { name: new RegExp(name, "i") });
      expect(tab).toBeInTheDocument();
      expect(tab.getAttribute("aria-selected")).not.toBeNull();
    }
  });

  it("falha quando uma tab só tem ícone sem texto acessível", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a" data-testid="icon-only">
            <BookOpen aria-hidden="true" />
          </TabsTrigger>
        </TabsList>
      </Tabs>
    );
    const tab = screen.getByTestId("icon-only");
    // Sem texto visível nem aria-label, o nome acessível fica vazio
    expect(tab.textContent?.trim()).toBe("");
  });
});
