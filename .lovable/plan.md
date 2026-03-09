

# Fix: Eliminar fallback a secretos sin sufijo en las 4 edge functions de Mifiel

## Problema
Las 4 edge functions tienen un fallback chain: `MIFIEL_API_URL_PRD` → `MIFIEL_API_URL` → hardcoded sandbox. Cuando el usuario elimine los secretos sin sufijo, el fallback caerá al hardcoded sandbox URL. Además, el webhook llama `getMifielCredentials()` sin environment, lo que siempre usa `_DEV`.

## Cambios

### 1. Actualizar `getMifielCredentials` en las 4 functions
Eliminar el fallback a secretos sin sufijo. Solo usar `_PRD` o `_DEV`:

```typescript
function getMifielCredentials(environment?: string) {
  const suffix = environment === "production" ? "_PRD" : "_DEV";
  return {
    apiUrl: (Deno.env.get(`MIFIEL_API_URL${suffix}`) || "").replace(/\/+$/, "").replace(/\/documents$/i, ""),
    apiId: Deno.env.get(`MIFIEL_API_ID${suffix}`) || "",
    apiSecret: Deno.env.get(`MIFIEL_API_SECRET${suffix}`) || "",
  };
}
```

Archivos afectados:
- `supabase/functions/mifiel-crear-documento/index.ts`
- `supabase/functions/mifiel-consultar-documento/index.ts`
- `supabase/functions/mifiel-cancelar-documento/index.ts`
- `supabase/functions/mifiel-webhook/index.ts`

### 2. Fix webhook: leer environment de metadata
En `mifiel-webhook/index.ts` (línea 75), cambiar:
```typescript
const { apiUrl, apiId, apiSecret } = getMifielCredentials();
```
a:
```typescript
const savedEnvironment = firmaRecord?.metadata?.environment || "development";
const { apiUrl, apiId, apiSecret } = getMifielCredentials(savedEnvironment);
```

### 3. Guardar environment en metadata al crear documento
En `mifiel-crear-documento/index.ts`, al insertar en `firmas_digitales`, incluir environment en metadata:
```typescript
metadata: { mifiel_response: mifielDoc, environment: environment || "development" }
```

