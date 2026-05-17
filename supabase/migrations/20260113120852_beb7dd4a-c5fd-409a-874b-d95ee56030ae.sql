-- Add 'polo' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'polo';

-- Create polo_users table to link users to polos
CREATE TABLE public.polo_users (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    polo_id UUID NOT NULL REFERENCES public.polos(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.polo_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage polo_users"
ON public.polo_users
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own polo assignment"
ON public.polo_users
FOR SELECT
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_polo_users_polo_id ON public.polo_users(polo_id);
CREATE INDEX idx_polo_users_user_id ON public.polo_users(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_polo_users_updated_at
BEFORE UPDATE ON public.polo_users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();