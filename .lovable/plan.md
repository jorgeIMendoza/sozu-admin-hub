

## Plan: Corregir el dialogo de cambio de estatus de documento

### Problema
Cuando se intenta rechazar o expirar un documento, el dialogo no valida correctamente y permite cerrar sin guardar cambios. El documento no se actualiza realmente.

### Causa raiz
El componente `AlertDialogAction` de Radix UI cierra automaticamente el dialogo al hacer click, **antes** de que la logica de validacion o la operacion asincrona puedan ejecutarse. Esto causa:

1. Si no se pone comentario obligatorio, el dialogo se cierra igual (sin mostrar error)
2. La operacion asincrona puede no completarse porque el estado se resetea al cerrarse

### Solucion

**Archivo: `src/components/admin/DocumentStatusChangeDialog.tsx`**

Agregar `e.preventDefault()` en el `onClick` del `AlertDialogAction` para evitar el cierre automatico, y solo cerrar manualmente despues de que la operacion sea exitosa:

```tsx
<AlertDialogAction
  onClick={(e) => {
    e.preventDefault();  // Evitar cierre automatico
    handleConfirm();
  }}
  disabled={isLoading || selectedStatus === currentStatus.toString()}
>
```

Tambien agregar un estado `isSubmitting` local para manejar el loading dentro del dialogo y evitar doble click:

```tsx
const [isSubmitting, setIsSubmitting] = useState(false);

const handleConfirm = async () => {
  const newStatusId = parseInt(selectedStatus);
  
  if (newStatusId !== 2 && !comment.trim()) {
    setError("El comentario es obligatorio para este estatus");
    return;  // Ahora si previene el avance
  }
  
  setError("");
  setIsSubmitting(true);
  
  try {
    await onConfirm(newStatusId, comment.trim());
    
    // Registrar actividad (solo si fue exitoso)
    // ... activity logger code ...
    
    setComment("");
    setSelectedStatus(currentStatus.toString());
    onClose();  // Cerrar manualmente solo en exito
  } catch (err) {
    // Mantener dialogo abierto en caso de error
  } finally {
    setIsSubmitting(false);
  }
};
```

### Resumen
Un solo archivo modificado: `DocumentStatusChangeDialog.tsx`. El cambio clave es `e.preventDefault()` en el boton de confirmacion para que Radix no cierre el dialogo automaticamente, permitiendo la validacion y la espera de la operacion asincrona.
