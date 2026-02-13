

## Plan: Porcentaje de Comision para Inmobiliarias

### Resumen
Agregar el campo "Porcentaje de Comision" a las inmobiliarias, con valor default de 2.00%, editable al crear y editar. Al generar una cuenta de cobranza (via `asignar-propiedad`), si el agente vendedor pertenece a una inmobiliaria, usar su porcentaje de comision. Ademas, actualizar todas las inmobiliarias existentes con porcentaje_comision=2.

---

### Cambios

#### 1. Migracion SQL: Actualizar inmobiliarias existentes
- Ejecutar `UPDATE entidades_relacionadas SET porcentaje_comision = 2 WHERE id_tipo_entidad = 5 AND activo = true`

#### 2. `src/pages/admin/Inmobiliarias.tsx` - Agregar campo porcentaje_comision

**En el createMutation:**
- Al insertar en `entidades_relacionadas`, agregar `porcentaje_comision: personData.porcentaje_comision || 2.00`
- Pasar el campo desde PersonForm

**En el updateMutation:**
- Despues de actualizar la persona, tambien actualizar `entidades_relacionadas` con el nuevo `porcentaje_comision` si cambio

**En el handleEdit:**
- Al cargar datos para edicion, tambien consultar `entidades_relacionadas` para obtener el `porcentaje_comision` actual

**En los Dialogs de crear/editar:**
- Agregar un campo numerico "Porcentaje de Comision (%)" con valor default 2.00, debajo o al lado del PersonForm dentro del DialogContent

#### 3. `src/components/admin/PersonForm.tsx` - Soporte para porcentaje_comision (solo para inmobiliarias)

Agregar estado y campo condicional cuando `entityType === 'inmobiliaria'`:
- Estado: `porcentajeComision` con default 2.00
- Renderizar un input numerico "Porcentaje de Comision (%)" en la seccion de datos basicos
- Incluir en el objeto de submit como `porcentaje_comision`

#### 4. `supabase/functions/asignar-propiedad/index.ts` - Usar porcentaje de inmobiliaria

Al crear la cuenta de cobranza (linea ~268-281):
- Despues de crear la oferta, buscar si el `email_usuario` (agente vendedor) tiene un usuario con `id_persona`
- Buscar si esa persona tiene una entidad_relacionada de tipo Agente (19) con `id_persona_duena_lead` (que apunta a la inmobiliaria)
- Si tiene inmobiliaria, buscar la entidad_relacionada de tipo 5 (Inmobiliaria) para esa persona y obtener su `porcentaje_comision`
- Usar ese valor como `porcentaje_comision_venta` en la cuenta de cobranza en vez de 0

---

### Detalle tecnico

**Flujo de datos:**

1. Inmobiliaria se crea/edita -> `entidades_relacionadas.porcentaje_comision` se guarda (default: 2.00)
2. Agente vendedor genera una asignacion -> `asignar-propiedad` edge function:
   - Identifica al agente via `email_usuario`
   - Busca `usuarios.id_persona` para ese email
   - Busca `entidades_relacionadas` tipo 19 (Agente) donde `id_persona = usuario.id_persona` para encontrar `id_persona_duena_lead` (la inmobiliaria)
   - Busca `entidades_relacionadas` tipo 5 donde `id_persona = id_persona_duena_lead` para obtener `porcentaje_comision`
   - Usa ese valor en `porcentaje_comision_venta` de la nueva cuenta de cobranza

**Archivos a modificar:**
- `supabase/migrations/` - nueva migracion para UPDATE masivo
- `src/pages/admin/Inmobiliarias.tsx` - campo en create/edit, lectura del valor
- `src/components/admin/PersonForm.tsx` - campo condicional para inmobiliarias
- `supabase/functions/asignar-propiedad/index.ts` - logica para buscar comision de inmobiliaria

