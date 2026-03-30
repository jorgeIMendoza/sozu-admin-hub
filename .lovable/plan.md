

## Cambio: Preguntar antes de generar si desea enviar por correo

### Resumen
Actualmente el flujo es: generar oferta → descargar PDFs → intentar envío automático → si no aplica envío automático, mostrar toast preguntando si quiere enviar. 

El cambio: en el **diálogo de confirmación** (`AlertDialog` que ya existe, líneas ~2394-2569), agregar un checkbox o toggle que diga **"Enviar oferta(s) por correo al prospecto"** para que el usuario decida ANTES de generar. Este checkbox solo se muestra cuando la oferta **NO** se enviaría automáticamente (es decir, cuando no tiene datos bancarios).

### Cambios en `src/components/admin/NewOfferDialog.tsx`

**1. Nuevo estado**
```typescript
const [sendEmailOnGenerate, setSendEmailOnGenerate] = useState(false);
```

**2. En el diálogo de confirmación (líneas ~2530-2554)**
Agregar un checkbox debajo de los avisos de datos bancarios, visible **solo cuando `confirmBankingReasons.length > 0`** (que es la condición que indica que no habrá envío automático):

```
☐ También enviar oferta(s) por correo al prospecto
```

**3. En el `onSuccess` del mutation (líneas ~1047-1084)**
Modificar la lógica post-generación:
- Si `emailSent` es `true` (envío automático por datos bancarios): no cambiar nada.
- Si `emailSent` es `false` Y `sendEmailOnGenerate` es `true`: llamar `sendMultipleOffersEmailDirect` directamente en vez de mostrar el toast con botón.
- Si `emailSent` es `false` Y `sendEmailOnGenerate` es `false`: no mostrar el toast con botón (el usuario ya decidió que no quiere enviar).

**4. Reset del estado**
Resetear `sendEmailOnGenerate` a `false` cuando se cierra el diálogo o se cancela.

### Resultado
El usuario ve la opción de envío **antes** de generar, eliminando el toast posterior. Las ofertas con envío automático (datos bancarios completos) siguen enviándose sin preguntar.

