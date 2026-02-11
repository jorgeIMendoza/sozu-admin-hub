
## Renombrar columnas para seguir nomenclatura consistente

### Cambios en base de datos (migración SQL)

**Tabla `avisos_roles_destinatarios`:**
- `aviso_id` --> `id_aviso`
- `rol_id` --> `id_rol`

**Tabla `avisos_ejecuciones`:**
- `aviso_id` --> `id_aviso`
- `ejecutado_por` cambia de tipo `uuid` a `text` (para almacenar el email del usuario)

### Archivos a modificar

1. **`supabase/functions/enviar-aviso-bulk/index.ts`**
   - Cambiar `.select('rol_id')` por `.select('id_rol')`
   - Cambiar `.eq('aviso_id', aviso_id)` por `.eq('id_aviso', aviso_id)` en la consulta a `avisos_roles_destinatarios`
   - Cambiar el campo `aviso_id` por `id_aviso` en el insert a `avisos_ejecuciones`

2. **`src/pages/admin/comunicacion/AdministrarAvisos.tsx`**
   - Cambiar `.select('rol_id').eq('aviso_id', ...)` por `.select('id_rol').eq('id_aviso', ...)`
   - Cambiar `.delete().eq('aviso_id', ...)` por `.delete().eq('id_aviso', ...)`
   - Cambiar el insert a usar `id_aviso` e `id_rol`
   - Actualizar el mapeo `r.rol_id` a `r.id_rol`

3. **`src/pages/admin/comunicacion/EnviarAvisos.tsx`**
   - Cambiar `ejecutado_por: user?.id` por `ejecutado_por: user?.email` en el body del invoke

4. **`src/pages/admin/comunicacion/Ejecuciones.tsx`**
   - Cambiar `e.aviso_id` por `e.id_aviso` en el filtro
   - Actualizar la interfaz `Ejecucion` para usar `id_aviso`

### Detalle técnico de la migración SQL

```sql
-- avisos_roles_destinatarios: renombrar columnas
ALTER TABLE avisos_roles_destinatarios RENAME COLUMN aviso_id TO id_aviso;
ALTER TABLE avisos_roles_destinatarios RENAME COLUMN rol_id TO id_rol;

-- avisos_ejecuciones: renombrar y cambiar tipo
ALTER TABLE avisos_ejecuciones RENAME COLUMN aviso_id TO id_aviso;
ALTER TABLE avisos_ejecuciones ALTER COLUMN ejecutado_por TYPE text USING ejecutado_por::text;
```

Las foreign keys se actualizan automaticamente al renombrar columnas con `RENAME COLUMN`.
