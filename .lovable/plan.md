

# Plan: Actualizar Aprobacion de Inmobiliaria Draft

## Objetivo
1. Crear usuarios para Representante Legal y Comercial al aprobar una inmobiliaria draft
2. Actualizar la notificacion N8N con el formato solicitado (telefono de inmobiliaria, mensaje con link/usuario/password)
3. Mostrar el email de la inmobiliaria en la columna "Usuario" de la pestaña Draft con la leyenda "Sin usuario"

---

## Seccion Tecnica

### Archivo a Modificar
`src/pages/admin/Inmobiliarias.tsx`

### Cambio 1: Agregar creacion de usuarios para representantes en `approveMutation`

Despues de crear el usuario de la inmobiliaria (linea ~906), agregar la logica para crear usuarios de rep. legal y rep. comercial. Esta logica ya existe en `createMutation` (lineas 549-690) y sera replicada:

```typescript
// 3. Create user for legal representative if exists
if (inmobiliaria.id_entidad_relacionada_rep_leg) {
  try {
    const { data: repLegalData, error: repLegalError } = await supabase
      .from('entidades_relacionadas')
      .select('id_persona, personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email, telefono, clave_pais_telefono)')
      .eq('id', inmobiliaria.id_entidad_relacionada_rep_leg)
      .single();
    
    if (!repLegalError && repLegalData?.personas) {
      const repPersona = repLegalData.personas as any;
      
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('usuarios')
        .select('email')
        .eq('email', repPersona.email)
        .maybeSingle();
      
      if (!existingUser && repPersona.email) {
        await supabase.functions.invoke('create-user', {
          body: {
            email: repPersona.email,
            nombre: repPersona.nombre_legal,
            rol_id: 3, // Agente Inmobiliario
            id_persona: repPersona.id,
            id_inmobiliaria: inmobiliaria.id,
            telefono: repPersona.telefono || null,
            clave_pais_telefono: repPersona.clave_pais_telefono || null,
            auto_create: true
          }
        });
      }
      
      // Update/create entidad_relacionada to link rep to inmobiliaria
      const { data: existingAgentEntidad } = await supabase
        .from('entidades_relacionadas')
        .select('id')
        .eq('id_persona', repPersona.id)
        .eq('id_tipo_entidad', 19)
        .eq('activo', true)
        .maybeSingle();
      
      if (existingAgentEntidad) {
        await supabase
          .from('entidades_relacionadas')
          .update({ id_persona_duena_lead: inmobiliaria.id })
          .eq('id', existingAgentEntidad.id);
      } else {
        await supabase
          .from('entidades_relacionadas')
          .insert({
            id_persona: repPersona.id,
            id_tipo_entidad: 19,
            id_persona_duena_lead: inmobiliaria.id,
            activo: true
          });
      }
    }
  } catch (e) {
    console.error('Error creating user for legal representative:', e);
  }
}

// Similar logic for commercial representative (id_entidad_relacionada_rep_com)
```

### Cambio 2: Actualizar notificacion N8N con formato nuevo

El payload actual envia a super admins. El nuevo formato debe:
- Enviar al **telefono de la inmobiliaria** (con formato correcto usando tabla `paises`)
- Mensaje actualizado con link, usuario y password

