## Diagnóstico

`abel.salazar@sozu.com` (rol 2 — Administrador de Proyecto) NO ve a `contacto@vivaltainmobiliaria.com` (rol 4 — Inmobiliaria, "VIVALTA") en la pantalla de Usuarios.

Datos verificados en BD:
- Ambos usuarios existen, están `activo = true` y con `es_rol_interno = true`.
- Hay **1016** usuarios con rol 3 o 4 (los únicos visibles para ADP).
- Ordenados por `nombre, email`, VIVALTA está en la posición **993** (dentro del primer batch teórico de 1000).

El filtro frontend (`filteredUsuarios` en `src/pages/admin/Usuarios.tsx`) SÍ permite rol 4 para ADP — no descarta a VIVALTA.

### Causa raíz: paginación frágil en `list-system-users`

La edge function `supabase/functions/list-system-users/index.ts` usa:

```ts
const pageSize = 1000;
for (let from = 0; ; from += pageSize) {
  const { data } = await query.range(from, from + pageSize - 1);
  allUsers.push(...(data ?? []));
  if (!data || data.length < pageSize) break;
}
```

Problema: PostgREST aplica un límite global (`db-max-rows`, típicamente 1000). Cuando se combina con `.range(0, 999)` y el join `roles!inner` + `personas`, el primer batch suele devolver **menos de 1000 filas** (no las 1000 esperadas). Como la condición de salida es `data.length < pageSize`, el loop **sale antes de pedir el segundo batch**, y se pierden los usuarios del final de la lista alfabética: VIVALTA (993), Welhome (999), Wellestate, Wendy Villa, Wiggot, Ximena, etc.

Los logs confirman la sospecha: cada invocación de `list-system-users` tarda ~250–600 ms con un único POST, indicando que solo se ejecuta una iteración del loop.

Además, `pageSize = 1000` es justo el límite máximo de PostgREST, así que cualquier fila descartada por el join provoca el corte prematuro.

## Solución

1. **Reducir `pageSize` a 500** en `list-system-users/index.ts` para quedar por debajo del límite de PostgREST y garantizar paginación efectiva.
2. **Cambiar la condición de salida** de `data.length < pageSize` a un control basado en si el último batch devolvió 0 filas o si se alcanzó un máximo de seguridad (p. ej. 20 iteraciones / 10 000 usuarios). Así, aunque PostgREST devuelva un batch parcial, se sigue pidiendo el siguiente offset.
3. **Ordenar también por una columna estable** (`email` ya está, pero añadir `email` como tie-breaker explícito y consistente para evitar duplicados/saltos entre páginas).
4. (Opcional, defensivo) Añadir `console.log` con el conteo total devuelto para facilitar futuros diagnósticos en logs.

### Detalles técnicos

Archivo: `supabase/functions/list-system-users/index.ts`

```ts
const pageSize = 500;
const maxIterations = 40; // tope de seguridad: 20 000 usuarios

for (let i = 0; i < maxIterations; i++) {
  const from = i * pageSize;
  let query = supabaseAdmin
    .from("usuarios")
    .select(`...`)
    .eq("roles.es_rol_interno", true)
    .order("nombre", { ascending: true })
    .order("email", { ascending: true })
    .range(from, from + pageSize - 1);

  if (requester.rol_id === ROLE_ADMINISTRADOR_PROYECTO) {
    query = query.in("rol_id", [ROLE_AGENTE_INMOBILIARIO, ROLE_INMOBILIARIA]);
  }

  const { data, error } = await query;
  if (error) { ... }

  const batch = data ?? [];
  allUsers.push(...batch);

  // Salir solo cuando un batch venga vacío (no cuando sea < pageSize)
  if (batch.length === 0) break;
}

console.log(`list-system-users: returned ${allUsers.length} users for rol ${requester.rol_id}`);
```

No hace falta tocar RLS: la edge function usa `service_role`, así que el problema nunca fue de políticas.

## Resultado esperado

- `abel.salazar@sozu.com` (y cualquier ADP) podrá ver **todos** los 1016 usuarios con rol 3 y 4, incluyendo VIVALTA (`contacto@vivaltainmobiliaria.com`) y todos los demás del final del alfabeto.
- Super Admin (rol 1) seguirá viendo el universo completo de usuarios internos sin verse afectado.
- Sin cambios en seguridad: la función conserva la verificación de rol del solicitante y los filtros existentes.

## QA sugerido

1. Iniciar sesión como `abel.salazar@sozu.com`.
2. Ir a la vista de Usuarios.
3. Buscar "vivalta" en el buscador → debe aparecer `contacto@vivaltainmobiliaria.com` en la pestaña "Activos".
4. Verificar que el contador total de usuarios coincida con lo esperado (~1016 visibles para ADP).
5. Probar con un Super Admin para confirmar que no se rompe la vista global.
