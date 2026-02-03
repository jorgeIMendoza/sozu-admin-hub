

## Plan: Corregir Creación Automática de Usuarios y Mostrar Representantes en Inmobiliarias

### Problemas Identificados

Se encontraron **3 problemas principales** en el módulo de Inmobiliarias:

#### 1. Usuario de Inmobiliaria NO se crea automáticamente
- La edge function `create-user` requiere que el solicitante sea **Super Administrador**
- Si quien crea la inmobiliaria es "Administrador de Proyecto" (u otro rol), la llamada falla silenciosamente
- Esto explica por qué "Brokers and Brothers" no tiene usuario aunque fue creada recientemente

#### 2. Columnas de Representantes vacías
- En `fetchInmobiliarias()` los nombres de representantes están hardcodeados como `null` (líneas 210-211)
- Nunca se consultan los nombres desde `entidades_relacionadas` → `personas`
- Por eso las columnas "Rep. Legal" y "Rep. Comercial" siempre muestran "-"

#### 3. Usuarios faltantes para migrar
- **Brokers and Brothers** (contacto@brokersandbrothers.com) no tiene usuario
- **Eduardo Ochoa** (eduardo@brokersbrothers.com) - representante legal - no tiene usuario

---

### Solución Propuesta

#### Parte 1: Corregir `create-user` Edge Function

Modificar la edge function para permitir la creación de usuarios con rol "Inmobiliaria" sin requerir que el solicitante sea Super Admin cuando es una creación automática desde el sistema:

```text
Cambios en supabase/functions/create-user/index.ts:

1. Agregar parámetro opcional "auto_create: boolean" al request
2. Si auto_create = true y rol_id = 4 (Inmobiliaria):
   - Permitir la creación sin verificar rol del solicitante
   - Esto aplica solo para creación automática de usuarios de inmobiliarias
3. Mantener la restricción de Super Admin para otros roles y creación manual
```

#### Parte 2: Corregir `fetchInmobiliarias` en Inmobiliarias.tsx

Agregar consulta para obtener los nombres de representantes:

```text
Flujo corregido en src/pages/admin/Inmobiliarias.tsx:

1. Extraer todos los id_entidad_relacionada_rep_leg e id_entidad_relacionada_rep_com únicos
2. Consultar entidades_relacionadas JOIN personas para obtener nombre_legal
3. Crear Map para lookup eficiente
4. Mapear representante_legal_nombre y representante_comercial_nombre correctamente
```

#### Parte 3: Agregar botón de Edge Function en Usuarios.tsx

Agregar un botón para ejecutar la edge function de migración:

```text
Cambios en src/pages/admin/Usuarios.tsx:

1. Agregar botón "Migrar Usuarios Faltantes" en el header (solo visible para Super Admin)
2. Agregar dialog de confirmación
3. Llamar a la edge function migrate-brokers-users
4. Mostrar resultados de la migración
```

#### Parte 4: Crear Edge Function de migración

Nueva edge function `migrate-brokers-users` para crear usuarios faltantes:

```text
Usuarios a crear:
┌───────────────────────────────────────────────────────────────────┐
│  1. contacto@brokersandbrothers.com                               │
│     └─ persona_id: 786                                            │
│     └─ nombre: Brokers and Brothers                               │
│     └─ rol: Inmobiliaria (4)                                      │
│                                                                   │
│  2. eduardo@brokersbrothers.com                                   │
│     └─ persona_id: 2361                                           │
│     └─ nombre: Eduardo Ochoa                                      │
│     └─ rol: Agente Inmobiliario (3)                               │
│     └─ id_inmobiliaria: 786 (Brokers and Brothers)                │
└───────────────────────────────────────────────────────────────────┘
```

---

