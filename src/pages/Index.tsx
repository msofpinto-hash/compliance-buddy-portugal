import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, FileText, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

const Index = () => {
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
          <Link to="/admin">
            <Button variant="outline" className="gap-2">
              <Settings className="h-4 w-4" />
              Administração
            </Button>
          </Link>
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
              Sincronização automática de legislação portuguesa do DRE
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="transition-all hover:shadow-lg">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <RefreshCw className="h-6 w-6" />
                </div>
                <CardTitle className="mt-4">Sincronização Automática</CardTitle>
                <CardDescription>
                  Importação automática de legislação do Diário da República Eletrónico
                  com categorização inteligente por temas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to="/admin">
                  <Button className="w-full">Ir para Sincronização</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="transition-all hover:shadow-lg">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Settings className="h-6 w-6" />
                </div>
                <CardTitle className="mt-4">Gestão de Temas</CardTitle>
                <CardDescription>
                  Configure temas e subcategorias com keywords para
                  categorização automática de legislação.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to="/admin">
                  <Button variant="outline" className="w-full">Gerir Temas</Button>
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
