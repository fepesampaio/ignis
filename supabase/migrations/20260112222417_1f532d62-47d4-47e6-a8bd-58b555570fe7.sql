-- Create polos table
CREATE TABLE public.polos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  city TEXT,
  state TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.polos ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage polos" 
ON public.polos 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active polos" 
ON public.polos 
FOR SELECT 
USING (is_active = true);

-- Add polo_id to enrollments
ALTER TABLE public.enrollments 
ADD COLUMN polo_id UUID REFERENCES public.polos(id);

-- Create trigger for updated_at
CREATE TRIGGER update_polos_updated_at
BEFORE UPDATE ON public.polos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();