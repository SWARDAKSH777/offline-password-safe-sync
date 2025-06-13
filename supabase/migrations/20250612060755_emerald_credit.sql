/*
  # Aadhaar Recovery System Database Schema

  1. New Tables
    - `aadhaar_recovery`
      - `id` (uuid, primary key)
      - `user_email` (text, unique)
      - `encrypted_name` (text)
      - `encrypted_aadhaar_number` (text)
      - `encrypted_dob` (text)
      - `encrypted_decryption_key` (text)
      - `salt` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      - `recovery_attempts` (integer, default 0)
      - `last_recovery_attempt` (timestamp)

  2. Security
    - Enable RLS on `aadhaar_recovery` table
    - Add policies for secure access
    - Add rate limiting for recovery attempts

  3. Indexes
    - Index on user_email for fast lookups
    - Index on created_at for cleanup operations
*/

CREATE TABLE IF NOT EXISTS aadhaar_recovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text UNIQUE NOT NULL,
  encrypted_name text NOT NULL,
  encrypted_aadhaar_number text NOT NULL,
  encrypted_dob text,
  encrypted_decryption_key text NOT NULL,
  salt text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  recovery_attempts integer DEFAULT 0,
  last_recovery_attempt timestamptz,
  CONSTRAINT valid_email CHECK (user_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT max_recovery_attempts CHECK (recovery_attempts <= 5)
);

-- Enable RLS
ALTER TABLE aadhaar_recovery ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_aadhaar_recovery_email ON aadhaar_recovery(user_email);
CREATE INDEX IF NOT EXISTS idx_aadhaar_recovery_created_at ON aadhaar_recovery(created_at);
CREATE INDEX IF NOT EXISTS idx_aadhaar_recovery_attempts ON aadhaar_recovery(last_recovery_attempt) WHERE recovery_attempts > 0;

-- RLS Policies
CREATE POLICY "Service role can manage aadhaar recovery data"
  ON aadhaar_recovery
  FOR ALL
  TO service_role
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_aadhaar_recovery_updated_at
  BEFORE UPDATE ON aadhaar_recovery
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up old recovery data (optional, for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_recovery_data()
RETURNS void AS $$
BEGIN
  DELETE FROM aadhaar_recovery 
  WHERE created_at < now() - interval '2 years';
END;
$$ language 'plpgsql';