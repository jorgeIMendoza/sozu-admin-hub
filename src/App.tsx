import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PermissionRoute } from "@/components/auth/PermissionRoute";
import { AdminLayout } from "./components/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Auth pages
const Login = lazy(() => import("./pages/auth/Login"));
const ChangePassword = lazy(() => import("./pages/auth/ChangePassword"));

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
const UsuariosDirectivos = lazy(() => import("./pages/admin/UsuariosDirectivos"));
const UsuariosClientes = lazy(() => import("./pages/admin/UsuariosClientes"));
const NuevoUsuario = lazy(() => import("./pages/admin/NuevoUsuario"));
const EntidadesLegales = lazy(() => import("./pages/admin/EntidadesLegales"));
const Desarrolladores = lazy(() => import("./pages/admin/Desarrolladores"));
const Inmobiliarias = lazy(() => import("./pages/admin/Inmobiliarias"));
const Administradoras = lazy(() => import("./pages/admin/Administradoras"));
const Notarias = lazy(() => import("./pages/admin/Notarias"));
const Bancos = lazy(() => import("./pages/admin/Bancos"));
const Prospectos = lazy(() => import("./pages/admin/Prospectos"));
const Compradores = lazy(() => import("./pages/admin/Compradores"));
const DetalleCuentaMantenimiento = lazy(() => import("./pages/admin/DetalleCuentaMantenimiento"));
const Vendedores = lazy(() => import("./pages/admin/Vendedores"));
const Duenos = lazy(() => import("./pages/admin/Duenos"));
const Residentes = lazy(() => import("./pages/admin/Residentes"));
const Agentes = lazy(() => import("./pages/admin/Agentes"));
const AdministradoresPersonas = lazy(() => import("./pages/admin/AdministradoresPersonas"));
const RepresentantesLegales = lazy(() => import("./pages/admin/RepresentantesLegales"));
const RepresentantesComerciales = lazy(() => import("./pages/admin/RepresentantesComerciales"));
const Productos = lazy(() => import("./pages/admin/Productos"));
const Servicios = lazy(() => import("./pages/admin/Servicios"));
const CategoriasProductos = lazy(() => import("./pages/admin/CategoriasProductos"));
const CuentasMantenimiento = lazy(() => import("./pages/admin/CuentasMantenimiento"));
const ComingSoon = lazy(() => import("./pages/admin/ComingSoon"));
const RevisionDocumentacion = lazy(() => import("./pages/admin/RevisionDocumentacion"));
const ConsultasIA = lazy(() => import("./pages/admin/ConsultasIA"));
const Reservas = lazy(() => import("./pages/admin/Reservas"));
const Contratos = lazy(() => import("./pages/admin/legal/Contratos"));
const Comisiones = lazy(() => import("./pages/admin/Comisiones"));
const AprobacionComisiones = lazy(() => import("./pages/admin/AprobacionComisiones"));
const ComisionesExternas = lazy(() => import("./pages/admin/ComisionesExternas"));
const PagarComisiones = lazy(() => import("./pages/admin/PagarComisiones"));
const PagoProveedores = lazy(() => import("./pages/admin/PagoProveedores"));
const ReporteDiscrepancias = lazy(() => import("./pages/admin/ReporteDiscrepancias"));
const RolesPermisos = lazy(() => import("./pages/admin/RolesPermisos"));
const AccessDenied = lazy(() => import("./pages/admin/AccessDenied"));
const LogsActividad = lazy(() => import("./pages/admin/LogsActividad"));
const RastreoClabeSTP = lazy(() => import("./pages/admin/RastreoClabeSTP"));
const RastreoPagosSTP = lazy(() => import("./pages/admin/RastreoPagosSTP"));
const ConfiguracionReportes = lazy(() => import("./pages/admin/ConfiguracionReportes"));
 const VersionProduccion = lazy(() => import("./pages/admin/VersionProduccion"));
const ReportesInventarios = lazy(() => import("./pages/admin/reportes/Inventarios"));
const ReportesFinanzas = lazy(() => import("./pages/admin/reportes/Finanzas"));
const ReporteViewer = lazy(() => import("./pages/admin/reportes/ReporteViewer"));
const MiInformacion = lazy(() => import("./pages/admin/inmobiliarias/MiInformacion"));
const MisAgentes = lazy(() => import("./pages/admin/inmobiliarias/MisAgentes"));
const MisPropiedades = lazy(() => import("./pages/admin/inmobiliarias/MisPropiedades"));
const MisVentas = lazy(() => import("./pages/admin/inmobiliarias/MisVentas"));
const MisProyectos = lazy(() => import("./pages/admin/inmobiliarias/MisProyectos"));
const MiProyectoDetalle = lazy(() => import("./pages/admin/inmobiliarias/MiProyectoDetalle"));
const MiProyectoInventario = lazy(() => import("./pages/admin/inmobiliarias/MiProyectoInventario"));
const InventarioGlobal = lazy(() => import("./pages/admin/inmobiliarias/InventarioGlobalAB"));
const MedicionesCTA = lazy(() => import("./pages/admin/MedicionesCTA"));
const ABTests = lazy(() => import("./pages/admin/ABTests"));
const AdministrarMenus = lazy(() => import("./pages/admin/AdministrarMenus"));
const AdministrarAvisos = lazy(() => import("./pages/admin/comunicacion/AdministrarAvisos"));
const EnviarAvisos = lazy(() => import("./pages/admin/comunicacion/EnviarAvisos"));
const EjecucionesAvisos = lazy(() => import("./pages/admin/comunicacion/Ejecuciones"));
const WorkflowOfertas = lazy(() => import("./pages/admin/crm/WorkflowOfertas"));
const DashboardEjecutivo = lazy(() => import("./pages/admin/crm/DashboardEjecutivo"));

