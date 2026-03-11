// Rutas válidas del sistema (deben coincidir con las rutas en src/App.tsx)
export const VALID_ADMIN_ROUTES = new Set([
  '/admin',
  '/admin/proyectos',
  '/admin/propiedades',
  '/admin/usuarios',
  '/admin/usuarios/nuevo',
  '/admin/usuarios-directivos',
  '/admin/usuarios-clientes',
  '/admin/roles-permisos',
  '/admin/entidades-legales',
  '/admin/desarrolladores',
  '/admin/inmobiliarias',
  '/admin/administradoras',
  '/admin/notarias',
  '/admin/bancos',
  '/admin/prospectos',
  '/admin/compradores',
  '/admin/vendedores',
  '/admin/duenos',
  '/admin/residentes',
  '/admin/agentes',
  '/admin/administradores-personas',
  '/admin/representantes-legales',
  '/admin/representantes-comerciales',
  '/admin/productos',
  '/admin/servicios',
  '/admin/categorias-productos',
  '/admin/amenidades',
  '/admin/caracteristicas',
  '/admin/modelos',
  '/admin/vistas',
  '/admin/estacionamientos',
  '/admin/bodegas',
  '/admin/cuentas-cobranza',
  '/admin/cuentas-mantenimiento',
  '/admin/comisiones',
  '/admin/aprobacion-comisiones',
  '/admin/comisiones-externas',
  '/admin/pagar-comisiones',
  '/admin/pago-proveedores',
  '/admin/pagos',
  '/admin/cuentas-bancarias',
  '/admin/documentos',
  '/admin/notarios/revision-documentacion',
  '/admin/consultas-ia',
  '/admin/reservas',
  '/admin/legal/contratos',
  '/admin/legal/carta-acuerdos',
  '/admin/reportes/discrepancias',
  '/admin/logs-actividad',
  '/admin/rastreo-clabes-stp',
  '/admin/rastreo-pagos-stp',
  '/admin/configuracion-reportes',
  '/admin/version-produccion',
  '/admin/reportes/inventarios',
  '/admin/reportes/finanzas',
  '/admin/reportes/ver/:id',
  '/admin/inmobiliarias/mi-informacion',
  '/admin/inmobiliarias/mis-agentes',
  '/admin/inmobiliarias/mis-propiedades',
  '/admin/inmobiliarias/mis-ventas',
  '/admin/inmobiliarias/proyectos',
  '/admin/inmobiliarias/proyectos/:id',
  '/admin/inmobiliarias/proyectos/:id/inventario',
  '/admin/inmobiliarias/inventario',
  '/admin/administrar-menus',
  '/admin/cuentas-mantenimiento/:id/detalle',
  '/admin/cuentas-cobranza/:id/detalle',
  '/admin/comunicacion/administrar-avisos',
  '/admin/comunicacion/enviar-avisos',
  '/admin/comunicacion/ejecuciones',
  '/admin/crm/workflow-ofertas',
  '/admin/crm/dashboard-ejecutivo',
  '/admin/mediciones-cta',
  '/admin/ab-tests',
  '/admin/comunicacion/configuracion-citas',
  '/admin/comunicacion/todas-las-citas',
  '/admin/agent/inicio',
  '/admin/agent/inventario',
  '/admin/agent/pipeline',
  '/admin/agent/comisiones',
  '/admin/agent/perfil',
  '/admin/agent/perfil/bloque/:id',
  // Portal Inmobiliaria
  '/admin/portal-inmobiliaria/dashboard',
  '/admin/portal-inmobiliaria/agentes',
  '/admin/portal-inmobiliaria/pipeline',
  '/admin/portal-inmobiliaria/prospectos',
  '/admin/portal-inmobiliaria/citas',
  '/admin/portal-inmobiliaria/comisiones',
  '/admin/portal-inmobiliaria/configuracion',
  '/admin/portal-inmobiliaria/agentes/:email',
  // Portal Cliente
  '/admin/portal-cliente/inicio',
  '/admin/portal-cliente/propiedades',
  '/admin/portal-cliente/pagos',
  '/admin/portal-cliente/perfil',
]);

export function isValidRoute(route: string): boolean {
  if (!route || !route.startsWith('/admin')) {
    return false;
  }
  
  // Buscar ruta exacta
  if (VALID_ADMIN_ROUTES.has(route)) {
    return true;
  }
  
  // Soporte para rutas parametrizadas (ej: /admin/reportes/ver/:id)
  // Normalizar la ruta entrante para comparar con patrones
  for (const validRoute of VALID_ADMIN_ROUTES) {
    if (validRoute.includes(':')) {
      // Convertir patrón a regex
      const pattern = validRoute.replace(/:\w+/g, '[^/]+');
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(route)) {
        return true;
      }
    }
  }
  
  return false;
}
