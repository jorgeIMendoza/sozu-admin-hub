import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { AdminLayout } from "./components/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy load non-critical route components
const Proyectos = lazy(() => import("./pages/admin/Proyectos"));
const Propiedades = lazy(() => import("./pages/admin/Propiedades"));
const Modelos = lazy(() => import("./pages/admin/Modelos"));
const Vistas = lazy(() => import("./pages/admin/Vistas"));
const Estacionamientos = lazy(() => import("./pages/admin/Estacionamientos"));
const Bodegas = lazy(() => import("./pages/admin/Bodegas"));
const Pagos = lazy(() => import("./pages/admin/Pagos"));
const DetalleCuentaCobranza = lazy(() => import("./pages/admin/DetalleCuentaCobranza"));
const Usuarios = lazy(() => import("./pages/admin/Usuarios"));
const NuevoUsuario = lazy(() => import("./pages/admin/NuevoUsuario"));
const EntidadesLegales = lazy(() => import("./pages/admin/EntidadesLegales"));
const Desarrolladores = lazy(() => import("./pages/admin/Desarrolladores"));
const Inmobiliarias = lazy(() => import("./pages/admin/Inmobiliarias"));
const Administradoras = lazy(() => import("./pages/admin/Administradoras"));
const Notarias = lazy(() => import("./pages/admin/Notarias"));
const Bancos = lazy(() => import("./pages/admin/Bancos"));
const Prospectos = lazy(() => import("./pages/admin/Prospectos"));
const Compradores = lazy(() => import("./pages/admin/Compradores"));
const Vendedores = lazy(() => import("./pages/admin/Vendedores"));
const Duenos = lazy(() => import("./pages/admin/Duenos"));
const Residentes = lazy(() => import("./pages/admin/Residentes"));
const Agentes = lazy(() => import("./pages/admin/Agentes"));
const AdministradoresPersonas = lazy(() => import("./pages/admin/AdministradoresPersonas"));
const RepresentantesLegales = lazy(() => import("./pages/admin/RepresentantesLegales"));
const Productos = lazy(() => import("./pages/admin/Productos"));
const Servicios = lazy(() => import("./pages/admin/Servicios"));
const CategoriasProductos = lazy(() => import("./pages/admin/CategoriasProductos"));
const CuentasMantenimiento = lazy(() => import("./pages/admin/CuentasMantenimiento"));
const ComingSoon = lazy(() => import("./pages/admin/ComingSoon"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider 
      attribute="class" 
      defaultTheme="system" 
      enableSystem
      disableTransitionOnChange={false}
    >
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PWAInstallPrompt />
        <BrowserRouter>
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
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
            <Route path="productos" element={<Productos />} />
            <Route path="servicios" element={<Servicios />} />
            <Route path="categorias-productos" element={<CategoriasProductos />} />
            <Route path="amenidades" element={<ComingSoon title="Amenidades" />} />
            <Route path="caracteristicas" element={<ComingSoon title="Características" />} />
            <Route path="modelos" element={<Modelos />} />
            <Route path="vistas" element={<Vistas />} />
            <Route path="estacionamientos" element={<Estacionamientos />} />
            <Route path="bodegas" element={<Bodegas />} />
            <Route path="cuentas-cobranza" element={<Pagos />} />
            <Route path="cuentas-mantenimiento" element={<CuentasMantenimiento />} />
            <Route path="cuentas-cobranza/:id/detalle" element={<DetalleCuentaCobranza />} />
            <Route path="pagos" element={<ComingSoon title="Pagos" />} />
            <Route path="cuentas-bancarias" element={<ComingSoon title="Cuentas Bancarias" />} />
            <Route path="documentos" element={<ComingSoon title="Documentos" />} />
          </Route>
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
