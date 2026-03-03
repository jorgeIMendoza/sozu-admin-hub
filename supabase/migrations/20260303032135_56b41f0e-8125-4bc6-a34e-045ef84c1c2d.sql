ALTER TABLE carta_acuerdos_template
ADD COLUMN IF NOT EXISTS firmantes_config JSONB DEFAULT '[]'::jsonb;