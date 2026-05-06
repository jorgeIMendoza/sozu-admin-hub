## Ajuste al Edge Function `migrar-archivos-storage`

Reducir la presión sobre `api.sozu.com` (origen de los timeouts 522) bajando concurrencia y agregando un pequeño delay entre descargas, además de un timeout explícito por archivo para que un host lento no bloquee toda la tanda.

### Cambios en `supabase/functions/migrar-archivos-storage/index.ts`

1. **Bajar concurrencia**: `CONCURRENCY` de `8` → `3`.
2. **Timeout por descarga**: envolver el `fetch(oldUrl)` con `AbortController` a **20s**. Si expira, se cuenta como error y se sigue con el siguiente (no rompe la tanda).
3. **Delay entre lotes**: `await sleep(500)` (500ms) entre cada batch de 3 para no saturar el origen.
4. **Reintento ligero**: si la descarga falla con 5xx o timeout, reintentar **1 vez** tras 1s antes de marcar como error.
5. **Sin cambios** en: validación de tabla/columna, payload de entrada, formato de respuesta, lógica de upload a Storage, ni update a la DB. La interfaz pública del Edge Function se mantiene 100% compatible con el n8n y con los `curl` actuales.

### Despliegue y verificación

1. Desplegar la función.
2. Lanzar 1 tanda de prueba con `limit: 50` y medir: tiempo total, exitosos, errores.
3. Si la tasa de error <10%, encadenar tandas hasta vaciar `multimedias_proyecto.url` (consulta de control: `SELECT COUNT(*) FROM multimedias_proyecto WHERE url LIKE '%api.sozu.com%'`).
4. Reportar total migrado y confirmar 0 pendientes.

### Notas

- Esto **no bloquea** el workflow n8n que estás montando: ambos pueden coexistir apuntando al mismo bucket/tabla porque el upload usa `upsert: true` y el `WHERE` solo trae filas con URL legacy (las ya migradas se excluyen automáticamente).
- Si tras el ajuste `api.sozu.com` sigue devolviendo 522 masivamente, la siguiente palanca sería bajar `CONCURRENCY` a `2` o agregar `User-Agent` custom en el `fetch`.
