import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, FileText, RefreshCw, BookOpen, LogIn, Shield, Scale, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Legal Compliance</h1>
              <p className="text-xs text-muted-foreground">Gestão de Legislação</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/biblioteca">
              <Button variant="ghost" size="sm" className="gap-2">
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Biblioteca</span>
              </Button>
            </Link>
            {user ? (
              <Link to="/dashboard">
                <Button size="sm" className="gap-2 shadow-md">
                  <Settings className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
            ) : (
              <Link to="/auth">
                <Button size="sm" className="gap-2 shadow-md">
                  <LogIn className="h-4 w-4" />
                  Entrar
                </Button>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-16">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/10" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-primary/5 to-secondary/5 rounded-full blur-3xl" />
        
        {/* Floating Icons */}
        <div className="absolute top-32 right-[15%] text-primary/20 animate-fade-in" style={{ animationDelay: "0.5s" }}>
          <Shield className="h-16 w-16" />
        </div>
        <div className="absolute bottom-32 left-[10%] text-primary/15 animate-fade-in" style={{ animationDelay: "0.7s" }}>
          <FileText className="h-20 w-20" />
        </div>
        <div className="absolute top-1/3 left-[8%] text-secondary/20 animate-fade-in" style={{ animationDelay: "0.9s" }}>
          <Scale className="h-12 w-12" />
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <div className="animate-fade-in mb-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
                <RefreshCw className="h-3.5 w-3.5" />
                Sincronização automática DRE & EUR-Lex
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="animate-fade-in text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl" style={{ animationDelay: "0.1s" }}>
              <span className="block text-foreground">Gestão de</span>
              <span className="block mt-2 bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                Compliance Legal
              </span>
            </h1>

            {/* Subtitle */}
            <p className="animate-fade-in mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl" style={{ animationDelay: "0.2s" }}>
              Automatize a conformidade da sua organização com sincronização em tempo real 
              de legislação portuguesa e europeia, categorização inteligente e alertas proativos.
            </p>

            {/* CTA Buttons */}
            <div className="animate-fade-in mt-10 flex flex-col sm:flex-row items-center justify-center gap-4" style={{ animationDelay: "0.3s" }}>
              <Link to="/biblioteca">
                <Button size="lg" className="gap-2 text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all">
                  <BookOpen className="h-5 w-5" />
                  Explorar Biblioteca
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
              <Link to={user ? "/dashboard" : "/auth"}>
                <Button variant="outline" size="lg" className="gap-2 text-base hover:bg-primary/5 transition-all">
                  {user ? (
                    <>
                      <Settings className="h-5 w-5" />
                      Aceder ao Dashboard
                    </>
                  ) : (
                    <>
                      <LogIn className="h-5 w-5" />
                      Começar Agora
                    </>
                  )}
                </Button>
              </Link>
            </div>

            {/* Stats */}
            <div className="animate-fade-in mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto" style={{ animationDelay: "0.4s" }}>
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">DRE</p>
                <p className="text-sm text-muted-foreground mt-1">Diário da República</p>
              </div>
              <div className="text-center border-x border-border">
                <p className="text-3xl font-bold text-foreground">EUR-Lex</p>
                <p className="text-sm text-muted-foreground mt-1">Legislação Europeia</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">24/7</p>
                <p className="text-sm text-muted-foreground mt-1">Sincronização</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-2">
            <div className="w-1 h-2 rounded-full bg-muted-foreground/50" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-24 bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Tudo o que precisa para{" "}
              <span className="text-primary">conformidade legal</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Uma plataforma completa para gerir obrigações legais com eficiência e tranquilidade.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            <Card className="group relative overflow-hidden border-0 bg-card/50 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/25 mb-4">
                  <BookOpen className="h-7 w-7" />
                </div>
                <CardTitle className="text-xl">Biblioteca de Legislação</CardTitle>
                <CardDescription className="text-base">
                  Pesquise e explore toda a legislação disponível organizada por temas e categorias com filtros avançados.
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Pesquisa por palavras-chave
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Filtros por tema e fonte
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Requisitos legais detalhados
                  </li>
                </ul>
                <Link to="/biblioteca">
                  <Button className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    Explorar Biblioteca
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="group relative overflow-hidden border-0 bg-card/50 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary to-secondary/70 text-secondary-foreground shadow-lg shadow-secondary/25 mb-4">
                  <RefreshCw className="h-7 w-7" />
                </div>
                <CardTitle className="text-xl">Sincronização Automática</CardTitle>
                <CardDescription className="text-base">
                  Importação automática do DRE e EUR-Lex com categorização inteligente por temas definidos.
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-secondary" />
                    Atualizações em tempo real
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-secondary" />
                    Categorização automática
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-secondary" />
                    Histórico de sincronização
                  </li>
                </ul>
                <Link to={user ? "/dashboard" : "/auth"}>
                  <Button variant="outline" className="w-full">
                    {user ? "Ver Dashboard" : "Começar"}
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="group relative overflow-hidden border-0 bg-card/50 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent/70 text-accent-foreground shadow-lg shadow-accent/25 mb-4">
                  <Shield className="h-7 w-7" />
                </div>
                <CardTitle className="text-xl">Gestão de Conformidade</CardTitle>
                <CardDescription className="text-base">
                  Acompanhe a conformidade da sua organização com planos de ação e alertas personalizados.
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                    Planos de ação
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                    Alertas proativos
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                    Relatórios de conformidade
                  </li>
                </ul>
                <Link to={user ? "/dashboard" : "/auth"}>
                  <Button variant="outline" className="w-full">
                    {user ? "Gerir Conformidade" : "Criar Conta"}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Legal Compliance. Sistema de Gestão de Legislação.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
