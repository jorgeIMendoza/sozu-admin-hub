import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminLayout } from "./components/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Proyectos from "./pages/admin/Proyectos";
import ComingSoon from "./pages/admin/ComingSoon";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/welcome" element={<Index />} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="proyectos" element={<Proyectos />} />
            <Route path="edificios" element={<ComingSoon title="Edificios" />} />
            <Route path="propiedades" element={<ComingSoon title="Propiedades" />} />
            <Route path="usuarios" element={<ComingSoon title="Usuarios" />} />
            <Route path="compradores" element={<ComingSoon title="Compradores" />} />
            <Route path="beneficiarios" element={<ComingSoon title="Beneficiarios" />} />
            <Route path="comisionistas" element={<ComingSoon title="Comisionistas" />} />
            <Route path="productos" element={<ComingSoon title="Productos" />} />
            <Route path="categorias" element={<ComingSoon title="Categorías de Producto" />} />
            <Route path="amenidades" element={<ComingSoon title="Amenidades" />} />
            <Route path="caracteristicas" element={<ComingSoon title="Características" />} />
            <Route path="cuentas-cobranza" element={<ComingSoon title="Cuentas de Cobranza" />} />
            <Route path="pagos" element={<ComingSoon title="Pagos" />} />
            <Route path="cuentas-bancarias" element={<ComingSoon title="Cuentas Bancarias" />} />
            <Route path="documentos" element={<ComingSoon title="Documentos" />} />
          </Route>
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
