-- Add migration columns to enrollments table
ALTER TABLE public.enrollments 
ADD COLUMN IF NOT EXISTS is_migrated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS migration_source text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS migrated_at timestamp with time zone DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.enrollments.is_migrated IS 'Indicates if student was migrated from another platform (e.g., Moodle)';
COMMENT ON COLUMN public.enrollments.migration_source IS 'Source platform name (e.g., moodle)';
COMMENT ON COLUMN public.enrollments.migrated_at IS 'When the migration occurred';