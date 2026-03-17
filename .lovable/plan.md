## Plan completado: Portal del Cliente

Nuevo módulo "Portal del Cliente" implementado con 3 submenús (Inicio, Propiedades, Perfil) siguiendo el diseño del Portal Inmobiliaria.

### Cambios realizados

| Área | Detalle |
|------|---------|
| **BD** | Menu 18 "Portal del Cliente" + 3 submenus + permisos leer para Super Admin |
| **Layout** | `PortalClienteLayout.tsx` — sidebar desktop + bottom nav mobile, mismo diseño que Portal Inmobiliaria |
| **Inicio** | Saludo, actividad, accesos rápidos, resumen financiero, pendientes, tarjetas de propiedades (mock) |
| **Propiedades** | Lista de tarjetas con hero, barra de progreso, datos financieros (mock) |
| **Perfil** | Hero identidad, info personal, documentación, fiscal, bancos, seguridad (mock) |
| **Routing** | App.tsx, AdminLayout.tsx, validRoutes.ts, useDynamicMenus.ts actualizados |

### Pendiente (follow-up)
- Conectar datos reales desde Supabase (cuentas_cobranza, propiedades, pagos)
- Rol "Cliente" con permisos específicos
