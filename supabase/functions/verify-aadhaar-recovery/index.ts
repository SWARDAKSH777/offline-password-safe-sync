import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface VerificationRequest {
  userEmail: string
  name: string
  aadhaarNumber: string
  dob?: string
  gender?: string
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

    const { userEmail, name, aadhaarNumber, dob, gender }: VerificationRequest = await req.json()

    // Validate input
    if (!userEmail || !name || !aadhaarNumber) {
      throw new Error('Missing required fields')
    }

    // Get stored recovery data
    const { data: recoveryData, error: fetchError } = await supabaseClient
      .from('aadhaar_recovery')
      .select('*')
      .eq('user_email', userEmail)
      .single()

    if (fetchError || !recoveryData) {
      throw new Error('No recovery data found for this email')
    }

    // Check rate limiting (max 5 attempts per day)
    const now = new Date()
    const lastAttempt = recoveryData.last_recovery_attempt ? new Date(recoveryData.last_recovery_attempt) : null
    const daysSinceLastAttempt = lastAttempt ? (now.getTime() - lastAttempt.getTime()) / (1000 * 60 * 60 * 24) : 1

    if (recoveryData.recovery_attempts >= 5 && daysSinceLastAttempt < 1) {
      throw new Error('Too many recovery attempts. Please try again after 24 hours.')
    }

    // Reset attempts if more than 24 hours have passed
    let currentAttempts = recoveryData.recovery_attempts
    if (daysSinceLastAttempt >= 1) {
      currentAttempts = 0
    }

    // Verify the provided data against stored encrypted data
    const nameMatch = await bcrypt.compare(name.toLowerCase().trim(), recoveryData.encrypted_name)
    const aadhaarMatch = await bcrypt.compare(aadhaarNumber.replace(/\s/g, ''), recoveryData.encrypted_aadhaar_number)
    
    let dobMatch = true // Default to true if no DOB stored
    if (recoveryData.encrypted_dob && dob) {
      dobMatch = await bcrypt.compare(dob, recoveryData.encrypted_dob)
    }

    let genderMatch = true // Default to true if no gender stored
    if (recoveryData.encrypted_gender && gender) {
      genderMatch = await bcrypt.compare(gender.toLowerCase(), recoveryData.encrypted_gender)
    }

    // Update recovery attempts
    const newAttempts = currentAttempts + 1
    await supabaseClient
      .from('aadhaar_recovery')
      .update({
        recovery_attempts: newAttempts,
        last_recovery_attempt: now.toISOString()
      })
      .eq('user_email', userEmail)

    // Check if verification passed
    if (nameMatch && aadhaarMatch && dobMatch && genderMatch) {
      // Send email with decryption key (in production, use a proper email service)
      await sendRecoveryEmail(userEmail, recoveryData.encrypted_decryption_key, recoveryData.salt)
      
      // Reset recovery attempts on successful verification
      await supabaseClient
        .from('aadhaar_recovery')
        .update({
          recovery_attempts: 0,
          last_recovery_attempt: null
        })
        .eq('user_email', userEmail)

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Verification successful. Decryption key has been sent to your email.' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    } else {
      const failedFields = []
      if (!nameMatch) failedFields.push('name')
      if (!aadhaarMatch) failedFields.push('Aadhaar number')
      if (!dobMatch) failedFields.push('date of birth')
      if (!genderMatch) failedFields.push('gender')
      
      throw new Error(`Verification failed for: ${failedFields.join(', ')}. ${5 - newAttempts} attempts remaining.`)
    }

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

async function sendRecoveryEmail(email: string, encryptedKey: string, salt: string) {
  // In production, integrate with a proper email service like SendGrid, AWS SES, etc.
  // For now, we'll log the key (in production, this should be sent via email)
  console.log(`Recovery email would be sent to: ${email}`)
  console.log(`Encrypted key: ${encryptedKey}`)
  
  // Here you would integrate with your email service
  // Example with a hypothetical email service:
  /*
  const emailService = new EmailService(Deno.env.get('EMAIL_API_KEY'))
  await emailService.send({
    to: email,
    subject: 'Password Manager - Decryption Key Recovery',
    html: `
      <h2>Your Decryption Key Recovery</h2>
      <p>Your identity has been verified using your Aadhaar details. Your decryption key is attached to this email.</p>
      <p><strong>Important:</strong> Keep this key secure and do not share it with anyone.</p>
      <p>If you did not request this recovery, please contact support immediately.</p>
    `,
    attachments: [{
      filename: 'decryption-key.json',
      content: encryptedKey
    }]
  })
  */
}