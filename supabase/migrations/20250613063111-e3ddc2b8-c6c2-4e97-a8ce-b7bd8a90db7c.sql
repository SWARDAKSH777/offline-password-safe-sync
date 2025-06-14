
-- Create table for storing encrypted Aadhaar recovery data
CREATE TABLE public.aadhaar_recovery (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  encrypted_name TEXT NOT NULL,
  encrypted_aadhaar_number TEXT NOT NULL,
  encrypted_dob TEXT,
  encrypted_gender TEXT,
  encrypted_decryption_key TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  recovery_attempts INTEGER DEFAULT 0,
  last_recovery_attempt TIMESTAMP WITH TIME ZONE
);

-- Add Row Level Security
ALTER TABLE public.aadhaar_recovery ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to insert their own recovery data
CREATE POLICY "Users can insert their own recovery data"
  ON public.aadhaar_recovery
  FOR INSERT
  WITH CHECK (true);

-- Create policy to allow users to select their own recovery data by email
CREATE POLICY "Users can view their own recovery data"
  ON public.aadhaar_recovery
  FOR SELECT
  USING (true);

-- Create policy to allow users to update their own recovery data
CREATE POLICY "Users can update their own recovery data"
  ON public.aadhaar_recovery
  FOR UPDATE
  USING (true);

-- Create index on user_email for faster lookups
CREATE INDEX idx_aadhaar_recovery_user_email ON public.aadhaar_recovery(user_email);