### Archivos a Modificar/Crear

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/create-user/index.ts` | Agregar parámetro `auto_create` para permitir creación automática de usuarios Inmobiliaria |
| `src/pages/admin/Inmobiliarias.tsx` | Agregar consulta para nombres de representantes en `fetchInmobiliarias` |
| `src/pages/admin/Usuarios.tsx` | Agregar botón para ejecutar edge function de migración |
| `supabase/functions/migrate-brokers-users/index.ts` | Nueva edge function para migrar usuarios faltantes |
| `supabase/config.toml` | Agregar configuración para la nueva edge function |

---

### Detalles Técnicos

#### Cambio en create-user Edge Function

```typescript
interface CreateUserRequest {
  email: string;
  nombre: string;
  rol_id: number;
  id_persona?: number;
  id_inmobiliaria?: number;
  telefono?: string;
  clave_pais_telefono?: string;
  auto_create?: boolean;  // NUEVO: Indica creación automática desde sistema
}

// Modificar la validación de rol (líneas 58-79):
const ROLE_INMOBILIARIA = 4;
const isAutoCreateInmobiliaria = body.auto_create && body.rol_id === ROLE_INMOBILIARIA;

if (!isAutoCreateInmobiliaria) {
  // Mantener validación existente de Super Admin
  const rolNombre = (adminCheck.roles as any)?.nombre;
  if (rolNombre !== "Super Administrador") {
    return new Response(
      JSON.stringify({ error: "Only Super Administrators can create users" }),
      { status: 403, ... }
    );
  }
}
```

#### Consulta de Representantes en Inmobiliarias.tsx

```typescript
// Después de línea 117 en fetchInmobiliarias:
// Extraer IDs de representantes
const repLegIds = (data || [])
  .map(i => i.id_entidad_relacionada_rep_leg)
  .filter(Boolean) as number[];
const repComIds = (data || [])
  .map(i => i.id_entidad_relacionada_rep_com)
  .filter(Boolean) as number[];

const allRepIds = [...new Set([...repLegIds, ...repComIds])];

let repsMap = new Map<number, string>();

if (allRepIds.length > 0) {
  const { data: repsData } = await supabase
    .from('entidades_relacionadas')
    .select('id, id_persona, personas!entidades_relacionadas_id_persona_fkey(nombre_legal)')
    .in('id', allRepIds);
  
  (repsData || []).forEach((r: any) => {
    if (r.id && r.personas?.nombre_legal) {
      repsMap.set(r.id, r.personas.nombre_legal);
    }
  });
}

// En el mapeo final (líneas 210-211):
representante_legal_nombre: repsMap.get(item.id_entidad_relacionada_rep_leg) || null,
representante_comercial_nombre: repsMap.get(item.id_entidad_relacionada_rep_com) || null,
```

#### Botón de Migración en Usuarios.tsx

```typescript
// Agregar estado
const [isMigrating, setIsMigrating] = useState(false);
const [showMigrationDialog, setShowMigrationDialog] = useState(false);

// Función de migración
const handleMigration = async () => {
  setIsMigrating(true);
  try {
    const { data, error } = await supabase.functions.invoke('migrate-brokers-users');
    if (error) throw error;
    
    toast({
      title: "Migración completada",
      description: data.message,
    });
    queryClient.invalidateQueries({ queryKey: ['usuarios'] });
  } catch (error) {
    toast({
      title: "Error",
      description: error.message,
      variant: "destructive",
    });
  } finally {
    setIsMigrating(false);
    setShowMigrationDialog(false);
  }
};

// Botón en el header (solo para Super Admin)
{profile?.rol_id === 1 && (
  <Button 
    variant="outline"
    onClick={() => setShowMigrationDialog(true)}
  >
    <RotateCcw className="w-4 h-4 mr-2" />
    Migrar Usuarios Faltantes
  </Button>
)}
```

---

### Resultado Esperado

1. **Al crear nueva inmobiliaria**: Se creará automáticamente el usuario con rol Inmobiliaria
2. **En listado de inmobiliarias**: Las columnas "Rep. Legal" y "Rep. Comercial" mostrarán los nombres correctos
3. **Usuarios Brokers and Brothers**: Se podrán crear mediante el botón de migración
4. **Contraseña temporal**: `Temporal123!` (los usuarios deberán cambiarla al primer login)

