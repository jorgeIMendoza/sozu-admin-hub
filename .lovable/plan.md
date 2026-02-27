

## Corregir validacion de precio_final en EditCuentaCobranzaDialog

### Problema
En `EditCuentaCobranzaDialog.tsx`, la validacion `!cuentaDetalle?.precio_final` trata el valor `0` como falsy, bloqueando la edicion con el mensaje "no hay datos suficientes" aunque si existan acuerdos de pago.

### Cambio
En la linea 2237 de `EditCuentaCobranzaDialog.tsx`, reemplazar:

```text
if (!cuentaDetalle?.precio_final || !lastAcuerdo)
```

por:

```text
if (cuentaDetalle?.precio_final == null || !lastAcuerdo)
```

Esto permite editar cuentas con `precio_final = 0` sin bloquear la funcionalidad, mientras sigue validando que exista un acuerdo de pago.

### Archivo afectado
- `src/components/admin/EditCuentaCobranzaDialog.tsx` (linea 2237)

