
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend@2.0.0'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendApiKey = Deno.env.get('RESEND_API_KEY')!

const resend = new Resend(resendApiKey)

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const { userEmail, name, aadhaarNumber, dob, gender } = await req.json()

    if (!userEmail || !name || !aadhaarNumber) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get stored recovery data
    const { data: recoveryData, error: selectError } = await supabase
      .from('aadhaar_recovery')
      .select('*')
      .eq('user_email', userEmail)
      .maybeSingle()

    if (selectError) {
      console.error('Database error:', selectError)
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!recoveryData) {
      return new Response(
        JSON.stringify({ error: 'No recovery data found for this email address' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check recovery attempt limits (max 5 attempts per 24 hours)
    const now = new Date()
    const lastAttempt = recoveryData.last_recovery_attempt ? new Date(recoveryData.last_recovery_attempt) : null
    const hoursSinceLastAttempt = lastAttempt ? (now.getTime() - lastAttempt.getTime()) / (1000 * 60 * 60) : 24

    if (hoursSinceLastAttempt < 24 && recoveryData.recovery_attempts >= 5) {
      return new Response(
        JSON.stringify({ error: 'Recovery attempt limit exceeded. Please try again later.' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Decrypt and verify the stored data
    const storedName = atob(recoveryData.encrypted_name)
    const storedAadhaarNumber = atob(recoveryData.encrypted_aadhaar_number)
    const storedDob = recoveryData.encrypted_dob ? atob(recoveryData.encrypted_dob) : null
    const storedGender = recoveryData.encrypted_gender ? atob(recoveryData.encrypted_gender) : null

    // Verify the provided details match stored data
    const nameMatch = storedName.toLowerCase() === name.toLowerCase()
    const aadhaarMatch = storedAadhaarNumber === aadhaarNumber
    const dobMatch = !storedDob || !dob || storedDob === dob
    const genderMatch = !storedGender || !gender || storedGender.toLowerCase() === gender.toLowerCase()

    // Update recovery attempts
    const newAttempts = hoursSinceLastAttempt >= 24 ? 1 : (recoveryData.recovery_attempts || 0) + 1
    
    await supabase
      .from('aadhaar_recovery')
      .update({
        recovery_attempts: newAttempts,
        last_recovery_attempt: now.toISOString()
      })
      .eq('id', recoveryData.id)

    if (!nameMatch || !aadhaarMatch || !dobMatch || !genderMatch) {
      return new Response(
        JSON.stringify({ 
          error: 'Identity verification failed. The provided details do not match our records.' 
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // If verification successful, send recovery email with decryption key
    const decryptionKey = JSON.parse(atob(recoveryData.encrypted_decryption_key))

    try {
      const emailResponse = await resend.emails.send({
        from: 'Password Manager <noreply@resend.dev>',
        to: [userEmail],
        subject: 'Your Password Vault Recovery Key',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #333; text-align: center;">Password Vault Recovery</h1>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="color: #333; margin-top: 0;">Identity Verification Successful</h2>
              <p>Hello ${name},</p>
              <p>Your identity has been successfully verified using your Aadhaar details. Here is your decryption key for password vault recovery:</p>
              
              <div style="background-color: #fff; padding: 15px; border-radius: 5px; border-left: 4px solid #4CAF50; margin: 20px 0;">
                <h3 style="margin: 0; color: #333;">Decryption Key:</h3>
                <code style="display: block; background-color: #f8f8f8; padding: 10px; margin: 10px 0; border-radius: 4px; font-family: monospace; word-break: break-all;">
                  ${JSON.stringify(decryptionKey, null, 2)}
                </code>
              </div>
              
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin: 20px 0;">
                <h4 style="margin: 0; color: #856404;">⚠️ Important Security Notice:</h4>
                <ul style="color: #856404; margin: 10px 0;">
                  <li>Keep this decryption key secure and private</li>
                  <li>Do not share this key with anyone</li>
                  <li>Use this key immediately to recover your vault</li>
                  <li>Delete this email after successful recovery</li>
                </ul>
              </div>
              
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                If you did not request this recovery, please ignore this email. This recovery request was made from IP address that verified your Aadhaar details.
              </p>
            </div>
          </div>
        `,
      })

      console.log('Recovery email sent successfully:', emailResponse)

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Identity verified successfully. Recovery key has been sent to your email address.',
          emailSent: true
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } catch (emailError) {
      console.error('Failed to send recovery email:', emailError)
      return new Response(
        JSON.stringify({ 
          error: 'Identity verified but failed to send recovery email. Please try again.' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

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
