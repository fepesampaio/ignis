-- Add payment configuration fields to courses table
ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS installment_price NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS installment_count INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.courses.installment_price IS 'Valor de cada parcela do curso em reais';
COMMENT ON COLUMN public.courses.installment_count IS 'Número total de parcelas do curso';