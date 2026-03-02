
# Fix: Enviar el PDF original de la oferta por correo (no regenerar)

## Problema
Cuando se envia la oferta por correo, el sistema llama al edge function `generar-oferta-pdf` para regenerar el PDF en el servidor. Esta regeneracion produce un PDF diferente al original (le falta la seccion "Esquemas de pago", muestra "Titular: N/A", pierde imagenes y formato).

El PDF correcto ya existe almacenado en Supabase Storage y su URL esta guardada en el campo `url` de la tabla `ofertas`.

## Solucion

En lugar de regenerar el PDF, descargar el archivo existente desde la URL almacenada en la tabla `ofertas` y adjuntarlo al correo.

### Archivo: `supabase/functions/enviar-oferta-email/index.ts`

Cambiar el flujo del fallback (cuando no hay `preGeneratedAttachments`) para:

1. Consultar la tabla `ofertas` para obtener la `url` de cada offerId
2. Descargar el PDF desde esa URL publica de Storage
3. Convertir el contenido a base64
4. Adjuntarlo al correo

```text
// En lugar de llamar a generar-oferta-pdf:
for (const offerId of offerIds) {
  // 1. Obtener URL del PDF desde la tabla ofertas
  const { data: oferta } = await supabase
    .from('ofertas')
    .select('url, tipo_oferta')
    .eq('id', offerId)
    .single();

  if (!oferta?.url) {
    console.error(`Oferta ${offerId} sin URL de PDF`);
    continue;
  }

  // 2. Descargar el PDF desde Storage
  const pdfResponse = await fetch(oferta.url);
  const pdfBuffer = await pdfResponse.arrayBuffer();

  // 3. Convertir a base64
  const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

  // 4. Extraer nombre del archivo de la URL
  const fileName = oferta.url.split('/').pop() || `Oferta_${offerId}.pdf`;

  attachments.push({ Name: fileName, Content: base64, ContentType: 'application/pdf' });
  pdfResults.push({ offerId, fileName, tipo: oferta.tipo_oferta || 'propiedad' });
}
```

### Sin cambios en otros archivos
- `ofertaEmailService.ts` sigue enviando `offerIds` al edge function, sin cambios
- `NewOfferDialog.tsx` y `NewProductOfferDialog.tsx` sin cambios

### Resultado
El correo adjuntara exactamente el mismo PDF que el usuario descarga, con todas las secciones (esquemas de pago, titular correcto, imagenes, formato completo).
