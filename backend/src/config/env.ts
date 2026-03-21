import path from 'path'
import dotenv from 'dotenv'

// Load env: backend folder first, then frontend/root (so backend/.env works too)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '..', 'frontend', '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '..', 'frontend', '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') })

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/$/, '')
}

const resolvedPublicAppUrl = normalizeUrl(
  process.env.PUBLIC_APP_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''
)

const publicAppUrl = resolvedPublicAppUrl || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '')

if (process.env.NODE_ENV === 'production' && (!publicAppUrl || /localhost|127\.0\.0\.1/i.test(publicAppUrl))) {
  console.error('[ENV] PUBLIC_APP_URL is missing or points to localhost in production. Winner email links will be invalid.')
}

export const env = {
  // Supabase
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  
  // Razorpay
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  
  // NextAuth
  nextAuthSecret: process.env.NEXTAUTH_SECRET || '',
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  
  // Twilio (optional)
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  
  // Resend (optional)
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFromEmail: process.env.RESEND_FROM_EMAIL || '',
  resendReplyToEmail: process.env.RESEND_REPLY_TO_EMAIL || '',
  
  // API
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  publicAppUrl,
  port: Number(process.env.PORT || 3001)
}
