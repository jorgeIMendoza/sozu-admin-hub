ALTER TABLE public.avisos
ADD COLUMN IF NOT EXISTS personalizado boolean NOT NULL DEFAULT false;