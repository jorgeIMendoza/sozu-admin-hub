
CREATE TABLE public.notificaciones_configuracion (
  id SERIAL PRIMARY KEY,
  tipo_evento TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  canal TEXT NOT NULL DEFAULT 'email' CHECK (canal IN ('email', 'whatsapp', 'ambos')),
  roles_destino INTEGER[] NOT NULL DEFAULT '{1,3,9}',
  activo BOOLEAN NOT NULL DEFAULT true,
  requiere_acceso_proyecto BOOLEAN NOT NULL DEFAULT true,
  asunto_email TEXT NOT NULL DEFAULT '',
  plantilla_wa TEXT NOT NULL DEFAULT '',
  plantilla_email_detalles TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notificaciones_configuracion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read notification config"
  ON public.notificaciones_configuracion
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage notification config"
  ON public.notificaciones_configuracion
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert initial event configs
INSERT INTO public.notificaciones_configuracion (tipo_evento, descripcion, canal, roles_destino, activo, requiere_acceso_proyecto, asunto_email, plantilla_wa, plantilla_email_detalles)
VALUES
  ('precio_actualizado', 'Se dispara cuando se actualiza precios vía carga masiva', 'ambos', '{1,3,9}', true, true,
   'Actualización de precios en {nombre_desarrollo}',
   '📢 *Actualización de Precios*\n\nSe han actualizado los precios en *{nombre_desarrollo}*.\n\nRevisa los cambios en el sistema.',
   '<p>Se han actualizado los precios del desarrollo <strong>{nombre_desarrollo}</strong>.</p><p>Ingresa al sistema para revisar los cambios.</p>'),
  ('nuevo_esquema_pago', 'Se dispara cuando se crea un nuevo esquema de pago', 'ambos', '{1,3,9}', true, true,
   'Nuevo esquema de pago en {nombre_desarrollo}: {nombre_esquema}',
   '📋 *Nuevo Esquema de Pago*\n\nSe ha creado el esquema *{nombre_esquema}* en *{nombre_desarrollo}*.',
   '<p>Se ha creado un nuevo esquema de pago <strong>{nombre_esquema}</strong> en el desarrollo <strong>{nombre_desarrollo}</strong>.</p>');
