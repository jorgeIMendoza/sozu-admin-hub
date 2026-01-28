
# Plan: Igualar PDF del Edge Function con el del Frontend

## Análisis de Diferencias

Después de revisar ambas implementaciones en detalle, he identificado las siguientes diferencias entre el PDF generado por el **frontend** (`ofertaPdfNativeService.ts`) y el generado por el **Edge Function** (`generar-oferta-pdf/index.ts`):

### Diferencias Críticas - Ofertas de Propiedad

| Característica | Frontend (jsPDF) | Edge Function (pdf-lib) | Estado |
|---------------|------------------|-------------------------|--------|
| **Iconos visuales** | Carga PNG icons (recamaras, baños, etc.) y los embebe en el PDF | Solo muestra texto (`"3 Recámaras • 2 Baños"`) sin iconos | ❌ Falta |
| **Imagen del modelo** | Carga y muestra imagen del modelo desde `modelImages` | No incluye imagen del modelo | ❌ Falta |
| **Vista/Orientación** | Consulta y muestra `vista.nombre` | No consulta la tabla `vistas` | ❌ Falta |
| **Titular bancario** | Muestra `ownerData.nombre_legal` en sección bancaria | No consulta ni muestra el nombre del dueño | ❌ Falta |
| **Tramos de mensualidad** | Soporta `tramos_mensualidad` con múltiples escalones | Solo calcula mensualidad uniforme | ❌ Falta |
| **Esquemas en grid 2x2** | Cards con altura de 45mm en grid de 2 columnas | Cards con altura de 100mm, no encajan bien | ⚠️ Diferente |
| **Multi-página** | Usa `checkNewPage()` y `pdf.addPage()` | Agrega página pero sin lógica correcta de Y | ⚠️ Bug |
| **Sección efectivo** | Muestra cuenta madre del dueño para pago en efectivo | No incluye tarjeta de pago en efectivo | ❌ Falta |
| **Balcón** | Muestra icono de balcón si `tieneBalcon` es true | No consulta ni muestra | ❌ Falta |

### Diferencias Críticas - Ofertas de Producto

| Característica | Frontend (jsPDF) | Edge Function (pdf-lib) | Estado |
|---------------|------------------|-------------------------|--------|
| **Titular bancario** | Muestra `ownerData.nombre_legal` | No lo consulta | ❌ Falta |
| **Cuenta de efectivo** | Muestra tarjeta con datos de cuenta madre | Solo muestra STP temporal | ❌ Falta |
| **Precio por m²** | Muestra si aplica | No incluido | ❌ Falta |
| **Metraje** | Muestra si aplica | No incluido | ❌ Falta |

---

## Cambios a Implementar

### 1. Agregar Consultas de Datos Faltantes

**Archivo:** `supabase/functions/generar-oferta-pdf/index.ts`

a) **Consultar tabla `vistas`** para obtener orientación:
```sql
-- Ya incluida en propiedades, agregar:
vistas (id, nombre)
```

b) **Consultar `modelImages`** (tabla `multimedia_modelo`):
```sql
SELECT url, ver_como_ubicacion_en_oferta
FROM multimedia_modelo
WHERE id_modelo = :modelId
```

c) **Consultar `ownerData`** para titular bancario:
```sql
-- Navegar desde proyecto → entidades_relacionadas → personas
```

d) **Consultar `ownerStpBankAccount`** para pago en efectivo:
```sql
-- Navegar desde personas → cuentas_bancarias
```

e) **Consultar `tieneBalcon`** desde propiedades características

f) **Incluir `tramos_mensualidad`** en la consulta de esquemas_pago

### 2. Embeber Iconos PNG en el PDF

- Convertir los 6 iconos (`recamaras.png`, `banos.png`, etc.) a Base64 y embeber directamente en el código del Edge Function
- Usar `pdfDoc.embedPng()` para incluirlos

### 3. Agregar Imagen del Modelo

- Consultar `multimedia_modelo` para obtener URL de imagen
- Preferir imagen con `ver_como_ubicacion_en_oferta = true`
- Usar `fetch()` + `pdfDoc.embedPng/Jpg()` para embeber

### 4. Corregir Layout de Esquemas de Pago

- Reducir altura de cards de 100mm a 45mm
- Implementar lógica de `tramos_mensualidad` para mostrar escalones
- Añadir lógica correcta de paginación

### 5. Implementar Multi-Página Correctamente

