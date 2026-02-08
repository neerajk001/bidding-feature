-- ================================================
-- PHONE OTP VERIFICATION - DATABASE MIGRATION
-- Run this in Supabase SQL Editor
-- ================================================

-- Add phone verification columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMPTZ;

-- Create index for faster lookups on phone_verified
CREATE INDEX IF NOT EXISTS idx_users_phone_verified ON users(phone_verified);

-- Update existing users to be unverified (you can manually verify them later)
UPDATE users SET phone_verified = FALSE WHERE phone_verified IS NULL;

-- Optional: If you want to auto-verify existing users, uncomment below:
-- UPDATE users SET phone_verified = TRUE, otp_verified_at = NOW() WHERE phone_verified = FALSE;

COMMENT ON COLUMN users.phone_verified IS 'Indicates if the user has verified their phone number via OTP';
COMMENT ON COLUMN users.otp_verified_at IS 'Timestamp when the phone number was verified';
