
## Plan: Mostrar el número de correos a enviar en el diálogo de confirmación

### Análisis Actual
- La página `EnviarAvisos.tsx` carga una lista de avisos activos desde la tabla `avisos`
- El diálogo de confirmación (línea 160) muestra "a todos los destinatarios configurados" sin número específico
- Los destinatarios están almacenados en `avisos_roles_destinatarios.correos` (campo JSONB)
- La edge function `enviar-aviso-bulk` calcula el total en tiempo de envío

### Solución Propuesta

**1. Extender el tipo `Aviso` y la consulta inicial**
   - Agregar un campo `destinatarios_count: number | null` al interfaz `Aviso`
   - Modificar la consulta `fetchAvisos` para obtener también `avisos_roles_destinatarios` relacionados
   - Calcular el total de destinatarios únicos desde el campo `correos` JSONB

**2. Crear una función auxiliar para contar destinatarios**
   - Función que reciba los datos de `avisos_roles_destinatarios` 
   - Extraiga emails únicos del campo `correos` (siguiendo la misma lógica que la edge function)
   - Retorne el conteo

**3. Actualizar el diálogo de confirmación**
   - Mostrar el número exacto: "¿Enviar a {N} destinatarios?" 
   - Incluir un fallback para avisos sin destinatarios configurados
   - Mostrar un aviso si no hay destinatarios (desactivar botón de envío)

**4. Mejorar la experiencia de carga**
   - Mostrar un skeleton/placeholder mientras se calcula el conteo
   - Los datos se cargan con la página inicial, sin peticiones adicionales

### Cambios Técnicos
- **Archivo**: `src/pages/admin/comunicacion/EnviarAvisos.tsx`
  - Extender interfaz `Aviso` con `destinatarios_count`
  - Modificar `fetchAvisos()` para hacer una consulta JOINada con `avisos_roles_destinatarios`
  - Agregar función `extractDestinatariosCount()` que parsee el JSONB
  - Actualizar el diálogo de confirmación para mostrar el número
  - Agregar validación: mostrar alerta si el aviso no tiene destinatarios

### Flujo de Datos
```
1. fetchAvisos() → Query avisos + avisos_roles_destinatarios
2. Para cada aviso, extrae destinatarios del campo correos
3. Cuenta emails únicos y guarda en estado
4. Al hacer clic en "Enviar", muestra diálogo con el número exacto
5. Usuario confirma y se ejecuta enviar-aviso-bulk
```

### Edge Cases
- Avisos sin roles/destinatarios configurados → mostrar 0 y desactivar botón
- Cambios en destinatarios entre refresh → Los datos son estáticos por página load
- Múltiples roles con mismo email → Sistema de deduplicación ya implementado en edge function

