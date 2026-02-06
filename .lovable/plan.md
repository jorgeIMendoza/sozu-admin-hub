
# Plan: Validacion de Datos Obligatorios de Inmobiliaria y Deshabilitacion de Submenus

## Resumen

Implementar un sistema de validacion que verifique si la inmobiliaria tiene todos los datos obligatorios completos en "Mi Informacion". Si faltan datos, los submenus **Mi Inventario**, **Mis Ventas** y **Mis Agentes** estaran deshabilitados (visibles pero no clickeables) hasta que se completen.

---

## Campos Obligatorios a Validar

### Informacion Basica (Pestana principal)
| Campo | Obligatorio |
|-------|-------------|
| Tipo de Persona | Si |
| Razon Social | Si |
| Nombre Comercial | Si |
| Email | Si |
| Telefono | Si |
| Representante Legal | Si |
| Representante Comercial | Si |

### Direccion
| Campo | Obligatorio |
|-------|-------------|
| Calle | Si |
| Numero Exterior | Si |
| Numero Interior | No |
| Codigo Postal | Si |
| Pais | Si |
| Estado | Si |
| Municipio | Si |
| Colonia/Barrio | Si |

### Informacion Fiscal
| Campo | Obligatorio |
|-------|-------------|
| Calle (Fiscal) | Si |
| Numero Exterior (Fiscal) | Si |
| Numero Interior (Fiscal) | No |
| Codigo Postal (Fiscal) | Si |
| Pais (Fiscal) | Si |
| Estado (Fiscal) | Si |
| Municipio (Fiscal) | Si |
| Colonia/Barrio (Fiscal) | Si |

### Documentos Obligatorios

| Documento | ID | Asignado a |
|-----------|-----|------------|
| Acta constitutiva | 7 | Inmobiliaria |
| Constancia de situacion fiscal | 6 | Inmobiliaria |
| Poder notarial representante legal | 9 | Inmobiliaria O Representante Legal |
| Frente INE | 2 | Representante Legal |
| Reverso INE | 3 | Representante Legal |

**Nota importante**: El Poder Notarial (ID: 9) se considerara completo si esta cargado en la Inmobiliaria O en el Representante Legal.

### Cuentas Bancarias
| Requisito | Obligatorio |
|-----------|-------------|
| Minimo 1 cuenta bancaria activa | Si |

---

## Arquitectura de la Solucion

### 1. Nuevo Hook: `useInmobiliariaDataStatus`

Crear un hook que verifique el estado de los datos de la inmobiliaria seleccionada:

```text
useInmobiliariaDataStatus(inmobiliariaId)
     |
     +-- Consulta datos de persona
     |   - nombre_legal, nombre_comercial, email, telefono
     |   - id_entidad_relacionada_rep_leg (Representante Legal)
     |   - id_entidad_relacionada_rep_com (Representante Comercial)
     |   - Campos de direccion
     |   - Campos de direccion fiscal
     |
     +-- Consulta documentos de inmobiliaria
     |   - Acta constitutiva (ID: 7)
     |   - Constancia situacion fiscal (ID: 6)
     |   - Poder notarial (ID: 9) - OPCIONAL si Rep Legal lo tiene
     |
     +-- Consulta documentos del Representante Legal
     |   - Poder notarial (ID: 9) - OPCIONAL si Inmobiliaria lo tiene
     |   - Frente INE (ID: 2)
     |   - Reverso INE (ID: 3)
     |
     +-- Consulta cuentas bancarias
     |   - Minimo 1 activa
     |
     +-- Retorna:
         - isDataComplete: boolean
         - missingFields: string[]
         - isLoading: boolean
```

### 2. Modificacion del Sidebar

En `AdminSidebar.tsx`, los submenus del portal de inmobiliarias mostraran:
- Menu deshabilitado (gris, no clickeable) si los datos estan incompletos
- Tooltip con mensaje explicativo al pasar el mouse
- Icono de candado indicando bloqueo

### 3. Notificacion al Guardar en MiInformacion

En `MiInformacion.tsx`, despues de guardar exitosamente:
- Si hay campos faltantes, mostrar toast de advertencia
- Listar las secciones que faltan por completar
- Permitir el guardado parcial

---

## Archivos a Crear

