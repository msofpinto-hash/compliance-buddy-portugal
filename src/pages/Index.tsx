import { Button } from "@/components/ui/button";
import { 
  Scale, 
  ArrowRight, 
  CheckCircle2, 
  Zap, 
  Globe, 
  Shield, 
  FileText,
  RefreshCw,
  TrendingUp,
  Clock,
  Users,
  ChevronDown,
  Sparkles
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useRef } from "react";

// Animated counter hook
const useCounter = (end: number, duration: number = 2000, start: number = 0) => {
  const [count, setCount] = useState(start);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    let startTime: number;
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(start + (end - start) * easeOut));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [isVisible, end, duration, start]);

  return { count, ref };
};

// Floating particles component
const FloatingParticles = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-primary/20 animate-float"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${3 + Math.random() * 4}s`,
          }}
        />
      ))}
    </div>
  );
};

const Index = () => {
  const { user } = useAuth();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const stat1 = useCounter(5000, 2500);
  const stat2 = useCounter(150, 2000);
  const stat3 = useCounter(99, 2000);
  const stat4 = useCounter(24, 1500);

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
        <div 
          className="absolute top-0 left-0 w-[800px] h-[800px] bg-gradient-radial from-primary/10 via-primary/5 to-transparent rounded-full blur-3xl"
          style={{ transform: `translate(${scrollY * 0.1}px, ${scrollY * 0.05}px)` }}
        />
        <div 
          className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-gradient-radial from-accent/30 via-accent/10 to-transparent rounded-full blur-3xl"
          style={{ transform: `translate(${-scrollY * 0.08}px, ${-scrollY * 0.04}px)` }}
        />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300">
        <div className={`mx-4 my-3 px-6 py-3 rounded-2xl transition-all duration-300 ${
          scrollY > 50 
            ? "bg-background/80 backdrop-blur-xl shadow-lg border border-border/50" 
            : "bg-transparent"
        }`}>
          <div className="container mx-auto flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/25 group-hover:shadow-xl group-hover:shadow-primary/30 transition-all duration-300 group-hover:scale-105">
                <Scale className="h-5 w-5" />
                <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-foreground leading-tight text-lg tracking-tight">I&D</span>
                <span className="text-xs text-primary leading-tight font-semibold tracking-wide">COMPLIANCE</span>
              </div>
            </Link>
            
            <nav className="flex items-center gap-3">
              <Link to="/biblioteca">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  Biblioteca
                </Button>
              </Link>
              {user ? (
                <Link to="/dashboard">
                  <Button size="sm" className="gap-2 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all rounded-xl px-5">
                    <Sparkles className="h-4 w-4" />
                    Dashboard
                  </Button>
                </Link>
              ) : (
                <Link to="/auth">
                  <Button size="sm" className="gap-2 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all rounded-xl px-5">
                    Começar
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-24 pb-16">
        <FloatingParticles />
        
        <div className="container relative z-10 mx-auto px-4">
          <div className="mx-auto max-w-5xl text-center">
            {/* Animated Badge */}
            <div className="animate-fade-in mb-8">
              <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary/10 via-primary/5 to-accent/10 border border-primary/20 px-5 py-2 text-sm font-medium text-primary backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Sincronização automática DRE & EUR-Lex
              </span>
            </div>

            {/* Main Heading with Gradient */}
            <h1 className="animate-fade-in text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl leading-[1.1]" style={{ animationDelay: "0.1s" }}>
              <span className="block text-foreground">Compliance</span>
              <span className="block mt-2 bg-gradient-to-r from-primary via-emerald-500 to-teal-400 bg-clip-text text-transparent pb-2">
                Legal Inteligente
              </span>
            </h1>

            {/* Subtitle */}
            <p className="animate-fade-in mx-auto mt-8 max-w-2xl text-lg sm:text-xl text-muted-foreground leading-relaxed" style={{ animationDelay: "0.2s" }}>
              Automatize a conformidade legal da sua organização com IA. Monitorização contínua, 
              categorização inteligente e alertas proativos.
            </p>

            {/* CTA Buttons */}
            <div className="animate-fade-in mt-12 flex flex-col sm:flex-row items-center justify-center gap-4" style={{ animationDelay: "0.3s" }}>
              <Link to={user ? "/dashboard" : "/auth"}>
                <Button size="lg" className="gap-3 text-base h-14 px-8 shadow-2xl shadow-primary/30 hover:shadow-primary/40 transition-all rounded-2xl group">
                  <Zap className="h-5 w-5 group-hover:animate-pulse" />
                  {user ? "Aceder ao Dashboard" : "Começar Gratuitamente"}
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/biblioteca">
                <Button variant="outline" size="lg" className="gap-2 text-base h-14 px-8 rounded-2xl border-2 hover:bg-primary/5 transition-all">
                  <Globe className="h-5 w-5" />
                  Explorar Biblioteca
                </Button>
              </Link>
            </div>

            {/* Trust Badges */}
            <div className="animate-fade-in mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground" style={{ animationDelay: "0.4s" }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>DRE Oficial</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>EUR-Lex Integrado</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>IA Avançada</span>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="flex flex-col items-center gap-2 text-muted-foreground/50 animate-bounce">
            <span className="text-xs font-medium tracking-wider uppercase">Scroll</span>
            <ChevronDown className="h-5 w-5" />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
        
        <div className="container relative mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            <div ref={stat1.ref} className="text-center group">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 mb-4 group-hover:scale-110 transition-transform">
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <p className="text-4xl md:text-5xl font-bold text-foreground">
                {stat1.count.toLocaleString()}+
              </p>
              <p className="text-sm text-muted-foreground mt-2">Diplomas Legais</p>
            </div>
            
            <div ref={stat2.ref} className="text-center group">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/30 to-accent/10 mb-4 group-hover:scale-110 transition-transform">
                <Users className="h-7 w-7 text-accent-foreground" />
              </div>
              <p className="text-4xl md:text-5xl font-bold text-foreground">
                {stat2.count}+
              </p>
              <p className="text-sm text-muted-foreground mt-2">Organizações</p>
            </div>
            
            <div ref={stat3.ref} className="text-center group">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 mb-4 group-hover:scale-110 transition-transform">
                <TrendingUp className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-4xl md:text-5xl font-bold text-foreground">
                {stat3.count}%
              </p>
              <p className="text-sm text-muted-foreground mt-2">Uptime</p>
            </div>
            
            <div ref={stat4.ref} className="text-center group">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 mb-4 group-hover:scale-110 transition-transform">
                <Clock className="h-7 w-7 text-orange-600" />
              </div>
              <p className="text-4xl md:text-5xl font-bold text-foreground">
                {stat4.count}/7
              </p>
              <p className="text-sm text-muted-foreground mt-2">Monitorização</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="inline-block text-sm font-semibold text-primary uppercase tracking-wider mb-4">
              Funcionalidades
            </span>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Tudo o que precisa,
              <span className="block mt-2 bg-gradient-to-r from-primary to-emerald-500 bg-clip-text text-transparent">
                numa só plataforma
              </span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
            {/* Feature Card 1 */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative h-full p-8 rounded-3xl bg-gradient-to-br from-card to-card/50 border border-border/50 backdrop-blur-sm hover:border-primary/30 transition-all duration-300 hover:-translate-y-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground shadow-lg shadow-primary/25 mb-6">
                  <FileText className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold mb-3">Legislação Aplicável</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Aceda à legislação específica da sua organização, organizada por temas e com estado de conformidade em tempo real.
                </p>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                      <CheckCircle2 className="h-3 w-3 text-primary" />
                    </div>
                    <span>Diplomas relevantes à organização</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                      <CheckCircle2 className="h-3 w-3 text-primary" />
                    </div>
                    <span>Filtros avançados por tema</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                      <CheckCircle2 className="h-3 w-3 text-primary" />
                    </div>
                    <span>Requisitos legais detalhados</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Feature Card 2 */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/30 to-accent/10 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative h-full p-8 rounded-3xl bg-gradient-to-br from-card to-card/50 border border-border/50 backdrop-blur-sm hover:border-accent-foreground/30 transition-all duration-300 hover:-translate-y-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 mb-6">
                  <RefreshCw className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold mb-3">Sincronização Automática</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Importação automática do DRE e EUR-Lex com categorização inteligente por IA e temas definidos.
                </p>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/10">
                      <CheckCircle2 className="h-3 w-3 text-teal-600" />
                    </div>
                    <span>Atualizações em tempo real</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/10">
                      <CheckCircle2 className="h-3 w-3 text-teal-600" />
                    </div>
                    <span>Categorização por IA</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/10">
                      <CheckCircle2 className="h-3 w-3 text-teal-600" />
                    </div>
                    <span>Histórico completo</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Feature Card 3 */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 to-purple-500/10 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative h-full p-8 rounded-3xl bg-gradient-to-br from-card to-card/50 border border-border/50 backdrop-blur-sm hover:border-violet-500/30 transition-all duration-300 hover:-translate-y-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/25 mb-6">
                  <Shield className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold mb-3">Gestão de Conformidade</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Acompanhe a conformidade com planos de ação, alertas personalizados e relatórios detalhados.
                </p>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/10">
                      <CheckCircle2 className="h-3 w-3 text-violet-600" />
                    </div>
                    <span>Planos de ação automatizados</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/10">
                      <CheckCircle2 className="h-3 w-3 text-violet-600" />
                    </div>
                    <span>Alertas proativos</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/10">
                      <CheckCircle2 className="h-3 w-3 text-violet-600" />
                    </div>
                    <span>Relatórios de conformidade</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/30 rounded-full blur-3xl" />
        
        <div className="container relative mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Pronto para{" "}
            <span className="bg-gradient-to-r from-primary via-emerald-500 to-teal-400 bg-clip-text text-transparent">
              simplificar
            </span>
            <br />
            a conformidade legal?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Junte-se a centenas de organizações que já automatizaram a gestão de obrigações legais.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to={user ? "/dashboard" : "/auth"}>
              <Button size="lg" className="gap-3 text-lg h-16 px-10 shadow-2xl shadow-primary/30 rounded-2xl group">
                <Sparkles className="h-5 w-5" />
                {user ? "Ir para o Dashboard" : "Criar Conta Gratuita"}
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card/50 backdrop-blur-sm py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
                <Scale className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-foreground leading-tight">I&D Compliance</span>
                <span className="text-xs text-muted-foreground">Sistema de Gestão de Legislação</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} I&D Compliance-ex. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
