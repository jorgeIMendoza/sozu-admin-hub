

## Modulo Comunicacion - Plan Corregido

### Correciones al plan anterior
- **3 tablas nuevas** (no 5, fue un error): `avisos`, `avisos_roles_destinatarios`, `avisos_ejecuciones`
- **Primary keys**: Todas con `integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (patron del proyecto)
- **Cron expression**: Se guarda en formato UNIX cron estándar en la BD, con UI visual amigable para configurarlo
- **Zona horaria**: Mexico UTC-6 (se documenta en la UI y se ajusta en el cron job)

---

### 1. Migracion de BD (3 tablas + datos menu/submenus/permisos)

**Tabla `avisos`**
```sql
CREATE TABLE public.avisos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL,
  asunto text NOT NULL,
  mensaje_html text NOT NULL,
  tipo_envio text NOT NULL DEFAULT 'manual', -- 'manual' o 'automatico'
  cron_expression text, -- formato UNIX: '*/15 9 * * 1-5' (solo si automatico)
  activo boolean DEFAULT true NOT NULL,
  fecha_creacion timestamptz DEFAULT now() NOT NULL,
  fecha_actualizacion timestamptz DEFAULT now() NOT NULL
);
```

**Tabla `avisos_roles_destinatarios`**
```sql
CREATE TABLE public.avisos_roles_destinatarios (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aviso_id integer NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
  rol_id integer NOT NULL REFERENCES public.roles(id),
  UNIQUE(aviso_id, rol_id)
);
```

**Tabla `avisos_ejecuciones`**
```sql
CREATE TABLE public.avisos_ejecuciones (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aviso_id integer NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
  fecha_ejecucion timestamptz DEFAULT now() NOT NULL,
  tipo_trigger text NOT NULL, -- 'manual' o 'cron'
  total_destinatarios integer DEFAULT 0,
  total_enviados integer DEFAULT 0,
  total_errores integer DEFAULT 0,
  estado text DEFAULT 'pendiente' NOT NULL, -- 'pendiente','enviando','completado','error'
  detalle_error text,
  ejecutado_por uuid -- auth user id si fue manual
);
```

**Datos de menu/submenus/permisos** (via insert tool, no migracion):
- Menu 14: "Comunicacion", orden 14, activo true
- Submenu 57: "Administrar Avisos" -> `/admin/comunicacion/administrar-avisos`
- Submenu 58: "Enviar Avisos" -> `/admin/comunicacion/enviar-avisos`
- Submenu 59: "Ejecuciones" -> `/admin/comunicacion/ejecuciones`
- Para cada submenu: 7 permisos disponibles en `submenus_permisos_disponibles`
- Para Super Admin (rol_id=1): 7 permisos activos en `submenus_permisos`

---

### 2. Edge Functions

**`enviar-aviso-bulk`** - Envia un aviso a todos los destinatarios via Postmark Bulk API
1. Recibe `{ aviso_id, ejecutado_por?, tipo_trigger }`
2. Consulta aviso + roles destinatarios
3. Obtiene emails de tabla `usuarios` filtrando por `rol_id` IN roles y `activo = true`
4. Llama a `POST https://api.postmarkapp.com/email/batch` con `X-Postmark-Server-Token`
5. Envia en lotes de 500
6. Registra resultado en `avisos_ejecuciones`

**`ejecutar-avisos-cron`** - Evaluador de cron expressions
1. Se invoca cada minuto via `pg_cron`
2. Consulta avisos con `tipo_envio = 'automatico'` y `activo = true`
3. Evalua si cada `cron_expression` coincide con el momento actual (ajustado a UTC-6 Mexico)
4. Para cada match, llama internamente a `enviar-aviso-bulk`

**Cron job** (via insert tool):
```sql
SELECT cron.schedule(
  'ejecutar-avisos-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzmhgfjmddkfyffkkmto.supabase.co/functions/v1/ejecutar-avisos-cron',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

### 3. Frontend (3 paginas nuevas)

**`src/pages/admin/comunicacion/AdministrarAvisos.tsx`**
- Tabla listando avisos con columnas: nombre, tipo envio, activo (switch), fecha creacion
- Dialog para crear/editar con:
  - Input: Nombre del aviso
  - Input: Asunto
  - Textarea: Mensaje HTML (editor de codigo)
  - Panel derecho: Preview en tiempo real via `<iframe srcdoc={mensajeHtml}>` (seguro, sandboxed)
  - Select: Tipo de envio (manual / automatico)
  - Si automatico: configurador visual de cron con 5 campos (minuto, hora, dia mes, mes, dia semana) con ayuda contextual. Se guarda como string cron UNIX en la BD. Se muestra la hora en formato Mexico (UTC-6)
  - Multi-select: Roles destinatarios (los 24 roles del sistema)
  - Switch: Activo / Inactivo
- Acciones por fila: editar, eliminar, toggle activo
- Permisos via `usePagePermissions`

**`src/pages/admin/comunicacion/EnviarAvisos.tsx`**
- Tabla de avisos activos
- Para manuales: boton "Enviar ahora" con confirmacion
- Para automaticos: muestra la cron expression legible y proxima ejecucion estimada
- Preview del aviso antes de enviar

**`src/pages/admin/comunicacion/Ejecuciones.tsx`**
- Tabla de log: fecha, aviso nombre, tipo trigger, destinatarios, enviados, errores, estado
- Grafica con `recharts` de envios por dia
- Filtros por aviso y rango de fechas

---

### 4. Archivos existentes a modificar

| Archivo | Cambio |
|---------|--------|
| `src/App.tsx` | 3 rutas lazy para comunicacion/* |
| `src/utils/validRoutes.ts` | 3 rutas nuevas |
| `src/hooks/useDynamicMenus.ts` | Iconos: `Mail`/`Send`/`History` para rutas + `Mail` para menu 14 |
| `supabase/config.toml` | `enviar-aviso-bulk` y `ejecutar-avisos-cron` con verify_jwt = false |

---

### 5. Secuencia de implementacion

1. Migracion BD: crear 3 tablas con RLS
2. Insert tool: menu, submenus, permisos disponibles, permisos super admin
3. Edge functions: `enviar-aviso-bulk` y `ejecutar-avisos-cron`
4. Config: config.toml + validRoutes + useDynamicMenus
5. Paginas: las 3 paginas con componentes
6. App.tsx: rutas
7. Insert tool: cron job pg_cron

