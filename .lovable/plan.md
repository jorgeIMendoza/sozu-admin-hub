

## Plan: Forzar firma biométrica sin mostrar opciones

### Hallazgo clave
La documentación de Mifiel (sección "Actualizar participante") especifica los valores válidos para `allowed_signature_methods`:
- **FEA** — Firma Electrónica Avanzada (e.firma/FIEL)
- **FESCV** — Firma Electrónica con verificación biométrica (con validación de identidad)
- **FESSV** — Firma Electrónica Simple sin validación

El código actual usa `"efirma"` que no es un valor válido de la API. Además, cuando `requiereBiometrica` es `true`, omite el parámetro por completo, lo que hace que Mifiel muestre TODAS las opciones disponibles en lugar de forzar solo la biométrica.

### Cambio requerido

**Archivo**: `supabase/functions/mifiel-crear-documento/index.ts` (líneas 443-455)

Cambiar la lógica para:
- Cuando `requiereBiometrica = true` → enviar `allowed_signature_methods = ["FESCV"]` (solo biométrica, sin opciones)
- Cuando `requiereBiometrica = false` → enviar `allowed_signature_methods = ["FEA"]` (solo e.firma, valor correcto)

```typescript
signatories.forEach((s, i) => {
  formData.append(`signatories[${i}][name]`, s.name);
  formData.append(`signatories[${i}][email]`, s.email);
  if (requiereBiometrica) {
    // Force biometric only - no choice screen
    formData.append(`signatories[${i}][allowed_signature_methods][0]`, "FESCV");
  } else {
    // e.firma only
    formData.append(`signatories[${i}][allowed_signature_methods][0]`, "FEA");
  }
});
```

Esto hará que Mifiel vaya directamente al flujo biométrico sin mostrar la pantalla de selección de método. Requiere redesplegar la edge function después del cambio.

