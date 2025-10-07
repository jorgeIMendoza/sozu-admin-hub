-- Agregar campos relacionados con escritura y notaría a cuentas_cobranza
ALTER TABLE cuentas_cobranza
ADD COLUMN clave_catastral TEXT,
ADD COLUMN numero_escritura TEXT,
ADD COLUMN libro TEXT,
ADD COLUMN hoja TEXT,
ADD COLUMN fecha_escritura DATE,
ADD COLUMN numero_unidad_privativa TEXT;