

## Plan: Sistema de Validación Automática de PDFs de Ofertas en Tiempo de Descarga

### Objetivo
Implementar un sistema que valide automáticamente si los datos críticos de una oferta han cambiado desde que fue generada. Si detecta cambios (como RFC del cliente agregado, CLABE modificado, etc.), invalidará automáticamente la URL guardada y regenerará el PDF.

### Problema Base
Cuando una oferta se genera sin datos críticos (ejemplo: RFC del cliente faltante), se guarda el PDF y su URL. Luego, cuando esos datos se añaden, el sistema sigue usando la URL antigua sin regenerar, mostrando un PDF incompleto.

### Situaciones que Requieren Regeneración
1. **RFC del comprador** - Agregado/modificado (afecta sección "Datos Bancarios")
2. **CLABE STP de la propiedad** - Agregado/modificado (afecta número de cuenta)
3. **Configuración del proyecto** - `mostrar_seccion_efectivo_en_oferta` cambiada
4. **Esquema de pago** - Modificado (afecta tabla de pagos)
5. **Datos del propietario/dueño** - Modificado (afecta datos bancarios del dueño)
6. **Información de la propiedad** - `clabe_stp_tmp_apartado` modificado

### Datos Críticos a Validar (Fase 1)
Para esta primera fase, nos enfocaremos en los datos más críticos:
- **RFC del comprador** (`personas.rfc` en la oferta)
- **CLABE STP** de la propiedad (`propiedades.clabe_stp_tmp_apartado`)
- **Configuración de mostrar datos bancarios** en proyecto (`proyectos.mostrar_seccion_efectivo_en_oferta`)
- **Datos del propietario** que tiene cuenta STP

### Estrategia de Implementación: Validación en Tiempo de Descarga

#### Fase 1: Validación Simple (Corto Plazo)
**Archivo: `src/services/ofertaPdfStorageService.ts`**

Agregar nuevo método `validateOfferDataAndInvalidateIfNeeded()` que:
1. Obtiene la oferta actual del BD con todos sus datos relacionados
2. Verifica si los datos críticos requeridos están presentes
3. Si faltan datos que antes no estaban disponibles, invalida la URL (setea `url = NULL`)
4. Retorna si el PDF es válido o fue invalidado

```typescript
async validateOfferDataAndInvalidateIfNeeded(offerId: number): Promise<{
  isValid: boolean;
  wasInvalidated: boolean;
  reason?: string;
}> {
  // Obtener oferta con todos sus datos relacionados
  const oferta = await this.fetchOfferWithAllData(offerId);
  
  // Validar datos críticos según tipo de oferta
  const validation = this.validateCriticalData(oferta);
  
  // Si faltan datos críticos, invalidar URL
  if (!validation.isValid) {
    await this.invalidateOfferUrl(offerId);
    return { isValid: false, wasInvalidated: true, reason: validation.reason };
  }
  
  return { isValid: true, wasInvalidated: false };
}
```

#### Actualización en Flujo de Descarga

En los 3 archivos donde se descarga oferta, modificar la lógica actual:

**Patrón actual:**
```typescript
const existingUrl = await ofertaPdfStorageService.getExistingUrl(offer.id);
if (existingUrl) {
  // Descargar directamente
} else {
  // Generar nuevo
}
```

**Patrón nuevo:**
```typescript
const existingUrl = await ofertaPdfStorageService.getExistingUrl(offer.id);

if (existingUrl) {
  // Validar que los datos no hayan cambiado
  const validation = await ofertaPdfStorageService.validateOfferDataAndInvalidateIfNeeded(offer.id);
  
  if (validation.wasInvalidated) {
    // URL fue invalidada, generar nuevo PDF
    toast({ title: "Regenerando PDF", description: "Los datos de la oferta han sido actualizados..." });
    // Generar nuevo PDF
  } else {
    // URL sigue siendo válida, descargar
    await ofertaPdfStorageService.downloadFromUrl(existingUrl, filename);
  }
} else {
  // No hay URL, generar nuevo
}
```

#### Archivos a Modificar

1. **`src/services/ofertaPdfStorageService.ts`** (NUEVO MÉTODO)
   - Agregar `validateOfferDataAndInvalidateIfNeeded(offerId)`
   - Agregar `fetchOfferWithAllData(offerId)` 
   - Agregar `validateCriticalData(oferta)`
   - Agregar `invalidateOfferUrl(offerId)`

2. **`src/pages/admin/Propiedades.tsx`** (ACTUALIZAR HANDLER)
   - Línea ~1020: Modificar `handleDownloadOffer()` para usar validación

3. **`src/pages/admin/Pagos.tsx`** (ACTUALIZAR HANDLER)
   - Línea ~559: Modificar lógica `if (existingUrl)` para validar antes de descargar

4. **`src/pages/admin/inmobiliarias/MisPropiedades.tsx`** (ACTUALIZAR HANDLER)
   - Línea ~938: Modificar lógica `if (existingUrl)` para validar antes de descargar

### Datos Técnicos de Validación

**Para ofertas de propiedad:**
- Requiere: RFC válido del comprador (`personas.rfc`)
- Requiere: CLABE STP si `mostrar_seccion_efectivo_en_oferta = true`
- Requiere: Datos del propietario si tiene cuenta STP

**Para ofertas de producto:**
- Requiere: RFC válido del comprador
- Requiere: Datos bancarios del propietario si aplica

### Ventajas de este Enfoque
✅ **Automático y transparente** - El usuario no nota que se regeneró
✅ **Sin cambios en BD** - No requiere migración SQL
✅ **Seguro** - Siempre muestra PDF correcto cuando hay datos faltantes
✅ **Performante** - Validación es una simple query
✅ **Escalable** - Fácil agregar más condiciones de validación

### Consideraciones
- La validación se hace en cada descarga (pequeño overhead de 1-2 queries)
- Si los datos cambian mientras el usuario está descargando, se regenera automáticamente
- El usuario recibe un toast indicando si se regeneró o se descargó del cache

### Fase 2 (Futuro)
Implementar un sistema de hashing de estado (`hash_estado` en tabla `ofertas`) para validaciones más eficientes, pero por ahora la Fase 1 es suficiente y no requiere cambios en BD.

