

# Plan: Botón "Enviar por correo" en ofertas

## Resumen

Dos cambios principales:

1. **Al generar oferta (NewOfferDialog)**: Cuando el email no se envía automáticamente (porque no hay datos bancarios), mostrar un toast con un botón "Enviar por correo" que permita enviar manualmente.

2. **En los diálogos de ofertas de Propiedades**: Agregar un botón de envío por correo (icono Mail) junto al botón de descarga, tanto en ofertas de propiedad como de producto.

## Cambios técnicos

### 1. `src/services/ofertaEmailService.ts`

Crear una nueva función `sendOfferEmailDirect` que **no valide datos bancarios** — simplemente obtiene el email del lead y llama al Edge Function. La función existente `sendOfferEmailAfterDownload` se mantiene sin cambios (sigue validando banking para el envío automático).

```typescript
export async function sendOfferEmailDirect(params: SendOfferEmailParams): Promise<void> {
  // Misma lógica que sendOfferEmailAfterDownload pero SIN la validación de showBanking
  // Obtener email del lead si no se proporciona → llamar Edge Function → toast
}
```

### 2. `src/components/admin/NewOfferDialog.tsx`

Después de llamar `sendOfferEmailAfterDownload`, detectar si el email no se envió (cuando `showBanking` es false). La función `sendOfferEmailAfterDownload` actualmente retorna `void` silenciosamente. Cambiar para que retorne un booleano indicando si se envió o no.

- Modificar `sendOfferEmailAfterDownload` para retornar `Promise<boolean>` (`true` = enviado, `false` = no enviado por banking)
- En `NewOfferDialog`, si retorna `false`, mostrar un toast con action button:

```typescript
const emailSent = await sendOfferEmailAfterDownload({...});
if (!emailSent) {
  toast({
    title: "Oferta descargada",
    description: "La oferta no incluye datos bancarios. ¿Deseas enviarla por correo?",
    action: <Button onClick={() => sendOfferEmailDirect({...})}>Enviar por correo</Button>,
    duration: 10000,
  });
}
```

### 3. `src/pages/admin/Propiedades.tsx` — Dialog de ofertas de propiedad

En la columna "Descarga" (línea ~6107-6137), agregar un botón con icono `Mail` junto al botón de `Download`:

```tsx
<div className="flex gap-1">
  <Button variant="outline" size="icon" onClick={() => handleDownloadOffer(offer)}>
    <Download />
  </Button>
  <Button variant="outline" size="icon" onClick={() => handleSendOfferEmail(offer, 'propiedad')}>
    <Mail />
  </Button>
</div>
```

Crear función `handleSendOfferEmail` que importe `sendOfferEmailDirect` y la llame con los datos de la oferta.

### 4. `src/pages/admin/Propiedades.tsx` — Dialog de ofertas de producto

En la columna "Acciones" (línea ~6514-6591), agregar el mismo botón `Mail` junto al botón de descarga de producto.

### 5. `src/pages/admin/inmobiliarias/MisPropiedades.tsx`

Aplicar los mismos botones de envío en los diálogos de ofertas de propiedad y producto (misma lógica que Propiedades.tsx).

## Archivos afectados

- `src/services/ofertaEmailService.ts` — nueva función `sendOfferEmailDirect`, cambiar retorno de `sendOfferEmailAfterDownload`
- `src/components/admin/NewOfferDialog.tsx` — toast con botón cuando no se envía automáticamente
- `src/components/admin/NewProductOfferDialog.tsx` — mismo cambio que NewOfferDialog
- `src/pages/admin/Propiedades.tsx` — botón Mail en ambos diálogos de ofertas
- `src/pages/admin/inmobiliarias/MisPropiedades.tsx` — botón Mail en diálogos de ofertas

