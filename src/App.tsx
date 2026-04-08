import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { AuthProvider } from "@/contexts/AuthContext";
import { AgentImpersonationProvider } from "@/contexts/AgentImpersonationContext";
import { ClienteImpersonationProvider } from "@/contexts/ClienteImpersonationContext";
import { InmobiliariaImpersonationProvider } from "@/contexts/InmobiliariaImpersonationContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PermissionRoute } from "@/components/auth/PermissionRoute";
import { AdminLayout } from "./components/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import InmobiliariasThemeWrapper from "./components/admin/InmobiliariasThemeWrapper";

// Retry wrapper for lazy imports — handles stale cache after deploys
const lazyRetry = (importFn: () => Promise<any>) =>
  lazy(() =>
    importFn().catch(() => {
      // If the chunk fails to load, reload the page once
      const key = "chunk-retry";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
      return importFn();
    })
  );

// Auth pages
const Login = lazyRetry(() => import("./pages/auth/Login"));
const ChangePassword = lazyRetry(() => import("./pages/auth/ChangePassword"));
const ConfirmacionEmail = lazyRetry(() => import("./pages/auth/ConfirmacionEmail"));
const ForgotPassword = lazyRetry(() => import("./pages/auth/ForgotPassword"));

// Lazy load non-critical route components
const Proyectos = lazyRetry(() => import("./pages/admin/Proyectos"));
const Propiedades = lazyRetry(() => import("./pages/admin/Propiedades"));
const Modelos = lazyRetry(() => import("./pages/admin/Modelos"));
const Vistas = lazyRetry(() => import("./pages/admin/Vistas"));
const Estacionamientos = lazyRetry(() => import("./pages/admin/Estacionamientos"));
const Bodegas = lazyRetry(() => import("./pages/admin/Bodegas"));
const Pagos = lazyRetry(() => import("./pages/admin/Pagos"));
const DetalleCuentaCobranza = lazyRetry(() => import("./pages/admin/DetalleCuentaCobranza"));
const Usuarios = lazyRetry(() => import("./pages/admin/Usuarios"));
const UsuariosDirectivos = lazyRetry(() => import("./pages/admin/UsuariosDirectivos"));
const UsuariosClientes = lazyRetry(() => import("./pages/admin/UsuariosClientes"));
const NuevoUsuario = lazyRetry(() => import("./pages/admin/NuevoUsuario"));
const EntidadesLegales = lazyRetry(() => import("./pages/admin/EntidadesLegales"));
const Desarrolladores = lazyRetry(() => import("./pages/admin/Desarrolladores"));
const Inmobiliarias = lazyRetry(() => import("./pages/admin/Inmobiliarias"));
const Administradoras = lazyRetry(() => import("./pages/admin/Administradoras"));
const Notarias = lazyRetry(() => import("./pages/admin/Notarias"));
const Bancos = lazyRetry(() => import("./pages/admin/Bancos"));
const Prospectos = lazyRetry(() => import("./pages/admin/Prospectos"));
const Compradores = lazyRetry(() => import("./pages/admin/Compradores"));
const DetalleCuentaMantenimiento = lazyRetry(() => import("./pages/admin/DetalleCuentaMantenimiento"));
const Vendedores = lazyRetry(() => import("./pages/admin/Vendedores"));
const Duenos = lazyRetry(() => import("./pages/admin/Duenos"));
const Residentes = lazyRetry(() => import("./pages/admin/Residentes"));
const Agentes = lazyRetry(() => import("./pages/admin/Agentes"));
const AdministradoresPersonas = lazyRetry(() => import("./pages/admin/AdministradoresPersonas"));
const RepresentantesLegales = lazyRetry(() => import("./pages/admin/RepresentantesLegales"));
const RepresentantesComerciales = lazyRetry(() => import("./pages/admin/RepresentantesComerciales"));
const Productos = lazyRetry(() => import("./pages/admin/Productos"));
const Servicios = lazyRetry(() => import("./pages/admin/Servicios"));
const CategoriasProductos = lazyRetry(() => import("./pages/admin/CategoriasProductos"));
const CuentasMantenimiento = lazyRetry(() => import("./pages/admin/CuentasMantenimiento"));
const ComingSoon = lazyRetry(() => import("./pages/admin/ComingSoon"));
const RevisionDocumentacion = lazyRetry(() => import("./pages/admin/RevisionDocumentacion"));
const ConsultasIA = lazyRetry(() => import("./pages/admin/ConsultasIA"));
const Reservas = lazyRetry(() => import("./pages/admin/Reservas"));
const Contratos = lazyRetry(() => import("./pages/admin/legal/Contratos"));
const CartaAcuerdos = lazyRetry(() => import("./pages/admin/legal/CartaAcuerdos"));
const Comisiones = lazyRetry(() => import("./pages/admin/Comisiones"));
const AprobacionComisiones = lazyRetry(() => import("./pages/admin/AprobacionComisiones"));
const ComisionesExternas = lazyRetry(() => import("./pages/admin/ComisionesExternas"));
const PagarComisiones = lazyRetry(() => import("./pages/admin/PagarComisiones"));
const PagoProveedores = lazyRetry(() => import("./pages/admin/PagoProveedores"));
const ReporteDiscrepancias = lazyRetry(() => import("./pages/admin/ReporteDiscrepancias"));
const RolesPermisos = lazyRetry(() => import("./pages/admin/RolesPermisos"));
const AccessDenied = lazyRetry(() => import("./pages/admin/AccessDenied"));
const LogsActividad = lazyRetry(() => import("./pages/admin/LogsActividad"));
const RastreoClabeSTP = lazyRetry(() => import("./pages/admin/RastreoClabeSTP"));
const RastreoPagosSTP = lazyRetry(() => import("./pages/admin/RastreoPagosSTP"));
const ConfiguracionReportes = lazyRetry(() => import("./pages/admin/ConfiguracionReportes"));
const VersionProduccion = lazyRetry(() => import("./pages/admin/VersionProduccion"));
const ReportesInventarios = lazyRetry(() => import("./pages/admin/reportes/Inventarios"));
const ReportesFinanzas = lazyRetry(() => import("./pages/admin/reportes/Finanzas"));
const ReporteViewer = lazyRetry(() => import("./pages/admin/reportes/ReporteViewer"));
const MiInformacion = lazyRetry(() => import("./pages/admin/inmobiliarias/MiInformacion"));
const MisAgentes = lazyRetry(() => import("./pages/admin/inmobiliarias/MisAgentes"));
const MisPropiedades = lazyRetry(() => import("./pages/admin/inmobiliarias/MisPropiedades"));
const MisVentas = lazyRetry(() => import("./pages/admin/inmobiliarias/MisVentas"));
const MisProyectos = lazyRetry(() => import("./pages/admin/inmobiliarias/MisProyectos"));
const MiProyectoDetalle = lazyRetry(() => import("./pages/admin/inmobiliarias/MiProyectoDetalle"));
const MiProyectoInventario = lazyRetry(() => import("./pages/admin/inmobiliarias/MiProyectoInventario"));
const InventarioGlobal = lazyRetry(() => import("./pages/admin/inmobiliarias/InventarioGlobalAB"));
const MedicionesCTA = lazyRetry(() => import("./pages/admin/MedicionesCTA"));
const ABTests = lazyRetry(() => import("./pages/admin/ABTests"));
const AdministrarMenus = lazyRetry(() => import("./pages/admin/AdministrarMenus"));
const AdministrarAvisos = lazyRetry(() => import("./pages/admin/comunicacion/AdministrarAvisos"));
const EnviarAvisos = lazyRetry(() => import("./pages/admin/comunicacion/EnviarAvisos"));
const EjecucionesAvisos = lazyRetry(() => import("./pages/admin/comunicacion/Ejecuciones"));
const WorkflowOfertas = lazyRetry(() => import("./pages/admin/crm/WorkflowOfertas"));
const DashboardEjecutivo = lazyRetry(() => import("./pages/admin/crm/DashboardEjecutivo"));
const ConfiguracionCitas = lazyRetry(() => import("./pages/admin/comunicacion/ConfiguracionCitas"));
const TodasLasCitas = lazyRetry(() => import("./pages/admin/comunicacion/TodasLasCitas"));
const NotificacionesConfig = lazyRetry(() => import("./pages/admin/NotificacionesConfig"));
const NotificacionesLog = lazyRetry(() => import("./pages/admin/NotificacionesLog"));

