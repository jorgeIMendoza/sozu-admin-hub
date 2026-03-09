

# Plan: Configuración dual Mifiel (DEV/PRD)

## Resumen
Eliminar `VITE_MIFIEL_ENVIRONMENT`. Usar `VITE_ENVIRONMENT` (ya existe: `"development"` en preview, `"production"` en publicado) para el widget frontend. Las edge functions recibirán `environment` en el body y seleccionarán secrets con sufijo `_DEV` o `_PRD`.

## Cambios

### 1. `src/components/admin/MifielSigningDialog.tsx`
- Reemplazar `VITE_MIFIEL_ENVIRONMENT` por `VITE_ENVIRONMENT`
- `production` → `app.mifiel.com`, otro → `app-sandbox.mifiel.com`

### 2. `src/components/admin/CartaAcuerdoDetalle.tsx`
- En las 3 llamadas a `supabase.functions.invoke("mifiel-*")`, agregar `environment: ENVIRONMENT` al body (importar `ENVIRONMENT` de `@/lib/config`)

### 3. `src/components/admin/AgentOnboardingStepDialog.tsx`
- En las 3 llamadas a `supabase.functions.invoke("mifiel-*")`, agregar `environment: ENVIRONMENT` al body

### 4. Edge Functions (4 archivos)
En cada una agregar helper al inicio:
```typescript
function getMifielCredentials(environment?: string) {
  const suffix = environment === "production" ? "_PRD" : "_DEV";
  return {
    apiUrl: (Deno.env.get(`MIFIEL_API_URL${suffix}`) || Deno.env.get("MIFIEL_API_URL") || "https://app-sandbox.mifiel.com/api/v1").replace(/\/+$/, "").replace(/\/documents$/i, ""),
    apiId: Deno.env.get(`MIFIEL_API_ID${suffix}`) || Deno.env.get("MIFIEL_API_ID") || "",
    apiSecret: Deno.env.get(`MIFIEL_API_SECRET${suffix}`) || Deno.env.get("MIFIEL_API_SECRET") || "",
  };
}
```
- Extraer `environment` del body del request
- Reemplazar las variables `MIFIEL_API_URL`, `MIFIEL_API_ID`, `MIFIEL_API_SECRET` globales por las del helper
- Archivos: `mifiel-crear-documento`, `mifiel-cancelar-documento`, `mifiel-consultar-documento`, `mifiel-webhook`
- Para `mifiel-webhook`: no recibe environment del frontend, inferirlo del `MIFIEL_API_URL` del documento o usar `_DEV` como default (el webhook es llamado por Mifiel, no por el frontend)

### 5. `.env`, `.env.development`, `.env.production`, `.env.example`
- Eliminar `VITE_MIFIEL_ENVIRONMENT` de todos

### 6. Secrets requeridos (acción del usuario)
Crear en Supabase dashboard:
- `MIFIEL_API_URL_DEV`, `MIFIEL_API_ID_DEV`, `MIFIEL_API_SECRET_DEV` (valores actuales)
- `MIFIEL_API_URL_PRD`, `MIFIEL_API_ID_PRD`, `MIFIEL_API_SECRET_PRD` (credenciales de producción)

Los secrets originales (`MIFIEL_API_URL`, `MIFIEL_API_ID`, `MIFIEL_API_SECRET`) sirven como fallback.

