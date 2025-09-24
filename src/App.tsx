import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminLayout } from "./components/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Proyectos from "./pages/admin/Proyectos";
import Propiedades from "./pages/admin/Propiedades";
import Modelos from "./pages/admin/Modelos";
import Vistas from "./pages/admin/Vistas";
import Estacionamientos from "./pages/admin/Estacionamientos";
import Bodegas from "./pages/admin/Bodegas";
import Pagos from "./pages/admin/Pagos";
import DetalleCuentaCobranza from "./pages/admin/DetalleCuentaCobranza";
import Usuarios from "./pages/admin/Usuarios";
import NuevoUsuario from "./pages/admin/NuevoUsuario";
import EntidadesLegales from "./pages/admin/EntidadesLegales";
import Desarrolladores from "./pages/admin/Desarrolladores";
import Inmobiliarias from "./pages/admin/Inmobiliarias";
import Administradoras from "./pages/admin/Administradoras";
import Notarias from "./pages/admin/Notarias";
import Bancos from "./pages/admin/Bancos";
import Prospectos from "./pages/admin/Prospectos";
import Compradores from "./pages/admin/Compradores";
import Vendedores from "./pages/admin/Vendedores";
import Duenos from "./pages/admin/Duenos";
import Residentes from "./pages/admin/Residentes";
import Agentes from "./pages/admin/Agentes";
import AdministradoresPersonas from "./pages/admin/AdministradoresPersonas";
import RepresentantesLegales from "./pages/admin/RepresentantesLegales";
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
            <Route path="propiedades" element={<Propiedades />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="usuarios/nuevo" element={<NuevoUsuario />} />
            <Route path="entidades-legales" element={<EntidadesLegales />} />
            <Route path="desarrolladores" element={<Desarrolladores />} />
            <Route path="inmobiliarias" element={<Inmobiliarias />} />
            <Route path="administradoras" element={<Administradoras />} />
            <Route path="notarias" element={<Notarias />} />
            <Route path="bancos" element={<Bancos />} />
            <Route path="prospectos" element={<Prospectos />} />
            <Route path="compradores" element={<Compradores />} />
            <Route path="vendedores" element={<Vendedores />} />
            <Route path="duenos" element={<Duenos />} />
            <Route path="residentes" element={<Residentes />} />
            <Route path="agentes" element={<Agentes />} />
            <Route path="administradores-personas" element={<AdministradoresPersonas />} />
            <Route path="representantes-legales" element={<RepresentantesLegales />} />
            <Route path="productos" element={<ComingSoon title="Productos" />} />
            <Route path="categorias" element={<ComingSoon title="Categorías de Producto" />} />
            <Route path="amenidades" element={<ComingSoon title="Amenidades" />} />
            <Route path="caracteristicas" element={<ComingSoon title="Características" />} />
            <Route path="modelos" element={<Modelos />} />
            <Route path="vistas" element={<Vistas />} />
            <Route path="estacionamientos" element={<Estacionamientos />} />
            <Route path="bodegas" element={<Bodegas />} />
            <Route path="cuentas-cobranza" element={<Pagos />} />
            <Route path="cuentas-cobranza/:id/detalle" element={<DetalleCuentaCobranza />} />
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
