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
import robotAuditorImg from "@/assets/robot-auditor.png";

interface LoginCheckResult {
  allowed: boolean;
  failed_attempts: number;
  max_attempts: number;
  remaining_attempts: number;
  lockout_until: string | null;
  lockout_minutes: number;
}

// Animated grid background - Green/Sage tones
const GridBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient - warm dark with green undertones */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-emerald-950/40 to-slate-950" />
      
      {/* Animated grid - sage green */}
      <div 
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage: `
            linear-gradient(rgba(132, 169, 140, 0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(132, 169, 140, 0.15) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'gridMove 20s linear infinite'
        }}
      />
      
      {/* Glow orbs - sage/olive/mint tones */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/15 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-700/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-lime-600/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
      
      {/* Scan line effect */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)'
        }}
      />
    </div>
  );
};

// Floating particles - sage/mint colors
const TechParticles = () => {
  const colors = ['bg-emerald-400', 'bg-teal-400', 'bg-lime-400', 'bg-green-300'];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className={`absolute w-1 h-1 ${colors[i % colors.length]} rounded-full opacity-40`}
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `floatParticle ${8 + Math.random() * 12}s linear infinite`,
            animationDelay: `${Math.random() * 5}s`
          }}
        />
      ))}
    </div>
  );
};

// Animated Logo Component
const AnimatedLogo = () => (
  <motion.div 
    className="relative group cursor-pointer"
    whileHover={{ scale: 1.05 }}
    transition={{ type: "spring", stiffness: 400, damping: 10 }}
  >
    {/* Continuous glow effect behind icon */}
    <div className="absolute -inset-3 bg-gradient-to-r from-emerald-500/20 via-teal-400/20 to-lime-500/20 rounded-2xl blur-xl opacity-60 group-hover:opacity-100 transition-opacity duration-500 animate-glow-pulse" />
    
    {/* Logo container */}
    <Link to="/" className="relative flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/60 border border-emerald-500/30 backdrop-blur-sm group-hover:border-emerald-400/50 transition-all duration-300">
      {/* Icon with continuous pulse animation */}
      <div className="relative">
        {/* Inner glow ring */}
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 blur-md opacity-60 animate-icon-glow" />
        
        {/* Icon container */}
        <motion.div 
          className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 via-teal-500 to-green-600 shadow-lg shadow-emerald-500/40"
          animate={{ 
            boxShadow: [
              '0 0 15px rgba(16, 185, 129, 0.4)',
              '0 0 25px rgba(16, 185, 129, 0.6)',
              '0 0 15px rgba(16, 185, 129, 0.4)'
            ]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Scale className="h-5 w-5 text-white drop-shadow-lg" />
        </motion.div>
      </div>
      
      {/* Text */}
      <div className="flex flex-col items-start">
        <span className="text-lg font-bold text-white tracking-tight">I&D</span>
        <span 
          className="text-xs font-semibold tracking-[0.2em] text-emerald-400"
          style={{
            textShadow: '0 0 10px rgba(16, 185, 129, 0.5)'
          }}
        >
          COMPLIANCE
        </span>
      </div>
    </Link>
  </motion.div>
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
      <GridBackground />
      <TechParticles />
      <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
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
        <GridBackground />
        <TechParticles />
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative z-10"
        >
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
        </motion.div>
      </div>
    );
  }

  // Show pending approval message for logged-in but unapproved users
  if (isPendingApproval) {
    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden p-4">
        <GridBackground />
        <TechParticles />
        
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 relative z-10"
        >
          <AnimatedLogo />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10"
        >
          <Card className="w-full max-w-md bg-slate-900/80 border-emerald-500/30 backdrop-blur-xl shadow-2xl shadow-emerald-900/20">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30">
                <Clock className="h-7 w-7 text-amber-400" />
              </div>
              <CardTitle className="text-white text-xl">Aguarda Aprovação</CardTitle>
              <CardDescription className="text-slate-400">
                A sua conta foi criada com sucesso e está a aguardar aprovação por um administrador.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-slate-800/50 border-emerald-500/30">
                <Clock className="h-4 w-4 text-emerald-400" />
                <AlertDescription className="text-slate-300">
                  Será notificado por email quando a sua conta for aprovada. Entretanto, poderá tentar iniciar sessão novamente mais tarde.
                </AlertDescription>
              </Alert>
              <div className="text-center text-sm text-slate-400">
                Sessão iniciada como: <strong className="text-emerald-400">{user?.email}</strong>
              </div>
              <Button 
                variant="outline" 
                className="w-full bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-emerald-500/50" 
                onClick={handleSignOut}
              >
                Terminar sessão
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Show success message after registration
  if (registrationSuccess && !user) {
    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden p-4">
        <GridBackground />
        <TechParticles />
        
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 relative z-10"
        >
          <AnimatedLogo />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10"
        >
          <Card className="w-full max-w-md bg-slate-900/80 border-emerald-500/30 backdrop-blur-xl shadow-2xl shadow-emerald-900/20">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/30">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <CardTitle className="text-white text-xl">Registo Submetido</CardTitle>
              <CardDescription className="text-slate-400">
                A sua conta foi criada com sucesso!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-slate-800/50 border-emerald-500/30">
                <Clock className="h-4 w-4 text-emerald-400" />
                <AlertDescription className="text-slate-300">
                  O seu pedido de acesso será analisado por um administrador. Receberá uma notificação quando a sua conta for aprovada.
                </AlertDescription>
              </Alert>
              <Button 
                variant="outline" 
                className="w-full bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-emerald-500/50" 
                onClick={() => setRegistrationSuccess(false)}
              >
                Voltar ao login
              </Button>
            </CardContent>
          </Card>
        </motion.div>
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
        <GridBackground />
        <TechParticles />
        
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 relative z-10"
        >
          <AnimatedLogo />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10"
        >
          <Card className="w-full max-w-md bg-slate-900/80 border-emerald-500/30 backdrop-blur-xl shadow-2xl shadow-emerald-900/20">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/30">
                <Mail className="h-7 w-7 text-emerald-400" />
              </div>
              <CardTitle className="text-white text-xl">Recuperar Password</CardTitle>
              <CardDescription className="text-slate-400">
                {resetEmailSent 
                  ? "Verifique o seu email para redefinir a password"
                  : "Introduza o seu email para receber instruções"
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {resetEmailSent ? (
                <>
                  <Alert className="bg-emerald-500/10 border-emerald-500/30">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <AlertDescription className="text-emerald-300">
                      Enviámos um email com instruções para redefinir a sua password. 
                      Por favor, verifique também a pasta de spam.
                    </AlertDescription>
                  </Alert>
                  <Button 
                    variant="outline" 
                    className="w-full gap-2 bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-emerald-500/50" 
                    onClick={handleBackToLogin}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar ao login
                  </Button>
                </>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  {error && (
                    <Alert variant="destructive" className="bg-red-500/10 border-red-500/30">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="reset-email" className="text-slate-300">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="email@exemplo.pt"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white border-0 shadow-lg shadow-emerald-500/20" 
                    disabled={isLoading}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar instruções
                  </Button>

                  <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full gap-2 text-slate-400 hover:text-white hover:bg-slate-800/50" 
                    onClick={handleBackToLogin}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar ao login
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Main auth form
  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      <GridBackground />
      <TechParticles />
      
      {/* Two Column Layout */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
        
        {/* Left Column - Illustration & Message */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex-1 text-center lg:text-left hidden md:block"
        >
          {/* Robot Illustration */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="relative mb-6"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-3xl blur-3xl" />
            <img 
              src={robotAuditorImg} 
              alt="Robot Auditor" 
              className="relative w-full max-w-md mx-auto lg:mx-0 drop-shadow-2xl"
            />
          </motion.div>
          
          {/* Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="space-y-4"
          >
            <h2 className="text-3xl lg:text-4xl font-bold text-white leading-tight">
              O seu{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                assistente digital
              </span>
              <br />
              de conformidade
            </h2>
            <p className="text-slate-400 text-lg max-w-md mx-auto lg:mx-0">
              Auditorias inteligentes, legislação atualizada e gestão de evidências — tudo num só lugar.
            </p>
            
            {/* Features list */}
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start pt-4">
              {[
                { icon: CheckCircle2, text: "Monitorização 24/7" },
                { icon: Scale, text: "Legislação atualizada" },
                { icon: ShieldAlert, text: "Auditorias rigorosas" },
              ].map((feature, i) => (
                <motion.div
                  key={feature.text}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.7 + i * 0.1 }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/60 border border-emerald-500/30 text-sm text-slate-300"
                >
                  <feature.icon className="h-4 w-4 text-emerald-400" />
                  {feature.text}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Right Column - Auth Form */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full max-w-md"
        >
          {/* Logo - Mobile & Desktop */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex justify-center mb-6"
          >
            <AnimatedLogo />
          </motion.div>

          <Card className="bg-slate-900/80 border-emerald-500/30 backdrop-blur-xl shadow-2xl shadow-emerald-900/20">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-white text-xl">Área de Cliente</CardTitle>
              <CardDescription className="text-slate-400">
                Aceda à sua área de gestão de conformidade legal
              </CardDescription>
            </CardHeader>
            <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-slate-800/50 border border-slate-700">
                <TabsTrigger 
                  value="login" 
                  className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-slate-400"
                >
                  Entrar
                </TabsTrigger>
                <TabsTrigger 
                  value="register"
                  className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-slate-400"
                >
                  Registar
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                  {loginBlocked && (
                    <Alert variant="destructive" className="bg-red-500/10 border-red-500/30">
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
                    <Alert variant="destructive" className="bg-red-500/10 border-red-500/30">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-300">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@exemplo.pt"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-slate-300">Password</Label>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-xs text-emerald-400/70 hover:text-emerald-400"
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
                      className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white border-0 shadow-lg shadow-emerald-500/20 group" 
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
                    <Alert variant="destructive" className="bg-red-500/10 border-red-500/30">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="reg-name" className="text-slate-300">Nome Completo</Label>
                    <Input
                      id="reg-name"
                      type="text"
                      placeholder="O seu nome"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="reg-email" className="text-slate-300">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="email@exemplo.pt"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="reg-password" className="text-slate-300">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className={`bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:ring-emerald-500/20 ${
                        password.length > 0 
                          ? (isPasswordValid ? "border-emerald-500 focus:border-emerald-500" : "border-amber-500 focus:border-amber-500") 
                          : "focus:border-emerald-500"
                      }`}
                    />
                    {password.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs">
                        <div className={`flex items-center gap-1.5 ${passwordValidation.minLength ? "text-emerald-400" : "text-slate-500"}`}>
                          {passwordValidation.minLength ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          Mínimo 8 caracteres
                        </div>
                        <div className={`flex items-center gap-1.5 ${passwordValidation.hasUppercase ? "text-emerald-400" : "text-slate-500"}`}>
                          {passwordValidation.hasUppercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          Uma letra maiúscula
                        </div>
                        <div className={`flex items-center gap-1.5 ${passwordValidation.hasLowercase ? "text-emerald-400" : "text-slate-500"}`}>
                          {passwordValidation.hasLowercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          Uma letra minúscula
                        </div>
                        <div className={`flex items-center gap-1.5 ${passwordValidation.hasNumber ? "text-emerald-400" : "text-slate-500"}`}>
                          {passwordValidation.hasNumber ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          Um número
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-confirm-password" className="text-slate-300">Confirmar Password</Label>
                    <Input
                      id="reg-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      className={`bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:ring-emerald-500/20 ${
                        confirmPassword.length > 0 
                          ? (password === confirmPassword ? "border-emerald-500 focus:border-emerald-500" : "border-red-500 focus:border-red-500") 
                          : "focus:border-emerald-500"
                      }`}
                    />
                    {confirmPassword.length > 0 && password !== confirmPassword && (
                      <div className="flex items-center gap-1.5 text-xs text-red-400 mt-1">
                        <X className="h-3 w-3" />
                        As passwords não coincidem
                      </div>
                    )}
                    {confirmPassword.length > 0 && password === confirmPassword && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-1">
                        <Check className="h-3 w-3" />
                        Passwords coincidem
                      </div>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white border-0 shadow-lg shadow-emerald-500/20" 
                    disabled={isLoading || !isPasswordValid || password !== confirmPassword}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Criar conta
                  </Button>

                  <Alert className="bg-slate-800/50 border-slate-700">
                    <Clock className="h-4 w-4 text-emerald-400" />
                    <AlertDescription className="text-xs text-slate-400">
                      Após criar conta, o seu acesso ficará pendente de aprovação por um administrador.
                    </AlertDescription>
                  </Alert>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
      </div>

      {/* Bottom decoration */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      
      {/* Copyright */}
      <div className="absolute bottom-6 text-slate-600 text-sm">
        © {new Date().getFullYear()} ID Compliance. Todos os direitos reservados.
      </div>
    </div>
  );
};

export default Auth;
