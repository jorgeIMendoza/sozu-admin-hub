
# Plan: Corrección de Indicadores para Cuentas con Precio $0 + Filtros Avanzados en Logs de Actividad

## Parte 1: Diagnóstico - Oferta 1717

### Hallazgos
La oferta 1717 **NO creó cuenta de cobranza** a pesar de que el log muestra "exito". Esto indica que:
1. El frontend llamó al webhook de n8n correctamente
2. n8n retornó HTTP 200 ("exito")
3. Pero la inserción en la base de datos no ocurrió

### Causa Probable
El webhook de n8n probablemente tiene una validación que aborta silenciosamente cuando ciertos datos faltan o son inválidos, pero retorna HTTP 200. Esto NO es un bug del frontend.

### Solución
La cuenta debe crearse manualmente o investigar los logs de n8n para entender por qué falló la inserción.

---

## Parte 2: Corrección de Indicadores para Cuentas con Precio $0

### Problema Actual
Las cuentas con `precio_final = 0`:
1. Muestran el indicador azul "Plan de pagos no seleccionado" aunque no hay nada que pagar
2. No muestran el checkmark verde de "completada" aunque el restante es $0

### Cambios en `src/pages/admin/Pagos.tsx`

#### Cambio 1: Ocultar indicador azul si precio_final = 0
Modificar la condición en línea ~1485:

**Antes:**
```tsx
{!cuenta.tiene_acuerdos ? <TooltipProvider>...
```

**Después:**
```tsx
{!cuenta.tiene_acuerdos && cuenta.precio_final > 0 ? <TooltipProvider>...
```

#### Cambio 2: Mostrar checkmark verde para cuentas con precio $0 y restante = $0
Modificar la condición en línea ~1686:

**Antes:**
```tsx
{cuenta.restante <= 0.01 && !cuenta.motivo_cancelacion && cuenta.tiene_acuerdos && !cuenta.tiene_multas_pendientes && cuenta.precio_final > 0 && (
```

**Después:**
```tsx
{cuenta.restante <= 0.01 && !cuenta.motivo_cancelacion && !cuenta.tiene_multas_pendientes && (cuenta.tiene_acuerdos || cuenta.precio_final === 0) && (
```

#### Cambio 3: Ocultar indicador ámbar si precio_final = 0
Modificar la condición en línea ~1497:

**Antes:**
```tsx
: !cuenta.apartado_pagado && cuenta.restante > 0.01 && cuenta.id_estatus_disponibilidad !== 10 ?
```

**Después:**
```tsx
: !cuenta.apartado_pagado && cuenta.restante > 0.01 && cuenta.id_estatus_disponibilidad !== 10 && cuenta.precio_final > 0 ?
```

---

## Parte 3: Filtros Avanzados en Logs de Actividad

### Nuevos Filtros a Implementar

| Filtro | Tipo | Descripción |
|--------|------|-------------|
| Usuario | Multi-select con búsqueda | Seleccionar uno o varios usuarios que generaron actividad |
| Entidad/Menú (Workflow) | Multi-select con búsqueda | Filtrar por workflows específicos |
| Estatus | Selector simple | "Todos", "Éxito", "Error" |

### Cambios en `src/pages/admin/LogsActividad.tsx`

#### Nuevos Estados
```typescript
const [selectedUsuarios, setSelectedUsuarios] = useState<string[]>([]);
const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
const [selectedEstatus, setSelectedEstatus] = useState<string>('all');
const [availableUsuarios, setAvailableUsuarios] = useState<string[]>([]);
const [availableWorkflows, setAvailableWorkflows] = useState<string[]>([]);
```

#### Nueva Función para Cargar Opciones
```typescript
const fetchFilterOptions = async () => {
  // Obtener usuarios únicos
  const { data: usuarios } = await supabase
    .from('logs_actividad')
    .select('usuario_id')
    .order('usuario_id');
  setAvailableUsuarios([...new Set(usuarios?.map(u => u.usuario_id) || [])]);

  // Obtener workflows únicos
  const { data: workflows } = await supabase
    .from('logs_actividad')
    .select('workflow')
    .not('workflow', 'is', null)
    .order('workflow');
  setAvailableWorkflows([...new Set(workflows?.map(w => w.workflow).filter(Boolean) || [])]);
};
```

#### Modificar Query de Logs
```typescript
// Agregar filtros a countQuery y query principal
if (selectedUsuarios.length > 0) {
  query = query.in('usuario_id', selectedUsuarios);
}
if (selectedWorkflows.length > 0) {
  query = query.in('workflow', selectedWorkflows);
}
if (selectedEstatus !== 'all') {
  query = query.eq('estatus_ejecucion', selectedEstatus);
}
```

### Componente MultiSelect
Crear un componente reutilizable que:
- Muestre un popover con barra de búsqueda
- Permita seleccionar múltiples opciones con checkboxes
- Muestre badges con los items seleccionados
- Tenga botón para limpiar selección

### Diseño UI Propuesto

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Filtros existentes:                                                       │
│ [🔍 Buscar usuario, workflow...] [Tipo actividad ▼] [Ambiente ▼]         │
│                                                                          │
│ Nuevos filtros:                                                          │
│ [👤 Usuario (0) ▼]  [📋 Workflow (0) ▼]  [✓ Estatus ▼]                   │
│                                                                          │
│ Filtros de fecha:                                                        │
│ 📅 Fecha: [Desde] [Hasta] [Limpiar fechas]                               │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/admin/Pagos.tsx` | Ajustar condiciones de indicadores para cuentas con precio $0 |
| `src/pages/admin/LogsActividad.tsx` | Agregar filtros multi-select para Usuario, Workflow y Estatus |
| `src/components/ui/multi-select-filter.tsx` (nuevo) | Componente reutilizable de multi-select con búsqueda |

---

## Resumen de Lógica Corregida

Para cuentas con `precio_final = 0`:
- NO mostrar indicador azul "Plan de pagos no seleccionado"
- NO mostrar indicador ámbar "Pago inicial pendiente"
- SÍ mostrar checkmark verde si `restante <= 0.01` (completada)
- El texto de "Restante" ya está en verde gracias a `cuenta.restante <= 0`
