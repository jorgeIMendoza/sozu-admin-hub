-- 1) Fix dashboard compatibility: add missing id_propiedad on cuentas_cobranza
ALTER TABLE public.cuentas_cobranza
ADD COLUMN IF NOT EXISTS id_propiedad INTEGER;

-- Backfill id_propiedad from ofertas.id_propiedad using id_oferta
UPDATE public.cuentas_cobranza cc
SET id_propiedad = o.id_propiedad,
    fecha_actualizacion = NOW()
FROM public.ofertas o
WHERE cc.id_oferta = o.id
  AND (cc.id_propiedad IS DISTINCT FROM o.id_propiedad);

-- Optional performance index for dashboard/property-based reads
CREATE INDEX IF NOT EXISTS idx_cuentas_cobranza_id_propiedad
ON public.cuentas_cobranza (id_propiedad);

-- 2) Assign all public Sozu projects to independent agents (rol 3 without active inmobiliaria relation)
WITH sozu_inmob AS (
  SELECT er.id_persona
  FROM public.entidades_relacionadas er
  JOIN public.personas p ON p.id = er.id_persona
  WHERE er.id_tipo_entidad = 5
    AND er.activo = true
    AND (
      LOWER(COALESCE(p.nombre_legal, '')) LIKE '%real estate ventures%'
      OR LOWER(COALESCE(p.nombre_comercial, '')) LIKE '%sozu%'
    )
  ORDER BY er.id
  LIMIT 1
),
sozu_public_projects AS (
  SELECT DISTINCT p.id AS proyecto_id, er.id AS owner_er_id
  FROM public.proyectos p
  JOIN public.entidades_relacionadas er
    ON er.id_proyecto = p.id
   AND er.id_tipo_entidad = 5
   AND er.activo = true
  JOIN sozu_inmob si
    ON si.id_persona = er.id_persona
  WHERE p.activo = true
    AND p.publicar = true
),
independent_agents AS (
  SELECT DISTINCT u.email
  FROM public.usuarios u
  WHERE u.activo = true
    AND u.rol_id = 3
    AND u.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.entidades_relacionadas er
      WHERE er.id_tipo_entidad = 19
        AND er.activo = true
        AND er.id_persona = u.id_persona
        AND er.id_persona_duena_lead IS NOT NULL
    )
)
INSERT INTO public.proyectos_acceso (usuario_id, proyecto_id, id_entidad_relacionada_dueno, activo)
SELECT ia.email, spp.proyecto_id, spp.owner_er_id, true
FROM independent_agents ia
CROSS JOIN sozu_public_projects spp
ON CONFLICT (usuario_id, proyecto_id)
DO UPDATE
SET activo = true,
    id_entidad_relacionada_dueno = EXCLUDED.id_entidad_relacionada_dueno,
    fecha_actualizacion = NOW();