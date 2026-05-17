-- Add column to store generated password for polo users
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS generated_password text;

-- Add comment explaining the column
COMMENT ON COLUMN public.polos.generated_password IS 'Stores the generated password for the polo user account';