import Razorpay from 'razorpay'
import twilio from 'twilio'
import { Resend } from 'resend'
import { env } from './env'

// Razorpay client
export const razorpay = env.razorpayKeyId && env.razorpayKeySecret
  ? new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret })
  : null

// Twilio client (optional)
export const twilioClient = env.twilioAccountSid && env.twilioAuthToken
  ? twilio(env.twilioAccountSid, env.twilioAuthToken)
  : null

// Resend client (optional)
export const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null
