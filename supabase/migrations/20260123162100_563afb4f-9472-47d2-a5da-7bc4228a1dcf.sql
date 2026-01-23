-- Drop all old versions of the function
DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas(integer, integer, text, text, text, text, text, text, text, integer[], text[], boolean, integer[], integer[]);
DROP FUNCTION IF EXISTS get_cuentas_cobranza_paginadas(integer, integer, text, text, text, text, text, text, text, integer[], text[], boolean, integer[], integer[], text);

-- The remaining correct version with bigint[] for p_dueno_entity_ids is already in place