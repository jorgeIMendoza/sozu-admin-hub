

## Plan: Hacer clickeable los errores y mejorar el detalle guardado

### Problema
Cuando un envio tiene errores parciales (ej: 550 enviados + 11 errores), el estado queda como "completado" y no se puede ver el detalle de los errores porque el dialogo solo se abre cuando el estado es "error".

Ademas, el detalle guardado no incluye a que correos fallaron, solo el codigo de error de Postmark.

### Cambios

**1. UI - Hacer clickeable la columna de Errores (no el estado)**
- En la columna "Errores", cuando `total_errores > 0` y hay `detalle_error`, mostrar el numero como un badge rojo clickeable que abre el dialogo de detalle
- El badge de estado se queda como indicador visual sin interaccion

**2. Edge Function - Guardar el email que fallo junto con el error**
- En `enviar-aviso-bulk/index.ts`, cambiar el formato del error guardado para incluir el correo destinatario que fallo
- Formato actual: `[400] The 'From' address...`
- Formato nuevo: `correo@ejemplo.com: [400] The 'From' address...`
- Tambien aumentar el limite de 5 a 20 errores guardados para tener mas visibilidad

---

### Detalle tecnico

**Archivo: `src/pages/admin/comunicacion/Ejecuciones.tsx`**
- Linea 165: Cambiar la celda de errores para que sea clickeable cuando hay errores
- De: `{e.total_errores ?? 0}`
- A: Badge destructive clickeable si `total_errores > 0 && detalle_error`

**Archivo: `supabase/functions/enviar-aviso-bulk/index.ts`**
- En el loop de resultados de Postmark (~linea 119), incluir el email del destinatario en el mensaje de error
- Cambiar `errorMessages.slice(0, 5)` a `errorMessages.slice(0, 20)` para capturar mas detalle

