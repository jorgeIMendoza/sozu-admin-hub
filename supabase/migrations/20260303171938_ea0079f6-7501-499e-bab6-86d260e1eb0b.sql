
-- 1. Create new cartas_acuerdo table
CREATE TABLE public.cartas_acuerdo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  contenido_html TEXT NOT NULL DEFAULT '',
  firmantes_config JSONB DEFAULT '[]'::jsonb,
  requiere_validacion_biometrica BOOLEAN DEFAULT false,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

-- 2. Enable RLS
ALTER TABLE public.cartas_acuerdo ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
CREATE POLICY "Authenticated users can read cartas_acuerdo"
  ON public.cartas_acuerdo FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert cartas_acuerdo"
  ON public.cartas_acuerdo FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update cartas_acuerdo"
  ON public.cartas_acuerdo FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 4. Migrate existing data from carta_acuerdos_template
INSERT INTO public.cartas_acuerdo (nombre, contenido_html, firmantes_config, updated_by, updated_at)
SELECT 
  'Carta de Cumplimiento',
  COALESCE(cat.contenido_html, ''),
  COALESCE(cat.firmantes_config, '[]'::jsonb),
  cat.updated_by,
  cat.updated_at
FROM public.carta_acuerdos_template AS cat
ORDER BY cat.id
LIMIT 1;

-- 5. Add carta_acuerdo_id to firmas_digitales
ALTER TABLE public.firmas_digitales 
  ADD COLUMN IF NOT EXISTS carta_acuerdo_id UUID REFERENCES public.cartas_acuerdo(id);