| Archivo | Descripcion |
|---------|-------------|
| `src/hooks/useInmobiliariaDataStatus.ts` | Hook para verificar completitud de datos |

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/admin/AdminSidebar.tsx` | Agregar logica de deshabilitacion de submenus con tooltip e icono candado |
| `src/hooks/useDynamicMenus.ts` | Agregar propiedad `disabled` a DynamicMenuChild |
| `src/pages/admin/inmobiliarias/MiInformacion.tsx` | Mostrar notificacion de campos faltantes tras guardar |

---

## Detalles Tecnicos

### Hook `useInmobiliariaDataStatus`

**Logica de validacion:**

1. **Campos de persona (tabla `personas`):**
   - `nombre_legal` no vacio
   - `nombre_comercial` no vacio
   - `email` no vacio
   - `telefono` no vacio
   - `id_entidad_relacionada_rep_leg` no nulo (ID del representante legal)
   - `id_entidad_relacionada_rep_com` no nulo (ID del representante comercial)
   - Campos de direccion: calle, num_ext, cp, pais, estado, municipio, colonia
   - Campos de direccion fiscal: mismos campos

2. **Documentos de la inmobiliaria (tabla `documentos`):**
   - Al menos 1 documento con `id_tipo_documento = 7` (Acta constitutiva) y activo
   - Al menos 1 documento con `id_tipo_documento = 6` (Constancia situacion fiscal) y activo

3. **Poder Notarial (ID: 9) - Validacion flexible:**
   - Verificar si existe en documentos de la inmobiliaria (id_persona = inmobiliariaId, id_tipo_documento = 9)
   - O verificar si existe en documentos del representante legal (id_persona = repLegalId, id_tipo_documento = 9)
   - Si existe en CUALQUIERA de los dos, se considera completo

4. **Documentos del Representante Legal:**
   - Documento `id_tipo_documento = 2` (Frente INE) con id_persona = repLegalId y activo
   - Documento `id_tipo_documento = 3` (Reverso INE) con id_persona = repLegalId y activo

5. **Cuentas bancarias (tabla `cuentas_bancarias`):**
   - Al menos 1 cuenta con `id_persona = inmobiliariaId` y `activo = true`

### Modificacion del Sidebar

Para usuarios con rol "Inmobiliaria" (rol_id = 4), antes de renderizar los submenus:

```text
Rutas bloqueables:
- /admin/inmobiliarias/mis-propiedades
- /admin/inmobiliarias/mis-ventas
- /admin/inmobiliarias/mis-agentes

Si isDataComplete = false:
  - Aplicar clases: "pointer-events-none opacity-50"
  - Agregar icono Lock al lado del nombre
  - Mostrar Tooltip: "Completa la informacion en 'Mi Informacion' 
    para habilitar esta seccion"
```

### Notificacion en MiInformacion

Tras guardar exitosamente, usar el hook para verificar estado:

```text
Si missingFields.length > 0:
  Toast de advertencia con:
  "Informacion guardada. Secciones pendientes: [lista]
   Completa todos los datos para habilitar Mi Inventario, 
   Mis Ventas y Mis Agentes."
```

---

## Flujo de Usuario

```text
Usuario Inmobiliaria
       |
       v
  Ingresa al sistema
       |
       v
  +--------------------+
  | Datos completos?   |
  +--------------------+
       |
   +---+---+
   |       |
   v       v
  Si      No
   |       |
   |       v
   |   Submenus deshabilitados:
   |   - Mi Inventario (bloqueado)
   |   - Mis Ventas (bloqueado)
   |   - Mis Agentes (bloqueado)
   |       |
   |       v
   |   Solo "Mi Informacion" activo
   |       |
   |       v
   |   Usuario completa datos
   |       |
   |       v
   |   Al guardar: notificacion
   |   de secciones faltantes
   |       |
   v       v
  Todos los submenus habilitados
```

---

## Comportamiento para Super Admin

El Super Admin vera todos los menus habilitados siempre, pero podra ver el estado de completitud de cada inmobiliaria cuando use el selector de inmobiliarias en el header.

---

## Consideraciones de UX

1. **Menus deshabilitados**: Grises con icono de candado pequeno
2. **Tooltip explicativo**: Al hover, mostrar que falta completar
3. **Notificacion informativa**: Al guardar, listar secciones incompletas
4. **No bloquea guardado**: El usuario puede guardar parcialmente
5. **Feedback claro**: Las secciones faltantes se nombran explicitamente

---

## Ejemplo de Mensaje de Secciones Faltantes

```text
"Informacion guardada correctamente. 

Para habilitar las demas funciones, completa:
- Informacion Fiscal (direccion fiscal)
- Documentos: Acta constitutiva, Constancia situacion fiscal
- Documentos Rep. Legal: Frente INE, Reverso INE
- Cuentas Bancarias (minimo 1)"
```
