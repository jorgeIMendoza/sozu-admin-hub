-- Corrección de propiedades de Bottura que están en Escrituración (7)
-- pero tienen saldo pendiente significativo. Deben estar en Vendido (5).
--
-- Propiedades afectadas con sus saldos pendientes:
-- 4768 (1004): $1,272,882.60
-- 4769 (1005): $1,272,882.60
-- 4799 (1207): $1,918,076.66
-- 4811 (1305): $2,293,506.46
-- 4829 (1409): $1,650,726.65
-- 4701 (507):  $2,054,688.74
-- 4715 (607):  $2,067,731.60
-- 4745 (809):  $1,332,627.72
-- 4760 (910):  $1,359,635.35
--
-- Causa: El trigger actualizar_estatus_a_escrituracion cambió el estatus
-- sin verificar que la cuenta estuviera realmente pagada.

UPDATE propiedades
SET 
  id_estatus_disponibilidad = 5,  -- Vendido
  fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id IN (4768, 4769, 4799, 4811, 4829, 4701, 4715, 4745, 4760)
  AND id_estatus_disponibilidad = 7;  -- Solo las que están en Escrituración