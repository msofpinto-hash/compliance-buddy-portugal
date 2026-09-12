import { motion } from "framer-motion";
import { Leaf, ClipboardCheck, ClipboardList, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/sustain-hero.jpg";

interface SustainHeroProps {
  userName?: string | null;
  organizationName?: string | null;
  upcomingAudits?: number;
  pendingActions?: number;
  compliancePercent?: number;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 20) return "Boa tarde";
  return "Boa noite";
}

export function SustainHero({
  userName,
  organizationName,
  upcomingAudits = 0,
  pendingActions = 0,
  compliancePercent,
}: SustainHeroProps) {
  const firstName = (userName || "").split(" ")[0] || "";

  const stats = [
    { label: "Auditorias ativas", value: upcomingAudits, icon: ClipboardCheck },
    { label: "Ações pendentes", value: pendingActions, icon: ClipboardList },
    ...(typeof compliancePercent === "number"
      ? [{ label: "Conformidade", value: `${compliancePercent}%`, icon: Leaf }]
      : []),
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative isolate overflow-hidden rounded-3xl border border-[hsl(var(--hero-scrim)/0.25)] bg-[hsl(var(--hero-scrim))] shadow-xl"
    >
      <img
        src={heroImage}
        alt="Floresta iluminada pelo sol, símbolo de sustentabilidade"
        width={1920}
        height={912}
        className="absolute inset-0 h-full w-full object-cover opacity-25"
      />
      <div className="absolute inset-0 bg-white/25" />
      <div className="absolute inset-0 bg-[linear-gradient(100deg,hsl(var(--hero-scrim)/0.98)_0%,hsl(var(--hero-scrim)/0.90)_50%,hsl(var(--hero-scrim)/0.55)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_100%,hsl(var(--primary)/0.18)_0%,transparent_55%)]" />

      <div className="relative px-6 py-10 sm:px-10 sm:py-14 lg:py-16 max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--hero-foreground)/0.2)] bg-[hsl(var(--hero-foreground)/0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--hero-accent))] backdrop-blur-sm">
          <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
          Conformidade sustentável
        </span>

        <h2 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-[hsl(var(--hero-foreground))]">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h2>
        <p className="mt-3 max-w-xl text-base sm:text-lg text-[hsl(var(--hero-muted))]">
          {organizationName ? `${organizationName} — ` : ""}
          acompanhe o cumprimento legal ambiental, de segurança e qualidade num
          só lugar.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--hero-foreground)/0.18)] bg-[hsl(var(--hero-foreground)/0.1)] px-4 py-3 backdrop-blur-md"
            >
              <span className="rounded-xl bg-[hsl(var(--hero-foreground)/0.14)] p-2 text-[hsl(var(--hero-accent))]">
                <s.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="leading-tight">
                <span className="block text-xl font-semibold text-[hsl(var(--hero-foreground))]">
                  {s.value}
                </span>
                <span className="block text-xs text-[hsl(var(--hero-muted))]">
                  {s.label}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/biblioteca"
            className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:opacity-90"
          >
            Explorar legislação
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
          <Link
            to="/dashboard?tab=actions"
            className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--hero-foreground)/0.25)] bg-[hsl(var(--hero-foreground)/0.1)] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--hero-foreground))] backdrop-blur-md transition hover:bg-[hsl(var(--hero-foreground)/0.18)]"
          >
            Ver planos de ação
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
