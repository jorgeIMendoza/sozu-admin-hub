BEGIN;
DELETE FROM aplicaciones_pago WHERE id = 46985;
DELETE FROM tabla_datos_cep WHERE claverastreo = '2025120440014TRAPP0004381420052';
DELETE FROM pagos WHERE id = 21654;
DELETE FROM compradores WHERE id_cuenta_cobranza = 1760;
DELETE FROM acuerdos_pago WHERE id_cuenta_cobranza = 1760;
DELETE FROM cuentas_cobranza WHERE id = 1760;
UPDATE propiedades SET id_estatus_disponibilidad = 2, clabe_stp_tmp_apartado = '646180287400133674' WHERE id = 5189;
COMMIT;