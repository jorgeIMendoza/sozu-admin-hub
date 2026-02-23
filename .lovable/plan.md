
# Plan: Sistema de Citas con Nombres Personalizados y Filtrado por Proyecto

## Resumen

Transformar el sistema de configuracion de citas para que cada usuario pueda crear multiples citas nombradas (ej: "Capacitacion Bottura", "Capacitacion Daiku"), cada una vinculada a proyectos especificos. Ademas, simplificar la administracion de tipos de cita, agregar campos nuevos (max invitados, correos de enterado), mostrar el nombre del agente en el header, y filtrar horarios disponibles en el portal de agentes por proyecto.

---

## Parte 1: Cambios en Base de Datos

### 1.1 Modificar `configuracion_citas_usuarios`
Actualmente la clave unica es `(id_usuario_email, id_tipo_cita)` lo cual limita a UNA configuracion por tipo. Se necesita:

- Agregar columna `nombre` (TEXT NOT NULL) - nombre personalizado de la cita (ej: "Capacitacion Bottura")
- Agregar columna `max_invitados` (INTEGER NOT NULL DEFAULT 1) - numero maximo de invitados
- Agregar columna `correos_enterado` (TEXT[] DEFAULT '{}') - array de correos que se agregan como attendees adicionales
- Eliminar constraint UNIQUE actual sobre `(id_usuario_email, id_tipo_cita)` y crear uno nuevo sobre `(id_usuario_email, id_tipo_cita, nombre)` para permitir multiples configuraciones por tipo

### 1.2 Crear tabla `configuracion_citas_proyectos`
Tabla join para vincular cada configuracion de cita con uno o mas proyectos:

```text
configuracion_citas_proyectos
- id (SERIAL PK)
- id_configuracion_cita (INTEGER FK -> configuracion_citas_usuarios.id)
- id_proyecto (INTEGER FK -> proyectos.id)
- UNIQUE(id_configuracion_cita, id_proyecto)
```

### 1.3 Actualizar `configuracion_citas_horarios`
Actualmente referencia `(id_usuario_email, id_tipo_cita)`. Necesita referenciar la configuracion especifica:
- Agregar columna `id_configuracion_cita` (INTEGER FK -> configuracion_citas_usuarios.id)
- Los horarios se vincularan a la configuracion especifica en lugar de al combo usuario+tipo

---

## Parte 2: Simplificar "Administrar Tipos de Cita"

Cambios en `ConfiguracionCitas.tsx`:
- Eliminar campo de descripcion del formulario de crear/editar tipo de cita
- Mostrar solo: Nombre + Switch activar/desactivar
- Eliminar la seccion de seleccion de proyectos de aqui (los proyectos ahora se configuran a nivel de cada cita individual del usuario)

---

## Parte 3: Configuracion de Citas por Usuario (pestanas con nombre)

### Modelo actual vs nuevo
- **Actual**: Un usuario tiene UNA pestana por tipo de cita (ej: pestana "Capacitacion", pestana "Visita Showroom")
- **Nuevo**: Un usuario puede crear MULTIPLES citas por tipo. Cada cita tiene un nombre personalizado que aparece como pestana (ej: "Capacitacion Bottura", "Capacitacion Daiku", "Visita Showroom")

### UI en `ConfiguracionCitas.tsx`:
1. Boton "Nueva Cita" que abre un formulario para:
   - Seleccionar tipo de cita (de los activos)
   - Escribir un nombre personalizado
2. Las pestanas muestran el nombre de cada cita creada
3. Dentro de cada pestana:
   - Configuracion general: Duracion, Email calendario Google
   - **Nuevo campo**: "Numero maximo de invitados" (input numerico, default 1, requerido)
   - **Nuevo campo**: "Proyectos" - multi-selector de proyectos publicados (al menos uno requerido)
   - **Nuevo campo**: "Enterar a los siguientes correos" - campo para agregar/quitar correos (chips)
   - Dias disponibles y horarios (igual que ahora)
   - Sincronizacion con Google Calendar

---

## Parte 4: Nombre del Agente en Header del Portal

En `InventarioGlobal.tsx` (y paginas similares del portal de agentes):
- Al lado del icono de perfil, agregar texto compacto: "Hola, [Nombre]"
- Usar el nombre del agente logueado (o impersonado si aplica)
- Estilo compacto para no desperdiciar espacio

---

## Parte 5: Filtrado de Horarios en Portal de Agentes

