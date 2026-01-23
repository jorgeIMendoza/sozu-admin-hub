-- Eliminar trigger anterior
DROP TRIGGER IF EXISTS on_document_insert_sat ON public.documentos;

-- Actualizar función para manejar INSERT y UPDATE
CREATE OR REPLACE FUNCTION public.trigger_document_insert_sat()
RETURNS TRIGGER AS $$
DECLARE
  v_cuenta_id INTEGER;
BEGIN
  -- Solo procesar documentos relevantes (constancia fiscal o facturas)
  IF NEW.id_tipo_documento NOT IN (6, 21, 22) THEN
    RETURN NEW;
  END IF;
  
  -- Para UPDATE, solo procesar si cambió algo relevante
  IF TG_OP = 'UPDATE' THEN
    -- Ignorar si no cambió nada importante
    IF OLD.id_persona = NEW.id_persona 
       AND OLD.id_estatus_verificacion = NEW.id_estatus_verificacion 
       AND OLD.activo = NEW.activo 
       AND OLD.id_cuenta_cobranza = NEW.id_cuenta_cobranza THEN
      RETURN NEW;
    END IF;
  END IF;
  
  -- Solo procesar si el documento está activo
  IF NEW.activo = false THEN
    RETURN NEW;
  END IF;
  
  -- Determinar la cuenta de cobranza
  IF NEW.id_cuenta_cobranza IS NOT NULL THEN
    v_cuenta_id := NEW.id_cuenta_cobranza;
  ELSIF NEW.id_persona IS NOT NULL THEN
    -- Buscar cuenta del comprador por persona
    SELECT c.id_cuenta_cobranza INTO v_cuenta_id
    FROM public.compradores c
    WHERE c.id_persona = NEW.id_persona AND c.activo = true
    LIMIT 1;
  END IF;
  
  IF v_cuenta_id IS NOT NULL THEN
    PERFORM public.check_sat_notification_conditions(v_cuenta_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Crear nuevo trigger para INSERT y UPDATE
CREATE TRIGGER on_document_insert_or_update_sat
  AFTER INSERT OR UPDATE ON public.documentos
  FOR EACH ROW
  WHEN (NEW.id_tipo_documento IN (6, 21, 22))
  EXECUTE FUNCTION public.trigger_document_insert_sat();