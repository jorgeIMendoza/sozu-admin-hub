

# Plan: Triggers basados en eventos para avisos automáticos

Hoy un aviso "automático" sólo se dispara por una **expresión cron** (fecha/hora fija). Vamos a ampliar el sistema para que un aviso pueda dispararse también por **eventos relativos a una fecha del negocio** (ejemplo: "5 días antes de la fecha de pago de un acuerdo de pago"), evaluado todos los días a una hora determinada.

## Concepto de "trigger por evento"

Cada aviso automático podrá usar uno de estos modos de disparo:
- **Cron clásico** (lo actual, sin cambios).
- **Evento basado en fecha**: se elige una **fuente de fecha** (ej. `acuerdos_pago.fecha_pago`), un **offset** (`-5`, `-3`, `0`, `+3` días, etc.) y la **hora del día** en la que se evalúa (ej. 10:00 AM Mexico). Se admiten **varios offsets** por aviso (-5, -3 y -1 a la vez).

Se diseña como **catálogo de fuentes** para que sea fácil agregar nuevos triggers en el futuro (vencimiento de contrato, fecha de escrituración, fin de promoción, etc.) sin tocar el cron principal.

### Fuentes de fecha disponibles en V1
- **Acuerdo de pago próximo a vencer** (`acuerdos_pago.fecha_pago`, sólo donde `activo = true` y `pago_completado = false`).
- **Acuerdo de pago vencido** (mismo campo, offsets positivos: 1, 3, 7 días después).

(El catálogo queda extensible: agregar una nueva fuente será una migración + entrada en una tabla de catálogo, no un cambio en el cron.)

## Cambios en base de datos

Tablas nuevas:

1. `aviso_triggers_fuentes` (catálogo, semilla manual)
   - `id`, `clave` (`acuerdo_pago_proximo`, `acuerdo_pago_vencido`), `nombre`, `descripcion`, `activo`.
   - Sirve para que en el futuro agreguemos fuentes sin migraciones de código en el cron.

2. `avisos_triggers_evento` (1 aviso → N configuraciones de trigger)
   - `id`, `id_aviso`, `id_fuente` (FK a `aviso_triggers_fuentes`)
   - `offsets_dias` (`int[]`, ej. `{-5,-3,-1}`)
   - `hora_envio` (`time`, ej. `10:00`, en horario Mexico UTC-6)
   - `canal` (`email` | `whatsapp` | `ambos`)
   - `filtros` (`jsonb`, opcional, ej. `{"id_concepto":[2,5]}` para limitar a parcialidades/enganches)
   - `activo`, `fecha_creacion`, `fecha_actualizacion`.

3. `avisos_envios_evento` (anti-duplicados / auditoría fina)
   - `id`, `id_aviso`, `id_trigger`, `clave_entidad` (texto, ej. `acuerdo:12345:offset:-5`), `fecha_objetivo`, `fecha_envio`, `email_destino`, `telefono_destino`, `canal`, `estado`, `error`.
   - `UNIQUE(id_trigger, clave_entidad)` → garantiza que **nunca** se envíe dos veces el mismo recordatorio al mismo destinatario para la misma fecha objetivo.

Cambio menor en `avisos`:
- Nuevo campo `modo_trigger` (`cron` | `evento`). Por compatibilidad, todos los avisos existentes quedan en `cron`.

## Cambios en Edge Functions

1. **Nueva función `evaluar-triggers-evento`** (corre dentro del cron diario existente):
   - Por cada `avisos_triggers_evento` activo, calcula la(s) `fecha_objetivo = today - offset` para cada offset.
   - Consulta la fuente (ej. `acuerdos_pago` join `cuentas_cobranza` → `ofertas` → `personas`) y obtiene los destinatarios reales (cliente titular + correos manuales del aviso).
   - Sólo dispara si `now()` (Mexico UTC-6) está dentro de la ventana de la `hora_envio` (±5 min, igual que el cron actual).
   - Inserta en `avisos_envios_evento` con `ON CONFLICT DO NOTHING` y, si la inserción es nueva, envía el mensaje vía Postmark (correo) y/o `enviar-notificacion` (WhatsApp).

2. **`ejecutar-avisos-cron` (existente)**: se le añade una llamada extra a `evaluar-triggers-evento` además de su lógica actual de cron expressions. Sigue corriendo cada minuto y los avisos por evento se evalúan sólo cuando coincide la `hora_envio`.

3. **Reutilizamos** `enviar-aviso-bulk` para el correo y `enviar-notificacion` (proxy a n8n) para WhatsApp — ya están listos y probados.