En `AgentOnboardingStepDialog.tsx` (paso de Capacitacion):
- Al llamar `check-availability`, enviar tambien los proyecto_ids a los que el agente tiene acceso
- La Edge Function `agendar-capacitacion` debe:
  1. Buscar todas las `configuracion_citas_usuarios` de tipo "Capacitacion" (id=1)
  2. Filtrar solo las que tengan al menos un proyecto en comun con los proyecto_ids del agente
  3. Consultar disponibilidad en los calendarios de esas configuraciones
  4. Retornar slots agrupados por calendario/dueño, incluyendo el nombre del dueño

### UI del calendario de capacitacion:
- Mostrar los horarios agrupados por dueño del calendario (ej: "Abel Salazar" y "Jorge Mendoza")
- Solo mostrar nombre, no correo

---

## Parte 6: Actualizacion de Edge Function `agendar-capacitacion`

- Actualizar la accion `check-availability` para aceptar `proyecto_ids` y filtrar configuraciones por proyecto
- Actualizar la accion `create-recurring-meets` para incluir los correos de enterado como attendees adicionales en los eventos de Google Calendar
- Al crear/actualizar eventos, agregar los correos de enterado como attendees (no cuentan para el maximo de invitados)

---

## Secuencia de Implementacion

1. Migracion de base de datos (esquema nuevo + migracion de datos existentes)
2. Simplificar UI de "Administrar Tipos de Cita"
3. Redisenar pestanas de configuracion por usuario (citas con nombre)
4. Agregar campos nuevos (max invitados, proyectos, correos enterado)
5. Nombre del agente en header
6. Actualizar Edge Function para filtrado por proyecto y correos enterado
7. Actualizar portal de agentes para filtrar y agrupar horarios

---

## Detalles Tecnicos

### Migracion SQL (resumen)
```text
ALTER TABLE configuracion_citas_usuarios
  ADD COLUMN nombre TEXT,
  ADD COLUMN max_invitados INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN correos_enterado TEXT[] DEFAULT '{}';

-- Migrar datos existentes: asignar nombre = nombre del tipo_cita
UPDATE configuracion_citas_usuarios u
  SET nombre = (SELECT t.nombre FROM tipos_cita t WHERE t.id = u.id_tipo_cita);

ALTER TABLE configuracion_citas_usuarios
  ALTER COLUMN nombre SET NOT NULL;

-- Cambiar constraint unico
ALTER TABLE configuracion_citas_usuarios
  DROP CONSTRAINT IF EXISTS configuracion_citas_usuarios_id_usuario_email_id_tipo_cita_key;
ALTER TABLE configuracion_citas_usuarios
  ADD CONSTRAINT configuracion_citas_usuarios_email_tipo_nombre_key
  UNIQUE(id_usuario_email, id_tipo_cita, nombre);

-- Tabla join para proyectos
CREATE TABLE configuracion_citas_proyectos (
  id SERIAL PRIMARY KEY,
  id_configuracion_cita INTEGER NOT NULL REFERENCES configuracion_citas_usuarios(id) ON DELETE CASCADE,
  id_proyecto INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  UNIQUE(id_configuracion_cita, id_proyecto)
);

-- Agregar FK en horarios
ALTER TABLE configuracion_citas_horarios
  ADD COLUMN id_configuracion_cita INTEGER REFERENCES configuracion_citas_usuarios(id) ON DELETE CASCADE;

-- Migrar horarios existentes
UPDATE configuracion_citas_horarios h
  SET id_configuracion_cita = (
    SELECT u.id FROM configuracion_citas_usuarios u
    WHERE u.id_usuario_email = h.id_usuario_email AND u.id_tipo_cita = h.id_tipo_cita
    LIMIT 1
  );
```

### Archivos a modificar
- `supabase/migrations/` - nueva migracion
- `src/integrations/supabase/types.ts` - tipos actualizados
- `src/pages/admin/comunicacion/ConfiguracionCitas.tsx` - rediseno completo de pestanas y CRUD tipos
- `src/pages/admin/inmobiliarias/InventarioGlobal.tsx` - nombre del agente en header
- `src/pages/admin/inmobiliarias/MisProyectos.tsx` - nombre del agente en header (si aplica)
- `src/pages/admin/inmobiliarias/MiProyectoDetalle.tsx` - nombre del agente en header (si aplica)
- `src/components/admin/AgentOnboardingStepDialog.tsx` - filtrado por proyecto y agrupacion por dueño
- `supabase/functions/agendar-capacitacion/index.ts` - filtrado por proyecto, correos enterado
