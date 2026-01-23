
# Plan: Mostrar botón SAT para propiedades con estatus 7, 8 y 9

## Problema actual

El botón SAT solo aparece cuando `id_estatus_disponibilidad === 9` (Pagada completamente). Sin embargo, también debe mostrarse para:

| ID | Estatus |
|----|---------|
| 7 | Escriturada |
| 8 | Entregado |
| 9 | Pagada completamente |

## Solución

Cambiar la condición de igualdad estricta por una verificación de inclusión en array.

## Archivo a modificar

`src/pages/admin/Pagos.tsx` - línea 1784

## Cambio específico

```typescript
// Antes (línea 1783-1784)
{/* SAT Notification Button - Only for Propiedad with estatus 9 */}
{cuenta.tipo === 'Propiedad' && cuenta.id_estatus_disponibilidad === 9 && (

// Después
{/* SAT Notification Button - For Propiedad with estatus 7, 8, or 9 */}
{cuenta.tipo === 'Propiedad' && [7, 8, 9].includes(cuenta.id_estatus_disponibilidad) && (
```

## Resultado esperado

- La cuenta 207 (estatus 8 - Entregado) mostrará el botón SAT
- Todas las propiedades con estatus Escriturada (7), Entregado (8) o Pagada completamente (9) tendrán acceso al botón de notificación SAT
