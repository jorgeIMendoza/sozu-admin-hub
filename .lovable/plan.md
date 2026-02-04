

# Plan: Nuevo Submenu "Pago Proveedores" en Finanzas

## Descripcion General
Agregar un nuevo submenu llamado "Pago Proveedores" dentro del menu Finanzas que muestre un listado de pagos realizados a proveedores (entidades con `id_tipo_entidad = 8`), cruzando las cuentas STP de comisiones con los registros de `pagos_stp_raw`.

---

## Seccion Tecnica

### 1. Base de Datos - Crear Submenu y Permisos

**Insertar submenu en la tabla `submenus`:**
```sql
INSERT INTO submenus (id, nombre, menu_id) 
VALUES (50, 'Pago Proveedores', 6);
```
- El menu_id `6` corresponde a "Finanzas"
- El siguiente ID disponible es `50`

**Insertar permisos (solo Leer y Exportar) para los roles indicados:**

| Rol ID | Rol Nombre |
|--------|-----------|
| 1 | Super Administrador |
| 21 | Administrador de finanzas |
| 12 | Administrador de cobranza |

```sql
-- Permiso Leer (permiso_id = 1)
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
VALUES 
  (50, 1, 1, true),   -- Super Admin
  (50, 1, 21, true),  -- Admin Finanzas
  (50, 1, 12, true);  -- Admin Cobranza

-- Permiso Exportar (permiso_id = 6)
INSERT INTO submenus_permisos (submenu_id, permiso_id, rol_id, activo)
VALUES 
  (50, 6, 1, true),   -- Super Admin
  (50, 6, 21, true),  -- Admin Finanzas
  (50, 6, 12, true);  -- Admin Cobranza
```

---

### 2. Archivo `src/components/admin/AdminSidebar.tsx`

Agregar el nuevo item al menu de Finanzas (linea 139):

```typescript
{
  title: "Finanzas",
  icon: CreditCard,
  children: [
    { title: "Cuentas de cobranza", href: "/admin/cuentas-cobranza", icon: Receipt },
    { title: "Comisiones", href: "/admin/comisiones", icon: Banknote },
    { title: "Aprobación de Comisiones", href: "/admin/aprobacion-comisiones", icon: BadgeDollarSign },
    { title: "Comisiones externas", href: "/admin/comisiones-externas", icon: Briefcase },
    { title: "Pagar comisiones", href: "/admin/pagar-comisiones", icon: CreditCard },
    { title: "Pago Proveedores", href: "/admin/pago-proveedores", icon: Banknote }, // NUEVO
  ]
}
```

---

### 3. Archivo `src/App.tsx`

Agregar lazy import y ruta:

```typescript
// Nuevo import
const PagoProveedores = lazy(() => import("./pages/admin/PagoProveedores"));

// Nueva ruta (despues de pagar-comisiones)
<Route path="pago-proveedores" element={<PagoProveedores />} />
```

---

### 4. Nuevo Archivo `src/pages/admin/PagoProveedores.tsx`

Crear la pagina con las siguientes caracteristicas:

**Logica de Query:**
1. Primero obtener todas las `cuenta_stp_comisiones` de `entidades_relacionadas` donde `id_tipo_entidad = 8` (Proveedor)
2. Consultar `pagos_stp_raw` donde:
   - `es_pago_aplicado = true`
   - `cuenta_beneficiario` esta en la lista de cuentas de proveedores

**Campos a mostrar:**
- claverastreo
- monto
- cuenta_beneficiario
- nombre_ordenante
- nombre_beneficiario
- empresa
- fecha_operacion
- concepto_pago

**Filtros:**
- Busqueda por texto (clave rastreo, nombre beneficiario, concepto)
- Fecha desde / Fecha hasta
- Nombre beneficiario (select con proveedores disponibles)
- Empresa

**Paginacion:**
- 50 registros por pagina
- Sin limite de 1000 (usar `count: 'exact'` y `range()` de Supabase)

**Exportar a Excel:**
- Usar hook `useExportToExcel`
- Exportar todos los registros filtrados (no solo la pagina actual)

