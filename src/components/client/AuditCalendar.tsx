import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { pt } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
} from "lucide-react";

export interface CalendarAudit {
  id: string;
  title: string;
  audit_date: string | null;
  status: string;
  audit_type?: string | null;
}

type ViewMode = "semanal" | "mensal" | "anual";
type TypeFilter = "all" | "anual" | "mensal";

const isExecuted = (a: CalendarAudit) => a.status === "closed";
const isMonthly = (a: CalendarAudit) => (a.audit_type || "anual") === "mensal";

interface Props {
  audits: CalendarAudit[];
  onSelectAudit?: (auditId: string) => void;
}

/** Audit calendar with weekly / monthly / annual views showing planned vs executed dates. */
export function AuditCalendar({ audits: allAudits, onSelectAudit }: Props) {
  const [view, setView] = useState<ViewMode>("mensal");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [cursor, setCursor] = useState(new Date());

  const audits = useMemo(
    () =>
      allAudits.filter((a) =>
        typeFilter === "all"
          ? true
          : typeFilter === "mensal"
            ? isMonthly(a)
            : !isMonthly(a),
      ),
    [allAudits, typeFilter],
  );


  const byDay = useMemo(() => {
    const map = new Map<string, CalendarAudit[]>();
    audits.forEach((a) => {
      if (!a.audit_date) return;
      const key = a.audit_date.slice(0, 10);
      map.set(key, [...(map.get(key) || []), a]);
    });
    return map;
  }, [audits]);

  const shift = (dir: number) => {
    setCursor((c) =>
      view === "semanal"
        ? addWeeks(c, dir)
        : view === "mensal"
          ? addMonths(c, dir)
          : addYears(c, dir),
    );
  };

  const label =
    view === "anual"
      ? format(cursor, "yyyy")
      : view === "mensal"
        ? format(cursor, "MMMM yyyy", { locale: pt })
        : `${format(startOfWeek(cursor, { weekStartsOn: 1 }), "d MMM", { locale: pt })} – ${format(endOfWeek(cursor, { weekStartsOn: 1 }), "d MMM yyyy", { locale: pt })}`;

  const days = useMemo(() => {
    if (view === "semanal") {
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [cursor, view]);

  const renderChip = (a: CalendarAudit) => (
    <button
      key={a.id}
      onClick={() => onSelectAudit?.(a.id)}
      title={`${isMonthly(a) ? "VCL mensal" : "Auditoria anual"} · ${a.title}`}
      className={`w-full truncate rounded border-l-2 px-1.5 py-0.5 text-left text-[10px] font-medium ${
        isMonthly(a) ? "border-sky-500" : "border-emerald-600"
      } ${
        isExecuted(a)
          ? "bg-primary/15 text-primary"
          : "bg-amber-500/15 text-amber-700"
      }`}
    >
      {isExecuted(a) ? "✓ " : "• "}
      {isMonthly(a) ? "VCL " : ""}
      {a.title}
    </button>
  );


  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold capitalize">{label}</h2>
              <p className="text-xs text-muted-foreground">
                Datas planeadas e executadas
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-md border p-0.5">
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border p-0.5">
              {(
                [
                  ["all", "Todas"],
                  ["anual", "Auditorias anuais"],
                  ["mensal", "VCL mensais"],
                ] as [TypeFilter, string][]
              ).map(([v, lbl]) => (
                <Button
                  key={v}
                  size="sm"
                  variant={typeFilter === v ? "default" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setTypeFilter(v)}
                >
                  {lbl}
                </Button>
              ))}
            </div>
            <div className="flex rounded-md border p-0.5">
              {(["semanal", "mensal", "anual"] as ViewMode[]).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={view === v ? "default" : "ghost"}
                  className="h-7 px-3 text-xs capitalize"
                  onClick={() => setView(v)}
                >
                  {v}
                </Button>
              ))}
            </div>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => setCursor(new Date())}>
              Hoje
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-600" /> Planeada
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Executada
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-0.5 rounded bg-emerald-600" /> Auditoria
            anual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-0.5 rounded bg-sky-500" /> VCL mensal
          </span>
        </div>

        {view === "anual" ? (

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 12 }, (_, m) =>
              addMonths(startOfYear(cursor), m),
            ).map((month) => {
              const items = audits.filter(
                (a) =>
                  a.audit_date && isSameMonth(new Date(a.audit_date), month),
              );
              return (
                <div
                  key={month.toISOString()}
                  className="rounded-lg border bg-muted/20 p-3"
                >
                  <p className="mb-2 text-sm font-semibold capitalize">
                    {format(month, "MMMM", { locale: pt })}
                  </p>
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : (
                    <div className="space-y-1">{items.map(renderChip)}</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <div
                key={d}
                className="pb-1 text-center text-[11px] font-semibold uppercase text-muted-foreground"
              >
                {d}
              </div>
            ))}
            {days.map((day) => {
              const items = byDay.get(format(day, "yyyy-MM-dd")) || [];
              const outside = view === "mensal" && !isSameMonth(day, cursor);
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[86px] rounded-md border p-1.5 ${
                    outside ? "bg-muted/20 opacity-50" : "bg-background"
                  } ${isSameDay(day, new Date()) ? "ring-2 ring-primary/40" : ""}`}
                >
                  <div className="mb-1 text-[11px] font-semibold text-muted-foreground">
                    {format(day, "d")}
                  </div>
                  <div className="space-y-1">{items.map(renderChip)}</div>
                </div>
              );
            })}
          </div>
        )}

        {audits.length === 0 && (
          <div className="pt-4 text-center text-sm text-muted-foreground">
            Sem auditorias registadas
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AuditCalendar;
