
ALTER TABLE citas_capacitacion
  ADD COLUMN id_configuracion_cita INTEGER REFERENCES configuracion_citas_usuarios(id) ON DELETE SET NULL;