const Registro = lazy(() => import("./pages/public/Registro"));
const AgentesLanding = lazy(() => import("./pages/public/AgentesLanding"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000, // 5 minutos
      retry: 1,
    },
  },
});

const isRegistroSubdomain = window.location.hostname === 'registro.sozu.com';
const isInmobiliariasSubdomain = window.location.hostname === 'inmobiliarias.sozu.com';
const isAgentesSubdomain = window.location.hostname === 'agentes.sozu.com';

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
          <AuthProvider>
            <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
              {isAgentesSubdomain ? (
                <Routes>
                  <Route path="*" element={<AgentesLanding />} />
                </Routes>
              ) : (
              <Routes>
                <Route path="/" element={isRegistroSubdomain ? <Registro /> : <Navigate to="/admin" replace />} />
                <Route path="/welcome" element={<Index />} />
                
                {/* Auth Routes */}
                <Route path="/auth/login" element={<Login />} />
                <Route path="/auth/change-password" element={<ChangePassword />} />
                
                {/* Public Routes */}
                <Route path="/registro" element={<Registro />} />
                <Route path="/agentes" element={<AgentesLanding />} />
                
                {/* Admin Routes - Protected by Auth and Permissions */}
                <Route path="/admin" element={
                  <ProtectedRoute>
                    <PermissionRoute>
                      <AdminLayout />
                    </PermissionRoute>
                  </ProtectedRoute>
                }>
                  <Route index element={<Dashboard />} />
                  <Route path="access-denied" element={<AccessDenied />} />
                  <Route path="proyectos" element={<Proyectos />} />
                  <Route path="propiedades" element={<Propiedades />} />
                  <Route path="usuarios" element={<Usuarios />} />
                  <Route path="usuarios/nuevo" element={<NuevoUsuario />} />
                  <Route path="usuarios-directivos" element={<UsuariosDirectivos />} />
                  <Route path="usuarios-clientes" element={<UsuariosClientes />} />
                  <Route path="roles-permisos" element={<RolesPermisos />} />
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
                  <Route path="representantes-comerciales" element={<RepresentantesComerciales />} />
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
                  <Route path="cuentas-mantenimiento/:id/detalle" element={<DetalleCuentaMantenimiento />} />
                  <Route path="cuentas-cobranza/:id/detalle" element={<DetalleCuentaCobranza />} />
                  <Route path="comisiones" element={<Comisiones />} />
                  <Route path="aprobacion-comisiones" element={<AprobacionComisiones />} />
                  <Route path="comisiones-externas" element={<ComisionesExternas />} />
                  <Route path="pagar-comisiones" element={<PagarComisiones />} />
                  <Route path="pago-proveedores" element={<PagoProveedores />} />
                  <Route path="pagos" element={<ComingSoon title="Pagos" />} />
                  <Route path="cuentas-bancarias" element={<ComingSoon title="Cuentas Bancarias" />} />
                  <Route path="documentos" element={<ComingSoon title="Documentos" />} />
                  <Route path="notarios/revision-documentacion" element={<RevisionDocumentacion />} />
                  <Route path="consultas-ia" element={<ConsultasIA />} />
                  <Route path="reservas" element={<Reservas />} />
                  <Route path="legal/contratos" element={<Contratos />} />
                  <Route path="reportes/discrepancias" element={<ReporteDiscrepancias />} />
                  <Route path="logs-actividad" element={<LogsActividad />} />
                  <Route path="rastreo-clabes-stp" element={<RastreoClabeSTP />} />
                  <Route path="rastreo-pagos-stp" element={<RastreoPagosSTP />} />
                  <Route path="configuracion-reportes" element={<ConfiguracionReportes />} />
                 <Route path="version-produccion" element={<VersionProduccion />} />
                  <Route path="reportes/inventarios" element={<ReportesInventarios />} />
                  <Route path="reportes/finanzas" element={<ReportesFinanzas />} />
                  <Route path="reportes/ver/:id" element={<ReporteViewer />} />
                  <Route path="inmobiliarias/mi-informacion" element={<MiInformacion />} />
                  <Route path="inmobiliarias/mis-agentes" element={<MisAgentes />} />
                  <Route path="inmobiliarias/mis-propiedades" element={<Navigate to="/admin/inmobiliarias/inventario" replace />} />
                  <Route path="inmobiliarias/mis-ventas" element={<MisVentas />} />
                  <Route path="inmobiliarias/proyectos" element={<MisProyectos />} />
                  <Route path="inmobiliarias/proyectos/:id" element={<MiProyectoDetalle />} />
                  <Route path="inmobiliarias/proyectos/:id/inventario" element={<MiProyectoInventario />} />
                  <Route path="inmobiliarias/mis-proyectos" element={<Navigate to="/admin/inmobiliarias/proyectos" replace />} />
                  <Route path="inmobiliarias/mis-proyectos/:id" element={<Navigate to="/admin/inmobiliarias/proyectos" replace />} />
                  <Route path="inmobiliarias/inventario" element={<InventarioGlobal />} />
                  <Route path="administrar-menus" element={<AdministrarMenus />} />
                  <Route path="comunicacion/administrar-avisos" element={<AdministrarAvisos />} />
                  <Route path="comunicacion/enviar-avisos" element={<EnviarAvisos />} />
                  <Route path="comunicacion/ejecuciones" element={<EjecucionesAvisos />} />
                  <Route path="crm/workflow-ofertas" element={<WorkflowOfertas />} />
                  <Route path="crm/dashboard-ejecutivo" element={<DashboardEjecutivo />} />
                  <Route path="mediciones-cta" element={<MedicionesCTA />} />
                  <Route path="ab-tests" element={<ABTests />} />
                </Route>
                
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              )}
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
