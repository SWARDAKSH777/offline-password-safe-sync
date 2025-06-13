import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface AadhaarRecoveryData {
  userEmail: string
  name: string
  aadhaarNumber: string
  dob?: string
  gender?: string
  decryptionKey: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (req.method !== 'POST') {
      throw new Error('Method not allowed')
    }

    const { userEmail, name, aadhaarNumber, dob, gender, decryptionKey }: AadhaarRecoveryData = await req.json()

    // Validate input
    if (!userEmail || !name || !aadhaarNumber || !decryptionKey) {
      throw new Error('Missing required fields')
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
    if (!emailRegex.test(userEmail)) {
      throw new Error('Invalid email format')
    }

    // Validate Aadhaar number format (12 digits)
    if (!/^\d{12}$/.test(aadhaarNumber.replace(/\s/g, ''))) {
      throw new Error('Invalid Aadhaar number format')
    }

    // Generate a unique salt for this user
    const salt = await bcrypt.genSalt(12)

    // Encrypt sensitive data with bcrypt
    const encryptedName = await bcrypt.hash(name.toLowerCase().trim(), salt)
    const encryptedAadhaarNumber = await bcrypt.hash(aadhaarNumber.replace(/\s/g, ''), salt)
    const encryptedDob = dob ? await bcrypt.hash(dob, salt) : null
    const encryptedGender = gender ? await bcrypt.hash(gender.toLowerCase(), salt) : null
    const encryptedDecryptionKey = await bcrypt.hash(JSON.stringify(decryptionKey), salt)

    // Store in database
    const { data, error } = await supabaseClient
      .from('aadhaar_recovery')
      .upsert({
        user_email: userEmail,
        encrypted_name: encryptedName,
        encrypted_aadhaar_number: encryptedAadhaarNumber,
        encrypted_dob: encryptedDob,
        encrypted_gender: encryptedGender,
        encrypted_decryption_key: encryptedDecryptionKey,
        salt: salt,
        recovery_attempts: 0,
        last_recovery_attempt: null
      }, {
        onConflict: 'user_email'
      })

    if (error) {
      console.error('Database error:', error)
      throw new Error('Failed to store recovery data')
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Aadhaar recovery data stored successfully' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})