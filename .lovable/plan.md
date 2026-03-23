

# Plan: Agregar toggle "Es incluido" en edición de bodegas + Corregir valor de escrituración

## Contexto
Todas las bodegas de Bottura tienen `es_incluido = true`, pero algunas (como la bodega 49) tienen su propia cuenta de cobranza con precio real. Se necesita poder editar este campo y que el cálculo de escrituración lo considere correctamente.

## Cambios

### 1. Agregar campo "Es incluido" al diálogo de edición de bodegas
**Archivo**: `src/components/admin/EditBodegaDialog.tsx`
- Agregar un Switch/Checkbox con label "Es incluido" al formulario
- Incluir `es_incluido` en el `formData` del estado
- Enviar el valor al guardar junto con los demás campos

### 2. Actualizar la función `onSave` para incluir `es_incluido`
**Archivo**: Componente padre que usa `EditBodegaDialog` (donde se define el `onSave`)
- Asegurar que el update a Supabase incluya el campo `es_incluido`

### 3. Corregir cálculo de Valor de Escrituración
**Archivo**: `src/pages/admin/DetalleCuentaCobranza.tsx`
- Modificar la consulta para obtener todas las bodegas/estacionamientos de la propiedad sin filtrar por `es_incluido`
- Para cada bodega/estacionamiento, verificar si tiene una cuenta de cobranza separada con `precio_final > 0`
- Sumar al total de escrituración solo aquellas que tengan cuenta separada con precio real, independientemente del flag `es_incluido`

## Resultado esperado
- El admin puede cambiar el toggle "Es incluido" desde la edición de bodega
- El valor de escrituración suma correctamente el precio de bodegas que tienen cuenta de cobranza separada

