-- Enable RLS on personas table and create policy for public access
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to personas" 
ON public.personas 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Enable RLS on entidades_relacionadas table and create policy for public access
ALTER TABLE public.entidades_relacionadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to entidades_relacionadas" 
ON public.entidades_relacionadas 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Enable RLS on tipos_entidad table and create policy for public access
ALTER TABLE public.tipos_entidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to tipos_entidad" 
ON public.tipos_entidad 
FOR ALL 
USING (true) 
WITH CHECK (true);