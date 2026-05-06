## Rollback de cuenta de cobranza 1760 (Daiku 104)

Datos confirmados en DB:
- **cuenta_cobranza id=1760**, oferta=2271, CLABE STP=`646180287400133674`, propiedad=5189 (Daiku #104)
- **propiedad 5189**: estatus actual = 4 (Apartado), `clabe_stp_tmp_apartado` = NULL
- **pago id=21654** (clave_rastreo `2025120440014TRAPP0004381420052`, $20,000)
- **aplicación id=46985** (vincula pago 21654 → acuerdo 26568)
- **43 acuerdos_pago** (ids 26568–26610)
- **CEP** en `tabla_datos_cep` con claverastreo coincidente
- **compradores**: 1 registro con id_cuenta_cobranza=1760
- Sin registros en multas / reservas / documentos / residentes / comisionistas

### Pasos (migración SQL en orden, transacción única)

1. `DELETE FROM aplicaciones_pago WHERE id = 46985;`
2. `DELETE FROM tabla_datos_cep WHERE claverastreo = '2025120440014TRAPP0004381420052';`
3. `DELETE FROM pagos WHERE id = 21654;`
4. `DELETE FROM compradores WHERE id_cuenta_cobranza = 1760;` (registro auxiliar creado al generar la cuenta)
5. `DELETE FROM acuerdos_pago WHERE id_cuenta_cobranza = 1760;` (43 filas)
6. `DELETE FROM cuentas_cobranza WHERE id = 1760;`
7. `UPDATE propiedades SET id_estatus_disponibilidad = 2, clabe_stp_tmp_apartado = '646180287400133674' WHERE id = 5189;` (Disponible + recicla la CLABE)

### Verificación post-rollback

Ejecutar SELECTs para confirmar:
- `cuentas_cobranza` id=1760 → 0 filas
- `pagos` id=21654 → 0 filas
- `aplicaciones_pago` id=46985 → 0 filas
- `acuerdos_pago` id_cuenta_cobranza=1760 → 0 filas
- `tabla_datos_cep` claverastreo=... → 0 filas
- `compradores` id_cuenta_cobranza=1760 → 0 filas
- `propiedades` id=5189 → estatus=2, clabe_stp_tmp_apartado=`646180287400133674`
- Confirmar que existen ofertas activas para id_propiedad=5189 (44 ofertas históricas; podrán generarse nuevas y al cerrarse se podrá crear una nueva cuenta de cobranza)

### Notas
- Las 43 ofertas históricas restantes en propiedad 5189 (incluida la 2271 que ya no tendrá cuenta) permanecen `activo=true`. Ninguna tiene `clabe_stp_tmp_producto` seteada, así que no hay CLABEs huérfanas que limpiar a nivel oferta.
- La CLABE `646180287400133674` queda lista en `clabe_stp_tmp_apartado` para reciclarse en el siguiente apartado/oferta de la propiedad.
- Operación realizada vía migración (DELETE/UPDATE requieren migración, no insert tool).
