
import { createClient } from '@supabase/supabase-js'

// Use the integrated Supabase client instead
export { supabase } from '@/integrations/supabase/client'

// Types for the aadhaar_recovery table
export interface AadhaarRecoveryRow {
  id: string
  user_email: string
  encrypted_name: string
  encrypted_aadhaar_number: string
  encrypted_dob?: string
  encrypted_gender?: string
  encrypted_decryption_key: string
  salt: string
  created_at: string
  updated_at: string
  recovery_attempts: number
  last_recovery_attempt?: string
}
