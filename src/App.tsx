import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAdmin } from "@/components/auth/RequireAdmin";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Biblioteca from "./pages/Biblioteca";
import LegislacaoDetalhes from "./pages/LegislacaoDetalhes";
import ClientPortal from "./pages/ClientPortal";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/biblioteca"
              element={
                <RequireAuth>
                  <Biblioteca />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
