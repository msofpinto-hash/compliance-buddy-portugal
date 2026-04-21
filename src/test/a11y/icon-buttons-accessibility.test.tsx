import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { LogOut, Trash2, X } from "lucide-react";

/**
 * Acessibilidade: botões só com ícone devem expor um nome acessível
 * (via texto visível, .sr-only, aria-label ou title).
 */
describe("A11y: Botões com ícone", () => {
  it("botões icon-only precisam de aria-label", () => {
    render(
      <>
        <Button size="icon" aria-label="Eliminar">
          <Trash2 aria-hidden="true" />
        </Button>
        <Button size="icon" aria-label="Fechar">
          <X aria-hidden="true" />
        </Button>
      </>
    );
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
  });

  it("botão com ícone + texto sr-only mantém nome acessível", () => {
    render(
      <Button>
        <LogOut aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Sair</span>
      </Button>
    );
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
  });

  it("LogoutConfirmDialog expõe o trigger com nome acessível", () => {
    render(<LogoutConfirmDialog onConfirm={() => {}} />);
    // 'Sair' está em <span className="hidden sm:inline">, mas continua no DOM
    expect(screen.getByRole("button", { name: /sair/i })).toBeInTheDocument();
  });

  it("deteta botão icon-only sem aria-label (anti-padrão)", () => {
    render(
      <Button size="icon" data-testid="bad-btn">
        <X aria-hidden="true" />
      </Button>
    );
    const btn = screen.getByTestId("bad-btn");
    const accessibleName =
      btn.getAttribute("aria-label") || btn.textContent?.trim() || "";
    expect(accessibleName).toBe("");
  });
});