// Portal Inmobiliaria pages
const InmobDashboard = lazyRetry(() => import("./pages/admin/portal-inmobiliaria/InmobDashboard"));
const InmobAgentes = lazyRetry(() => import("./pages/admin/portal-inmobiliaria/InmobAgentes"));
const InmobAgentProfile = lazyRetry(() => import("./pages/admin/portal-inmobiliaria/InmobAgentProfile"));
const InmobPipeline = lazyRetry(() => import("./pages/admin/portal-inmobiliaria/InmobPipeline"));
const InmobProspectos = lazyRetry(() => import("./pages/admin/portal-inmobiliaria/InmobProspectos"));
const InmobCitas = lazyRetry(() => import("./pages/admin/portal-inmobiliaria/InmobCitas"));
const InmobComisiones = lazyRetry(() => import("./pages/admin/portal-inmobiliaria/InmobComisiones"));
const InmobReportes = lazyRetry(() => import("./pages/admin/portal-inmobiliaria/InmobReportes"));
const InmobConfiguracion = lazyRetry(() => import("./pages/admin/portal-inmobiliaria/InmobConfiguracion"));

// Agent Portal pages
const AgentInicio = lazyRetry(() => import("./pages/admin/agent-portal/AgentInicio"));
const AgentInventario = lazyRetry(() => import("./pages/admin/agent-portal/AgentInventario"));
const AgentPipeline = lazyRetry(() => import("./pages/admin/agent-portal/AgentPipeline"));
const AgentComisiones = lazyRetry(() => import("./pages/admin/agent-portal/AgentComisiones"));
const AgentPerfil = lazyRetry(() => import("./pages/admin/agent-portal/AgentPerfil"));
const AgentProspectos = lazyRetry(() => import("./pages/admin/agent-portal/AgentProspectos"));
const AgentUnidadesProyecto = lazyRetry(() => import("./pages/admin/agent-portal/AgentUnidadesProyecto"));
const AgentProyectoDetalle = lazyRetry(() => import("./pages/admin/agent-portal/AgentProyectoDetalle"));

