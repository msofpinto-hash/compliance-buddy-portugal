import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, ShieldCheck, ShieldOff, QrCode, Copy, Check, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TwoFactorSetupProps {
  isEnabled: boolean;
  onStatusChange: () => void;
}

export function TwoFactorSetup({ isEnabled, onStatusChange }: TwoFactorSetupProps) {
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  const startEnrollment = async () => {
    setIsEnrolling(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'ID Compliance Authenticator'
      });

      if (error) throw error;

      if (data.totp) {
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
        setFactorId(data.id);
      }
    } catch (err: any) {
      console.error("Error starting 2FA enrollment:", err);
      setError(err.message || "Erro ao iniciar configuração 2FA");
    } finally {
      setIsEnrolling(false);
    }
  };

  const verifyAndEnable = async () => {
    if (!factorId || verificationCode.length !== 6) return;

    setIsVerifying(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: verificationCode
      });

      if (error) throw error;

      toast.success("Autenticação de dois fatores ativada com sucesso!");
      resetState();
      onStatusChange();
    } catch (err: any) {
      console.error("Error verifying 2FA:", err);
      if (err.message?.includes("Invalid")) {
        setError("Código inválido. Verifique e tente novamente.");
      } else {
        setError(err.message || "Erro ao verificar código");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const disable2FA = async () => {
    setIsDisabling(true);
    setError(null);

    try {
      // Get existing factors
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      
      if (factorsError) throw factorsError;

      const verifiedFactors = factorsData.totp.filter(f => f.status === 'verified');
      
      for (const factor of verifiedFactors) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
      }

      toast.success("Autenticação de dois fatores desativada");
      setShowDisableConfirm(false);
      onStatusChange();
    } catch (err: any) {
      console.error("Error disabling 2FA:", err);
      setError(err.message || "Erro ao desativar 2FA");
    } finally {
      setIsDisabling(false);
    }
  };

  const resetState = () => {
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setVerificationCode("");
    setError(null);
  };

  const copySecret = async () => {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Código copiado!");
  };

  // Show QR code enrollment flow
  if (qrCode && secret) {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-4">
          <div className="mx-auto w-fit p-4 bg-white rounded-lg shadow-sm border">
            <img src={qrCode} alt="QR Code 2FA" className="w-48 h-48" />
          </div>
          
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Leia o código QR com a sua aplicação de autenticação (Google Authenticator, Authy, etc.)
            </p>
            <p className="text-xs text-muted-foreground">
              Ou introduza manualmente o código:
            </p>
            <div className="flex items-center justify-center gap-2">
              <code className="px-3 py-1.5 bg-muted rounded text-sm font-mono">
                {secret}
              </code>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={copySecret}
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="verification-code">Código de Verificação</Label>
          <Input
            id="verification-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-widest"
          />
          <p className="text-xs text-muted-foreground text-center">
            Introduza o código de 6 dígitos da sua aplicação
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={resetState}
            disabled={isVerifying}
          >
            Cancelar
          </Button>
          <Button
            className="flex-1"
            onClick={verifyAndEnable}
            disabled={verificationCode.length !== 6 || isVerifying}
          >
            {isVerifying ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            Ativar 2FA
          </Button>
        </div>
      </div>
    );
  }

  // Show disable confirmation
  if (showDisableConfirm) {
    return (
      <div className="space-y-4">
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Atenção:</strong> Desativar a autenticação de dois fatores reduz a segurança da sua conta.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setShowDisableConfirm(false)}
            disabled={isDisabling}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={disable2FA}
            disabled={isDisabling}
          >
            {isDisabling ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ShieldOff className="h-4 w-4 mr-2" />
            )}
            Confirmar Desativação
          </Button>
        </div>
      </div>
    );
  }

  // Default state - show enable/disable button
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label className="font-medium">Autenticação de Dois Fatores</Label>
            {isEnabled ? (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1">
                <ShieldCheck className="h-3 w-3" />
                Ativado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground gap-1">
                <Shield className="h-3 w-3" />
                Desativado
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {isEnabled 
              ? "A sua conta está protegida com autenticação de dois fatores"
              : "Adicione uma camada extra de segurança à sua conta"
            }
          </p>
        </div>
        {isEnabled ? (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowDisableConfirm(true)}
          >
            <ShieldOff className="h-4 w-4 mr-1" />
            Desativar
          </Button>
        ) : (
          <Button 
            variant="outline" 
            size="sm"
            onClick={startEnrollment}
            disabled={isEnrolling}
          >
            {isEnrolling ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <QrCode className="h-4 w-4 mr-1" />
            )}
            Configurar
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}