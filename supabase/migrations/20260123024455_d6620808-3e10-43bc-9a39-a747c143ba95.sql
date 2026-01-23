-- Actualizar la URL para que apunte al bucket documentos de Supabase
UPDATE pagos 
SET url_cep = 'https://tzmhgfjmddkfyffkkmto.supabase.co/storage/v1/object/public/documentos/cep_20240410_HSBC086392.pdf',
    url_recibo = 'https://tzmhgfjmddkfyffkkmto.supabase.co/storage/v1/object/public/documentos/cep_20240410_HSBC086392.pdf',
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id = 1432 AND clave_rastreo = 'HSBC086392';