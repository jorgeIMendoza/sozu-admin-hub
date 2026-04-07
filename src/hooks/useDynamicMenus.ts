 import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { LucideIcon } from 'lucide-react';
import {
    LayoutDashboard,
    Building2,
    Building,
    Users,
    Home,
    Package,
    Settings,
    FileText,
    CreditCard,
    User,
    Calendar,
    Briefcase,
    Car,
    Warehouse,
    Eye,
    UserSearch,
    Wallet,
    BadgeDollarSign,
    UserCheck,
    UserCog,
    Scale,
    Receipt,
    Banknote,
    Landmark,
    Shield,
    Wrench,
    Activity,
     KeyRound,
     ScrollText,
     Bot,
     UserPlus,
     BarChart3,
     ClipboardList,
     DollarSign,
     Cog,
     ShoppingCart,
     GitBranch,
     Mail,
     Send,
     History,
     Bell,
   } from 'lucide-react';
 
 // Mapeo de iconos por vista_front_end o menu_id
 const iconMapByPath: Record<string, LucideIcon> = {
   '/admin': LayoutDashboard,
   '/admin/proyectos': Building2,
   '/admin/propiedades': Building,
   '/admin/modelos': Home,
   '/admin/vistas': Eye,
   '/admin/estacionamientos': Car,
   '/admin/bodegas': Warehouse,
   '/admin/entidades-legales': Shield,
   '/admin/desarrolladores': Building2,
   '/admin/inmobiliarias': KeyRound,
   '/admin/administradoras': Wrench,
   '/admin/notarias': ScrollText,
   '/admin/bancos': Landmark,
   '/admin/prospectos': UserSearch,
   '/admin/compradores': Wallet,
   '/admin/vendedores': BadgeDollarSign,
   '/admin/duenos': UserCheck,
   '/admin/residentes': Home,
   '/admin/agentes': Briefcase,
   '/admin/administradores-personas': UserCog,
   '/admin/representantes-legales': Scale,
   '/admin/representantes-comerciales': Briefcase,
   '/admin/productos': Package,
   '/admin/servicios': Wrench,
   '/admin/categorias-productos': ShoppingCart,
   '/admin/cuentas-cobranza': Receipt,
   '/admin/comisiones': Banknote,
   '/admin/aprobacion-comisiones': BadgeDollarSign,
   '/admin/comisiones-externas': Briefcase,
   '/admin/pagar-comisiones': CreditCard,
  '/admin/pago-proveedores': Banknote,
   '/admin/cuentas-mantenimiento': Wrench,
   '/admin/reservas': Calendar,
   '/admin/notarios/revision-documentacion': FileText,
  '/admin/legal/contratos': FileText,
  '/admin/legal/carta-acuerdos': ScrollText,
   '/admin/usuarios': UserPlus,
   '/admin/usuarios-directivos': Users,
   '/admin/usuarios-clientes': UserCheck,
   '/admin/roles-permisos': Shield,
   '/admin/reportes/inventarios': ClipboardList,
   '/admin/reportes/finanzas': DollarSign,
   '/admin/consultas-ia': Bot,
   '/admin/logs-actividad': Activity,
   '/admin/rastreo-clabes-stp': CreditCard,
   '/admin/rastreo-pagos-stp': CreditCard,
   '/admin/configuracion-reportes': Cog,
  '/admin/version-produccion': GitBranch,
  // Inmobiliarias portal
  '/admin/inmobiliarias/mi-informacion': User,
  '/admin/inmobiliarias/mis-agentes': Briefcase,
  '/admin/inmobiliarias/mis-propiedades': Building,
  '/admin/inmobiliarias/mis-ventas': BadgeDollarSign,
  '/admin/administrar-menus': Settings,
  '/admin/comunicacion/administrar-avisos': Mail,
  '/admin/comunicacion/enviar-avisos': Send,
   '/admin/comunicacion/ejecuciones': History,
    '/admin/comunicacion/todas-las-citas': Calendar,
     '/admin/notificaciones-config': Bell,
     '/admin/notificaciones-log': ScrollText,
  '/admin/crm/workflow-ofertas': ClipboardList,
  '/admin/crm/dashboard-ejecutivo': BarChart3,
   // Agent Portal
   '/admin/agent/inicio': LayoutDashboard,
   '/admin/agent/inventario': Building,
   '/admin/agent/prospectos': Users,
   '/admin/agent/pipeline': Activity,
   '/admin/agent/comisiones': Banknote,
   '/admin/agent/perfil': User,
   // Portal Inmobiliaria
   '/admin/portal-inmobiliaria/dashboard': LayoutDashboard,
   '/admin/portal-inmobiliaria/agentes': Users,
   '/admin/portal-inmobiliaria/pipeline': Activity,
   '/admin/portal-inmobiliaria/prospectos': UserSearch,
   '/admin/portal-inmobiliaria/citas': Calendar,
   '/admin/portal-inmobiliaria/comisiones': Banknote,
   '/admin/portal-inmobiliaria/reportes': BarChart3,
   '/admin/portal-inmobiliaria/configuracion': Cog,
   // Portal Cliente
   '/admin/portal-cliente/inicio': LayoutDashboard,
   '/admin/portal-cliente/propiedades': Building,
   '/admin/portal-cliente/perfil': User,
 };
 
 // Mapeo de iconos por menu_id para los grupos
 const iconMapByMenuId: Record<number, LucideIcon> = {
   1: LayoutDashboard,  // Dashboard
   2: Building2,        // Inventarios
   3: Users,            // Entidades
   4: User,             // Personas
   5: Package,          // Productos
   6: CreditCard,       // Finanzas
   7: Wrench,           // Mantenimientos
   8: ScrollText,       // Notario
   9: Scale,            // Legal
   10: Settings,        // Sistema
   11: BarChart3,       // Reportes
   12: KeyRound,        // Inmobiliarias (portal)
    13: Activity,        // Configuraciones/Logs
    14: Mail,            // Comunicación
    15: Briefcase,        // CRM
     16: User,              // Portal Agente
      17: Building2,          // Portal Inmobiliaria
      18: User,                // Portal Cliente
   };
 
 export interface DynamicMenuItem {
   title: string;
   href?: string;
   icon: LucideIcon;
   menuId: number;
   children?: DynamicMenuChild[];
 }
 
