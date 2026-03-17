// Centralized configuration constants
// N8N Webhook Configuration
export const N8N_WEBHOOK_BASE_URL = import.meta.env.VITE_N8N_WEBHOOK_BASE_URL || 'https://automatizacion-n8n.fbqqbe.easypanel.host/webhook';

// Supabase Configuration
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://tzmhgfjmddkfyffkkmto.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6bWhnZmptZGRrZnlmZmtrbXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTU0NDUsImV4cCI6MjA3MjkzMTQ0NX0.8DaFtWO6zyJg14jFo_Zm2idYKwI-mvfmUtlixG2JDSE';
export const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'tzmhgfjmddkfyffkkmto';

// Environment Configuration
export const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT || 'production';

// App Version (injected at build time)
export const APP_VERSION = `v${__APP_VERSION__}-${__BUILD_TIMESTAMP__}`;