-- Primero, subir el archivo CEP al storage de Supabase
-- Como no podemos subir archivos binarios directamente via SQL,
-- vamos a actualizar el registro del pago con la URL correcta del storage
-- El archivo se subirá manualmente al bucket 'documentos'

-- Actualizar el pago HSBC086392 con la URL del CEP
-- La URL será: https://tzmhgfjmddkfyffkkmto.supabase.co/storage/v1/object/public/documentos/cep_20240410_HSBC086392.pdf

UPDATE pagos 
SET url_cep = 'https://tzmhgfjmddkfyffkkmto.supabase.co/storage/v1/object/public/documentos/cep_20240410_HSBC086392.pdf',
    url_recibo = 'https://tzmhgfjmddkfyffkkmto.supabase.co/storage/v1/object/public/documentos/cep_20240410_HSBC086392.pdf',
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id = 1432 AND clave_rastreo = 'HSBC086392';