- Mantener referencia a `currentPage` al agregar páginas
- Resetear `y` correctamente al cambiar de página
- Asegurar que todos los `drawText` usen la página correcta

### 6. Agregar Sección Bancaria Completa

- Mostrar **Titular** en ambas tarjetas (STP y efectivo)
- Agregar tarjeta de "Pago en efectivo" si `mostrar_seccion_efectivo_en_oferta` está activo
- Incluir todos los datos: banco, titular, CLABE

---

## Estructura de Archivos Modificados

```text
supabase/functions/generar-oferta-pdf/
└── index.ts  ← Modificar (~500+ líneas adicionales)
```

---

## Detalle Técnico de Implementación

### Sección 1: Nuevas Consultas SQL

```typescript
// Agregar a la consulta de propiedades:
vistas (id, nombre)

// Nueva consulta para model images:
const { data: modelImages } = await supabase
  .from('multimedia_modelo')
  .select('url, ver_como_ubicacion_en_oferta')
  .eq('id_modelo', modelo.id);

// Consultar owner data del proyecto:
const { data: entidadDueno } = await supabase
  .from('entidades_relacionadas')
  .select(`
    personas!entidades_relacionadas_id_persona_fkey (
      id, nombre_legal, email, telefono
    )
  `)
  .eq('id_proyecto', proyecto.id)
  .eq('tipo_entidad', 'propietario')
  .single();

// Consultar cuenta bancaria del dueño:
const { data: ownerBankAccount } = await supabase
  .from('cuentas_bancarias')
  .select('numero_cuenta, cuenta_clabe, cuenta_swift, banco_nombre')
  .eq('id_persona', ownerData.id)
  .eq('es_cuenta_madre_stp', false)
  .limit(1)
  .single();
```

### Sección 2: Embeber Iconos Base64

```typescript
// En el Edge Function, incluir iconos como constantes Base64:
const ICONS = {
  recamaras: 'data:image/png;base64,iVBORw0KGgo...',
  banos: 'data:image/png;base64,iVBORw0KGgo...',
  // ... etc
};

// Función para embeber:
async function embedIcon(pdfDoc: PDFDocument, iconKey: string) {
  const base64Data = ICONS[iconKey].split(',')[1];
  const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  return await pdfDoc.embedPng(bytes);
}
```

### Sección 3: Corregir Layout de Esquemas

```typescript
// Reducir altura y mejorar grid:
const schemeHeight = scheme.tramos_mensualidad?.length > 0 
  ? 45 + (scheme.tramos_mensualidad.length * 12)  // Altura dinámica
  : 45;

// Implementar tramos:
if (scheme.tramos_mensualidad && scheme.tramos_mensualidad.length > 0) {
  for (const tramo of scheme.tramos_mensualidad) {
    page.drawText(`${tramo.numero_mensualidades} mensualidades:`, {...});
    page.drawText(formatCurrency(tramo.monto), {...});
    lineY -= 12;
  }
}
```

### Sección 4: Multi-Página Correcta

```typescript
let currentPage = page;
const pages = [page];

function checkNewPage(neededHeight: number) {
  if (y - neededHeight < margin) {
    const newPage = pdfDoc.addPage([595.28, 841.89]);
    pages.push(newPage);
    currentPage = newPage;
    y = height - margin;
    return true;
  }
  return false;
}

// Usar currentPage en lugar de page para todos los draws
currentPage.drawText(...);
```

---

## Estimación

- **Complejidad**: Alta
- **Líneas adicionales**: ~400-500 líneas
- **Tiempo estimado**: Implementación completa
- **Archivos modificados**: 1 (`index.ts`)

## Notas Importantes

1. Los iconos se convertirán a Base64 y se incluirán directamente en el código para evitar dependencias externas
2. La imagen del modelo se cargará dinámicamente desde Storage
3. Se mantendrá compatibilidad 100% con el formato del frontend
4. Se preservará la lógica de URL efímera (1 minuto)

---

## Resultado Esperado

Después de implementar estos cambios, el PDF generado por el Edge Function será **visualmente idéntico** al generado por el frontend, incluyendo:

- Iconos visuales para características (recámaras, baños, etc.)
- Imagen del modelo en la sección de propiedad
- Vista/orientación de la propiedad
- Nombre del titular en datos bancarios
- Tarjeta de pago en efectivo
- Tramos de mensualidad en esquemas de pago
- Paginación correcta para ofertas largas
