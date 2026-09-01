import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Zap, Lock, Scale, CheckCircle2, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import authVisual from "@/assets/sustain-hero.jpg";

const BrandLogo = ({ variant = "default" }: { variant?: "default" | "light" }) => (
  <Link
    to="/"
    className={
      variant === "light"
        ? "inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-primary-foreground/10 border border-primary-foreground/20 backdrop-blur-md transition-all duration-200 hover:bg-primary-foreground/15"
        : "inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-all duration-200"
    }
  >
    <div
      className={
        variant === "light"
          ? "flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/20"
          : "flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-sm"
      }
    >
      <Scale className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
    </div>
    <div className="flex flex-col items-start">
      <span
        className={
          variant === "light"
            ? "text-lg font-heading font-bold tracking-tight text-primary-foreground"
            : "text-lg font-heading font-bold tracking-tight text-foreground"
        }
      >
        I&D
      </span>
      <span
        className={
          variant === "light"
            ? "text-xs font-heading font-semibold tracking-[0.15em] text-primary-foreground/80"
            : "text-xs font-heading font-semibold tracking-[0.15em] text-primary"
        }
      >
        COMPLIANCE
      </span>
    </div>
  </Link>
);

const Index = () => {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-background">
      {/* Visual panel */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12">
        <img
          src={authVisual}
          alt="Floresta iluminada pelo sol"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary/65 to-terracotta/70" />

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

      {/* Content panel */}
      <main className="relative flex flex-col items-center justify-center overflow-hidden bg-cream p-6 sm:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-terracotta/15 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary/15 blur-[100px]" />

        <div className="relative z-10 w-full max-w-md flex flex-col items-center text-center">
          <div className="lg:hidden mb-8">
            <BrandLogo />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-xs font-heading font-semibold tracking-[0.25em] uppercase text-muted-foreground mb-4">
              Plataforma de Gestão
            </p>
            <h1 className="text-4xl xl:text-5xl font-heading font-bold tracking-tight leading-[1.1] text-foreground">
              <span className="text-primary">Conformidade Legal</span>
              <br />
              Simplificada
            </h1>
            <p className="mt-5 text-muted-foreground leading-relaxed">
              Gestão de conformidade legal conduzida por auditores especializados — acompanhamento
              personalizado, auditorias rigorosas e suporte contínuo para o seu negócio.
            </p>
          </motion.div>

          <motion.div
            className="mt-8 w-full"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <Link to="/auth">
              <Button size="lg" className="group w-full rounded-xl py-6 text-base font-semibold shadow-md hover:shadow-lg transition-all">
                Aceder à Área Cliente
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Button>
            </Link>
          </motion.div>

          <motion.ul
            className="mt-10 w-full space-y-3 text-left"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            {[
              { icon: Shield, label: "Dados Seguros" },
              { icon: Zap, label: "Atualizações em Tempo Real" },
              { icon: Lock, label: "Acesso Privado" },
            ].map((item) => (
              <li key={item.label} className="flex items-center gap-3 rounded-xl border border-border bg-card/70 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/30 border border-border">
                  <item.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </li>
            ))}
          </motion.ul>
        </div>

        <p className="relative z-10 mt-8 text-xs text-muted-foreground lg:hidden text-center">
          © {new Date().getFullYear()} ID Compliance. Todos os direitos reservados.
        </p>
      </main>
    </div>
  );
};

export default Index;
