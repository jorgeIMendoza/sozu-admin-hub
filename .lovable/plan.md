

## Problema identificado

El aviso `Recordatorio de pago 3 dia antes` (id 5) tiene:
- 6 acuerdos elegibles hoy con offset -2 (clientes reales: Abraham, Edgar, José Ramón ×2, Luis Gabriel, Ricardo).
- 390 correos cargados manualmente en `avisos_roles_destinatarios.correos.destinatarios` (padrón completo de clientes).

La lógica actual en `evaluar-triggers-evento` aplica los manuales como destinatarios que **REEMPLAZAN al cliente real** y los itera **por cada acuerdo encontrado**. Resultado:
- Personalizado prendido: 6 acuerdos × 390 manuales = **hasta 2,340 envíos** (cada cliente del padrón recibe el recordatorio de los 6 acuerdos ajenos).
- Personalizado apagado: 6 acuerdos × 1 payload consolidado, cada uno a la lista CSV de 390 correos = los 390 reciben el mensaje 6 veces.

Esto es lo que estás viendo en producción.

## Comportamiento correcto esperado

Cuando un aviso de evento (acuerdo de pago) tiene una lista manual de destinatarios cargada:
- la lista manual debe tratarse como **filtro/whitelist por email del cliente real**, no como reemplazo;
- si el aviso aplica a 6 acuerdos, deben salir **6 envíos** dirigidos al email del cliente real de cada acuerdo, siempre que ese email esté presente en la lista manual cargada;
- si el aviso no tiene lista manual, debe seguir disparándose al email del cliente real de cada acuerdo (comportamiento actual ya correcto).

Adicionalmente:
- los nombre/teléfono/etc del manual se usan **solo como override** cuando el email manual coincide con el del acuerdo (por ejemplo si el manual trae teléfono y el cliente real no lo tiene en `personas`);
- el modo `personalizado` sigue controlando si el render es individual con `{{nombre}}`, `{{monto}}`, etc. (que ya es el caso porque el universo final es 1 cliente real por acuerdo).

## Cambios

### `supabase/functions/evaluar-triggers-evento/index.ts`
1. Cambiar la semántica de `manualEmails`:
   - dejar de tratarlos como "reemplazan al cliente real";
   - construir un `Map<emailLower, { nombre, telefono }>` (`manualOverridesByEmail`) y un `Set<emailLower>` (`manualEmailsSet`).
2. En el loop por acuerdo (`for (const ac of rowsFilteredByProject)`):
   - calcular `emailReal` del cliente del acuerdo;
   - si hay lista manual y `emailReal` no está en `manualEmailsSet`, saltar el acuerdo (con log y motivo "cliente del acuerdo no está en la lista manual");
   - si está, tomar nombre/teléfono del manual cuando exista; si no, usar los del cliente real.
3. Eliminar el bloque `if (manualEmails.length > 0) { ... }` que iteraba `manualEmails` por acuerdo (líneas 564–724) y la ruta `manualAccum` consolidada que envía a todos los manuales (líneas 887+).
4. Mantener el resto del flujo (un envío por acuerdo, idempotencia por `acuerdo:{id}:offset:{n}`, modo personalizado para render por acuerdo, ventana de tolerancia, omitidos por reenvío automático).
5. Actualizar el log: en vez de `"X destinatario(s) manual(es) → REEMPLAZAN al cliente real"`, escribir `"X correo(s) manual(es) cargados → operan como whitelist sobre el email del cliente del acuerdo"`.

### `supabase/functions/enviar-aviso-bulk/index.ts`
Aplicar la misma corrección al envío manual desde "Enviar Avisos" cuando el aviso es de evento: la lista cargada actúa como whitelist sobre el cliente real del acuerdo, no como universo independiente.

### UI `src/pages/admin/comunicacion/AdministrarAvisos.tsx`
- Añadir un texto de ayuda corto debajo de la sección de "Destinatarios" del aviso que aclare:
  - "La lista manual funciona como whitelist sobre el email del cliente real del acuerdo. Si la dejas vacía, se notifica a todos los clientes que cumplan la condición del trigger."
- Sin cambios funcionales adicionales.

### Sin cambios de base de datos
No se requiere migración; la información necesaria ya está en `avisos_roles_destinatarios.correos.destinatarios` y `personas.email`.

## Resultado esperado tras el fix

Para el aviso 5 ejecutado hoy (con offset -2 → fecha objetivo 2026-04-25):
- 6 acuerdos elegibles;
- emails reales: `elabrahamql@gmail.com`, `egrizo@hotmail.com`, `ing.escobar.mtz@gmail.com` (×2 acuerdos), `importacioneschavez@hotmail.com`, `doc_lyn@hotmail.com`;
- los 5 emails únicos están dentro de los 390 manuales cargados;
- saldrán **6 envíos personalizados, uno por acuerdo, al cliente real correspondiente** (uno de ellos repetido al mismo email pero por dos acuerdos distintos del mismo cliente, lo cual es correcto y queda diferenciado por `clave_entidad`).

## Validación posterior

1. Forzar una corrida del trigger 47 a una hora controlada y verificar en `avisos_envios_evento` que se crean exactamente 6 filas, una por acuerdo, cada una al email del cliente real.
2. Confirmar en logs que aparece `"6 correo(s) manual(es) cargados → whitelist"` y que no se itera 390×6.
3. Crear un acuerdo de prueba cuyo email NO esté en la lista manual y verificar que se omite con motivo "cliente fuera de whitelist".
4. Quitar la lista manual del aviso y verificar que se siguen mandando 6 envíos a los 6 clientes reales.

