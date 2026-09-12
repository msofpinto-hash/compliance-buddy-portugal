import { motion } from "framer-motion";

// Professional background inspired by incredibleanddynamic.com
// Forest green + warm beige/salmon/brown accents
export const IDBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
    {/* Clean off-white base with a soft brand-green tint */}
    <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-secondary/50 dark:from-[hsl(162_18%_8%)] dark:via-[hsl(162_16%_10%)] dark:to-[hsl(164_30%_10%)]" />


    {/* Subtle warm geometric pattern overlay */}
    <div
      className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"
      style={{
        backgroundImage: `
 repeating-linear-gradient(
 45deg,
 transparent,
 transparent 50px,
 hsl(125 22% 34%) 50px,
 hsl(125 22% 34%) 51px
 )
 `,
      }}
    />

    {/* Warm salmon/terracotta accent - top right */}
    <div
      className="absolute -top-20 -right-20 w-[700px] h-[700px] opacity-10 dark:opacity-8"
      style={{
        background:
          "radial-gradient(circle at center, hsl(28 30% 55% / 0.18) 0%, transparent 60%)",
      }}
    />

    {/* Forest green accent - bottom left */}
    <div
      className="absolute -bottom-20 -left-20 w-[500px] h-[500px] opacity-12 dark:opacity-8"
      style={{
        background:
          "radial-gradient(circle at center, hsl(125 24% 45% / 0.16) 0%, transparent 65%)",
      }}
    />

    {/* Warm brown accent - center */}
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] opacity-6 dark:opacity-4"
      style={{
        background:
          "radial-gradient(ellipse at center, hsl(25 35% 52% / 0.10) 0%, transparent 70%)",
      }}
    />

    {/* Animated floating elements - warm tones */}
    <motion.div
      className="absolute top-1/4 right-1/3 w-2 h-2 rounded-full bg-primary/25 "
      animate={{
        y: [-20, 20, -20],
        opacity: [0.2, 0.5, 0.2],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
    <motion.div
      className="absolute bottom-1/3 left-1/4 w-3 h-3 rounded-full bg-primary/20 "
      animate={{
        y: [15, -15, 15],
        opacity: [0.2, 0.4, 0.2],
      }}
      transition={{
        duration: 10,
        repeat: Infinity,
        ease: "easeInOut",
        delay: 2,
      }}
    />
    <motion.div
      className="absolute top-2/3 right-1/4 w-2 h-2 rounded-full bg-orange-400/20 dark:bg-orange-300/10"
      animate={{
        y: [-15, 15, -15],
        opacity: [0.15, 0.35, 0.15],
      }}
      transition={{
        duration: 12,
        repeat: Infinity,
        ease: "easeInOut",
        delay: 4,
      }}
    />

    {/* Bottom decorative line - warm gradient */}
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
  </div>
);

// Floating particles - more subtle for corporate feel
export const IDParticles = ({ count = 8 }: { count?: number }) => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-primary/20 "
          style={{
            left: `${10 + (i * 80) / count}%`,
            top: `${20 + Math.sin(i) * 30}%`,
          }}
          animate={{
            y: [-10, 10, -10],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: 6 + i,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.5,
          }}
        />
      ))}
    </div>
  );
};

// Hero section with I&D aesthetic - warm tones
export const IDHeroSection = ({
  title,
  subtitle,
  badge,
  icon: Icon,
  stats,
  actions,
  image,
  imageAlt = "",
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  icon?: React.ElementType;
  /** Optional background image for the hero (same treatment as the main panel) */
  image?: string;
  imageAlt?: string;
  /** Optional quick metrics rendered on the right side of the hero */
  stats?: { label: string; value: React.ReactNode }[];
  /** Optional controls rendered under the metrics */
  actions?: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    className="relative isolate overflow-hidden rounded-3xl border border-[hsl(var(--hero-scrim)/0.25)] bg-[hsl(var(--hero-scrim))] p-6 lg:p-9 shadow-xl"
  >
    {image && (
      <>
        <img
          src={image}
          alt={imageAlt}
          aria-hidden={imageAlt ? undefined : true}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-white/25" />
      </>
    )}
    {/* Readability scrim */}
    <div className="absolute inset-0 bg-[linear-gradient(100deg,hsl(var(--hero-scrim)/0.98)_0%,hsl(var(--hero-scrim)/0.88)_45%,hsl(var(--hero-scrim)/0.58)_100%)]" />
    <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,hsl(var(--primary)/0.18)_0%,transparent_55%)]" />

    {/* Accent edge */}
    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[hsl(var(--hero-accent))] via-[hsl(var(--primary))] to-[hsl(var(--terracotta))]" />

    <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pl-4">
      <div className="space-y-3">
        {badge && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-widest bg-[hsl(var(--hero-foreground)/0.12)] text-[hsl(var(--hero-accent))] border border-[hsl(var(--hero-foreground)/0.2)] backdrop-blur-sm">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {badge}
          </span>
        )}
        <h1 className="text-2xl lg:text-4xl font-bold text-[hsl(var(--hero-foreground))] tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[hsl(var(--hero-muted))] max-w-xl text-sm lg:text-base">
            {subtitle}
          </p>
        )}
      </div>

      {(stats?.length || actions) && (
        <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
          {!!stats?.length && (
            <div className="flex flex-wrap gap-2.5">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="min-w-[96px] rounded-xl border border-[hsl(var(--hero-foreground)/0.18)] bg-[hsl(var(--hero-foreground)/0.1)] px-3.5 py-2.5 text-center shadow-sm backdrop-blur-md"
                >
                  <p className="text-xl font-bold text-[hsl(var(--hero-foreground))] leading-none">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--hero-muted))]">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          )}
          {actions}
        </div>
      )}
    </div>
  </motion.div>
);

// Card component with I&D styling - warm accents
export const IDCard = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`bg-white/95 dark:bg-[#181410]/90 border border-border/60 rounded-xl shadow-sm backdrop-blur-sm ${className}`}
  >
    {children}
  </div>
);
