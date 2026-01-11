import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Scale, AlertCircle, Clock, CheckCircle2, ArrowLeft, Mail, Check, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const { signIn, signUp, signOut, user, isAdmin, isApproved, isPendingApproval, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect authenticated and approved users based on their role
  useEffect(() => {
    if (!authLoading && user && isApproved) {
      if (isAdmin) {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    }
  }, [authLoading, user, isAdmin, isApproved, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error } = await signIn(email, password);
      
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setError("Email ou password incorretos");
        } else {
          setError(error.message);
        }
      } else {
        toast({
          title: "Login efetuado",
          description: "A verificar acesso...",
        });
        // Auth state change will handle the rest
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

  // Show loading while checking auth state
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show pending approval message for logged-in but unapproved users
  if (isPendingApproval) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Clock className="h-6 w-6" />
            </div>
            <CardTitle>Aguarda Aprovação</CardTitle>
            <CardDescription>
              A sua conta foi criada com sucesso e está a aguardar aprovação por um administrador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Será notificado por email quando a sua conta for aprovada. Entretanto, poderá tentar iniciar sessão novamente mais tarde.
              </AlertDescription>
            </Alert>
            <div className="text-center text-sm text-muted-foreground">
              Sessão iniciada como: <strong>{user?.email}</strong>
            </div>
            <Button variant="outline" className="w-full" onClick={handleSignOut}>
              Terminar sessão
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show success message after registration
  if (registrationSuccess && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <CardTitle>Registo Submetido</CardTitle>
            <CardDescription>
              A sua conta foi criada com sucesso!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                O seu pedido de acesso será analisado por um administrador. Receberá uma notificação quando a sua conta for aprovada.
              </AlertDescription>
            </Alert>
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => setRegistrationSuccess(false)}
            >
              Voltar ao login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Don't render form if already authenticated and approved (redirect will happen)
  if (user && isApproved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Forgot password view
  if (showForgotPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="h-6 w-6" />
            </div>
            <CardTitle>Recuperar Password</CardTitle>
            <CardDescription>
              {resetEmailSent 
                ? "Verifique o seu email para redefinir a password"
                : "Introduza o seu email para receber instruções"
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {resetEmailSent ? (
              <>
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700">
                    Enviámos um email com instruções para redefinir a sua password. 
                    Por favor, verifique também a pasta de spam.
                  </AlertDescription>
                </Alert>
                <Button 
                  variant="outline" 
                  className="w-full gap-2" 
                  onClick={handleBackToLogin}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar ao login
                </Button>
              </>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="email@exemplo.pt"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar instruções
                </Button>

                <Button 
                  type="button"
                  variant="ghost" 
                  className="w-full gap-2" 
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
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Scale className="h-6 w-6" />
          </div>
          <CardTitle>Área de Cliente</CardTitle>
          <CardDescription>
            Aceda à sua área de gestão de conformidade legal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="register">Registar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleSignIn} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@exemplo.pt"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
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
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleSignUp} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="reg-name">Nome Completo</Label>
                  <Input
                    id="reg-name"
                    type="text"
                    placeholder="O seu nome"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="email@exemplo.pt"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
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
                    className={password.length > 0 ? (isPasswordValid ? "border-green-500 focus-visible:ring-green-500" : "border-amber-500 focus-visible:ring-amber-500") : ""}
                  />
                  {password.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs">
                      <div className={`flex items-center gap-1.5 ${passwordValidation.minLength ? "text-green-600" : "text-muted-foreground"}`}>
                        {passwordValidation.minLength ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Mínimo 8 caracteres
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordValidation.hasUppercase ? "text-green-600" : "text-muted-foreground"}`}>
                        {passwordValidation.hasUppercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Uma letra maiúscula
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordValidation.hasLowercase ? "text-green-600" : "text-muted-foreground"}`}>
                        {passwordValidation.hasLowercase ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Uma letra minúscula
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordValidation.hasNumber ? "text-green-600" : "text-muted-foreground"}`}>
                        {passwordValidation.hasNumber ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        Um número
                      </div>
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar conta
                </Button>

                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Após criar conta, o seu acesso ficará pendente de aprovação por um administrador.
                  </AlertDescription>
                </Alert>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
