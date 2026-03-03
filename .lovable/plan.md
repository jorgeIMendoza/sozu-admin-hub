

## Plan: Firmantes configurables + PDF enriquecido + Firma autografa del agente

### Resumen

Eliminar todos los firmantes hardcodeados (incluyendo Rodrigo). Los firmantes se configuran desde la UI de Legal > Carta de Acuerdos y se guardan en la base de datos. Cuando el agente firma autografamente desde su portal, su firma queda registrada inmediatamente (estado "firmado_parcial") y los demas firmantes configurados reciben un correo de Mifiel para firmar cuando gusten (desde la seccion Firmas o desde su correo).

### Flujo completo

1. Admin configura firmantes en Legal > Carta de Acuerdos (ej: Rodrigo, Director Legal, etc.)
2. Agente abre su portal > Perfil > Identidad > Documentos > "Firmar carta"
3. Se crea el documento en Mifiel con todos los firmantes (los configurados + el agente)
4. El agente firma autografamente con el widget embebido (garabato)
5. Al firmar, Mifiel envia correos a los demas firmantes y el webhook actualiza estado a "firmado_parcial"
6. Los otros firmantes pueden firmar desde su correo o desde la seccion Legal > Firmas (con un boton "Firmar" que abre el widget con su widget_id)
7. Cuando todos firman, el webhook marca "completado" y genera el documento tipo 48

---

### Cambios en base de datos

**Agregar columna `firmantes_config` a `carta_acuerdos_template`:**

```text
ALTER TABLE carta_acuerdos_template
ADD COLUMN firmantes_config JSONB DEFAULT '[]'::jsonb;
```

Estructura del campo:
```text
[
  { "name": "Rodrigo Terveen", "email": "rodrigo.terveen@sozu.com" },
  { "name": "Otro Director", "email": "otro@empresa.com" }
]
```

---

### Cambios en archivos

#### 1. `src/pages/admin/legal/CartaAcuerdos.tsx`

- Agregar una tercera pestania "Firmantes" (o seccion dentro del editor)
- UI para CRUD de firmantes: lista con nombre + email, boton agregar, boton eliminar
- El agente NO aparece aqui (es dinamico, se agrega automaticamente al crear el documento)
- Indicador visual de que el agente se agrega automaticamente
- Guardar `firmantes_config` junto con el template al hacer clic en "Guardar"
- En la pestania "Firmas": agregar boton "Firmar" para firmantes pendientes que tengan widget_id, abriendo el MifielSigningDialog

#### 2. `supabase/functions/mifiel-crear-documento/index.ts`

- Eliminar constantes hardcodeadas `SOZU_SIGNER_EMAIL` y `SOZU_SIGNER_NAME`
- Leer `firmantes_config` de la tabla `carta_acuerdos_template` junto con `contenido_html`
- Construir la lista de firmantes dinamicamente: firmantes_config + agente
- Enviar `send_invites: true` para que los firmantes fijos reciban correo inmediatamente
- **Mejorar parser HTML-to-PDF** para preservar formato:
  - `<strong>` / `<b>`: usar HelveticaBold
  - `<h1>`-`<h3>`: tamanio de fuente mayor + bold
  - `<ol>` / `<ul>` / `<li>`: listas con numeracion o vinetas
  - `<p>`, `<br>`: saltos de parrafo y linea
  - Preservar espaciado y margenes

#### 3. `supabase/functions/mifiel-webhook/index.ts`

- Sin cambios mayores. Ya maneja `firmado_parcial` y `completado` correctamente.
- El estado "firmado_parcial" se activa cuando el agente firma pero los demas no han firmado aun.

#### 4. `src/components/admin/AgentOnboardingStepDialog.tsx`

- Sin cambios en el flujo del agente. El agente sigue viendo "Firmar carta", se abre el widget, firma con garabato, y queda en estado "firmado_parcial" o "enviado" hasta que todos firmen.

---

### Detalles tecnicos

**Parser HTML mejorado en la Edge Function:**

```text
Logica de renderizado:
1. Tokenizar el HTML por bloques (h1-h3, p, ul/ol/li, strong, br)
2. Para cada bloque:
   - Encabezados: fontSize 16-20 + boldFont + espaciado extra
   - Parrafos: fontSize 11 + font regular
   - Negritas inline: cambiar a boldFont para ese segmento
   - Listas: prefijo "1." o "o" con indentacion
   - Saltos: incrementar Y
3. Word-wrap respetando cambios de fuente bold/regular
4. Paginacion automatica
```

**UI de Firmantes en CartaAcuerdos:**

```text
+------------------------------------------+
| Firmantes Configurados                   |
+------------------------------------------+
| Rodrigo Terveen                          |
| rodrigo.terveen@sozu.com          [X]    |
+------------------------------------------+
| Director Legal                           |
| legal@empresa.com                 [X]    |
+------------------------------------------+
| [Nombre]  [Email]  [+ Agregar]           |
+------------------------------------------+
| (i) El agente se agrega automaticamente  |
|     al momento de firmar                 |
+------------------------------------------+
```

**Boton "Firmar" en tabla de Firmas (para firmantes pendientes):**

En la pestania Firmas de CartaAcuerdos, cada firma con estado != "completado" mostrara un boton "Firmar" junto a cada firmante que tenga widget_id. Al hacer clic, abre el MifielSigningDialog con ese widget_id, permitiendo que Rodrigo (u otro firmante) firme directamente desde la seccion Legal.

