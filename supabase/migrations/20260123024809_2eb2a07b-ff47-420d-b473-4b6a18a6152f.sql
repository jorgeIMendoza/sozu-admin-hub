-- Actualizar URLs del pago con la ubicación correcta en el bucket ceps
UPDATE pagos 
SET url_cep = 'https://tzmhgfjmddkfyffkkmto.supabase.co/storage/v1/object/public/ceps/CEP-20240410-HSBC086392.pdf',
    url_recibo = 'https://tzmhgfjmddkfyffkkmto.supabase.co/storage/v1/object/public/ceps/CEP-20240410-HSBC086392.pdf',
    fecha_actualizacion = CURRENT_TIMESTAMP
WHERE id = 1432 AND clave_rastreo = 'HSBC086392';