// Portal Cliente pages
const ClienteInicio = lazyRetry(() => import("./pages/admin/portal-cliente/ClienteInicio"));
const ClientePropiedades = lazyRetry(() => import("./pages/admin/portal-cliente/ClientePropiedades"));
const ClientePerfil = lazyRetry(() => import("./pages/admin/portal-cliente/ClientePerfil"));
const ClienteHistorialPagos = lazyRetry(() => import("./pages/admin/portal-cliente/ClienteHistorialPagos"));
const ClientePropiedadDetalle = lazyRetry(() => import("./pages/admin/portal-cliente/ClientePropiedadDetalle"));
const ClienteMantenimientoPago = lazyRetry(() => import("./pages/admin/portal-cliente/ClienteMantenimientoPago"));
const ClientePropiedadPago = lazyRetry(() => import("./pages/admin/portal-cliente/ClientePropiedadPago"));
const ClienteDetallesTecnicos = lazyRetry(() => import("./pages/admin/portal-cliente/ClienteDetallesTecnicos"));

const Registro = lazyRetry(() => import("./pages/public/Registro"));
const RegistroInmobiliaria = lazyRetry(() => import("./pages/public/RegistroInmobiliaria"));
const AgentesLanding = lazyRetry(() => import("./pages/public/AgentesLanding"));

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

const hostname = window.location.hostname;
const isRegistroSubdomain = hostname === 'registro.sozu.com';
const isInmobiliariasSubdomain = hostname === 'inmobiliarias.sozu.com';
const isAgentesSubdomain = hostname === 'agentes.sozu.com';
const isClientesSubdomain = hostname === 'clientes.sozu.com';

