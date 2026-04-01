

# Correcciones al evento de Google Calendar

## Problemas identificados

1. **Nombre del remitente**: "Keity Galindo" aparece como organizador/remitente porque el calendario es de ella y Google Calendar siempre muestra al dueño del calendario como organizador. No se puede cambiar el "From" de la invitación, pero sí podemos usar `organizer.displayName` en el evento para intentar mostrar otro nombre, y configurar `guestsCanSeeOtherGuests: false` para ocultar invitados.

2. **Nombre del agente incorrecto**: El campo "Agente" muestra el nombre del prospecto porque el código usa `id_persona` (que es el prospecto) para buscar el nombre del agente. Debe usar `id_agente` para obtener el nombre real del agente.

3. **Invitados visibles**: Google Calendar permite la propiedad `guestsCanSeeOtherGuests: false` para que los invitados no vean a los demás.

## Cambios en `supabase/functions/agendar-capacitacion/index.ts`

### 1. Corregir resolución del nombre del agente
- Actualmente (línea ~1096): busca `id_persona` para obtener `agentName` → esto trae al prospecto.
- Corrección: cuando existe `id_agente`, usar ese ID para obtener el nombre del agente. Usar `id_persona` solo como fallback para citas de capacitación (donde no hay prospecto).

### 2. Cambiar etiquetas en la descripción
- `--- Prospecto ---` → `--- Invitado ---`
- `--- Agente ---` → `--- Atiende ---`

### 3. Ocultar invitados entre sí
- Agregar `guestsCanSeeOtherGuests: false` al objeto del evento en `createCalendarEvent`. Esto hará que el prospecto no vea a los enterados ni al organizador en la lista de invitados.

### 4. Intentar ocultar al organizador
- Agregar `organizer: { displayName: "Cita Sozu" }` al evento (o el nombre del proyecto) para que en lugar de "Keity Galindo" aparezca un nombre genérico.
- **Nota importante**: Google Calendar tiene limitaciones — con Service Account + DWD, el organizador siempre será el dueño del calendario. El `displayName` del organizador podría o no ser respetado por Google. Si no funciona, la alternativa sería crear un calendario dedicado con nombre "Citas Sozu" para que el organizador se muestre así.

## Detalle técnico

```text
Antes (descripción):
  --- Prospecto ---
  • Prospecto de jorge test (prospecto@email.com)
  --- Agente ---
  • Prospecto de jorge test (jorge.test.inmo@yopmail.com)  ← BUG

Después (descripción):
  --- Invitado ---
  • Prospecto de jorge test (prospecto@email.com)
  --- Atiende ---
  • Jorge Test Inmobiliario (jorge.test.inmo@yopmail.com)  ← nombre correcto

Evento Google Calendar:
  guestsCanSeeOtherGuests: false  ← oculta invitados entre sí
```

