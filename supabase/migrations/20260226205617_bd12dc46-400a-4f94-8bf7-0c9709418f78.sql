INSERT INTO tipos_documento (id, nombre, activo, id_categoria_documento)
VALUES (49, 'Selfie de verificación', true, 1)
ON CONFLICT (id) DO NOTHING;