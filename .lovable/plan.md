

## Plan: Renombrar EVOLUTION_WA_TOKEN a EVOLUTION_WA_COBRANZA_TOKEN

### Cambios en código

**1. `supabase/functions/notificar-agentes/index.ts`** — 3 referencias:
- Línea 188: `Deno.env.get('EVOLUTION_WA_TOKEN')` → `Deno.env.get('EVOLUTION_WA_COBRANZA_TOKEN')`
- Línea 202: log message → `'EVOLUTION_WA_COBRANZA_TOKEN included...'`
- Línea 204: warn message → `'EVOLUTION_WA_COBRANZA_TOKEN not configured...'`

**2. `supabase/functions/enviar-notificacion/index.ts`** — 1 comentario:
- Línea 26: comentario `EVOLUTION_WA_TOKEN` → `EVOLUTION_WA_COBRANZA_TOKEN`

**3. Desplegar** ambas Edge Functions.

### Acción manual requerida

Deberás renombrar el secreto en el Vault de Supabase: eliminar `EVOLUTION_WA_TOKEN` y crear `EVOLUTION_WA_COBRANZA_TOKEN` con el mismo valor.

