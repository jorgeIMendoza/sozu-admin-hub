// Centralized configuration constants
// N8N Webhook Configuration
export const N8N_WEBHOOK_BASE_URL = import.meta.env.VITE_N8N_WEBHOOK_BASE_URL || 'https://automatizacion-n8n.fbqqbe.easypanel.host/webhook';

// Supabase Configuration
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || '';

// Environment Configuration
export const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT || 'development';

// App Version (injected at build time)
export const APP_VERSION = `v${__APP_VERSION__}-${__BUILD_TIMESTAMP__}`;