## Cambios de UI (Administración de avisos)

Editor de aviso, pestaña "Programación":
- Selector **Modo de envío**: `Manual` / `Automático por fecha y hora (cron)` / `Automático por evento`.
- Si `evento`:
  - Selector **Fuente de la fecha** (poblado desde `aviso_triggers_fuentes`).
  - Input multi-tag de **Offsets en días** (acepta negativos para "antes" y positivos para "después", ej. `-5, -3, -1`).
  - **Hora de envío** (time picker, default 10:00).
  - **Canal**: Email / WhatsApp / Ambos.
  - (Opcional) **Filtros**: ej. concepto de pago (parcialidad, enganche…) usando el catálogo `conceptos_pago`.
- Resumen en lenguaje natural: *"Se enviará por email a las 10:00 AM, 5, 3 y 1 día antes de la fecha de pago de cada acuerdo activo."*

En la tabla de avisos:
- Nueva columna **Disparador** que muestra `Cron`, `Evento: Acuerdo próximo (-5,-3,-1d @10:00)`, etc.

## Detalles técnicos relevantes

- **Zona horaria**: toda evaluación de `hora_envio` se hace en Mexico UTC-6, igual que `ejecutar-avisos-cron` hoy.
- **Idempotencia**: la `UNIQUE(id_trigger, clave_entidad)` en `avisos_envios_evento` impide reenvíos aun si el cron corre dos veces el mismo minuto o si Postmark responde lento.
- **Destinatarios**: para "Acuerdo de pago" el destinatario por defecto es el cliente titular de la `cuenta_cobranza` (`personas.email`, `personas.telefono`, `personas.clave_pais_telefono`). Si el aviso también tiene roles/correos manuales configurados, se les copia.
- **WhatsApp**: ya existe la infraestructura (`enviar-notificacion` + `EVOLUTION_WA_COBRANZA_TOKEN`). Se reutiliza tal cual.
- **Documentos adjuntos**: queda fuera de V1 explícitamente (se puede sumar después como un campo `url_adjuntos[]` en `avisos`).
- **Permisos / RLS**: las nuevas tablas de configuración usan `is_super_admin()` para escritura y lectura (mismo patrón que `avisos`).

## Flujo end-to-end

```text
cron pg (cada minuto)
   └─> ejecutar-avisos-cron
         ├─> avisos por cron expression (lógica actual)
         └─> evaluar-triggers-evento
               ├─ para cada trigger evento activo:
               │    ├─ ¿hora actual MX coincide con hora_envio? (±5 min) → sigue
               │    ├─ por cada offset → fecha_objetivo = today - offset
               │    ├─ query a la fuente (acuerdos_pago, etc.)
               │    ├─ por cada match → INSERT avisos_envios_evento (ON CONFLICT DO NOTHING)
               │    └─ si insertó → enviar email/WhatsApp y actualizar estado
```

## Orden de implementación

1. Migración: catálogo `aviso_triggers_fuentes` + `avisos_triggers_evento` + `avisos_envios_evento` + columna `modo_trigger` en `avisos`. Semillas: `acuerdo_pago_proximo`, `acuerdo_pago_vencido`.
2. Edge function `evaluar-triggers-evento` (con verificación en BD del flujo para acuerdos de pago).
3. Integrar la llamada en `ejecutar-avisos-cron`.
4. UI en `AdministrarAvisos.tsx`: nuevo modo "Evento" con offsets, hora y canal.
5. Pruebas: crear un aviso de prueba `-1` día sobre un acuerdo real, verificar log en `avisos_envios_evento` y la entrega.

<lov-actions>
<lov-suggestion message="Apruebo el plan, procede a implementarlo y al terminar verifica end-to-end con un acuerdo real que el envío se registre y no se duplique.">Aprobar e implementar</lov-suggestion>
<lov-suggestion message="Antes de implementar, agrega también soporte para adjuntar un PDF (ej. estado de cuenta) en el aviso por evento.">Incluir adjuntos en V1</lov-suggestion>
<lov-suggestion message="Agrega una segunda fuente de fecha al catálogo: fecha de escrituración de la cuenta de cobranza, con offsets en días.">Sumar trigger de escrituración</lov-suggestion>
<lov-suggestion message="Agrega una vista de bitácora en el portal que muestre los envíos por evento (avisos_envios_evento) con filtros por aviso, canal y estado.">Bitácora de envíos por evento</lov-suggestion>
</lov-actions>
