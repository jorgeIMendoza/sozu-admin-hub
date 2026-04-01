

# Fix: No mostrar plano arquitectónico genérico cuando la unidad no tiene uno configurado

## Problema
Cuando una propiedad (ej. 703 de Botura) no tiene un plano arquitectónico específico asignado en `modelos_planos_arquitectonicos`, el sistema muestra el plano genérico del modelo (`modelos.plano_arquitectonico`) como fallback. Esto es incorrecto — si existen planos configurados para ese nivel pero ninguno incluye la unidad, significa que esa unidad simplemente no está configurada y no se debe mostrar ningún plano.

## Solución
Modificar la lógica de fallback en **2 archivos**:

### 1. `src/hooks/useClientePropiedadDetalle.ts` (línea 222-241)
- Cambiar el valor inicial de `planoArqUrl` de `planoArquitectonico` a `null`
- Solo usar el plano genérico del modelo si NO existen entradas en `modelos_planos_arquitectonicos` para ese nivel
- Si existen entradas pero ninguna coincide con el depto → dejar `null`
- Si no hay `emId`, `numeroPiso` o `numeroDepa` → usar el genérico como fallback

### 2. `src/components/admin/agent-portal/PropertyFloorPlanButton.tsx`
- Aplicar la misma lógica corregida de fallback

## Detalle técnico
```
Antes:  planoArqUrl = planoArquitectonico (siempre fallback al genérico)
Después: planoArqUrl = null (solo se asigna si hay match específico O si no hay planos configurados para el nivel)
```

La UI del portal del cliente (`ClienteDetallesTecnicos.tsx`) ya maneja `planoArquitectonico === null` mostrando un placeholder con ícono y texto "Plano arquitectónico del modelo", así que no requiere cambios.

