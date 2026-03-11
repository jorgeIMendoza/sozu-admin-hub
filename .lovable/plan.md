

## Plan: Navigate to Pagos with property filter instead of inline history

### What changes

1. **`ClienteHistorialPagos.tsx`** — Read a `cuentaId` query parameter from the URL. When present, auto-select the matching property in the property selector instead of defaulting to index 0.

2. **`ClientePropiedadDetalle.tsx`** — Replace the inline "Historial de pagos" toggle+expansion with a navigation link to `/admin/portal-cliente/pagos?cuentaId={cuentaId}`. Remove the `showHistorialPagos` state, the `InlinePagosSection` component usage, and the `ChevronUp`/`ChevronDown` toggle icons for that button (use `ChevronRight` instead, like a nav link).

### Implementation details

**ClienteHistorialPagos.tsx:**
- Import `useSearchParams` from react-router-dom
- On mount, read `searchParams.get("cuentaId")` 
- When `properties` load, find the index matching that `cuentaId` and set `selectedProperty` to it

**ClientePropiedadDetalle.tsx:**
- The "Historial de pagos" button becomes: `navigate(`/admin/portal-cliente/pagos?cuentaId=${prop.cuentaId}`)`
- Remove the inline `InlinePagosSection` render block and related state
- Clean up unused imports (`InlinePagosSection` component definition, `showHistorialPagos` state)

