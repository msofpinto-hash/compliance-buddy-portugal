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
import { ThemeToggle } from "@/components/ThemeToggle";
import { motion } from "framer-motion";
import officeWorkspaceImg from "@/assets/office-workspace.jpg";

interface LoginCheckResult {
  allowed: boolean;
  failed_attempts: number;
  max_attempts: number;
  remaining_attempts: number;
  lockout_until: string | null;
  lockout_minutes: number;
}

// Corporate professional background - Warm I&D palette (beige, salmon, brown + green)
const CorporateBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Warm beige/cream base with subtle green */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50/90 via-stone-50 to-emerald-50/40 dark:from-[#1a1512] dark:via-[#141210] dark:to-[#0f1a14]" />
      
      {/* Subtle warm geometric pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"
        style={{
          backgroundImage: `
            repeating-linear-gradient(
              45deg,
              transparent,
              transparent 50px,
              hsl(30 40% 45%) 50px,
              hsl(30 40% 45%) 51px
            )
          `,
        }}
      />
      
      {/* Warm salmon/terracotta accent - top right */}
      <div 
        className="absolute -top-20 -right-20 w-[700px] h-[700px] opacity-20 dark:opacity-12"
        style={{
          background: 'radial-gradient(circle at center, hsl(15 50% 55% / 0.4) 0%, transparent 60%)'
        }}
      />
      
      {/* Forest green accent - bottom left */}
      <div 
        className="absolute -bottom-20 -left-20 w-[500px] h-[500px] opacity-25 dark:opacity-15"
        style={{
          background: 'radial-gradient(circle at center, hsl(152 45% 30% / 0.35) 0%, transparent 65%)'
        }}
      />
      
      {/* Warm brown accent - center */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] opacity-10 dark:opacity-6"
        style={{
          background: 'radial-gradient(ellipse at center, hsl(25 35% 40% / 0.2) 0%, transparent 70%)'
        }}
      />
    </div>
  );
};

// Removed TechParticles - keeping corporate clean look