export interface DynamicMenuChild {
  title: string;
  href: string;
  icon: LucideIcon;
  submenuId: number;
  disabled?: boolean;
}
 
interface RawSubmenu {
  id: number;
  nombre: string;
  vista_front_end: string | null;
  menu_id: number;
  orden: number;
  solo_usuarioa?: boolean;
  menus: {
    id: number;
    nombre: string;
  } | null;
}
 
const USUARIO_A_EMAIL = 'jorge.mendoza@sozu.com';
const LOGS_MENU_ID = 13; // Menu de Configuraciones/Logs
const INMOBILIARIAS_PORTAL_MENU_ID = 12; // Menu de Inmobiliarias (portal)
const DASHBOARD_MENU_ID = 1;
 
 export function useDynamicMenus() {
   const { profile, isLoading: isAuthLoading, user, permissionVersion } = useAuth();
   const [menuItems, setMenuItems] = useState<DynamicMenuItem[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const hasLoadedOnce = useRef(false);
 
   const isSuperAdmin = profile?.rol_nombre === 'Super Administrador';
   const isProfileStillLoading = !!user && !profile && !isAuthLoading;
   const userEmail = profile?.email;
 
   const fetchDynamicMenus = useCallback(async () => {
     if (!profile?.rol_id) return;
 
     try {
       if (!hasLoadedOnce.current) {
         setIsLoading(true);
       }
 
       // Obtener permiso 'leer'
       const { data: permisoData } = await supabase
         .from('permisos')
         .select('id')
         .eq('nombre', 'leer')
         .single();
 
       if (!permisoData) {
         setMenuItems([]);
         return;
       }
 
       let allowedSubmenuIds: number[] = [];
 
       if (!isSuperAdmin) {
         // Obtener submenus permitidos para este rol
         const { data: permisosData, error: permisosError } = await supabase
           .from('submenus_permisos')
           .select('submenu_id')
           .eq('rol_id', profile.rol_id)
           .eq('permiso_id', permisoData.id)
           .eq('activo', true);
 
         if (permisosError) {
           console.error('Error fetching permissions:', permisosError);
           setMenuItems([]);
           return;
         }
 
         allowedSubmenuIds = permisosData?.map(p => p.submenu_id) || [];
       }
 
        // Obtener todos los submenus activos con su menu padre
        const { data: submenusData, error: submenusError } = await supabase
          .from('submenus')
          .select(`
            id,
            nombre,
            vista_front_end,
            menu_id,
            orden,
            solo_usuarioa,
            menus!inner (
              id,
              nombre
            )
          `)
          .eq('activo', true)
          .order('orden');

    // Obtener menus activos con campo orden
    const { data: menusData } = await supabase
      .from('menus')
      .select('id, nombre, orden, activo')
      .eq('activo', true);

    // Crear mapa de orden de menus y set de menus activos
    const menuOrdenMap = new Map<number, number>();
    const activeMenuIds = new Set<number>();
    menusData?.forEach(m => {
      menuOrdenMap.set(m.id, m.orden ?? 100);
      activeMenuIds.add(m.id);
    });
 
       if (submenusError) {
         console.error('Error fetching submenus:', submenusError);
         setMenuItems([]);
         return;
       }
 
          // Filtrar submenus por permisos
          const filteredSubmenus = (submenusData as unknown as RawSubmenu[])?.filter(submenu => {
            // Solo incluir submenus de menus activos
            if (!activeMenuIds.has(submenu.menu_id)) {
              return false;
            }
            
            // Filtrar submenus con solo_usuarioa=true: solo jorge.mendoza puede verlos
            if (submenu.solo_usuarioa && userEmail !== USUARIO_A_EMAIL) {
              return false;
            }
            
            // Super Admin ve todo (excepto los ya filtrados por solo_usuarioA)
            if (isSuperAdmin) {
              return true;
            }

            // Para otros roles, verificar si tienen permiso
            return allowedSubmenuIds.includes(submenu.id);
          }) || [];
 
       // Agrupar por menu
       const menuMap = new Map<number, { menuNombre: string; children: DynamicMenuChild[] }>();
 
       filteredSubmenus.forEach(submenu => {
         if (!submenu.vista_front_end) return; // Skip submenus sin ruta
 
         const menuId = submenu.menu_id;
         const menuNombre = submenu.menus?.nombre || 'Sin nombre';
 
         if (!menuMap.has(menuId)) {
           menuMap.set(menuId, { menuNombre, children: [] });
         }
 
         const icon = iconMapByPath[submenu.vista_front_end] || FileText;
 
         menuMap.get(menuId)!.children.push({
           title: submenu.nombre,
           href: submenu.vista_front_end,
           icon,
           submenuId: submenu.id,
         });
       });
 
       // Convertir a array de DynamicMenuItem
       const items: DynamicMenuItem[] = [];
 
    // Orden de menus según el campo 'orden' de la tabla menus
    const sortedMenuIds = Array.from(menuMap.keys()).sort((a, b) => {
      const ordenA = menuOrdenMap.get(a) ?? 100;
      const ordenB = menuOrdenMap.get(b) ?? 100;
      return ordenA - ordenB;
    });
 
       sortedMenuIds.forEach(menuId => {
         const menuData = menuMap.get(menuId)!;
         const menuIcon = iconMapByMenuId[menuId] || Settings;
 
         // Dashboard es especial - es un menu sin hijos que lleva directo a /admin
         if (menuId === DASHBOARD_MENU_ID && menuData.children.length === 1) {
           items.push({
             title: menuData.children[0].title,
             href: menuData.children[0].href,
             icon: menuData.children[0].icon,
             menuId,
           });
         } else {
           items.push({
             title: menuData.menuNombre,
             icon: menuIcon,
             menuId,
             children: menuData.children,
           });
         }
       });
 
       setMenuItems(items);
       hasLoadedOnce.current = true;
     } catch (err) {
       console.error('Error in fetchDynamicMenus:', err);
       if (!hasLoadedOnce.current) {
         setMenuItems([]);
       }
     } finally {
       setIsLoading(false);
     }
   }, [profile?.rol_id, isSuperAdmin, userEmail]);
 
   useEffect(() => {
     if (isAuthLoading) return;
     if (user && !profile) return;
 
     if (!profile?.rol_id) {
       setIsLoading(false);
       return;
     }
 
     fetchDynamicMenus();
   }, [profile?.rol_id, isAuthLoading, user, profile, permissionVersion, fetchDynamicMenus]);
 
   const isLoadingMenus = isAuthLoading || isProfileStillLoading || isLoading;
 
   return {
     menuItems,
     isLoading: isLoadingMenus,
     isSuperAdmin,
   };
 }