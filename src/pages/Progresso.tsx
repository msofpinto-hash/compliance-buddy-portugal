import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Activity, Globe, Tags, Link2, FileText } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Stats {
  total: number;
  pt: number;
  eu: number;
  with_category: number;
  without_category: number;
  with_relations: number;
  without_relations: number;
  with_eu_link: number;
  without_eu_link: number;
  with_requirements: number;
  without_requirements: number;
  total_relations: number;
  top_categories: { name: string; value: number }[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--accent-foreground))",
  "hsl(var(--secondary-foreground))",
];

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function DonutCard({
  title,
  icon: Icon,
  done,
  missing,
  doneLabel,
  missingLabel,
}: {
  title: string;
  icon: typeof Tags;
  done: number;
  missing: number;
  doneLabel: string;
  missingLabel: string;
}) {
  const total = done + missing;
  const data = [
    { name: doneLabel, value: done },
    { name: missingLabel, value: missing },
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                <Cell fill="hsl(var(--primary))" />
                <Cell fill="hsl(var(--muted))" />
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={24} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 space-y-1">
          <Progress value={pct(done, total)} />
          <p className="text-sm text-muted-foreground">
            {done} de {total} concluídos ({pct(done, total)}%)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Progresso() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["diplomas-progress-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_diplomas_progress_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
    refetchInterval: 15000,
  });

  // Atualização em tempo real
  useEffect(() => {
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: ["diplomas-progress-stats"] });

    const channel = supabase
      .channel("progresso-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "legislation" }, invalidate)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "legislation_category_mapping" },
        invalidate,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "legislation_relations" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "legal_requirements" }, invalidate)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const originData = data ? [{ name: "Origem", PT: data.pt, EU: data.eu }] : [];

  return (
    <div className="min-h-dvh bg-background">
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin">
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
              Voltar
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/diplomas">Ver diplomas</Link>
          </Button>
        </div>

        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">Progresso da Base Legal</h1>
            <p className="mt-1 text-muted-foreground">
              Diplomas por origem, categorias, ligações à legislação europeia e relações — atualizado em tempo real.
            </p>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Activity className="h-3 w-3 animate-pulse text-primary" aria-hidden="true" />
            Tempo real
          </Badge>
        </header>

        {isLoading || !data ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Total de diplomas", value: data.total },
                { label: "Nacionais (PT)", value: data.pt },
                { label: "Europeus (EU)", value: data.eu },
                { label: "Relações mapeadas", value: data.total_relations },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="mt-1 font-heading text-3xl font-bold text-foreground">{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
                  Diplomas por origem
                </CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={originData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="PT" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="EU" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
              <DonutCard
                title="Categorias"
                icon={Tags}
                done={data.with_category}
                missing={data.without_category}
                doneLabel="Com categoria"
                missingLabel="Sem categoria"
              />
              <DonutCard
                title="Ligação EU (diplomas PT)"
                icon={Globe}
                done={data.with_eu_link}
                missing={data.without_eu_link}
                doneLabel="Com ligação EU"
                missingLabel="Sem ligação EU"
              />
              <DonutCard
                title="Relações"
                icon={Link2}
                done={data.with_relations}
                missing={data.without_relations}
                doneLabel="Com relações"
                missingLabel="Sem relações"
              />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                  Top categorias por número de diplomas
                </CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.top_categories} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={180}
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {data.top_categories.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