**Estructura del componente:**
```typescript
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X, RefreshCw, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useExportToExcel } from '@/hooks/useExportToExcel';

const PAGE_SIZE = 50;

interface PagoProveedor {
  id: number;
  claverastreo: string;
  monto: number;
  cuenta_beneficiario: string;
  nombre_ordenante: string | null;
  nombre_beneficiario: string | null;
  empresa: string | null;
  fecha_operacion: string | null;
  concepto_pago: string | null;
}

export default function PagoProveedores() {
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    fechaDesde: '',
    fechaHasta: '',
    empresa: 'all',
    beneficiario: 'all'
  });
  
  const { exportToExcel, isExporting } = useExportToExcel();

  // Query para obtener CLABEs de proveedores
  const { data: proveedorCuentas = [] } = useQuery({
    queryKey: ['proveedor-cuentas-stp'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('cuenta_stp_comisiones, personas!entidades_relacionadas_id_persona_fkey(nombre_legal)')
        .eq('id_tipo_entidad', 8)
        .not('cuenta_stp_comisiones', 'is', null);
      if (error) throw error;
      return data || [];
    }
  });

  // Query principal con paginacion (sin limite de 1000)
  const { data: pagosData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pagos-proveedores', filters, currentPage, proveedorCuentas],
    queryFn: async () => {
      if (proveedorCuentas.length === 0) return { data: [], count: 0 };
      
      const cuentas = proveedorCuentas.map(p => p.cuenta_stp_comisiones);
      
      // Obtener count total
      let countQuery = supabase
        .from('pagos_stp_raw')
        .select('*', { count: 'exact', head: true })
        .eq('es_pago_aplicado', true)
        .in('cuenta_beneficiario', cuentas);
      
      // Aplicar filtros al count
      if (filters.fechaDesde) {
        countQuery = countQuery.gte('fecha_operacion', filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        countQuery = countQuery.lte('fecha_operacion', filters.fechaHasta);
      }
      if (filters.empresa !== 'all') {
        countQuery = countQuery.eq('empresa', filters.empresa);
      }
      if (filters.beneficiario !== 'all') {
        countQuery = countQuery.eq('cuenta_beneficiario', filters.beneficiario);
      }
      if (filters.search) {
        countQuery = countQuery.or(`claverastreo.ilike.%${filters.search}%,nombre_beneficiario.ilike.%${filters.search}%,concepto_pago.ilike.%${filters.search}%`);
      }
      
      const { count } = await countQuery;
      
      // Obtener datos paginados
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      
      let dataQuery = supabase
        .from('pagos_stp_raw')
        .select('id, claverastreo, monto, cuenta_beneficiario, nombre_ordenante, nombre_beneficiario, empresa, fecha_operacion, concepto_pago')
        .eq('es_pago_aplicado', true)
        .in('cuenta_beneficiario', cuentas)
        .order('fecha_operacion', { ascending: false })
        .range(from, to);
      
      // Aplicar mismos filtros
      if (filters.fechaDesde) {
        dataQuery = dataQuery.gte('fecha_operacion', filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        dataQuery = dataQuery.lte('fecha_operacion', filters.fechaHasta);
      }
      if (filters.empresa !== 'all') {
        dataQuery = dataQuery.eq('empresa', filters.empresa);
      }
      if (filters.beneficiario !== 'all') {
        dataQuery = dataQuery.eq('cuenta_beneficiario', filters.beneficiario);
      }
      if (filters.search) {
        dataQuery = dataQuery.or(`claverastreo.ilike.%${filters.search}%,nombre_beneficiario.ilike.%${filters.search}%,concepto_pago.ilike.%${filters.search}%`);
      }
      
      const { data, error } = await dataQuery;
      if (error) throw error;
      
      return { data: data as PagoProveedor[], count: count || 0 };
    },
    enabled: proveedorCuentas.length > 0
  });

  // Funcion para exportar (sin limite - obtiene TODOS los registros)
  const handleExport = async () => {
    if (proveedorCuentas.length === 0) return;
    
    const cuentas = proveedorCuentas.map(p => p.cuenta_stp_comisiones);
    
    // Obtener TODOS los registros filtrados sin paginacion
    let query = supabase
      .from('pagos_stp_raw')
      .select('claverastreo, monto, cuenta_beneficiario, nombre_ordenante, nombre_beneficiario, empresa, fecha_operacion, concepto_pago')
      .eq('es_pago_aplicado', true)
      .in('cuenta_beneficiario', cuentas)
      .order('fecha_operacion', { ascending: false });
    
    // Aplicar filtros
    if (filters.fechaDesde) query = query.gte('fecha_operacion', filters.fechaDesde);
    if (filters.fechaHasta) query = query.lte('fecha_operacion', filters.fechaHasta);
    if (filters.empresa !== 'all') query = query.eq('empresa', filters.empresa);
    if (filters.beneficiario !== 'all') query = query.eq('cuenta_beneficiario', filters.beneficiario);
    if (filters.search) query = query.or(`claverastreo.ilike.%${filters.search}%,nombre_beneficiario.ilike.%${filters.search}%,concepto_pago.ilike.%${filters.search}%`);
    
    const { data, error } = await query;
    if (error) return;
    
    await exportToExcel({
      data: data as Record<string, unknown>[],
      filename: 'pagos_proveedores',
      columnas_visibles: [
        { key: 'claverastreo', label: 'Clave Rastreo' },
        { key: 'monto', label: 'Monto' },
        { key: 'cuenta_beneficiario', label: 'Cuenta Beneficiario' },
        { key: 'nombre_ordenante', label: 'Nombre Ordenante' },
        { key: 'nombre_beneficiario', label: 'Nombre Beneficiario' },
        { key: 'empresa', label: 'Empresa' },
        { key: 'fecha_operacion', label: 'Fecha Operacion' },
        { key: 'concepto_pago', label: 'Concepto' },
      ]
    });
  };

  // UI con tabla, filtros, paginacion...
}
```

---

## Resumen de Cambios

| Tipo | Archivo/Ubicacion | Descripcion |
|------|-------------------|-------------|
| SQL | Base de datos | Insertar submenu id=50 "Pago Proveedores" en menu Finanzas |
| SQL | Base de datos | Insertar permisos leer (1) y exportar (6) para roles 1, 21, 12 |
| Modificar | `src/components/admin/AdminSidebar.tsx` | Agregar item "Pago Proveedores" al menu Finanzas |
| Modificar | `src/App.tsx` | Agregar lazy import y ruta `/admin/pago-proveedores` |
| Crear | `src/pages/admin/PagoProveedores.tsx` | Nueva pagina con listado, filtros, paginacion 50/pagina, exportar |

---

## Notas Adicionales

- La paginacion usa `range(from, to)` de Supabase que no tiene el limite de 1000 registros
- El export obtiene todos los registros sin paginacion para exportar el dataset completo
- Solo se muestran pagos donde `es_pago_aplicado = true`
- Los proveedores se identifican por `id_tipo_entidad = 8` en `entidades_relacionadas`

