

## Plan: Rediseño de "Todas las Citas" — Estilo Google Calendar mejorado

### Problema actual
Cuando un slot tiene múltiples citas (ej. slots grupales o varias configuraciones en la misma hora), las tarjetas se comprimen horizontalmente y se vuelven ilegibles. No hay forma clara de ver cuántas citas hay ni expandirlas.

### Cambios en `TodasLasCitas.tsx`

#### 1. Slots con múltiples citas: indicador apilado + expandible
- Cuando hay >1 cita en un slot, en lugar de dividir el ancho en columnas diminutas, mostrar una **tarjeta apilada** con:
  - Indicador visual de cantidad (ej. "3 citas")
  - Las primeras 1-2 citas visibles como mini-chips
  - Al hacer click se expande un **popover/dropdown** mostrando la lista completa de citas en ese slot
- Para slots individuales (1 cita), mantener la tarjeta actual

#### 2. Aumentar altura de slots y mejorar densidad
- Aumentar `slotHeight` de 72px a 80px para dar más espacio visual
- Mejorar tipografía y padding de `SlotCard` para mejor legibilidad
- Agregar micro-avatar/iniciales del invitado en las tarjetas agendadas

#### 3. Colores más claros por estatus
- **Disponible (sin agendar)**: fondo gris claro, borde punteado (ya existe)
- **Agendada**: fondo azul suave con borde sólido azul
- **Confirmada**: fondo verde suave con borde sólido verde
- **Pendiente**: fondo amarillo suave con borde sólido amarillo
- **Grupal con invitados**: borde azul con barra de progreso visual (ocupación)

#### 4. Popover de detalle para slots apilados
- Nuevo componente `SlotPopover` que se muestra al hacer click en un slot con múltiples citas
- Lista vertical de las citas con nombre, estatus (badge), y hora
- Cada cita clickeable para abrir el `SlotDetailDialog` existente con el detalle completo

#### 5. Barra de progreso en slots grupales
- Para configuraciones con `max_invitados > 1`, mostrar una mini barra de progreso dentro de la tarjeta indicando `agendados/máximo`
- Color de la barra: azul parcial, verde cuando está lleno

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/admin/comunicacion/TodasLasCitas.tsx` | Refactorizar `SlotCard`, agregar `SlotPopover`, ajustar lógica de renderizado de items apilados, mejorar colores y alturas |

### Sin cambios en
- Lógica de datos/queries (se mantiene igual)
- `SlotDetailDialog` (se reutiliza tal cual)
- Backend / BD