// Corporate Logo Component - Warm I&D palette
const CorporateLogo = () => (
  <Link to="/" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/95 dark:bg-stone-900/90 border-2 border-stone-200 dark:border-amber-900/40 shadow-sm hover:border-amber-400 dark:hover:border-amber-600 hover:shadow-md transition-all duration-200 backdrop-blur-sm">
    {/* Icon container */}
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 shadow-sm">
      <Scale className="h-5 w-5 text-white" />
    </div>
    
    {/* Text */}
    <div className="flex flex-col items-start">
      <span className="text-lg font-bold text-stone-800 dark:text-amber-50 tracking-tight">I&D</span>
      <span className="text-xs font-semibold tracking-[0.15em] text-emerald-700 dark:text-emerald-400">
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
    signIn, 
    signUp, 
    signOut, 
    user, 
    isAdmin, 
    isApproved, 
    isPendingApproval, 
    isLoading: authLoading,
    mfaChallenge,
    completeMFAChallenge,
    cancelMFAChallenge
  } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect authenticated and approved users based on their role (only if no MFA pending)
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
      // Check if login is allowed (brute-force protection)
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
        // Record failed attempt
        await supabase.rpc('record_login_attempt', { 
          p_email: email, 
          p_success: false 
        });

        // Re-check if now blocked
        const { data: newCheckResult } = await supabase
          .rpc('check_login_allowed', { p_email: email });
        
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
          if (error.message.includes("Invalid login credentials")) {
            setError("Email ou password incorretos");
          } else {
            setError(error.message);
          }
        }
      } else {
        // Record successful attempt (clears failed attempts)
        await supabase.rpc('record_login_attempt', { 
          p_email: email, 
          p_success: true 
        });

        toast({
          title: "Login efetuado",
          description: "A verificar acesso...",
        });
      }
    } catch (err) {
      setError("Ocorreu um erro inesperado");
    } finally {
      setIsLoading(false);
    }
  };

  // Password validation functions
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

    if (!fullName.trim()) {
      setError("Por favor, introduza o seu nome completo");
      setIsLoading(false);
      return;
    }

    if (!isPasswordValid) {
      setError("A password não cumpre os requisitos de segurança");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("As passwords não coincidem");
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await signUp(email, password, fullName);
      
      if (error) {
        if (error.message.includes("already registered")) {
          setError("Este email já está registado");
        } else {
          setError(error.message);
        }
      } else {
        setRegistrationSuccess(true);
        toast({
          title: "Conta criada",
          description: "O seu registo foi submetido para aprovação.",
        });
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

    if (!email.trim()) {
      setError("Por favor, introduza o seu email");
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        setError(error.message);
      } else {
        setResetEmailSent(true);
        toast({
          title: "Email enviado",
          description: "Verifique a sua caixa de correio.",
        });
      }
    } catch (err) {
      setError("Ocorreu um erro inesperado");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setRegistrationSuccess(false);
  };

  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setResetEmailSent(false);
    setError(null);
  };

  // Loading state component
  const LoadingScreen = () => (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      <CorporateBackground />
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
    </div>
  );

  // Show loading while checking auth state
  if (authLoading) {
    return <LoadingScreen />;
  }

  // Show MFA verification if challenge is pending
  if (mfaChallenge) {
    return (
      <div className="min-h-screen relative flex items-center justify-center overflow-hidden p-4">
        <CorporateBackground />
        <div className="relative z-10">
          <TwoFactorVerify
            factorId={mfaChallenge.factorId}
            onSuccess={() => {
              completeMFAChallenge();
              toast({
                title: "Login efetuado",
                description: "Verificação 2FA concluída com sucesso.",
              });
            }}
            onCancel={async () => {
              await cancelMFAChallenge();
              toast({
                title: "Login cancelado",
                description: "Verificação 2FA cancelada.",
              });
            }}
          />
        </div>
      </div>
    );
  }

  // Show pending approval message for logged-in but unapproved users
  if (isPendingApproval) {
    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden p-4">
        <CorporateBackground />
        
        {/* Logo */}
        <div className="mb-8 relative z-10">
          <CorporateLogo />
        </div>

        <div className="relative z-10">
          <Card className="w-full max-w-md bg-white/95 dark:bg-stone-900/90 border-2 border-stone-200 dark:border-amber-900/40 shadow-lg backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 border-2 border-amber-300 dark:border-amber-700">
                <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <CardTitle className="text-stone-800 dark:text-amber-50 text-xl">Aguarda Aprovação</CardTitle>
              <CardDescription className="text-stone-600 dark:text-stone-400">
                A sua conta foi criada com sucesso e está a aguardar aprovação por um administrador.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-200 dark:border-emerald-800/50">
                <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <AlertDescription className="text-stone-700 dark:text-stone-300">
                  Será notificado por email quando a sua conta for aprovada. Entretanto, poderá tentar iniciar sessão novamente mais tarde.
                </AlertDescription>
              </Alert>
              <div className="text-center text-sm text-stone-600 dark:text-stone-400">
                Sessão iniciada como: <strong className="text-emerald-700 dark:text-emerald-400">{user?.email}</strong>
              </div>
              <Button 
                variant="outline" 
                className="w-full border-2 border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:border-amber-400 dark:hover:border-amber-600" 
                onClick={handleSignOut}
              >
                Terminar sessão
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show success message after registration
  if (registrationSuccess && !user) {
    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden p-4">
        <CorporateBackground />
        
        {/* Logo */}
        <div className="mb-8 relative z-10">
          <CorporateLogo />
        </div>

        <div className="relative z-10">
          <Card className="w-full max-w-md bg-white/95 dark:bg-stone-900/90 border-2 border-stone-200 dark:border-amber-900/40 shadow-lg backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 border-2 border-emerald-300 dark:border-emerald-700">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardTitle className="text-stone-800 dark:text-amber-50 text-xl">Registo Submetido</CardTitle>
              <CardDescription className="text-stone-600 dark:text-stone-400">
                A sua conta foi criada com sucesso!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-200 dark:border-emerald-800/50">
                <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <AlertDescription className="text-stone-700 dark:text-stone-300">
                  O seu pedido de acesso será analisado por um administrador. Receberá uma notificação quando a sua conta for aprovada.
                </AlertDescription>
              </Alert>
              <Button 
                variant="outline" 
                className="w-full border-2 border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:border-amber-400 dark:hover:border-amber-600" 
                onClick={() => setRegistrationSuccess(false)}
              >
                Voltar ao login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Don't render form if already authenticated and approved (redirect will happen)
  if (user && isApproved) {
    return <LoadingScreen />;
  }

  // Forgot password view
  if (showForgotPassword) {
    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden p-4">
        <CorporateBackground />
        
        {/* Logo */}
        <div className="mb-8 relative z-10">
          <CorporateLogo />
        </div>

        <div className="relative z-10">
          <Card className="w-full max-w-md bg-white/95 dark:bg-stone-900/90 border-2 border-stone-200 dark:border-amber-900/40 shadow-lg backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 border-2 border-amber-300 dark:border-amber-700">
                <Mail className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <CardTitle className="text-stone-800 dark:text-amber-50 text-xl">Recuperar Password</CardTitle>
              <CardDescription className="text-stone-600 dark:text-stone-400">
                {resetEmailSent 
                  ? "Verifique o seu email para redefinir a password"
                  : "Introduza o seu email para receber instruções"
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {resetEmailSent ? (
                <>
                  <Alert className="bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-200 dark:border-emerald-800/50">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <AlertDescription className="text-emerald-700 dark:text-emerald-300">
                      Enviámos um email com instruções para redefinir a sua password. 
                      Por favor, verifique também a pasta de spam.
                    </AlertDescription>
                  </Alert>
                  <Button 
                    variant="outline" 
                    className="w-full gap-2 border-2 border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:border-amber-400 dark:hover:border-amber-600" 
                    onClick={handleBackToLogin}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar ao login
                  </Button>
                </>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  {error && (
                    <Alert variant="destructive" className="bg-red-50 dark:bg-red-950/50 border-2 border-red-200 dark:border-red-800">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="reset-email" className="text-stone-700 dark:text-stone-300">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="email@exemplo.pt"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="bg-white dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 text-stone-800 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-emerald-500 dark:focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-0 shadow-sm" 
                    disabled={isLoading}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar instruções
                  </Button>

                  <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full gap-2 text-stone-600 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-amber-50 dark:hover:bg-amber-900/30" 
                    onClick={handleBackToLogin}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar ao login
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Main auth form
  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      <CorporateBackground />
      
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      {/* Two Column Layout */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
        
        {/* Left Column - Illustration & Message */}
        <div className="flex-1 text-center lg:text-left hidden md:block">
          {/* Office Workspace Photo */}
          <div className="relative mb-6">
            <img 
              src={officeWorkspaceImg} 
              alt="Profissional a trabalhar em compliance" 
              className="relative w-full max-w-md mx-auto lg:mx-0 rounded-2xl border-2 border-stone-200 dark:border-amber-900/40 shadow-lg"
            />
          </div>
          
          {/* Text Content */}
          <div className="space-y-4">
            <h2 className="text-3xl lg:text-4xl font-bold text-stone-800 dark:text-amber-50 leading-tight">
              O seu{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                assistente digital
              </span>
              <br />
              de conformidade
            </h2>
            <p className="text-stone-600 dark:text-stone-400 text-lg max-w-md mx-auto lg:mx-0">
              Auditorias inteligentes, legislação atualizada e gestão de evidências — tudo num só lugar.
            </p>
            
            {/* Features list */}
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start pt-4">
              {[
                { icon: CheckCircle2, text: "Monitorização 24/7" },
                { icon: Scale, text: "Legislação atualizada" },
                { icon: ShieldAlert, text: "Auditorias rigorosas" },
              ].map((feature) => (
                <div
                  key={feature.text}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 dark:bg-stone-800/80 border-2 border-stone-200 dark:border-amber-900/40 text-sm text-stone-700 dark:text-stone-200 shadow-sm backdrop-blur-sm"
                >
                  <feature.icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  {feature.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Auth Form */}
        <div className="w-full max-w-md">
          {/* Logo - Mobile & Desktop */}
          <div className="flex justify-center mb-6">
            <CorporateLogo />
          </div>

          <Card className="bg-white/95 dark:bg-stone-900/90 border-2 border-stone-200 dark:border-amber-900/40 shadow-lg backdrop-blur-sm">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-stone-800 dark:text-amber-50 text-xl">Área de Cliente</CardTitle>
              <CardDescription className="text-stone-600 dark:text-stone-400">
                Aceda à sua área de gestão de conformidade legal
              </CardDescription>
            </CardHeader>
            <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-stone-100 dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700">
                <TabsTrigger 
                  value="login" 
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-stone-900 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm text-stone-600 dark:text-stone-400"
                >
                  Entrar
                </TabsTrigger>
                <TabsTrigger 
                  value="register"
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-stone-900 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm text-stone-600 dark:text-stone-400"
                >
                  Registar
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                  {loginBlocked && (
                    <Alert variant="destructive" className="bg-red-50 dark:bg-red-950/50 border-2 border-red-200 dark:border-red-800">
                      <ShieldAlert className="h-4 w-4" />
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
                    <Alert variant="destructive" className="bg-red-50 dark:bg-red-950/50 border-2 border-red-200 dark:border-red-800">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-stone-700 dark:text-stone-300">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@exemplo.pt"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-white dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 text-stone-800 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-emerald-500 dark:focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-stone-700 dark:text-stone-300">Password</Label>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                        onClick={() => setShowForgotPassword(true)}
                      >
                        Esqueceu a password?
                      </Button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-white dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 text-stone-800 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-emerald-500 dark:focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-0 shadow-sm group" 
                    disabled={isLoading || !!loginBlocked}
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <span className="flex items-center gap-2">
                        {loginBlocked ? "Conta Bloqueada" : "Entrar"}
                        {!loginBlocked && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                      </span>
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                  {error && (
                    <Alert variant="destructive" className="bg-red-50 dark:bg-red-950/50 border-2 border-red-200 dark:border-red-800">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="reg-name" className="text-stone-700 dark:text-stone-300">Nome Completo</Label>
                    <Input
                      id="reg-name"
                      type="text"
                      placeholder="O seu nome"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="bg-white dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 text-stone-800 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-emerald-500 dark:focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="reg-email" className="text-stone-700 dark:text-stone-300">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="email@exemplo.pt"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-white dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 text-stone-800 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-emerald-500 dark:focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="reg-password" className="text-stone-700 dark:text-stone-300">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className={`bg-white dark:bg-stone-800 border-2 text-stone-800 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:ring-emerald-500/20 ${
                        password.length > 0 
                          ? (isPasswordValid ? "border-emerald-500 focus:border-emerald-500" : "border-amber-500 focus:border-amber-500") 
                          : "border-stone-200 dark:border-stone-700 focus:border-emerald-500"
                      }`}
                    />
                    {password.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs">
                        <div className={`flex items-center gap-1.5 ${passwordValidation.minLength ? "text-emerald-600 dark:text-emerald-400" : "text-stone-500 dark:text-stone-400"}`}>
                          {passwordValidation.minLength ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          Mínimo 8 caracteres
                        </div>
                        <div className={`flex items-center gap-1.5 ${passwordValidation.hasUppercase ? "text-emerald-600 dark:text-emerald-400" : "text-stone-500 dark:text-stone-400"}`}>
                          {passwordValidation.hasUppercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          Uma letra maiúscula
                        </div>
                        <div className={`flex items-center gap-1.5 ${passwordValidation.hasLowercase ? "text-emerald-600 dark:text-emerald-400" : "text-stone-500 dark:text-stone-400"}`}>
                          {passwordValidation.hasLowercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          Uma letra minúscula
                        </div>
                        <div className={`flex items-center gap-1.5 ${passwordValidation.hasNumber ? "text-emerald-600 dark:text-emerald-400" : "text-stone-500 dark:text-stone-400"}`}>
                          {passwordValidation.hasNumber ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          Um número
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-confirm-password" className="text-stone-700 dark:text-stone-300">Confirmar Password</Label>
                    <Input
                      id="reg-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      className={`bg-white dark:bg-stone-800 border-2 text-stone-800 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:ring-emerald-500/20 ${
                        confirmPassword.length > 0 
                          ? (password === confirmPassword ? "border-emerald-500 focus:border-emerald-500" : "border-red-500 focus:border-red-500") 
                          : "border-stone-200 dark:border-stone-700 focus:border-emerald-500"
                      }`}
                    />
                    {confirmPassword.length > 0 && password !== confirmPassword && (
                      <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 mt-1">
                        <X className="h-3 w-3" />
                        As passwords não coincidem
                      </div>
                    )}
                    {confirmPassword.length > 0 && password === confirmPassword && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                        <Check className="h-3 w-3" />
                        Passwords coincidem
                      </div>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-0 shadow-sm" 
                    disabled={isLoading || !isPasswordValid || password !== confirmPassword}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Criar conta
                  </Button>

                  <Alert className="bg-amber-50/50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800/50">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertDescription className="text-xs text-stone-600 dark:text-stone-400">
                      Após criar conta, o seu acesso ficará pendente de aprovação por um administrador.
                    </AlertDescription>
                  </Alert>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      </div>

      {/* Bottom decoration - warm gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-500/30 dark:via-amber-500/20 to-transparent" />
      
      {/* Copyright */}
      <div className="absolute bottom-6 text-stone-500 dark:text-stone-500 text-sm">
        © {new Date().getFullYear()} ID Compliance. Todos os direitos reservados.
      </div>
    </div>
  );
};

export default Auth;
