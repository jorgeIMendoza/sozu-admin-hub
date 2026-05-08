# 🤖 Guía Completa para Clonar ALO

**Sistema personalizado de IA para Jorge — OpenClaw Infrastructure & DevOps**

---

## 📑 Tabla de Contenidos

1. [Introducción: Quién es Alo](#introducción-quién-es-alo)
2. [Identidad y Comportamiento](#identidad-y-comportamiento)
3. [Requisitos Técnicos](#requisitos-técnicos)
4. [Infraestructura Base](#infraestructura-base)
5. [Configuración Paso a Paso](#configuración-paso-a-paso)
6. [Integraciones de Servicios](#integraciones-de-servicios)
7. [Estructura de Roles y Responsabilidades](#estructura-de-roles-y-responsabilidades)
8. [Flujos de Escalada y Decisiones](#flujos-de-escalada-y-decisiones)
9. [Troubleshooting y Mantenimiento](#troubleshooting-y-mantenimiento)
10. [Próximos Pasos](#próximos-pasos)

---

## 1. Introducción: Quién es Alo

**Alo** es una asistente de IA personalizada para **Jorge Mendoza**, responsable del mantenimiento, operaciones y seguridad del ecosistema de desarrollo OpenClaw (Sistema Multi-Agente).

### Contexto

- **Usuario Principal:** Jorge Mendoza (15 años exp. en desarrollo, Guadalajara, México)
- **Sector:** Software para bienes raíces, ERP completo
- **Stack:** Supabase, n8n, Lovable (Frontend), Node.js en VPS
- **Misión de Alo:** Mantener la infraestructura, seguridad y salud del sistema de agentes

### Diferencia entre Alo y Sebas

| Aspecto | Sebas (PM Global) | Alo (Mantenimiento) |
|---------|---|---|
| **Responsabilidad Principal** | Orquestar agentes para entregar features | Mantener infraestructura y seguridad |
| **Scope** | Funcionalidad del sistema | Operaciones, confiabilidad, seguridad |
| **Tareas Típicas** | Delegar a BA, Frontend, Backend, etc. | Parches de seguridad, CI/CD, monitoring |
| **Escalas** | Al usuario (Jorge) para aprobación | A Sebas para coordinación |

---

## 2. Identidad y Comportamiento

### Identidad Personal

- **Nombre:** Alo (por la hija mayor de Jorge)
- **Género:** Femenino
- **Voz TTS:** Siempre femenina
- **Personalidad:** Útil, graciosa pero seria cuando se requiere
- **Idioma:** SIEMPRE español, sin excepción

### Reglas Críticas de Comportamiento

1. **Responder en Español:** Toda comunicación debe ser en español, sin excepciones

2. **Llamar "su alteza":** Dirigirse siempre a Jorge como "su alteza"

3. **Pedir aprobación antes de escribir:** EXCEPTO en archivos permitidos permanentemente:
   - `IDENTITY.md`
   - `USER.md`
   - `SOUL.md`

4. **Audio solo cuando corresponde:** Usar TTS solo si Jorge envía audio primero, o si explícitamente pide que lo pueda oír

5. **Investigar antes de responder:** Para datos externos (precios, versiones, APIs), usar web_search primero

6. **Sincronizar Bitwarden:** SIEMPRE sincronizar antes de recuperar credenciales: `bw sync`

### ⚠️ CRÍTICO

Alo mantiene secretos de la organización. Nunca expongas credenciales en archivos públicos. Nunca compartas información sensible sin necesidad.

---

## 3. Requisitos Técnicos

### Hardware/Infraestructura

- VPS con Ubuntu (recomendado: 22.04 LTS o superior)
- Node.js v22.22.2 (ya instalado en VPS de Jorge)
- Acceso SSH a VPS con credenciales guardadas
- PostgreSQL (via Supabase)

### Software/Dependencias

- CLI de OpenClaw (instalado)
- Bitwarden CLI (`bw` instalado)
- Node.js SDK de Anthropic
- Cliente de Supabase
- curl para pruebas de API
- Git (control de versiones)

### Credenciales Requeridas

- **Bitwarden Master Password:** Guardada en `/home/srvsozu/.openclaw/secrets/.bw-credentials`
- **Bitwarden Client ID/Secret:** Para autenticación de máquina
- **Anthropic API Key:** Para SDK de Claude
- **Supabase Credentials:** URL + Service Role Key
- **Evolution API Key:** Para WhatsApp (en `secrets.env`)
- **Telegram Bot Token:** Para comunicación

---

## 4. Infraestructura Base

### Arquitectura del Sistema Multi-Agente

Alo es parte de un ecosistema más grande de 9 agentes especializados:

```
┌─────────────────────────────────────────────┐
│           JORGE (SU ALTEZA)                 │
│        (Aprobador Final)                    │
└────────────────────┬────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────▼─────┐           ┌────▼──────┐
    │   SEBAS   │           │    ALO     │
    │   (PM)    │           │(Mantenimiento)
    └────┬─────┘           └────────────┘
         │
  ┌──────┴──────────────────────────────┐
  │  8 Agentes Especializados           │
  ├──────────────────────────────────────┤
  │ 1. BA (Business Analyst)            │
  │ 2. FRONT (React/Next.js/Vue)        │
  │ 3. BACK (Supabase/Edge Functions)   │
  │ 4. BD (PostgreSQL)                  │
  │ 5. TST (Testing)                    │
  │ 6. DEVOPS (CI/CD)                   │
  │ 7. DOC (Documentación)              │
  │ 8. SOP (Soporte/Usuarios)           │
  └──────────────────────────────────────┘
```

### Stack Decidido

- **Runtime:** VPS (Node.js v22)
- **Memoria/BD:** Supabase (proyecto dedicado)
- **SDK:** Anthropic Node.js
- **Comunicación:** Telegram (canales por proyecto)
- **Visualización:** Dashboard Next.js (reemplaza Slack)
- **NO usar:** Docker, Cloud Run, Slack

### Base de Datos (Supabase)

Tablas requeridas en Supabase:

- `projects` — metadata de proyectos
- `agents` — definición de 9 agentes (ID, nombre, system prompt)
- `agent_project_context` — contexto por (agent_type, project_id)
- `tasks` — tareas asignadas a agentes
- `agent_messages` — historial de conversaciones
- `agent_logs` — logs de ejecución
- `sop_messages` — mensajes de usuarios finales via SOP

---

## 5. Configuración Paso a Paso — Comandos Prácticos

### ⚡ SCRIPT RÁPIDO (Copiar y Pegar)

Ejecuta estos comandos uno por uno en tu VPS:

```bash
# 1. ACCEDER AL VPS (desde tu máquina local)
ssh srvsozu@[VPS_IP]

# 2. VERIFICAR NODE.JS
node --version
npm --version

# 3. CREAR DIRECTORIO
mkdir -p /home/srvsozu/agentes-sistema
cd /home/srvsozu/agentes-sistema

# 4. DESBLOQUEAR BITWARDEN
source /home/srvsozu/.openclaw/secrets/.bw-credentials
export BW_SESSION=$(echo "$BW_MASTER_PASSWORD" | bw unlock --raw 2>/dev/null)

# 5. SINCRONIZAR BITWARDEN
bw sync

# 6. OBTENER CREDENCIALES (copia los valores que aparecen)
echo "=== ANTHROPIC API KEY ==="
bw get item anthropic-api-key | grep '"password"' | head -1

echo "=== SUPABASE URL ==="
bw get item supabase-agentes | grep '"password"' | head -1

echo "=== TELEGRAM BOT TOKEN ==="
bw get item telegram-bot-token | grep '"password"' | head -1

echo "=== EVOLUTION API KEY ==="
cat /home/srvsozu/.openclaw/secrets.env | grep EVOLUTION_API_KEY

# 7. INICIALIZAR PROYECTO NODE.JS
npm init -y

# 8. INSTALAR TODAS LAS DEPENDENCIAS DE UNA VEZ
npm install @anthropic-ai/sdk @supabase/supabase-js dotenv node-telegram-bot-api pm2

# 9. CREAR ARCHIVO .env.local (REEMPLAZA LOS VALORES)
cat > .env.local << 'EOF'
ANTHROPIC_API_KEY=tu_api_key_aqui
SUPABASE_URL=tu_supabase_url
SUPABASE_SERVICE_KEY=tu_service_key
TELEGRAM_BOT_TOKEN=tu_bot_token
EVOLUTION_API_URL=tu_evolution_url
EVOLUTION_API_KEY=tu_evolution_key
EOF

# 10. AGREGAR .env.local A .gitignore
echo ".env.local" >> .gitignore

# 11. CREAR agents.js (ARCHIVO BASE)
cat > agents.js << 'EOF'
const agents = {
  po: {
    name: "PO",
    role: "Orquestador",
    systemPrompt: "Eres el Project Officer. Coordinas a todos los agentes y reportas a Jorge."
  },
  ba: {
    name: "BA",
    role: "Business Analyst",
    systemPrompt: "Eres el Business Analyst. Entiendes procesos y requisitos de negocio."
  },
  front: {
    name: "FRONT",
    role: "Frontend Developer",
    systemPrompt: "Eres desarrollador frontend especializado en React, Next.js y Vue."
  },
  back: {
    name: "BACK",
    role: "Backend Developer",
    systemPrompt: "Eres desarrollador backend especializado en Supabase y Edge Functions."
  },
  bd: {
    name: "BD",
    role: "Database Engineer",
    systemPrompt: "Eres ingeniero de BD especializado en PostgreSQL y diseño de esquemas."
  },
  tst: {
    name: "TST",
    role: "QA Tester",
    systemPrompt: "Eres QA especializado en testing E2E, regresión y automatización."
  },
  devops: {
    name: "DEVOPS",
    role: "DevOps Engineer",
    systemPrompt: "Eres DevOps especializado en CI/CD, deployments y monitoreo."
  },
  doc: {
    name: "DOC",
    role: "Documentation Specialist",
    systemPrompt: "Eres especialista en documentación técnica y funcional."
  },
  sop: {
    name: "SOP",
    role: "Support Operator",
    systemPrompt: "Eres el agente de soporte. Comunicas con usuarios finales vía Telegram."
  }
};

module.exports = agents;
EOF

# 12. CREAR orchestrator.js (TEMPLATE BÁSICO)
cat > orchestrator.js << 'EOF'
require('dotenv').config({ path: '.env.local' });
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

// Inicializar clientes
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Variables
const JORGE_CHAT_ID = process.env.JORGE_CHAT_ID || '8695453779';

console.log('✅ Orquestador Alo iniciando...');
console.log('🤖 Escuchando mensajes de Jorge en Telegram');

// Escuchar mensajes
bot.on('message', async (msg) => {
  try {
    console.log(`📨 Mensaje de Jorge: ${msg.text}`);
    
    // Aquí iría la lógica de orquestación
    // Por ahora, solo confirma que recibió el mensaje
    await bot.sendMessage(msg.chat.id, '✅ Mensaje recibido, su alteza. Alo está operativo.');
    
  } catch (error) {
    console.error('❌ Error:', error);
    bot.sendMessage(JORGE_CHAT_ID, `❌ Error en orquestador: ${error.message}`);
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('❌ Error de polling:', error);
});

console.log('✅ Alo está lista para servir');
EOF

# 13. AGREGAR LOGS
mkdir -p logs

# 14. INSTALAR PM2 GLOBALMENTE (SI NO ESTÁ)
npm install -g pm2

# 15. INICIAR CON PM2
pm2 start orchestrator.js --name "alo-orchestrator"

# 16. GUARDAR CONFIGURACIÓN DE PM2
pm2 save

# 17. VERIFICAR ESTADO
pm2 status
```

---

### ✅ Paso a Paso Manual (si prefieres hacerlo paso a paso)

**1. Entra al VPS:**
```bash
ssh srvsozu@[VPS_IP]
```

**2. Verifica Node.js:**
```bash
node --version  # Debe ser v22+
npm --version
```

**3. Crea el directorio:**
```bash
mkdir -p /home/srvsozu/agentes-sistema
cd /home/srvsozu/agentes-sistema
```

**4. Desbloquea Bitwarden:**
```bash
source /home/srvsozu/.openclaw/secrets/.bw-credentials
export BW_SESSION=$(echo "$BW_MASTER_PASSWORD" | bw unlock --raw 2>/dev/null)
bw sync
```

**5. Obtén credenciales (copia los valores):**
```bash
bw get item anthropic-api-key
bw get item supabase-agentes
bw get item telegram-bot-token
cat /home/srvsozu/.openclaw/secrets.env
```

**6. Inicia el proyecto npm:**
```bash
npm init -y
```

**7. Instala dependencias:**
```bash
npm install @anthropic-ai/sdk @supabase/supabase-js dotenv node-telegram-bot-api pm2
```

**8. Crea el archivo `.env.local`:**
```bash
nano .env.local
```

Pega esto (reemplaza con tus valores reales):
```
ANTHROPIC_API_KEY=[TU_API_KEY_AQUI]
SUPABASE_URL=[TU_SUPABASE_URL]
SUPABASE_SERVICE_KEY=[TU_SERVICE_KEY]
TELEGRAM_BOT_TOKEN=[TU_BOT_TOKEN]
EVOLUTION_API_URL=[TU_EVOLUTION_URL]
EVOLUTION_API_KEY=[TU_EVOLUTION_KEY]
JORGE_CHAT_ID=8695453779
```

Guarda: `Ctrl+O` → Enter → `Ctrl+X`

**9. Agrega a .gitignore:**
```bash
echo ".env.local" >> .gitignore
echo "node_modules/" >> .gitignore
echo "logs/" >> .gitignore
```

**10. Crea agents.js:**
```bash
nano agents.js
```

Pega el contenido de agents.js (ver sección anterior)

**11. Crea orchestrator.js:**
```bash
nano orchestrator.js
```

Pega el contenido de orchestrator.js (ver sección anterior)

**12. Crea carpeta de logs:**
```bash
mkdir -p logs
```

**13. Inicia con PM2:**
```bash
pm2 start orchestrator.js --name "alo-orchestrator"
pm2 save
pm2 status
```

**14. Ver logs en vivo:**
```bash
pm2 logs alo-orchestrator
```

---

### 🧪 Verificar que todo funciona

**Revisa el status:**
```bash
pm2 status
```

**Revisa los logs:**
```bash
pm2 logs alo-orchestrator
```

**Envía un mensaje a Telegram:**
- Abre Telegram
- Escribe a tu bot
- Debe responder con: "✅ Mensaje recibido, su alteza. Alo está operativo."

**Si hay error, revisa:**
```bash
pm2 logs alo-orchestrator --err
```

---

## 6. Integraciones de Servicios

### 6.1 Bitwarden — Vault de Credenciales

#### Ubicación de Credenciales
```
/home/srvsozu/.openclaw/secrets/.bw-credentials
```

Contiene: `BW_CLIENTID`, `BW_CLIENTSECRET`, `BW_MASTER_PASSWORD`

#### Cómo Desbloquear
```bash
source /home/srvsozu/.openclaw/secrets/.bw-credentials
export BW_SESSION=$(echo "$BW_MASTER_PASSWORD" | bw unlock --raw 2>/dev/null)
```

#### Sincronizar Antes de Leer
```bash
bw sync
```

⚠️ **CRÍTICO:** SIEMPRE sincronizar antes de recuperar valores, para asegurar que tienes la versión más reciente del vault.

### 6.2 Supabase — Base de Datos

#### Proyecto Dedicado

- **Propósito:** Memoria y contexto del sistema de agentes
- **Credenciales en Bitwarden:** Buscar "supabase-agentes"
- **Variables:** SUPABASE_URL, SUPABASE_SERVICE_KEY
- **Tablas existentes:** agents, agent_project_context, tasks, agent_messages, agent_logs, sop_messages
- **Nota:** La BD es permanente en Supabase. Solo conecta con tus credenciales.

### 6.3 Evolution API — WhatsApp

#### Credenciales

Ubicación: `/home/srvsozu/.openclaw/secrets.env`

- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE` = "Pruebas de todo"

#### Formato de Número Mexicano

```
Número: 3531682550
Con prefijo: 523531682550
(Agregar 52, sin +, sin guiones, sin espacios)
```

#### Ejemplo de Envío

```bash
curl -X POST \
  "https://whatsapp-evolution-api.fbqqbe.easypanel.host/message/sendText/Pruebas%20de%20todo" \
  -H "apikey: TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number": "523531682550", "text": "Hola!"}'
```

### 6.4 Anthropic API — SDK de Claude

#### Instalación

```bash
npm install @anthropic-ai/sdk
```

#### Uso Básico

```javascript
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const response = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 1024,
  system: 'Tu system prompt aquí',
  messages: [
    { role: 'user', content: 'Pregunta del usuario' }
  ]
});

console.log(response.content[0].text);
```

### 6.5 Telegram — Comunicación con Jorge

#### Instalación

```bash
npm install node-telegram-bot-api
```

#### Conexión Básica

```javascript
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
  console.log('Mensaje de Jorge:', msg.text);
  bot.sendMessage(msg.chat.id, 'Mensaje recibido, su alteza');
});
```

---

## 7. Estructura de Roles y Responsabilidades

### Alo — Mantenimiento y DevOps

#### Responsabilidades Directas

- ✅ Actualizaciones de dependencias de Node.js/npm
- ✅ Parches de seguridad (monitoreo Cyber Neo)
- ✅ CI/CD pipeline y deployment
- ✅ Monitoreo de logs y alertas
- ✅ Documentación técnica del sistema
- ✅ Respaldo y recuperación de datos
- ✅ Acceso y gestión de Bitwarden

#### NO Responsabilidades de Alo (Territorio de Sebas)

- ❌ Orquestar agentes para features nuevas
- ❌ Asignar tareas a agentes especializados
- ❌ Consultar con usuarios finales

### Flujo de Comunicación

```
Jorge (su alteza) ← Solicita feature
     ↓
SEBAS ← Recibe solicitud
     ↓
SEBAS + PM-Área ← Analizan juntos
     ↓
SEBAS → Notifica a Jorge
     ↓
Jorge Aprueba
     ↓
Agentes Especializados ← Ejecutan tareas
     ↓
ALO ← Apoya infraestructura y seguridad
```

---

## 8. Flujos de Escalada y Decisiones

### Flujo Jerárquico Completo

1. **Usuarios Finales:** Envían feedback vía Telegram (canales por proyecto)
2. **Agente SOP:** Recopila TODO el feedback, escucha múltiples canales
3. **PM Global (Sebas):** Recibe escalaciones del SOP
4. **PM Global + PM-Área:** Analizan juntos, deciden plan operativo
5. **PM Global → Jorge:** Notifica con plan completo y asignaciones
6. **Jorge Aprueba:** Visto bueno antes de ejecutar
7. **Agentes Especializados:** Ejecutan tareas asignadas
8. **Alo (DevOps):** Apoya en paralelo (monitoreo, seguridad, logs)

### Punto Crítico de Control

⚠️ **ANTES DE EJECUTAR:** PM Global DEBE notificar a Jorge con detalles de qué se va a hacer y ESPERAR aprobación explícita. Solo proceder si Jorge autoriza.

### Canales Telegram

- **Múltiples canales:** Uno por cada proyecto
- **Stakeholders:** Participan en canales de sus proyectos
- **Agente SOP:** Acceso a TODOS los canales (centraliza feedback)
- **PM Global:** Se conecta con SOP para recibir escalaciones

---

## 9. Troubleshooting y Mantenimiento

### Problema: No se conecta a Bitwarden

**Solución:**
```bash
source /home/srvsozu/.openclaw/secrets/.bw-credentials
bw lock
export BW_SESSION=$(echo "$BW_MASTER_PASSWORD" | bw unlock --raw 2>/dev/null)
bw sync
```

### Problema: API Key de Anthropic no funciona

**Verificación:**
```bash
echo $ANTHROPIC_API_KEY
bw get item anthropic-api-key | grep "password"
```

Asegúrate de que la key esté actualizada en Bitwarden.

### Problema: Supabase conexión lenta

**Solución:**
```bash
npm list @supabase/supabase-js
npm update @supabase/supabase-js
```

### Problema: Mensaje de WhatsApp no se envía

**Verificar:**
1. Formato del número (debe tener prefijo 52 para México)
2. API Key en `secrets.env` está correcta
3. Instancia "Pruebas de todo" está activa
4. Respuesta es "PENDING" (no error)

### Problema: Agente no responde

**Pasos de debug:**
```bash
1. Revisar logs: tail -f /var/log/agentes-sistema.log
2. Revisar BD: SELECT COUNT(*) FROM agent_messages;
3. Reiniciar agente: pm2 restart agente-name
4. Revisar system prompt en agents.js
```

### Mantenimiento Regular

- **Semanal:** Revisar logs de errores y alertas
- **Quincenal:** Sincronizar y actualizar Bitwarden
- **Mensual:** Actualizar dependencias npm
- **Trimestral:** Revisar y purgar logs antiguos
- **Semestral:** Auditar accesos y permisos

---

## 10. Próximos Pasos

### Para Clonar Completamente a Alo en Otra Instancia:

**Paso 1 - Exportar Configuración**

Guardar:
- Este documento (GUIA_CLONAR_ALO.md)
- Archivos de memoria (MEMORY.md y archivos individuales)
- agents.js (definiciones de agentes)
- orchestrator.js (lógica del orquestador)
- package.json (dependencias)

**Paso 2 - Transferir a Nueva Máquina**

Copiar archivos y estructura a nueva ubicación (VPS, otra máquina, etc.)

**Paso 3 - Recrear .env.local**

Con credenciales nuevas de Bitwarden (o mismas si es réplica idéntica)

**Paso 4 - Instalar Dependencias**

```bash
npm install
```

**Paso 5 - Ejecutar Tests**

Verificar que todos los servicios estén disponibles

**Paso 6 - Iniciar Sistema**

```bash
npm start
# O con PM2:
pm2 start orchestrator.js --name "alo-orquestador"
```

### ✅ Checklist Final

- ✅ Node.js v22+ instalado
- ✅ Bitwarden CLI configurado y sincronizado
- ✅ API Key de Anthropic válida en Bitwarden
- ✅ Proyecto Supabase creado con tablas base
- ✅ Bot de Telegram creado y token guardado
- ✅ Evolution API Key configurada
- ✅ package.json con todas las dependencias
- ✅ .env.local creado (NO en git)
- ✅ agents.js con 9 agentes definidos
- ✅ orchestrator.js conectado a Telegram y Supabase
- ✅ Logs configurados
- ✅ PM2 configurado (opcional pero recomendado)

---

## Archivos de Referencia Rápida

| Archivo/Ubicación | Contenido | Acceso |
|---|---|---|
| `/home/srvsozu/.openclaw/secrets/.bw-credentials` | Credenciales de Bitwarden (ID, Secret, Password) | Lectura local |
| `/home/srvsozu/.openclaw/secrets.env` | Variables de Evolution API y otros servicios | Lectura local |
| `/home/srvsozu/agentes-sistema/` | Directorio raíz del sistema de agentes | Lectura/Escritura |
| `Bitwarden Vault` | Todas las API keys y credenciales centralizadas | Via bw CLI |
| `Supabase Dashboard` | Base de datos de agentes, tareas, contexto | Web |

---

**Documento:** Guía Completa para Clonar Alo  
**Versión:** 1.0  
**Fecha:** 2026-05-05  
**Para:** Jorge Mendoza (Su Alteza)  
**Preparado por:** Alo (Sistema de Mantenimiento OpenClaw)
