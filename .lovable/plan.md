

# Plan: Asignacion Alternada A/B + Variante Ganadora

## Cambio en la logica de asignacion

Reemplazar el `Math.random()` actual en `useAbTest.ts` con una logica de alternancia simple:

1. Consultar el ultimo registro en `ab_test_assignments` para ese `ab_test_id`, ordenado por `created_at DESC`
2. Si el ultimo fue "A", asignar "B". Si fue "B", asignar "A". Si no hay registros, asignar "A".
3. Insertar el nuevo registro como ya se hace actualmente.

Esto permite que:
- La distribucion sea naturalmente 50/50
- Se pueda corregir manualmente desde la BD si se necesita (cambiar la variante de un usuario)
- El usuario siempre ve lo mismo una vez asignado (ya funciona asi, se consulta primero si ya tiene asignacion)

## Variante ganadora

Agregar columna `variante_ganadora` a `ab_tests` para que cuando un test se desactive, todos vean la variante ganadora.

### Cambios en base de datos
- `ALTER TABLE ab_tests ADD COLUMN variante_ganadora TEXT DEFAULT NULL`

### Logica en useAbTest.ts

```text
Usuario visita pagina con test configurado
  |
  +-- Test ACTIVO?
  |     +-- Ya tiene asignacion? -> devolver su variante
  |     +-- No tiene? -> ver ultimo registro, asignar el opuesto, insertar
  |
  +-- Test INACTIVO + variante_ganadora definida?
  |     +-- Devolver variante_ganadora (todos ven lo mismo)
  |
  +-- No hay test o inactivo sin ganadora?
        +-- Devolver "A"
```

### Cambios en ABTests.tsx (panel admin)

- Al hacer clic en "Finalizar", mostrar un dialogo preguntando cual variante gano (A o B)
- Guardar `variante_ganadora` y `activo = false`
- Mostrar badge de variante ganadora en tests finalizados
- Permitir editar la ganadora en tests finalizados

## Archivos a modificar

1. **`src/hooks/useAbTest.ts`** -- cambiar random por alternancia, agregar logica de ganadora
2. **`src/pages/admin/ABTests.tsx`** -- dialogo de seleccion de ganadora al finalizar, badge
3. **Migracion SQL** -- agregar columna `variante_ganadora`

