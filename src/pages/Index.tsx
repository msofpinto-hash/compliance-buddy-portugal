import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, FileText, RefreshCw, BookOpen, LogIn } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Legal Compliance</h1>
              <p className="text-sm text-muted-foreground">Gestão de Legislação</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/biblioteca">
              <Button variant="ghost" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Biblioteca
              </Button>
            </Link>
            {user ? (
              <Link to="/dashboard">
                <Button className="gap-2">
                  <Settings className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
            ) : (
              <Link to="/auth">
                <Button className="gap-2">
                  <LogIn className="h-4 w-4" />
                  Entrar
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Sistema de Compliance Legal
            </h2>
            <p className="mt-2 text-lg text-muted-foreground">
              Sincronização automática de legislação portuguesa e europeia
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Card className="transition-all hover:shadow-lg">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-6 w-6" />
                </div>
                <CardTitle className="mt-4">Biblioteca de Legislação</CardTitle>
                <CardDescription>
                  Pesquise e explore toda a legislação disponível organizada por temas e categorias.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to="/biblioteca">
                  <Button className="w-full">Explorar Biblioteca</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="transition-all hover:shadow-lg">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <RefreshCw className="h-6 w-6" />
                </div>
                <CardTitle className="mt-4">Sincronização Automática</CardTitle>
                <CardDescription>
                  Importação automática do DRE e EUR-Lex com categorização inteligente por temas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to={user ? "/dashboard" : "/auth"}>
                  <Button variant="outline" className="w-full">
                    {user ? "Ver Dashboard" : "Entrar"}
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="transition-all hover:shadow-lg">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Settings className="h-6 w-6" />
                </div>
                <CardTitle className="mt-4">Gestão de Conformidade</CardTitle>
                <CardDescription>
                  Acompanhe a conformidade da sua organização com planos de ação e alertas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to={user ? "/dashboard" : "/auth"}>
                  <Button variant="outline" className="w-full">
                    {user ? "Gerir Conformidade" : "Criar Conta"}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
