import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Scale, AlertCircle, Clock, CheckCircle2, ArrowLeft, Mail, Check, X, ShieldAlert, ArrowRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { TwoFactorVerify } from "@/components/auth/TwoFactorVerify";
import { motion } from "framer-motion";
import authVisual from "@/assets/sustain-hero.jpg";


interface LoginCheckResult {
  allowed: boolean;
  failed_attempts: number;
  max_attempts: number;
  remaining_attempts: number;
  lockout_until: string | null;
  lockout_minutes: number;
}

// Clean brand logo
const BrandLogo = ({ variant = "default" }: { variant?: "default" | "light" }) => (
  <Link
    to="/"
    className={
      variant === "light"
        ? "inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-primary-foreground/10 border border-primary-foreground/20 backdrop-blur-md transition-all duration-200 hover:bg-primary-foreground/15"
        : "inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-all duration-200"
    }
  >
    <div className={variant === "light" ? "flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/20" : "flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-sm"}>
      <Scale className={variant === "light" ? "h-5 w-5 text-primary-foreground" : "h-5 w-5 text-primary-foreground"} aria-hidden="true" />
    </div>
    <div className="flex flex-col items-start">
      <span className={variant === "light" ? "text-lg font-heading font-bold tracking-tight text-primary-foreground" : "text-lg font-heading font-bold tracking-tight text-foreground"}>I&D</span>
      <span className={variant === "light" ? "text-xs font-heading font-semibold tracking-[0.15em] text-primary-foreground/80" : "text-xs font-heading font-semibold tracking-[0.15em] text-primary"}>
        COMPLIANCE
      </span>
    </div>
  </Link>
);


