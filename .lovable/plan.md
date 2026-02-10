

## Plan: Corregir bug del mensaje de inactividad en Login

### Problema
`handleInactivityTimeout` usa `useCallback` con dependencias vacias `[]`, lo que captura una referencia stale de `signOut`. Ademas, `signOut` dentro de AuthContext limpia el estado del realtime channel y llama a `supabase.auth.signOut()`. Si el signOut falla internamente, el `await` lanza una excepcion y el `window.location.href` nunca se ejecuta, por lo que el usuario no ve el parametro `?reason=inactivity` en la URL.

### Solucion

**Archivo: `src/contexts/AuthContext.tsx`**

Modificar `handleInactivityTimeout` para que el redirect siempre se ejecute, independientemente de si `signOut` falla:

```tsx
const handleInactivityTimeout = useCallback(async () => {
  console.log("Session expired due to inactivity");
  try {
    // Clean up realtime channel
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Error during inactivity signOut:", err);
  }
  // Siempre redirigir, sin importar si signOut fallo
  window.location.href = "/auth/login?reason=inactivity";
}, []);
```

### Cambios clave
- Envolver `signOut` en try/catch para que el redirect siempre se ejecute
- Hacer la limpieza directamente (realtime channel + supabase.auth.signOut) en lugar de llamar la funcion `signOut` del contexto, evitando la dependencia stale y los setters de estado innecesarios (ya que vamos a recargar la pagina de todos modos)
- Un solo archivo modificado

