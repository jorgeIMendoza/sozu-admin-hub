
-- Insertar submenú para Mediciones CTA bajo Configuraciones/Logs (menu_id 13)
INSERT INTO public.submenus (nombre, vista_front_end, menu_id, orden, activo, solo_usuarioa)
VALUES 
  ('Mediciones CTA', '/admin/mediciones-cta', 13, 8, true, true),
  ('A/B Tests', '/admin/ab-tests', 13, 9, true, true);
