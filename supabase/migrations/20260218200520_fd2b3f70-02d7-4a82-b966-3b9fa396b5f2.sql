
-- =============================================
-- CTA Event Tracking
-- =============================================
CREATE TABLE public.cta_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id TEXT,
  user_email TEXT NOT NULL,
  auth_user_id UUID,
  page TEXT NOT NULL,
  element_id TEXT NOT NULL,
  element_label TEXT,
  element_type TEXT DEFAULT 'button',
  metadata JSONB DEFAULT '{}',
  ab_test_id INT,
  ab_variant TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cta_events_page ON public.cta_events(page);
CREATE INDEX idx_cta_events_element ON public.cta_events(element_id);
CREATE INDEX idx_cta_events_created ON public.cta_events(created_at);
CREATE INDEX idx_cta_events_ab ON public.cta_events(ab_test_id, ab_variant);

ALTER TABLE public.cta_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own CTA events"
ON public.cta_events FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'email' = user_email);

CREATE POLICY "Super admin can read CTA events"
ON public.cta_events FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.rol_id = 1
  )
);

-- =============================================
-- A/B Tests
-- =============================================
CREATE TABLE public.ab_tests (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  pagina TEXT NOT NULL,
  variantes JSONB NOT NULL DEFAULT '["A","B"]',
  porcentaje_distribucion JSONB DEFAULT '{"A":50,"B":50}',
  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_fin TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage AB tests"
ON public.ab_tests FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.rol_id = 1
  )
);

CREATE POLICY "Authenticated can read active AB tests"
ON public.ab_tests FOR SELECT TO authenticated
USING (activo = true);

-- =============================================
-- A/B Test User Assignments
-- =============================================
CREATE TABLE public.ab_test_assignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ab_test_id INT NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  variante TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ab_test_id, auth_user_id)
);

CREATE INDEX idx_ab_assignments_test ON public.ab_test_assignments(ab_test_id);
CREATE INDEX idx_ab_assignments_user ON public.ab_test_assignments(auth_user_id);

ALTER TABLE public.ab_test_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own AB assignment"
ON public.ab_test_assignments FOR SELECT TO authenticated
USING (auth_user_id = auth.uid());

CREATE POLICY "Users can insert own AB assignment"
ON public.ab_test_assignments FOR INSERT TO authenticated
WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Super admin can read all AB assignments"
ON public.ab_test_assignments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.rol_id = 1
  )
);

CREATE POLICY "Super admin can manage AB assignments"
ON public.ab_test_assignments FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.rol_id = 1
  )
);
