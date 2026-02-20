

## Plan: Corregir generacion de factura comision y permitir reintento

### Problema detectado

La cuenta 1739 tiene los datos correctos para generar la factura:
- Propiedad 4729, estatus "Vendido" (5)
- Entidad duena con `facturar_comision_sozu = true`
- Precio final: $3,839,814 con 5% comision = $191,990.70

Sin embargo, cuando se llamo al endpoint N8N `/generaFactura`, este devolvio una respuesta invalida (vacia o sin URL). El codigo actual (linea 236-238) tiene un fallback que guarda `https://pendiente-de-generar.sozu.com` como URL en lugar de reportar el error. Esto hace que parezca que la factura se genero correctamente cuando en realidad fallo.

### Cambios necesarios

**1. Edge Function `generar-factura-comision-sozu/index.ts`**

- Cuando N8N responde con un status code de error (4xx, 5xx), lanzar un error claro en lugar de guardar una URL falsa.
- Cuando N8N responde exitosamente pero sin URL valida, tambien lanzar error.
- Eliminar el fallback a `https://pendiente-de-generar.sozu.com`.
- Si N8N falla, NO actualizar la cuenta, para que se pueda reintentar.

Cambio especifico en lineas 220-238:
```typescript
// 8. Llamar N8N
const n8nResponse = await fetch(`${n8nBaseUrl}/generaFactura`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const responseText = await n8nResponse.text();
console.log(`[generar-factura-comision-sozu] N8N response status: ${n8nResponse.status}, text: "${responseText}"`);

if (!n8nResponse.ok) {
  throw new Error(`N8N respondió con error ${n8nResponse.status}: ${responseText}`);
}

let facturaResult: any = {};
try {
  facturaResult = JSON.parse(responseText);
} catch {
  facturaResult = { url: responseText || null };
}

const docUrl = facturaResult.url;
if (!docUrl || !docUrl.startsWith('http') || docUrl.includes('pendiente')) {
  throw new Error(`N8N no devolvió una URL válida. Respuesta: ${responseText}`);
}
```

**2. Limpiar la cuenta 1739 para permitir reintento**

Agregar logica en la funcion para que si la URL actual contiene "pendiente-de-generar", se permita regenerar (tratar como si no tuviera factura). Cambio en linea 134:
```typescript
if (cuentaExistente?.url_factura_comision && 
    cuentaExistente?.es_draft_factura_comision === false) {
  // Solo bloquear si ya esta timbrada
  return ...already_exists...
}

// Si tiene URL pendiente, limpiarla para regenerar
if (cuentaExistente?.url_factura_comision?.includes('pendiente-de-generar')) {
  console.log(`[generar-factura-comision-sozu] URL pendiente detectada, regenerando...`);
  await supabase.from('cuentas_cobranza')
    .update({ url_factura_comision: null, es_draft_factura_comision: null })
    .eq('id', id_cuenta_cobranza);
}
```

**3. Boton "Regenerar" en la UI (`Comisiones.tsx`)**

En la columna de "Fact. Comision Sozu", cuando la URL contiene "pendiente-de-generar", mostrar un boton de "Regenerar" (icono RefreshCw) que llame nuevamente a la edge function `generar-factura-comision-sozu`.

### Seccion tecnica

- La edge function ya permite re-ejecucion para drafts (linea 134 solo bloquea timbradas)
- El secret `N8N_WEBHOOK_BASE_URL` ya esta configurado
- El secret `COMISIONES_SOZU_API_KEY_DRAFT` ya esta configurado
- Se desplegara la edge function actualizada automaticamente
- No se requieren cambios en la base de datos
