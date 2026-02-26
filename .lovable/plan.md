

# Portal Agente: Permisos, Logs de Actividad y Mediciones CTA

## Resumen

Se realizaran 3 mejoras transversales a las 5 vistas del Portal Agente (Inicio, Inventario, Pipeline, Comisiones, Perfil) y se reconfigurara la pagina Mediciones CTA para soportar ambos contextos.

---

## 1. Inventario completo de CTAs por vista

### Inicio (`AgentInicio`)
| CTA | Permiso actual | Permiso correcto | Log actividad | CTA Tracker |
|-----|---------------|-------------------|---------------|-------------|
| Nuevo prospecto | canCreate | OK | Falta | Falta |
| Agendar cita | canCreate | OK | Falta | Falta |
| Completar ahora (ir a perfil) | Ninguno | canRead (lectura) | Falta | Falta |
| Click item atencion | Ninguno | canRead | Falta | Falta |

### Inventario (`AgentInventario`)
| CTA | Permiso actual | Permiso correcto | Log actividad | CTA Tracker |
|-----|---------------|-------------------|---------------|-------------|
| Ver unidades (por proyecto) | Ninguno | canRead | Falta | Falta |
| Ver Desarrollo | Ninguno | canRead | Falta | Falta |
| Compartir (abrir dialog) | Ninguno | canRead | Falta | Falta |
| Compartir plataforma (WA/FB/Email/Copy) | Ninguno | canRead | Falta | Falta |
| Buscar desarrollo (input) | N/A | N/A | N/A | Falta |

### Detalle Desarrollo (`AgentProyectoDetalle`)
| CTA | Permiso actual | Permiso correcto | Log actividad | CTA Tracker |
|-----|---------------|-------------------|---------------|-------------|
| Descargar brochure | Ninguno | canRead | Falta | Falta |
| Descargar ficha tecnica | Ninguno | canRead | Falta | Falta |
| Generar oferta comercial | Ninguno | canGenerateOffer | Falta | Falta |
| Compartir proyecto | Ninguno | canRead | Falta | Falta |
| Compartir plataforma | Ninguno | canRead | Falta | Falta |
| Ver unidades (por modelo) | Ninguno | canRead | Falta | Falta |

### Unidades (`AgentUnidadesProyecto`)
| CTA | Permiso actual | Permiso correcto | Log actividad | CTA Tracker |
|-----|---------------|-------------------|---------------|-------------|
| Filtros (abrir drawer) | Ninguno | canRead | N/A | Falta |
| Ordenar precio | Ninguno | canRead | N/A | Falta |
| Click unidad (abrir detalle) | Ninguno | canRead | Falta | Falta |
| Configurar Oferta | canGenerateOffer | OK | Falta | Falta |

### Pipeline (`AgentPipeline`)
| CTA | Permiso actual | Permiso correcto | Log actividad | CTA Tracker |
|-----|---------------|-------------------|---------------|-------------|
| Nueva oferta | canUpdate | canCreate | Falta | Falta |
| Filtro por etapa | Ninguno | canRead | N/A | Falta |

### Comisiones (`AgentComisiones`)
| CTA | Permiso actual | Permiso correcto | Log actividad | CTA Tracker |
|-----|---------------|-------------------|---------------|-------------|
| Completar perfil (bloqueado) | Ninguno | canRead | Falta | Falta |
| Filtro por tab | Ninguno | canRead | N/A | Falta |

### Perfil (`AgentPerfil`)
| CTA | Permiso actual | Permiso correcto | Log actividad | CTA Tracker |
|-----|---------------|-------------------|---------------|-------------|
| Abrir etapa onboarding | canUpdate | OK | Falta | Falta |
| Cerrar sesion | Ninguno | Siempre visible | Falta | Falta |

---

## 2. Cambios por archivo

### A. Agregar permisos faltantes

**AgentInventario.tsx**: Importar `useAgentPortalPermissions`, obtener permisos de `/admin/agent/inventario`. Condicionar "Ver unidades" y "Ver Desarrollo" a `canRead`, "Compartir" a `canRead`.

**AgentProyectoDetalle.tsx**: Importar `useAgentPortalPermissions`. Condicionar "Generar oferta comercial" a `canGenerateOffer`, descargas a `canRead`.

**AgentPipeline.tsx**: Cambiar "Nueva oferta" de `canUpdate` a `canCreate`.

**AgentComisiones.tsx**: Sin cambios de permisos (la vista ya muestra el bloqueo correcto por onboarding).

