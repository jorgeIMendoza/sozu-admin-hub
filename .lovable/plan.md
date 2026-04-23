
Objetivo: hacer que el aviso de “Recordatorio de pago” genere un registro nuevo en el log cada vez que corre el proceso, aunque el envío real quede omitido por idempotencia, para que la vista de Ejecuciones refleje cada corrida y no parezca que “se reemplaza” por la última.

Diagnóstico confirmado
- La vista `Ejecuciones.tsx` hoy no muestra una bitácora real de corridas de avisos por evento; reconstruye filas “sintéticas” agrupando `avisos_envios_evento` por minuto.
- En `evaluar-triggers-evento`, la tabla `avisos_envios_evento` tiene un `UNIQUE (id_trigger, clave_entidad)`.
- Para el aviso de recordatorio, `clave_entidad` es estable:
  - cliente real: `acuerdo:{id}:offset:{offset}`
  - modo manual consolidado: `trigger:{id}:offset:{offset}:fecha:{fechaObjetivo}:manual:{email}`
- Resultado:
  - la primera corrida inserta el registro;
  - las siguientes corridas dentro del mismo escenario ya no insertan nada y solo loguean “ya enviado, omitiendo”;
  - como la UI depende de nuevos inserts en `avisos_envios_evento`, no aparece una nueva fila por ejecución.

Qué se va a construir
1. Registrar cada corrida de aviso por evento en `avisos_ejecuciones`
- Crear un registro explícito al inicio de cada ejecución de trigger/offset en `avisos_ejecuciones`.
- Guardar:
  - `id_aviso`
  - `tipo_trigger = 'evento'`
  - `fecha_ejecucion`
  - totales
  - estado final
  - detalle del resultado
- Ese registro debe existir aunque:
  - no haya acuerdos,
  - esté fuera de ventana,
  - ya se hubiera enviado antes,
  - todos los destinatarios sean omitidos por duplicado.

2. Mantener `avisos_envios_evento` solo para auditoría de destinatarios/envíos
- Conservar la protección anti-duplicado actual para no reenviar el mismo aviso varias veces al mismo destinatario.
- No usar esa tabla como fuente principal de “corridas” en la pantalla de Ejecuciones.
- Seguir guardando ahí el detalle por destinatario y payload enviado.

3. Ajustar la lógica de `evaluar-triggers-evento`
- Crear un acumulador por corrida con contadores claros:
  - acuerdos encontrados
  - destinatarios evaluados
  - enviados
  - omitidos por idempotencia
  - errores
  - motivo principal
- Al finalizar cada trigger/offset:
  - actualizar el registro de `avisos_ejecuciones` con estado consistente:
    - `completado`
    - `parcial`
    - `error`
    - o equivalente legible si fue “omitido/ya enviado”
- Incluir en `detalle_error` o en un resumen textual mensajes como:
  - “Ya enviado previamente; ejecución omitida”
  - “Sin acuerdos elegibles”
  - “Fuera de ventana de envío”

4. Corregir la vista `Ejecuciones.tsx`
- Dejar de sintetizar las ejecuciones de evento desde `avisos_envios_evento`.
- Tomar `avisos_ejecuciones` como fuente principal del listado.
- Si hace falta, usar `avisos_envios_evento` solo para abrir detalle fino por destinatario o enriquecer datos secundarios.
- Mostrar filas separadas por cada corrida real, incluso si dos corridas del mismo aviso ocurrieron con un minuto de diferencia.

5. Homologar lo que verá el usuario
- Cuando una corrida no envíe nada porque ya había sido enviada, debe verse como una fila nueva con su hora real.
- Esa fila debe explicar el motivo, en lugar de desaparecer del log.
- Así el historial mostrará algo como:
  - 21:50 enviado
  - 21:51 omitido por ya enviado
  - 21:52 fuera de ventana
  en vez de aparentar una sola ejecución.

Archivos a modificar
- `supabase/functions/evaluar-triggers-evento/index.ts`
- `src/pages/admin/comunicacion/Ejecuciones.tsx`

Trabajo de base de datos requerido
- Revisar si `avisos_ejecuciones` ya tiene columnas suficientes para guardar motivo/resumen de una corrida de evento.
- Si no las tiene, agregar por migración los campos mínimos necesarios para auditoría clara.
- No se eliminará el `UNIQUE` de `avisos_envios_evento`, porque sigue siendo útil para evitar reenvíos duplicados.

Resultado esperado
- Cada vez que el cron ejecute el aviso de recordatorio, aparecerá una nueva fila en el log.
- El sistema no volverá a mandar el mismo aviso solo por crear la bitácora.
- La pantalla dejará de dar la impresión de que el aviso “se reemplaza por el último” y mostrará la historia real de ejecuciones con su motivo.