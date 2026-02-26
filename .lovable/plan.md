

# Fix: Mediciones CTA del Portal Agente muestra ceros

## Problema raiz

Las paginas del Portal Agente llaman `registrarVista()` (que escribe en `logs_actividad`) pero **NO** llaman `track({ elementId: 'page_view' })` (que escribe en `cta_events`). La pagina de Mediciones CTA lee exclusivamente de `cta_events`, por lo que las visitas a paginas del portal agente nunca aparecen.

Las paginas de inmobiliaria SI tienen ambas llamadas, por eso sus metricas funcionan correctamente.

## Solucion

Agregar una llamada `track()` con `elementId: 'page_view'` en el `useEffect` de carga de cada pagina del portal agente, junto al `registrarVista()` existente.

## Cambios por archivo

### 1. `AgentInicio.tsx` (linea ~38-40)
Agregar `track({ page: 'agent_inicio', elementId: 'page_view', elementType: 'page' })` dentro del `useEffect` existente.

### 2. `AgentInventario.tsx`
Agregar `track({ page: 'agent_inventario', elementId: 'page_view', elementType: 'page' })` en el `useEffect` de carga.

### 3. `AgentProyectoDetalle.tsx`
Agregar `track({ page: 'agent_detalle_desarrollo', elementId: 'page_view', elementType: 'page' })` en el `useEffect` de carga.

### 4. `AgentUnidadesProyecto.tsx`
Agregar `track({ page: 'agent_unidades', elementId: 'page_view', elementType: 'page' })` en el `useEffect` de carga.

### 5. `AgentPipeline.tsx`
Agregar `track({ page: 'agent_pipeline', elementId: 'page_view', elementType: 'page' })` en el `useEffect` de carga.

### 6. `AgentComisiones.tsx`
Agregar `track({ page: 'agent_comisiones', elementId: 'page_view', elementType: 'page' })` en el `useEffect` de carga.

### 7. `AgentPerfil.tsx`
Agregar `track({ page: 'agent_perfil', elementId: 'page_view', elementType: 'page' })` en el `useEffect` de carga.

## Detalle tecnico

Cada archivo ya importa `useCtaTracker` y tiene `const { track } = useCtaTracker()`. Solo falta agregar la llamada `track()` en el `useEffect` de carga de pagina. Ejemplo del patron:

```typescript
useEffect(() => {
  registrarVista('/admin/agent/inicio');
  track({ page: 'agent_inicio', elementId: 'page_view', elementType: 'page' });
}, []);
```

Esto es exactamente el mismo patron que usan las paginas de inmobiliaria que SI registran datos correctamente.

## Resultado esperado

- Las "Visitas por Seccion" en Mediciones CTA mostraran conteos reales
- Los clicks en botones ya estan instrumentados y se registraran cuando el usuario interactue (eso ya funciona, pero sin page views el dashboard se veia completamente vacio)
- No se requieren cambios en base de datos ni en MedicionesCTA.tsx

