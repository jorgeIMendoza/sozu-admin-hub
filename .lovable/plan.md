
# Agentes con inmobiliaria = Verificado

## Cambio
Modificar `useAgentOnboardingStatus` para que, si el agente (personaId) tiene una inmobiliaria relacionada en la tabla `entidades_relacionadas` (tipo 19, activo), retorne automaticamente `percentage: 100` y todos los pasos como completos.

## Archivo a modificar
**`src/hooks/useAgentOnboardingStatus.ts`**

1. Agregar un query para buscar si el agente tiene una inmobiliaria:
   - Consultar `entidades_relacionadas` donde `id_persona = personaId`, `id_tipo_entidad = 19`, `activo = true`, y `id_persona_duena_lead IS NOT NULL`
2. Si existe al menos un registro, retornar todos los steps como completos (percentage = 100) sin evaluar los demas datos
3. Si no tiene inmobiliaria, continuar con la logica actual de validacion paso a paso

## Efecto
- En el header del portal, mostrara "Verificado" en verde
- El widget de onboarding mostrara "Perfil completo"
- No se bloqueara el acceso a comisiones
- Los agentes sin inmobiliaria siguen con el flujo normal de verificacion
