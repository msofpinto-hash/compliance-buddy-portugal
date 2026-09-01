import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setHasRecoverySession(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasRecoverySession(!!session);
      setChecking(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const validation = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };
  const isValid = Object.values(validation).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValid) { setError("A password não cumpre os requisitos de segurança"); return; }
    if (password !== confirmPassword) { setError("As passwords não coincidem"); return; }

    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (updateError) {
      const m = updateError.message || "";
      if (m.includes("Current password") || m.includes("current_password")) {
        setError("O link de recuperação expirou. Peça um novo email de recuperação e abra o link imediatamente.");
      } else if (m.includes("should be different")) {
        setError("A nova password tem de ser diferente da anterior.");
      } else if (m.toLowerCase().includes("pwned") || m.toLowerCase().includes("compromised")) {
        setError("Esta password foi encontrada em fugas de dados públicas. Escolha outra.");
      } else if (m.includes("session") || m.includes("JWT") || m.includes("Auth session missing")) {
        setError("Sessão de recuperação inválida. Peça um novo email de recuperação.");
      } else {
        setError(m);
      }
      return;
    }

    toast({ title: "Password atualizada", description: "Já pode entrar com a nova password." });
    navigate("/auth");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
          <CardTitle>Definir nova password</CardTitle>
          <CardDescription>Escolha uma nova password para a sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          {checking ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : !hasRecoverySession ? (
            <Alert variant="destructive">
              <AlertDescription>
                Link de recuperação inválido ou expirado. Peça um novo email de recuperação na página de login.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova password</Label>
                <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>{validation.minLength ? "✓" : "•"} Mínimo 8 caracteres</li>
                  <li>{validation.hasUppercase ? "✓" : "•"} Uma letra maiúscula</li>
                  <li>{validation.hasLowercase ? "✓" : "•"} Uma letra minúscula</li>
                  <li>{validation.hasNumber ? "✓" : "•"} Um número</li>
                </ul>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar password</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Guardar nova password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
