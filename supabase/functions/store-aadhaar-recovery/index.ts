
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const { userEmail, name, aadhaarNumber, dob, gender, decryptionKey } = await req.json()

    if (!userEmail || !name || !aadhaarNumber || !decryptionKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Simple encryption using built-in crypto (for demo purposes)
    const encoder = new TextEncoder()
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
    
    // In a real implementation, you'd use proper encryption here
    const encryptedName = btoa(name)
    const encryptedAadhaarNumber = btoa(aadhaarNumber)
    const encryptedDob = dob ? btoa(dob) : null
    const encryptedGender = gender ? btoa(gender) : null
    const encryptedDecryptionKey = btoa(JSON.stringify(decryptionKey))

    // Check if recovery data already exists for this email
    const { data: existing, error: selectError } = await supabase
      .from('aadhaar_recovery')
      .select('id')
      .eq('user_email', userEmail)
      .maybeSingle()

    if (selectError) {
      console.error('Error checking existing data:', selectError)
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    let result
    if (existing) {
      // Update existing record
      result = await supabase
        .from('aadhaar_recovery')
        .update({
          encrypted_name: encryptedName,
          encrypted_aadhaar_number: encryptedAadhaarNumber,
          encrypted_dob: encryptedDob,
          encrypted_gender: encryptedGender,
          encrypted_decryption_key: encryptedDecryptionKey,
          salt: saltHex,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
    } else {
      // Insert new record
      result = await supabase
        .from('aadhaar_recovery')
        .insert({
          user_email: userEmail,
          encrypted_name: encryptedName,
          encrypted_aadhaar_number: encryptedAadhaarNumber,
          encrypted_dob: encryptedDob,
          encrypted_gender: encryptedGender,
          encrypted_decryption_key: encryptedDecryptionKey,
          salt: saltHex
        })
    }

    if (result.error) {
      console.error('Database error:', result.error)
      return new Response(
        JSON.stringify({ error: 'Failed to store recovery data' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Recovery data stored successfully' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
