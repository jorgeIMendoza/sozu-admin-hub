
# Plan: Corregir Mapeo de Celdas para Plantilla SAT Oficial

## Resumen

El código actual está escribiendo en celdas incorrectas (B2-B26) que no corresponden a la estructura real del template oficial `Presentacion_de_Aviso_al_SAT_Inmuebles_v4_5-3.xlsm`. Se corregirá el mapeo para usar las celdas correctas según la plantilla oficial.

---

## Estructura del Template Oficial

Basado en el análisis del archivo subido:

### Datos Generales (filas 3-11)
| Celda | Campo |
|-------|-------|
| B3 | RFC |
| B4 | Periodo (AAAAMM) |
| D4 | ¿Artículo 27 Bis? |
| B5 | Referencia |
| D5 | Prioridad |
| B6 | Tipo de alerta |
| D6 | Descripción de alerta |
| B8 | RFC Entidad colegiada |
| B10 | ¿El aviso es modificatorio? |
| B11 | Folio del aviso previo |
| B12 | Descripción de la modificación |

### Persona Física (fila 17 en adelante, primera persona en fila 17)
| Columna | Campo |
|---------|-------|
| B17 | Nombre(s) |
| C17 | Apellido Paterno |
| D17 | Apellido Materno |
| E17 | Fecha Nacimiento |
| F17 | RFC |
| G17 | CURP |
| H17 | País de nacionalidad |
| I17 | Actividad económica |

### Domicilio Nacional (fila 48 en adelante, primer domicilio en fila 48)
| Columna | Campo |
|---------|-------|
| B48 | Código postal |
| C48 | Estado |
| D48 | Municipio/Delegación |
| E48 | Colonia |
| F48 | Calle, avenida o vía |
| G48 | Número exterior |
| H48 | Número interior |

### Contacto (fila 72 en adelante)
| Columna | Campo |
|---------|-------|
| B72 | Clave de país |
| C72 | Número de teléfono |
| D72 | Correo electrónico |

---

## Cambios a Realizar

### 1. Actualizar plantilla en public/templates
**Archivo**: Copiar el template subido a `public/templates/template-aviso-sat-inmuebles.xlsm`

### 2. Modificar función handleGenerateExcel
**Archivo**: `src/components/admin/SATNotificationDialog.tsx`

Reemplazar el mapeo de celdas actual con el mapeo correcto:

```typescript
// Datos generales
setCellValue('B3', cfdi.emisor.rfc);                    // RFC del emisor (inmobiliaria)
setCellValue('B4', periodo);                             // Periodo AAAAMM
setCellValue('B5', `CC-${cuentaCobranzaId}`);           // Referencia

// Persona física - Fila 17 (primera persona)
setCellValue('B17', nombres);                           // Nombre(s)
setCellValue('C17', apellidoPaterno);                   // Apellido Paterno
setCellValue('D17', apellidoMaterno);                   // Apellido Materno
setCellValue('E17', fechaNacimiento);                   // Fecha Nacimiento (DD/MM/YYYY)
setCellValue('F17', csf.datos_identificacion.rfc);      // RFC
setCellValue('G17', csf.datos_identificacion.curp);     // CURP
setCellValue('H17', 'México');                          // País de nacionalidad
setCellValue('I17', csf.regimenes?.[0] || '');         // Actividad económica

// Domicilio nacional - Fila 48
setCellValue('B48', csf.domicilio_fiscal.codigo_postal);
setCellValue('C48', csf.domicilio_fiscal.entidad);
setCellValue('D48', csf.domicilio_fiscal.municipio);
setCellValue('E48', csf.domicilio_fiscal.colonia);
setCellValue('F48', csf.domicilio_fiscal.vialidad);
setCellValue('G48', csf.domicilio_fiscal.numero_exterior || '');
setCellValue('H48', csf.domicilio_fiscal.numero_interior || '');
```

---

## Consideraciones Técnicas

1. **Formato de fecha**: El template espera fecha en formato DD/MM/YYYY, ya implementado correctamente
2. **Múltiples compradores**: El template soporta hasta 10 personas físicas (filas 17-26), pero por ahora solo poblamos la primera
3. **Preservación de estilos**: Mantener el helper `setCellValue` que solo modifica el valor sin alterar estilos
4. **ExcelJS y .xlsm**: ExcelJS tiene soporte limitado para macros, pero preserva el contenido básico

---

## Archivos Afectados

| Archivo | Cambio |
|---------|--------|
| `public/templates/template-aviso-sat-inmuebles.xlsm` | Reemplazar con el archivo oficial subido |
| `src/components/admin/SATNotificationDialog.tsx` | Actualizar mapeo de celdas según estructura del template |

---

## Flujo de Generación

```text
┌────────────────────────────────────────┐
│      Datos Extraídos (CSF + CFDI)      │
└───────────────────┬────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│      Mapeo a Celdas del Template       │
│                                        │
│  RFC Emisor      → B3                  │
│  Periodo         → B4                  │
│  Referencia      → B5                  │
│  Nombre(s)       → B17                 │
│  Apellido Pat.   → C17                 │
│  Apellido Mat.   → D17                 │
│  Fecha Nac.      → E17                 │
│  RFC             → F17                 │
│  CURP            → G17                 │
│  País            → H17                 │
│  Actividad       → I17                 │
│  Código Postal   → B48                 │
│  Estado          → C48                 │
│  Municipio       → D48                 │
│  Colonia         → E48                 │
│  Calle           → F48                 │
│  Núm. Ext.       → G48                 │
│  Núm. Int.       → H48                 │
└───────────────────┬────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│    Guardar y Descargar Excel (.xlsx)   │
└────────────────────────────────────────┘
```
