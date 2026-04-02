

# Plan: Agregar soporte de tramos escalonados a esquemas de pago precargados

## Contexto

Actualmente, la opción de "montos escalonados" (tramos de mensualidades con diferentes montos) solo existe en el formulario de ofertas manuales (`NewOfferDialog`). Sin embargo, la tabla `esquemas_pago` ya tiene la columna `tramos_mensualidad` (JSON), por lo que no se requieren cambios de base de datos. Solo falta agregar la UI y la lógica de guardado en los formularios de esquemas de pago del proyecto.

## Cambios propuestos

### 1. Agregar tramos escalonados al formulario de CREAR esquema
**Archivo**: `src/components/admin/NewPaymentSchemeDialog.tsx`

- Agregar un Switch "Usar montos escalonados" que aparezca cuando `porcentaje_mensualidades > 0` y `numero_mensualidades > 0`.
- Permitir hasta 3 tramos, cada uno con: numero de mensualidades y monto (en centavos, usando un input numérico simple ya que no hay precio base para calcular).
- Validar que la suma de mensualidades de los tramos sea igual al `numero_mensualidades` total.
- Al guardar, enviar el campo `tramos_mensualidad` como JSON al insert de `esquemas_pago`.

### 2. Agregar tramos escalonados al formulario de EDITAR esquema
**Archivo**: `src/components/admin/EditPaymentSchemeDialog.tsx`

- Misma UI que el de crear.
- Al abrir el dialog, cargar los tramos existentes del esquema (`scheme.tramos_mensualidad`).
- Al guardar, actualizar el campo `tramos_mensualidad`.

### 3. Mostrar tramos en el detalle del esquema
**Archivo**: `src/components/admin/PaymentSchemeManagement.tsx`

- En `PaymentSchemeDetailsDialog`, si el esquema tiene `tramos_mensualidad`, mostrar el desglose de tramos en lugar del número simple de mensualidades.

### 4. Consumo en ofertas (Pipeline)
- Cuando un agente selecciona un esquema precargado que tiene tramos, los tramos se copian automáticamente a `ofertas_esquemas_pago.tramos_mensualidad`. Esto ya funciona porque el PDF y las vistas leen `tramos_mensualidad` de donde esté disponible.

## Detalle técnico

- No se requieren migraciones de base de datos (la columna `tramos_mensualidad: Json | null` ya existe en `esquemas_pago`).
- El formato JSON es: `[{ orden: 1, numero_mensualidades: 6, monto: 1500000 }, ...]` (monto en centavos).
- Para los esquemas precargados, el monto del tramo es un valor fijo (no calculado sobre un precio base), ya que el precio varía por propiedad. Por esto, en la UI de esquemas de proyecto se ingresará como **porcentaje del monto de mensualidades** o simplemente como **proporción** (ej. "primeras 6 mensualidades al 60%, siguientes 6 al 40%"). Alternativamente, se puede dejar solo el número de mensualidades por tramo sin monto, y que el monto se calcule al momento de generar la oferta.

**Nota importante**: En ofertas manuales, los tramos tienen un monto fijo porque ya se conoce el precio. En esquemas precargados (plantillas), no se conoce el precio hasta que se asigna a una propiedad. Por lo tanto, los tramos en esquemas precargados solo definirán la **distribución de mensualidades** (cuántas por tramo), y el monto se calculará proporcionalmente al generar la oferta.

Formato almacenado: `[{ orden: 1, numero_mensualidades: 6 }, { orden: 2, numero_mensualidades: 6 }]` (sin monto, ya que se calcula después).

