
## Columnas colapsables en Workflow de Ofertas

### Comportamiento deseado
- Todas las columnas del Kanban pueden contraerse/expandirse manualmente
- **Expiradas**: contraida por defecto (ya funciona asi parcialmente)
- **Columnas vacias** (0 ofertas): contraidas automaticamente
- **Columnas con ofertas**: expandidas automaticamente
- Al hacer clic en una columna contraida, se expande y viceversa

### Cambios tecnicos

**Archivo**: `src/pages/admin/crm/WorkflowOfertas.tsx`

1. **Reemplazar `showExpiradas` por un estado de conjunto** (`collapsedStages: Set<string>`) que rastree cuales columnas estan contraidas
2. **Inicializar el estado** despues de cargar ofertas:
   - "expiradas" siempre inicia contraida
   - Columnas con 0 ofertas inician contraidas
   - Columnas con ofertas inician expandidas
3. **Actualizar automaticamente** cuando cambian las ofertas (via `useEffect` sobre `ofertasByStage`): si una columna pasa de 0 a tener ofertas, se expande; si pasa a 0, se contrae (excepto si el usuario la expandio manualmente)
4. **Vista contraida**: mostrar un boton vertical angosto (similar al actual de "expiradas") con el nombre de la etapa rotado y el conteo, usando el color de la etapa
5. **Boton de toggle** en el header de cada columna expandida para poder contraerla manualmente (icono ChevronLeft o similar)

### Resultado visual
- Columnas contraidas: boton vertical delgado con nombre rotado, badge de conteo y color de la etapa
- Columnas expandidas: igual que ahora pero con un boton para contraer en el header
- Transicion fluida al expandir/contraer
