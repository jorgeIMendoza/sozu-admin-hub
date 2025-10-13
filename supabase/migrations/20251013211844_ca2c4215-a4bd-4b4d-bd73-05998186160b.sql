-- Eliminar el trigger que ejecuta ajustar_ultimo_acuerdo_pago en INSERT
-- Este trigger causa errores al crear acuerdos de pago iniciales con montos en 0
-- La función solo debe ejecutarse en UPDATE (cuando se edita manualmente un monto)

DROP TRIGGER IF EXISTS trigger_ajustar_acuerdo_insert ON public.acuerdos_pago;

-- El trigger trigger_ajustar_acuerdo_update permanece activo para ajustes manuales