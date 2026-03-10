

# Plan: Portal del Cliente

## Summary
Create a new "Portal del Cliente" module with 3 submenus (Inicio, Propiedades, Perfil) following the same design system as the Portal Inmobiliaria. The portal is mobile-first, uses the Sozu green palette (#239E6C), and replicates the UI structure from the reference project [SOZU cliente DISEÑO](/projects/4f38b850-7416-4cf4-b2fc-75ddcc2c96ea).

## Reference Design Analysis
The reference project uses a single-page app with tab-based navigation (BottomNav) and the following sections:
- **Inicio**: Welcome greeting, activity feed (pending payments), quick actions grid, compact financial summary, pendings by property, property cards
- **Propiedades**: List of properties with cards (hero image, progress bar, financial data)
- **Perfil**: Identity hero, personal info, documents, fiscal data, bank accounts, security, logout

All data is currently mock data in the reference. In our implementation, data will come from Supabase (the client's cuentas_cobranza, propiedades, pagos, etc.) but we'll start with the layout and mock data, then wire real data in a follow-up.

## Database Changes

**1. Insert new menu (ID 18) "Portal del Cliente"**
```sql
INSERT INTO menus (id, nombre, orden, activo) VALUES (18, 'Portal del Cliente', 18, true);
```

**2. Insert 3 submenus**
```sql
INSERT INTO submenus (nombre, vista_front_end, menu_id, orden, activo) VALUES
  ('Inicio', '/admin/portal-cliente/inicio', 18, 1, true),
  ('Propiedades', '/admin/portal-cliente/propiedades', 18, 2, true),
  ('Perfil', '/admin/portal-cliente/perfil', 18, 3, true);
```

**3. Grant read permissions to Super Admin (rol_id=1)**
```sql
-- Get permiso 'leer' id, then insert submenus_permisos for each new submenu
INSERT INTO submenus_permisos (submenu_id, rol_id, permiso_id, activo)
SELECT s.id, 1, p.id, true
FROM submenus s, permisos p
WHERE s.menu_id = 18 AND p.nombre = 'leer';
```

## Code Changes

### 1. Layout: `src/components/admin/portal-cliente/PortalClienteLayout.tsx`
- Clone the `PortalInmobiliariaLayout` pattern
- Same sidebar structure (desktop) with "S" logo, "Panel Cliente" subtitle
- Same mobile bottom nav (3 tabs: Inicio, Propiedades, Perfil + Salir)
- Same topbar with breadcrumbs
- Scoped CSS class: `inmob-portal` (reuse the same design system, no new CSS needed)
- Show "Menú principal" back button for non-Cliente roles
- Fetch tabs from DB (menu_id=18) with fallback

### 2. Pages (mobile-first, mock data initially)

**`src/pages/admin/portal-cliente/ClienteInicio.tsx`**
- Welcome section with greeting + client name
- Activity section (pending payments/actions)
- Quick actions grid (Estado de cuenta, Historial de pagos)
- Compact financial summary (total invested, paid, pending, progress)
- Pendings by property list
- Property cards at bottom

**`src/pages/admin/portal-cliente/ClientePropiedades.tsx`**
- List of property cards with hero images, status badges, financial progress
- Click opens property detail (future)

**`src/pages/admin/portal-cliente/ClientePerfil.tsx`**
- Identity hero with avatar and verification status
- Personal info section (RFC, CURP, email, phone)
- Documentation section with status indicators
- Fiscal info section
- Bank accounts section
- Security section
- Logout button

### 3. Shared Components: `src/components/admin/portal-cliente/`
- `ClientePropertyCard.tsx` - Property card with hero, progress bar, financials
- `ClienteActivitySection.tsx` - Pending items feed
- `ClienteQuickActions.tsx` - Quick action grid
- `ClienteFinancialSummary.tsx` - Compact financial summary
- `ClienteWelcomeSection.tsx` - Greeting + stats

### 4. Routing Updates

**`src/App.tsx`** - Add routes:
```
portal-cliente/inicio → ClienteInicio
portal-cliente/propiedades → ClientePropiedades
portal-cliente/perfil → ClientePerfil
```

**`src/components/admin/AdminLayout.tsx`** - Add layout detection:
```typescript
if (location.pathname.startsWith("/admin/portal-cliente")) {
  return <PortalClienteLayout />;
}
```

### 5. Permission/Navigation Updates

**`src/utils/validRoutes.ts`** - Add 3 new routes

**`src/hooks/useDynamicMenus.ts`** - Add icon mappings:
```typescript
iconMapByPath: {
  '/admin/portal-cliente/inicio': LayoutDashboard,
  '/admin/portal-cliente/propiedades': Building2,
  '/admin/portal-cliente/perfil': User,
}
iconMapByMenuId: { 18: User }
```

**`src/components/auth/PermissionRoute.tsx`** - Allow portal-cliente routes (similar to agent portal bypass, or let them go through normal permission flow)

### 6. CSS
No new CSS needed -- reuse `.inmob-portal` class which already defines the Sozu green design system. The layout component will wrap content with this class.

## Scope
- All pages start with **mock data** matching the reference design
- Real Supabase data integration will be a follow-up task
- Mobile-first: `max-w-lg mx-auto` container for mobile views, sidebar for desktop
- Exact same color palette, typography, border radius, and component patterns as Portal Inmobiliaria