```typescript
// Obtener codigo telefonico desde tabla paises
const { data: paises } = await supabase
  .from('paises')
  .select('id, clave_pais_telefono')
  .eq('activo', true);

const codigosPorPais = new Map(
  (paises || []).map(p => [p.id.trim(), p.clave_pais_telefono?.trim()])
);

// Formatear telefono de la inmobiliaria
const clavePaisInmobiliaria = (inmobiliaria.clave_pais_telefono || 'MX').trim();
const codigoPaisInmobiliaria = codigosPorPais.get(clavePaisInmobiliaria) || '+52';
const telefonoFormateado = inmobiliaria.telefono 
  ? `${codigoPaisInmobiliaria}${inmobiliaria.telefono}` 
  : '';

const notificationPayload = {
  tipo: "ambos",
  from: "Notificaciones Sozu <notificaciones@sozu.com>",
  email: inmobiliaria.email,
  telefono: telefonoFormateado,
  mensajeWA: `Tu inmobiliaria *${inmobiliaria.nombre_legal}* ha sido aprobada. Usuario: ${inmobiliaria.email} Password: Temporal123!`,
  asunto: "Aprobacion de Inmobiliaria",
  mensaje: {
    nombre: inmobiliaria.nombre_legal || inmobiliaria.nombre_comercial,
    actividad: "Aprobacion de inmobiliaria",
    detalles: `<tr><td class='label'>Link:</td><td class='value'>https://admin.sozu.com/</td></tr><tr><td class='label'>Usuario:</td><td class='value'>${inmobiliaria.email}</td></tr><tr><td class='label'>Password:</td><td class='value'>Temporal123!</td></tr>`
  },
  templateId: 41353048
};
```

### Cambio 3: Agregar `clave_pais_telefono` al tipo `Inmobiliaria`

Agregar el campo al tipo para poder formatear el telefono:

```typescript
type Inmobiliaria = {
  // ... campos existentes ...
  clave_pais_telefono?: string;
};
```

### Cambio 4: Incluir `clave_pais_telefono` en la consulta `fetchInmobiliarias`

Modificar el SELECT para incluir este campo:

```typescript
.select(`
  id,
  nombre_legal,
  nombre_comercial,
  email,
  telefono,
  clave_pais_telefono,  // AGREGAR
  rfc,
  activo,
  // ... resto de campos
`)
```

Y agregarlo al mapeo:

```typescript
return (data || []).map((item: any) => ({
  // ... otros campos ...
  clave_pais_telefono: item.clave_pais_telefono,
}))
```

### Cambio 5: Actualizar columna Usuario en tabla Draft

La columna "Usuario" ya muestra "Sin usuario" cuando `usuario_email` es null (lineas 1603-1621). Esto funciona correctamente porque las inmobiliarias Draft no tienen usuario creado hasta que se aprueban.

Pero para mostrar el **email de la inmobiliaria** con leyenda "Sin usuario", modificar:

```typescript
// Antes (actual):
{inmobiliaria.usuario_email ? (
  <button>...</button>
) : (
  <span className="text-muted-foreground/50">Sin usuario</span>
)}

// Despues (nuevo - solo para tab Draft):
{inmobiliaria.usuario_email ? (
  <button>...</button>
) : activeTab === 'draft' ? (
  <div className="flex flex-col">
    <span className="text-muted-foreground">{inmobiliaria.email}</span>
    <span className="text-xs text-muted-foreground/50">(Sin usuario)</span>
  </div>
) : (
  <span className="text-muted-foreground/50">Sin usuario</span>
)}
```

---

## Resumen de Cambios

| Linea Aprox. | Cambio | Descripcion |
|--------------|--------|-------------|
| 29-50 | Tipo Inmobiliaria | Agregar `clave_pais_telefono` |
| 110-127 | fetchInmobiliarias SELECT | Incluir `clave_pais_telefono` |
| 252-272 | fetchInmobiliarias MAP | Mapear `clave_pais_telefono` |
| 880-953 | approveMutation | Agregar creacion de usuarios rep. legal y comercial |
| 880-953 | approveMutation | Actualizar payload de notificacion N8N |
| 1603-1621 | renderTable Usuario | Mostrar email de inmobiliaria con "(Sin usuario)" en tab Draft |

---

## Flujo Actualizado de Aprobacion

```
Usuario hace clic en "Aprobar"
          |
          v
+-----------------------------------+
| 1. Actualizar es_draft = false   |
+-----------------------------------+
          |
          v
+-----------------------------------+
| 2. Crear usuario Inmobiliaria    |
|    (rol 4)                       |
+-----------------------------------+
          |
          v
+-----------------------------------+
| 3. Si hay Rep. Legal:            |
|    - Verificar usuario existente |
|    - Crear usuario Agente (rol 3)|
|    - Vincular entidad_relacionada|
+-----------------------------------+
          |
          v
+-----------------------------------+
| 4. Si hay Rep. Comercial:        |
|    - Verificar usuario existente |
|    - Crear usuario Agente (rol 3)|
|    - Vincular entidad_relacionada|
+-----------------------------------+
          |
          v
+-----------------------------------+
| 5. Enviar notificacion N8N       |
|    - A telefono de inmobiliaria  |
|    - Mensaje con link/user/pass  |
+-----------------------------------+
          |
          v
       [FIN]
```

