-- Drop the api_keys_secrets table as we will use native Supabase Secrets instead
DROP TABLE IF EXISTS public.api_keys_secrets CASCADE;