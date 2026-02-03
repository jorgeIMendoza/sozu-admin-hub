
## Plan: Corregir Despliegue y Agregar Modal de Confirmación

### Problema 1: Edge Function No Desplegada
Los logs muestran que la edge function `create-user` todavía tiene un error de sintaxis porque no se ha desplegado correctamente con los últimos cambios. El código en el repositorio está correcto, pero Supabase sigue ejecutando una versión antigua.

**Solución:** Redesplegar la edge function `create-user`.

---

### Problema 2: No Hay Modal de Confirmación

Actualmente, al crear una inmobiliaria, los usuarios se crean automáticamente sin mostrar un modal de confirmación.

**Solución:** Agregar un paso intermedio que muestre un modal con los usuarios que se crearán antes de proceder.

---

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/create-user/index.ts` | Redesplegar (sin cambios en el código, ya está correcto) |
| `src/pages/admin/Inmobiliarias.tsx` | Agregar modal de confirmación antes de crear usuarios |

---

### Flujo Propuesto con Modal

```text
Usuario llena formulario de nueva inmobiliaria
                    ▼
Hace clic en "Crear"
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  NUEVO: Modal de Confirmación de Usuarios                       │
│                                                                 │
│  Se crearán los siguientes usuarios:                            │
│                                                                 │
│  1. Inmobiliaria: brokers.inmo@yopmail.com                     │
│     Rol: Inmobiliaria                                           │
│                                                                 │
│  2. Representante Legal: rep.legal@yopmail.com                 │
│     Rol: Agente Inmobiliario                                    │
│                                                                 │
│  3. Representante Comercial: rep.comercial@yopmail.com         │
│     Rol: Agente Inmobiliario                                    │
│                                                                 │
│  Contraseña temporal: Temporal123!                              │
│                                                                 │
│  [Cancelar]  [Confirmar y Crear]                               │
└─────────────────────────────────────────────────────────────────┘
                    ▼
Al confirmar, se ejecuta la creación de inmobiliaria y usuarios
```

---

### Implementación del Modal

1. Crear nuevo estado para controlar el modal de confirmación
2. Modificar el flujo de `handleSubmit` para:
   - Primero mostrar el modal con la lista de usuarios a crear
   - Solo al confirmar, proceder con la creación
3. El modal mostrará:
   - Email de la inmobiliaria (si tiene email)
   - Email del representante legal (si tiene)
   - Email del representante comercial (si tiene)
   - Contraseña temporal que se asignará

---

### Detalles Técnicos

**Nuevos estados a agregar:**
```typescript
const [showUserConfirmationDialog, setShowUserConfirmationDialog] = useState(false);
const [pendingInmobiliariaData, setPendingInmobiliariaData] = useState<any>(null);
const [usersToCreate, setUsersToCreate] = useState<Array<{
  email: string;
  nombre: string;
  rol: string;
  tipo: 'inmobiliaria' | 'rep_legal' | 'rep_comercial';
}>>([]);
```

**Nuevo flujo de creación:**
1. Usuario hace clic en "Crear"
2. Se valida el formulario
3. Se detectan los usuarios a crear (inmobiliaria + representantes)
4. Se muestra el modal de confirmación
5. Al confirmar, se ejecuta `createMutation.mutate(pendingInmobiliariaData)`

---

### Resultado Esperado

- La edge function funcionará correctamente al redesplegarla
- El usuario verá un modal antes de crear la inmobiliaria mostrando qué usuarios se generarán
- Mayor transparencia sobre las acciones automáticas del sistema