### B. Agregar logs de actividad (`useActivityLogger`)

En cada vista del portal agente, importar `useActivityLogger` y registrar:

- **Inicio**: `registrarCreacion('prospecto', ...)` al guardar prospecto, `registrarCreacion('cita_showroom', ...)` al agendar cita, `registrarVista('/admin/agent/inicio')` al cargar.
- **Inventario**: `registrarVista('/admin/agent/inventario')` al cargar.
- **Detalle**: `registrarVista('/admin/agent/inventario/proyecto/:id')`, `registrarExportacion('brochure', ...)`, `registrarExportacion('ficha_tecnica', ...)`.
- **Unidades**: `registrarVista('/admin/agent/inventario/unidades')`, ya tiene log de oferta via `NewOfferDialog`.
- **Pipeline**: `registrarVista('/admin/agent/pipeline')`.
- **Comisiones**: `registrarVista('/admin/agent/comisiones')`.
- **Perfil**: `registrarVista('/admin/agent/perfil')`, `registrarActualizacion('perfil_agente', ...)` en cada fase guardada.

### C. Agregar CTA tracking (`useCtaTracker`)

En cada vista, importar `useCtaTracker` y llamar `track()` en cada boton/accion relevante con `page` correspondiente al portal agente (ej. `agent_inicio`, `agent_inventario`, `agent_detalle_desarrollo`, `agent_unidades`, `agent_pipeline`, `agent_comisiones`, `agent_perfil`).

Cada CTA se registra con un `elementId` unico y descriptivo, por ejemplo:
- `btn_nuevo_prospecto`, `btn_agendar_cita`, `btn_completar_perfil`
- `btn_ver_unidades`, `btn_ver_desarrollo`, `btn_compartir`, `btn_compartir_plataforma`
- `btn_descargar_brochure`, `btn_descargar_ficha`, `btn_generar_oferta`
- `btn_detalle_unidad`, `btn_configurar_oferta`
- `btn_nueva_oferta`, `btn_filtro_etapa`
- `btn_completar_perfil_comisiones`, `btn_filtro_tab`
- `btn_etapa_onboarding`, `btn_cerrar_sesion`

### D. Reconfigurar Mediciones CTA (`MedicionesCTA.tsx`)

**Estructura actual**: La pagina muestra metricas de "Datos de inmobiliaria" (inventario, desarrollos, detalle).

**Nueva estructura**:
1. Agregar un `Select` al inicio con dos opciones: "Datos de inmobiliaria" y "Portal Agente"
2. Cuando se selecciona "Datos de inmobiliaria", se muestra exactamente lo que hay hoy (sin cambios)
3. Cuando se selecciona "Portal Agente":
   - Summary cards (total clicks, CTAs unicos, usuarios unicos, visitas)
   - Tabs con los 5 botones de navegacion: Inicio, Inventario, Pipeline, Comisiones, Perfil
   - Dentro de cada tab, grafico de barras con los CTAs de esa vista y sus conteos
   - Seccion de conversion de modales (prospecto, cita) filtrada por portal
   - Seccion de perfil/onboarding (fases) ya existente, reutilizada

El filtrado se hace por el campo `page` del `cta_events`, usando el prefijo `agent_` para distinguir eventos del portal agente.

---

## 3. Archivos a modificar

1. `src/pages/admin/agent-portal/AgentInicio.tsx` - permisos, logs, CTA tracking
2. `src/pages/admin/agent-portal/AgentInventario.tsx` - permisos, logs, CTA tracking
3. `src/pages/admin/agent-portal/AgentProyectoDetalle.tsx` - permisos, logs, CTA tracking
4. `src/pages/admin/agent-portal/AgentUnidadesProyecto.tsx` - logs, CTA tracking
5. `src/pages/admin/agent-portal/AgentPipeline.tsx` - fix permiso Nueva oferta, logs, CTA tracking
6. `src/pages/admin/agent-portal/AgentComisiones.tsx` - logs, CTA tracking
7. `src/pages/admin/agent-portal/AgentPerfil.tsx` - logs, CTA tracking
8. `src/pages/admin/MedicionesCTA.tsx` - reestructurar con selector + tabs por vista del portal

---

## 4. Sin cambios de base de datos

No se requieren migraciones. La tabla `cta_events` ya soporta los campos necesarios (`page`, `element_id`, `element_label`, `metadata`). Los logs usan `logs_actividad` existente.