// Determine portal context from subdomain for login page branding
const getPortalContext = (): 'agentes' | 'inmobiliarias' | 'clientes' | null => {
  if (isAgentesSubdomain) return 'agentes';
  if (isInmobiliariasSubdomain) return 'inmobiliarias';
  if (isClientesSubdomain) return 'clientes';
  return null;
};
const portalContext = getPortalContext();

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
            <AgentImpersonationProvider>
            <ClienteImpersonationProvider>
            <InmobiliariaImpersonationProvider>
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
                <Route path="/auth/confirmacion-email" element={<ConfirmacionEmail />} />
                <Route path="/auth/forgot-password" element={<ForgotPassword />} />
                
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
                  <Route path="legal/carta-acuerdos" element={<CartaAcuerdos />} />
                  <Route path="reportes/discrepancias" element={<ReporteDiscrepancias />} />
                  <Route path="logs-actividad" element={<LogsActividad />} />
                  <Route path="rastreo-clabes-stp" element={<RastreoClabeSTP />} />
                  <Route path="rastreo-pagos-stp" element={<RastreoPagosSTP />} />
                  <Route path="configuracion-reportes" element={<ConfiguracionReportes />} />
                 <Route path="version-produccion" element={<VersionProduccion />} />
                  <Route path="reportes/inventarios" element={<ReportesInventarios />} />
                  <Route path="reportes/finanzas" element={<ReportesFinanzas />} />
                  <Route path="reportes/ver/:id" element={<ReporteViewer />} />
                  <Route element={<InmobiliariasThemeWrapper />}>
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
                  </Route>
                  <Route path="administrar-menus" element={<AdministrarMenus />} />
                  <Route path="comunicacion/administrar-avisos" element={<AdministrarAvisos />} />
                  <Route path="comunicacion/enviar-avisos" element={<EnviarAvisos />} />
                  <Route path="comunicacion/ejecuciones" element={<EjecucionesAvisos />} />
                  <Route path="comunicacion/configuracion-citas" element={<ConfiguracionCitas />} />
                  <Route path="comunicacion/todas-las-citas" element={<TodasLasCitas />} />
                  <Route path="crm/workflow-ofertas" element={<WorkflowOfertas />} />
                  <Route path="crm/dashboard-ejecutivo" element={<DashboardEjecutivo />} />
                  <Route path="mediciones-cta" element={<MedicionesCTA />} />
                  <Route path="ab-tests" element={<ABTests />} />
                  <Route path="notificaciones-config" element={<NotificacionesConfig />} />
                  <Route path="notificaciones-log" element={<NotificacionesLog />} />
                  {/* Portal Inmobiliaria Routes */}
                  <Route path="portal-inmobiliaria/dashboard" element={<InmobDashboard />} />
                  <Route path="portal-inmobiliaria/agentes" element={<InmobAgentes />} />
                  <Route path="portal-inmobiliaria/agentes/:email" element={<InmobAgentProfile />} />
                  <Route path="portal-inmobiliaria/pipeline" element={<InmobPipeline />} />
                  <Route path="portal-inmobiliaria/prospectos" element={<InmobProspectos />} />
                  <Route path="portal-inmobiliaria/citas" element={<InmobCitas />} />
                  <Route path="portal-inmobiliaria/comisiones" element={<InmobComisiones />} />
                  <Route path="portal-inmobiliaria/reportes" element={<InmobReportes />} />
                  <Route path="portal-inmobiliaria/configuracion" element={<InmobConfiguracion />} />
                  {/* Agent Portal Routes */}
                  <Route path="agent/inicio" element={<AgentInicio />} />
                  <Route path="agent/inventario" element={<AgentInventario />} />
                  <Route path="agent/pipeline" element={<AgentPipeline />} />
                  <Route path="agent/comisiones" element={<AgentComisiones />} />
                  <Route path="agent/prospectos" element={<AgentProspectos />} />
                  <Route path="agent/perfil" element={<AgentPerfil />} />
                  <Route path="agent/inventario/unidades" element={<AgentUnidadesProyecto />} />
                  <Route path="agent/proyecto/:id" element={<AgentProyectoDetalle />} />
                  <Route path="agent/inventario/proyecto/:id" element={<AgentProyectoDetalle />} />
                  {/* Portal Cliente Routes */}
                  <Route path="portal-cliente/inicio" element={<ClienteInicio />} />
                  <Route path="portal-cliente/historial-pagos" element={<ClienteHistorialPagos />} />
                  <Route path="portal-cliente/pagos" element={<ClienteHistorialPagos />} />
                  <Route path="portal-cliente/propiedades" element={<ClientePropiedades />} />
                  <Route path="portal-cliente/propiedad/:cuentaId" element={<ClientePropiedadDetalle />} />
                  <Route path="portal-cliente/propiedad/:cuentaId/detalles-tecnicos" element={<ClienteDetallesTecnicos />} />
                  <Route path="portal-cliente/perfil" element={<ClientePerfil />} />
                  <Route path="portal-cliente/mantenimiento-pago/:cuentaId" element={<ClienteMantenimientoPago />} />
                  <Route path="portal-cliente/propiedad-pago/:cuentaId" element={<ClientePropiedadPago />} />
                </Route>
                
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              )}
            </Suspense>
            </InmobiliariaImpersonationProvider>
            </ClienteImpersonationProvider>
            </AgentImpersonationProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
