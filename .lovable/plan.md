## Plan completado: Reestructurar onboarding del Portal de Agente

### Reglas de negocio implementadas

| Nivel | Requisito | Qué desbloquea |
|-------|-----------|-----------------|
| 0 | Ninguno | Ver inventario |
| 1 | Capacitación completada | Generar oferta **sin** sección STP |
| 2 | Capacitación + Info básica completa (identidad) | Generar oferta **con** sección STP |
| 3 | Identidad + Fiscal + Cuenta bancaria | Ver comisiones |
| Firma | Info básica + documentos obligatorios completos | Habilitar firma carta cumplimiento |

### Cambios realizados

| Archivo | Detalle |
|---------|---------|
| `useAgentOnboardingStatus.ts` | Nuevos campos: `hasTrainingComplete`, `hasBasicIdentityComplete`, `canAccessComisiones`, `missingForComisiones` |
| `AgentUnidadesProyecto.tsx` | Botón oferta bloqueado sin capacitación; `hideBankingInPdf` basado en identidad |
| `AgentProyectoDetalle.tsx` | CTA "Generar oferta" bloqueado sin capacitación |
| `AgentPipeline.tsx` | "Nueva oferta" bloqueado sin capacitación |
| `AgentComisiones.tsx` | Usa `canAccessComisiones` (Identidad + Fiscal + Banco) |
| `AgentOnboardingStepDialog.tsx` | Firma carta bloqueada si identidad incompleta |
| `AgentInicio.tsx` | Mensajes diferenciados según nivel de progreso |
