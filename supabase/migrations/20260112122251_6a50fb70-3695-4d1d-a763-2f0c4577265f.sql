-- Add contract and payment status fields to enrollments
ALTER TABLE public.enrollments 
ADD COLUMN IF NOT EXISTS contract_status text DEFAULT 'pending' CHECK (contract_status IN ('pending', 'sent', 'signed', 'rejected')),
ADD COLUMN IF NOT EXISTS contract_document_id text,
ADD COLUMN IF NOT EXISTS contract_signed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'active', 'overdue', 'paid')),
ADD COLUMN IF NOT EXISTS access_blocked boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS block_reason text;

-- Add student additional data to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cpf text,
ADD COLUMN IF NOT EXISTS sex text,
ADD COLUMN IF NOT EXISTS birth_date text,
ADD COLUMN IF NOT EXISTS whatsapp text,
ADD COLUMN IF NOT EXISTS address_cep text,
ADD COLUMN IF NOT EXISTS address_street text,
ADD COLUMN IF NOT EXISTS address_number text,
ADD COLUMN IF NOT EXISTS address_neighborhood text,
ADD COLUMN IF NOT EXISTS address_city text,
ADD COLUMN IF NOT EXISTS address_state text;

-- Add monthly payment info to payments
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS due_date date,
ADD COLUMN IF NOT EXISTS installment_number integer,
ADD COLUMN IF NOT EXISTS total_installments integer;

-- Create index for faster queries on payment status
CREATE INDEX IF NOT EXISTS idx_enrollments_payment_status ON public.enrollments(payment_status);
CREATE INDEX IF NOT EXISTS idx_enrollments_access_blocked ON public.enrollments(access_blocked);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON public.payments(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- Function to check and update overdue payments
CREATE OR REPLACE FUNCTION public.check_overdue_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update payments that are past due date
  UPDATE public.payments
  SET status = 'OVERDUE'
  WHERE status = 'PENDING'
    AND due_date < CURRENT_DATE;
  
  -- Block access for users with overdue payments
  UPDATE public.enrollments e
  SET access_blocked = true,
      payment_status = 'overdue',
      block_reason = 'Pagamento em atraso'
  WHERE EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.user_id = e.user_id
      AND p.course_id = e.course_id
      AND p.status = 'OVERDUE'
  );
  
  -- Unblock access for users without overdue payments and with signed contract
  UPDATE public.enrollments e
  SET access_blocked = false,
      payment_status = 'active',
      block_reason = NULL
  WHERE contract_status = 'signed'
    AND NOT EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.user_id = e.user_id
        AND p.course_id = e.course_id
        AND p.status = 'OVERDUE'
    );
END;
$$;