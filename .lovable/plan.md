

## Respuestas a tus dos preguntas

### Escenario 1: Recarga SIN cuenta madre configurada
**Estado inicial**: 144 propiedades con `_TMP`, entidad sin `cuenta_madre_stp`.

**Con el endurecimiento aplicado al paso 11 de `etl_propiedades`**:
- El ETL ya NO trata `_TMP` como CLABE válida → no propaga ese valor a staging.
- El workflow de n8n verá las propiedades como "sin CLABE" → intentará llamar `crear_referencia_bancaria(id_er_dueno)`.
- Como la entidad sigue sin `cuenta_madre_stp`, el RPC fallará o devolverá NULL/error.
- **Resultado**: las propiedades existentes con `_TMP` quedarán con `_TMP` (no se sobreescriben, el UPDATE solo aplica si el RPC devuelve valor válido). Las nuevas propiedades del CSV se insertarán con `<n>_TMP` como hoy.
- **Conclusión**: estado equivalente al actual — `_TMP` persiste hasta que haya cuenta madre. Sin daño.

### Escenario 2: Recarga DESPUÉS de configurar cuenta madre
**Estado inicial**: 144 propiedades con `_TMP`, entidad ahora SÍ tiene `cuenta_madre_stp`.

**Con el endurecimiento + nuevo RPC `regenerar_clabes_faltantes`**:
- Opción recomendada: NO necesitas re-cargar el CSV. Solo ejecutas `SELECT regenerar_clabes_faltantes(1902)` y las 144 obtienen CLABE real en segundos.
- Si aún así re-cargas el CSV: el ETL endurecido detecta `_TMP` como inválido → marca staging como "sin CLABE" → n8n llama al RPC → genera CLABEs reales secuenciales (`...0014`, `...0015`, ...) → UPDATE reemplaza los `_TMP` exitosamente.
- **Conclusión**: las CLABEs `_TMP` se convierten en CLABEs reales de 18 dígitos en ambos caminos.

---

## Plan de implementación (3 migraciones SQL)

### Migración 1 — Backfill inmediato Monócolo
Limpia los 144 `_TMP` y los reemplaza con CLABEs reales usando `crear_referencia_bancaria` en loop fila por fila (necesario para que el contador secuencial interno avance correctamente).

```sql
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN 
    SELECT p.id, p.id_entidad_relacionada_dueno
    FROM propiedades p
    JOIN entidades_relacionadas er ON er.id = p.id_entidad_relacionada_dueno
    WHERE p.clabe_stp_tmp_apartado LIKE '%\_TMP' ESCAPE '\'
      AND er.id_proyecto = 1902
      AND er.cuenta_madre_stp IS NOT NULL
    ORDER BY p.id
  LOOP
    UPDATE propiedades 
    SET clabe_stp_tmp_apartado = crear_referencia_bancaria(r.id_entidad_relacionada_dueno)
    WHERE id = r.id;
  END LOOP;
END $$;
```

### Migración 2 — Endurecer `etl_propiedades` paso 11
Modificar el WHERE para excluir explícitamente los `_TMP` como CLABEs válidas, evitando que el ETL los propague como "ya tiene CLABE":

```sql
-- En paso 11:
WHERE p.activo = true
  AND (
    (p.clabe_stp_tmp_apartado IS NOT NULL 
     AND p.clabe_stp_tmp_apartado NOT LIKE '%\_TMP' ESCAPE '\')
    OR cc.clabe_stp IS NOT NULL
  )
  AND upper(trim(ps.numero_propiedad)) = upper(trim(p.numero_propiedad))
  AND ps.id_proyecto::int = er.id_proyecto
  AND er.id_tipo_entidad IN (4, 15);
```
Resto de la función intacta.

### Migración 3 — RPC `regenerar_clabes_faltantes`
Función reutilizable que encapsula el loop de generación. Acepta filtros opcionales y devuelve el conteo procesado. n8n podrá llamarla con un solo nodo Postgres en lugar del frágil loop `LIMIT 1`.

```sql
CREATE OR REPLACE FUNCTION public.regenerar_clabes_faltantes(
  p_id_proyecto integer DEFAULT NULL,
  p_id_entidad integer DEFAULT NULL
) RETURNS integer 
LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN 
    SELECT p.id, p.id_entidad_relacionada_dueno
    FROM propiedades p
    JOIN entidades_relacionadas er ON er.id = p.id_entidad_relacionada_dueno
    WHERE p.activo = true
      AND (p.clabe_stp_tmp_apartado IS NULL 
           OR p.clabe_stp_tmp_apartado LIKE '%\_TMP' ESCAPE '\')
      AND er.cuenta_madre_stp IS NOT NULL
      AND (p_id_proyecto IS NULL OR er.id_proyecto = p_id_proyecto)
      AND (p_id_entidad IS NULL OR p.id_entidad_relacionada_dueno = p_id_entidad)
    ORDER BY p.id
  LOOP
    UPDATE propiedades 
    SET clabe_stp_tmp_apartado = crear_referencia_bancaria(r.id_entidad_relacionada_dueno)
    WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
```

## Validación post-aplicación
```sql
SELECT COUNT(*) FROM propiedades 
WHERE id_entidad_relacionada_dueno = 3411
  AND clabe_stp_tmp_apartado LIKE '%_TMP';
-- Esperado: 0
```

## Recomendación n8n (manual, fuera del codebase)
Reemplazar en el workflow `carga-masiva-propiedades` el bloque `Identifico propiedades insertadas → loop → Actualiza clabes STP (LIMIT 1)` por un solo nodo Postgres con:
```sql
SELECT regenerar_clabes_faltantes();
```
Esto elimina la fragilidad y garantiza que ningún `_TMP` quede sin reemplazar en futuras cargas.

