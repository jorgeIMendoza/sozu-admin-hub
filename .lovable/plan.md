

## Plan: Invalidar PDF al cambiar agente vendedor

### Problema
Al cambiar el agente vendedor en `AgenteVendedorDialog`, solo se actualiza `email_creador` en la tabla `ofertas`, pero no se borra la URL del PDF existente. El PDF sigue mostrando el agente anterior.

### Cambio

**`src/components/admin/AgenteVendedorDialog.tsx`** — líneas 58-61

En la mutación `updateAgentMutation`, agregar `url: null` al update para que el PDF se regenere la próxima vez que se solicite:

```typescript
const { error } = await supabase
  .from('ofertas')
  .update({ email_creador: newEmail, url: null })
  .eq('id', ofertaId);
```

Esto es todo. Al poner `url: null`, el sistema existente (en `ofertaPdfStorageService`) detectará que no hay URL y regenerará el PDF con el agente correcto.