const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [loginBlocked, setLoginBlocked] = useState<LoginCheckResult | null>(null);
  const { 
    signIn, signUp, signOut, user, isAdmin, isApproved, isPendingApproval, 
    isLoading: authLoading, mfaChallenge, completeMFAChallenge, cancelMFAChallenge
  } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && user && isApproved && !mfaChallenge) {
      if (isAdmin) {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    }
  }, [authLoading, user, isAdmin, isApproved, mfaChallenge, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoginBlocked(null);
    setIsLoading(true);

    try {
      const { data: checkResult, error: checkError } = await supabase
        .rpc('check_login_allowed', { p_email: email });

      if (checkError) {
        console.error('Error checking login status:', checkError);
      } else if (checkResult) {
        const result = checkResult as unknown as LoginCheckResult;
        if (!result.allowed) {
          setLoginBlocked(result);
          setIsLoading(false);
          return;
        }
      }

      const { error } = await signIn(email, password);
      
      if (error) {
        await supabase.rpc('record_login_attempt', { p_email: email, p_success: false });
        const { data: newCheckResult } = await supabase.rpc('check_login_allowed', { p_email: email });
        
        if (newCheckResult) {
          const result = newCheckResult as unknown as LoginCheckResult;
          if (!result.allowed) {
            setLoginBlocked(result);
          } else {
            const remaining = result.remaining_attempts;
            if (error.message.includes("Invalid login credentials")) {
              setError(`Email ou password incorretos. ${remaining} tentativa${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''}.`);
            } else {
              setError(error.message);
            }
          }
        } else {
          setError(error.message.includes("Invalid login credentials") ? "Email ou password incorretos" : error.message);
        }
      } else {
        await supabase.rpc('record_login_attempt', { p_email: email, p_success: true });
        toast({ title: "Login efetuado", description: "A verificar acesso..." });
      }
    } catch (err) {
      setError("Ocorreu um erro inesperado");
    } finally {
      setIsLoading(false);
    }
  };

  const passwordValidation = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };
  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!fullName.trim()) { setError("Por favor, introduza o seu nome completo"); setIsLoading(false); return; }
    if (!isPasswordValid) { setError("A password não cumpre os requisitos de segurança"); setIsLoading(false); return; }
    if (password !== confirmPassword) { setError("As passwords não coincidem"); setIsLoading(false); return; }

    try {
      const { error } = await signUp(email, password, fullName);
      if (error) {
        const m = error.message || "";
        if (m.includes("already registered")) setError("Este email já está registado");
        else if (m.toLowerCase().includes("weak") || m.toLowerCase().includes("pwned")) setError("Esta password é demasiado comum ou apareceu em fugas de dados. Escolha outra mais forte.");
        else if (m.includes("Signups not allowed")) setError("O registo de novas contas está desativado. Contacte o administrador.");
        else setError(m);
      } else {
        setRegistrationSuccess(true);
        toast({ title: "Conta criada", description: "O seu registo foi submetido para aprovação." });
      }
    } catch (err) {
      setError("Ocorreu um erro inesperado");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    if (!email.trim()) { setError("Por favor, introduza o seu email"); setIsLoading(false); return; }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) { setError(error.message); } else {
        setResetEmailSent(true);
        toast({ title: "Email enviado", description: "Verifique a sua caixa de correio." });
      }
    } catch (err) {
      setError("Ocorreu um erro inesperado");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => { await signOut(); setRegistrationSuccess(false); };
  const handleBackToLogin = () => { setShowForgotPassword(false); setResetEmailSent(false); setError(null); };

  // --- Split-screen shell: immersive brand panel + clean form panel ---
  const PageShell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-background">
      {/* Visual panel */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12">
        <img
          src={authVisual}
          alt="Floresta iluminada pelo sol"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/85 via-primary/60 to-foreground/70" />

        <div className="relative z-10">
          <BrandLogo variant="light" />
        </div>

        <motion.div
          className="relative z-10 max-w-lg"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <h2 className="text-4xl xl:text-5xl font-heading font-bold leading-[1.1] text-primary-foreground">
            O seu assistente digital de conformidade
          </h2>
          <p className="mt-5 text-lg text-primary-foreground/80">
            Auditorias inteligentes, legislação atualizada e gestão de evidências — tudo num só lugar.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {[
              { icon: CheckCircle2, text: "Monitorização 24/7" },
              { icon: Scale, text: "Legislação atualizada" },
              { icon: ShieldAlert, text: "Auditorias rigorosas" },
            ].map((f) => (
              <span
                key={f.text}
                className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3.5 py-1.5 text-sm text-primary-foreground backdrop-blur-sm"
              >
                <f.icon className="h-4 w-4" aria-hidden="true" />
                {f.text}
              </span>
            ))}
          </div>
        </motion.div>

        <p className="relative z-10 text-sm text-primary-foreground/70">
          © {new Date().getFullYear()} ID Compliance. Todos os direitos reservados.
        </p>
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-col items-center justify-center overflow-hidden p-6 sm:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-accent/20 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-secondary/40 blur-[100px]" />
        <div className="relative z-10 w-full max-w-md flex flex-col items-center">
          <div className="lg:hidden mb-8"><BrandLogo /></div>
          {children}
        </div>
        <p className="relative z-10 mt-8 text-xs text-muted-foreground lg:hidden text-center">
          © {new Date().getFullYear()} ID Compliance. Todos os direitos reservados.
        </p>
      </main>
    </div>
  );


  // Loading
  if (authLoading) {
    return (
      <PageShell>
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </PageShell>
    );
  }

  // MFA
  if (mfaChallenge) {
    return (
      <PageShell>
        <h1 className="sr-only">Aceder à Plataforma</h1>
        <div className="relative z-10">
          <TwoFactorVerify
            factorId={mfaChallenge.factorId}
            onSuccess={() => { completeMFAChallenge(); toast({ title: "Login efetuado", description: "Verificação 2FA concluída com sucesso." }); }}
            onCancel={async () => { await cancelMFAChallenge(); toast({ title: "Login cancelado", description: "Verificação 2FA cancelada." }); }}
          />
        </div>
      </PageShell>
    );
  }

  // Pending approval
  if (isPendingApproval) {
    return (
      <PageShell>
        <h1 className="sr-only">Aceder à Plataforma</h1>
        <div className="mb-8 relative z-10"><BrandLogo /></div>
        <div className="relative z-10">
          <Card className="w-full max-w-md shadow-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary border border-border">
                <Clock className="h-7 w-7 text-foreground" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl">Aguarda Aprovação</CardTitle>
              <CardDescription>A sua conta foi criada com sucesso e está a aguardar aprovação por um administrador.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-accent/20 border-accent">
                <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                <AlertDescription>Será notificado por email quando a sua conta for aprovada.</AlertDescription>
              </Alert>
              <div className="text-center text-sm text-muted-foreground">
                Sessão iniciada como: <strong className="text-primary">{user?.email}</strong>
              </div>
              <Button variant="outline" className="w-full" onClick={handleSignOut}>Terminar sessão</Button>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  // Registration success
  if (registrationSuccess && !user) {
    return (
      <PageShell>
        <h1 className="sr-only">Aceder à Plataforma</h1>
        <div className="mb-8 relative z-10"><BrandLogo /></div>
        <div className="relative z-10">
          <Card className="w-full max-w-md shadow-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/30 border border-primary/20">
                <CheckCircle2 className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl">Registo Submetido</CardTitle>
              <CardDescription>A sua conta foi criada com sucesso!</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-accent/20 border-accent">
                <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                <AlertDescription>O seu pedido de acesso será analisado por um administrador. Receberá uma notificação quando a sua conta for aprovada.</AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" onClick={() => setRegistrationSuccess(false)}>Voltar ao login</Button>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  // Redirect
  if (user && isApproved) {
    return <PageShell><Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" /></PageShell>;
  }

  // Forgot password
  if (showForgotPassword) {
    return (
      <PageShell>
        <h1 className="sr-only">Aceder à Plataforma</h1>
        <div className="mb-8 relative z-10"><BrandLogo /></div>
        <div className="relative z-10">
          <Card className="w-full max-w-md shadow-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary border border-border">
                <Mail className="h-7 w-7 text-foreground" aria-hidden="true" />
              </div>
              <CardTitle className="text-xl">Recuperar Password</CardTitle>
              <CardDescription>
                {resetEmailSent ? "Verifique o seu email para redefinir a password" : "Introduza o seu email para receber instruções"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {resetEmailSent ? (
                <>
                  <Alert className="bg-accent/20 border-accent">
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                    <AlertDescription>Enviámos um email com instruções para redefinir a sua password. Verifique também a pasta de spam.</AlertDescription>
                  </Alert>
                  <Button variant="outline" className="w-full gap-2" onClick={handleBackToLogin}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao login
                  </Button>
                </>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  {error && (
                    <Alert variant="destructive"><AlertCircle className="h-4 w-4" aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input id="reset-email" type="email" placeholder="email@exemplo.pt" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                    Enviar instruções
                  </Button>
                  <Button type="button" variant="ghost" className="w-full gap-2" onClick={handleBackToLogin}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao login
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  // --- Main auth form ---
  return (
    <PageShell>
      <motion.div
        className="w-full"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-7">
          <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">
            Aceder à Plataforma
          </h1>
          <p className="text-muted-foreground mt-2">
            Gestão de conformidade legal para a sua organização
          </p>
        </div>

        <Card className="border-border/70 shadow-xl shadow-primary/5 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Área de Cliente</CardTitle>
            <CardDescription>Aceda à sua área de gestão de conformidade legal</CardDescription>
          </CardHeader>

              <CardContent>
                <Tabs defaultValue="login" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">Entrar</TabsTrigger>
                    <TabsTrigger value="register">Registar</TabsTrigger>
                  </TabsList>

                  <TabsContent value="login">
                    <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                      {loginBlocked && (
                        <Alert variant="destructive">
                          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                          <AlertDescription>
                            <div className="font-medium">Conta temporariamente bloqueada</div>
                            <p className="text-xs mt-1">
                              Demasiadas tentativas falhadas. Tente novamente {loginBlocked.lockout_until 
                                ? `às ${format(new Date(loginBlocked.lockout_until), "HH:mm", { locale: pt })}`
                                : `em ${loginBlocked.lockout_minutes} minutos`
                              }.
                            </p>
                          </AlertDescription>
                        </Alert>
                      )}
                      {error && !loginBlocked && (
                        <Alert variant="destructive"><AlertCircle className="h-4 w-4" aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert>
                      )}
                      
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" placeholder="email@exemplo.pt" value={email} onChange={(e) => setEmail(e.target.value)} required />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">Password</Label>
                          <Button type="button" variant="link" className="h-auto p-0 text-xs text-primary" onClick={() => setShowForgotPassword(true)}>
                            Esqueceu a password?
                          </Button>
                        </div>
                        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                      </div>

                      <Button type="submit" className="w-full group" disabled={isLoading || !!loginBlocked}>
                        {isLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <span className="flex items-center gap-2">
                            {loginBlocked ? "Conta Bloqueada" : "Entrar"}
                            {!loginBlocked && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" aria-hidden="true" />}
                          </span>
                        )}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="register">
                    <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                      {error && (
                        <Alert variant="destructive"><AlertCircle className="h-4 w-4" aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="reg-name">Nome Completo</Label>
                        <Input id="reg-name" type="text" placeholder="O seu nome" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="reg-email">Email</Label>
                        <Input id="reg-email" type="email" placeholder="email@exemplo.pt" value={email} onChange={(e) => setEmail(e.target.value)} required />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="reg-password">Password</Label>
                        <Input
                          id="reg-password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={8}
                          className={password.length > 0 ? (isPasswordValid ? "border-primary focus:border-primary" : "border-destructive focus:border-destructive") : ""}
                        />
                        {password.length > 0 && (
                          <div className="mt-2 space-y-1 text-xs">
                            {[
                              { ok: passwordValidation.minLength, text: "Mínimo 8 caracteres" },
                              { ok: passwordValidation.hasUppercase, text: "Uma letra maiúscula" },
                              { ok: passwordValidation.hasLowercase, text: "Uma letra minúscula" },
                              { ok: passwordValidation.hasNumber, text: "Um número" },
                            ].map((v) => (
                              <div key={v.text} className={`flex items-center gap-1.5 ${v.ok ? "text-primary" : "text-muted-foreground"}`}>
                                {v.ok ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
                                {v.text}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reg-confirm-password">Confirmar Password</Label>
                        <Input
                          id="reg-confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          minLength={8}
                          className={confirmPassword.length > 0 ? (password === confirmPassword ? "border-primary focus:border-primary" : "border-destructive focus:border-destructive") : ""}
                        />
                        {confirmPassword.length > 0 && password !== confirmPassword && (
                          <div className="flex items-center gap-1.5 text-xs text-destructive mt-1"><X className="h-3 w-3" aria-hidden="true" /> As passwords não coincidem</div>
                        )}
                        {confirmPassword.length > 0 && password === confirmPassword && (
                          <div className="flex items-center gap-1.5 text-xs text-primary mt-1"><Check className="h-3 w-3" aria-hidden="true" /> Passwords coincidem</div>
                        )}
                      </div>

                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                        Criar conta
                      </Button>

                      <Alert className="bg-secondary/30 border-secondary">
                        <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <AlertDescription className="text-xs text-muted-foreground">
                          Após criar conta, o seu acesso ficará pendente de aprovação por um administrador.
                        </AlertDescription>
                      </Alert>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
        </Card>
      </motion.div>

    </PageShell>
  );
};

export default Auth;
