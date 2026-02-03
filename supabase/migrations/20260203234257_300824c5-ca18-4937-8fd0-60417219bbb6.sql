-- Add es_draft column to personas table for draft inmobiliarias feature
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS es_draft BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN public.personas.es_draft IS 'Indicates if this persona was created via public registration and is pending approval';