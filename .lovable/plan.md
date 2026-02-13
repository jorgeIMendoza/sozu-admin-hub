

## Add Offer Link to Property Info Section in Cuenta de Cobranza Detail

### What will change

In the "Informacion de la Propiedad" (or Product) card of the Cuenta de Cobranza detail page, a new field "Oferta" will be added showing the offer ID with proper nomenclature:
- **Property offers**: `O-000001`
- **Product/Service offers**: `OP-000001`

Clicking on it will trigger the existing download-or-regenerate flow (same pattern used in Pagos.tsx).

### Implementation Details

**File: `src/pages/admin/DetalleCuentaCobranza.tsx`**

1. **Add a loading state** for offer download (e.g., `downloadingOferta`).

2. **Add an `handleDownloadOferta` function** replicating the proven pattern from `Pagos.tsx`:
   - Import `ofertaPdfStorageService` dynamically.
   - Check if the offer already has a URL via `getExistingUrl(ofertaId)`.
   - If URL exists, validate with `validateOfferDataAndInvalidateIfNeeded(ofertaId)`:
     - If invalidated: regenerate the PDF via `generateOfferPDF` (dynamically imported from `htmlToPdfService`).
     - If still valid: download directly via `downloadFromUrl`.
   - If no URL: generate new PDF via `generateOfferPDF`, distinguishing between property and product offers using `cuentaDetalle.tipo_cuenta` and the offer's `id_producto`.
   - The function will use `cuentaDetalle.oferta_id` and existing data (`id_propiedad`, compradores, etc.) to call the generation service.

3. **Add the "Oferta" field in the property info grid** (in both the property and product/service branches):
   - Display the formatted offer ID using inline formatting: `O-{padded}` or `OP-{padded}` based on `cuentaDetalle.tipo_cuenta`.
   - Render as a clickable `Button` (variant="link") with a `FileText` icon.
   - Show a loading spinner when `downloadingOferta` is true.
   - Place it after "No. Propiedad" for property accounts and after "Categoria" for product accounts.

### Technical Notes

- The nomenclature follows the existing app convention: `O-` prefix for property offers, `OP-` for product/service offers (not `OF-` which is used in a different context for payment scheme badges).
- The download/regenerate logic mirrors `Pagos.tsx` lines 516-648, which already handles the same cuenta-cobranza-to-offer relationship.
- No new dependencies or database changes required.
- Single file change: `src/pages/admin/DetalleCuentaCobranza.tsx`.

