import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TwoFactorVerifyProps {
  factorId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function TwoFactorVerify({ factorId, onSuccess, onCancel }: TwoFactorVerifyProps) {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (code.length !== 6) {
      setError("O código deve ter 6 dígitos");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      // First create a challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId
      });

      if (challengeError) throw challengeError;

      // Then verify the challenge with the code
      const { data, error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code
      });

      if (verifyError) throw verifyError;

      onSuccess();
    } catch (err: any) {
      console.error("2FA verification error:", err);
      if (err.message?.includes("Invalid") || err.message?.includes("invalid")) {
        setError("Código inválido. Verifique e tente novamente.");
      } else {
        setError(err.message || "Erro ao verificar código");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Shield className="h-6 w-6" />
        </div>
        <CardTitle>Verificação de Dois Fatores</CardTitle>
        <CardDescription>
          Introduza o código da sua aplicação de autenticação
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerify} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="2fa-code">Código de Verificação</Label>
            <Input
              id="2fa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl tracking-[0.5em] font-mono"
              autoFocus
              autoComplete="one-time-code"
            />
            <p className="text-xs text-muted-foreground text-center">
              Código de 6 dígitos do Google Authenticator, Authy, etc.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onCancel}
              disabled={isVerifying}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={code.length !== 6 || isVerifying}
            >
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verificar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}