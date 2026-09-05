import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAdmin } from "@/components/auth/RequireAdmin";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Biblioteca from "./pages/Biblioteca";
import Normas from "./pages/Normas";
import LegislacaoDetalhes from "./pages/LegislacaoDetalhes";
import LegislacaoRecente from "./pages/LegislacaoRecente";
import ClientPortal from "./pages/ClientPortal";
import Settings from "./pages/Settings";
import Diplomas from "./pages/Diplomas";
import GestaoTemas from "./pages/GestaoTemas";
import CorrigirDiplomas from "./pages/CorrigirDiplomas";
import RequisitosTema from "./pages/RequisitosTema";

import Progresso from "./pages/Progresso";
import ProgressoCliente from "./pages/ProgressoCliente";
import FontesOficiais from "./pages/FontesOficiais";
import Conformidade from "./pages/Conformidade";
import Aprovacoes from "./pages/Aprovacoes";
import PoliticaIA from "./pages/PoliticaIA";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
        <BrowserRouter>
          <RouteSeo />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/politica-ia" element={<PoliticaIA />} />

            <Route
              path="/biblioteca"
              element={
                <RequireAuth>
                  <Biblioteca />
                </RequireAuth>
              }
            />
            <Route
              path="/normas"
              element={
                <RequireAuth>
                  <Normas />
                </RequireAuth>
              }
            />
            <Route
              path="/aprovacoes"
              element={
                <RequireAuth>
                  <Aprovacoes />
                </RequireAuth>
              }
            />

            <Route
              path="/legislacao/:id"
              element={
                <RequireAuth>
                  <LegislacaoDetalhes />
                </RequireAuth>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/cliente"
              element={
                <RequireAuth>
                  <ClientPortal />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Admin />
                </RequireAdmin>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <Settings />
                </RequireAuth>
              }
            />
            <Route
              path="/progresso"
              element={
                <RequireAdmin>
                  <Progresso />
                </RequireAdmin>
              }
            />
            <Route
              path="/progresso-cliente"
              element={
                <RequireAuth>
                  <ProgressoCliente />
                </RequireAuth>
              }
            />
            <Route
              path="/diplomas"
              element={
                <RequireAdmin>
                  <Diplomas />
                </RequireAdmin>
              }
            />
            <Route
              path="/gestao-temas"
              element={
                <RequireAdmin>
                  <GestaoTemas />
                </RequireAdmin>
              }
            />
            <Route
              path="/corrigir-diplomas"
              element={
                <RequireAdmin>
                  <CorrigirDiplomas />
                </RequireAdmin>
              }
            />
              element={
                <RequireAdmin>
                  <GestaoTemas />
                </RequireAdmin>
              }
            />
            <Route
              path="/requisitos-tema"
              element={
                <RequireAdmin>
                  <RequisitosTema />
                </RequireAdmin>
              }
            />

            <Route
              path="/fontes-oficiais"
              element={
                <RequireAdmin>
                  <FontesOficiais />
                </RequireAdmin>
              }
            />
            <Route
              path="/conformidade"
              element={
                <RequireAuth>
                  <Conformidade />
                </RequireAuth>
              }
            />
            <Route
              path="/legislacao-recente"
              element={
                <RequireAuth>
                  <LegislacaoRecente />
                </RequireAuth>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;
