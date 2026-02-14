-- EMAIL VERIFICATION MIGRATION
-- This migration adds email verification support and removes phone verification requirement

-- 1. Add email verification columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- 2. Create email_otps table for storing temporary OTP codes
CREATE TABLE IF NOT EXISTS public.email_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- Index for fast email lookup and cleanup
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON public.email_otps(email);
CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON public.email_otps(expires_at);

-- 3. Add comments for documentation
COMMENT ON COLUMN users.email_verified IS 'Indicates if the user has verified their email address via OTP';
COMMENT ON COLUMN users.email_verified_at IS 'Timestamp when the email was verified';
COMMENT ON TABLE email_otps IS 'Temporary storage for email OTP codes with 10-minute expiration';

-- 4. Optional: Clean up old OTP records (run this periodically or via cron)
-- DELETE FROM email_otps WHERE expires_at < NOW() - INTERVAL '1 day';

-- 5. Optional: Migrate existing users (if you want to mark phone-verified users as email-verified)
-- UPDATE users SET email_verified = TRUE, email_verified_at = otp_verified_at WHERE phone_verified = TRUE AND email IS NOT NULL;
