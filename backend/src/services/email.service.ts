import { resend } from '../config/services'
import { env } from '../config/env'

const appBaseUrl = env.publicAppUrl
let lastWinnerEmailError: string | null = null
const DEFAULT_FROM = 'onboarding@resend.dev'

export function getLastWinnerEmailError(): string | null {
  return lastWinnerEmailError
}

function setLastWinnerEmailError(reason: string) {
  lastWinnerEmailError = reason
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getFromEmail(): string {
  return (env.resendFromEmail || DEFAULT_FROM).trim()
}

function getReplyToEmail(): string | undefined {
  const replyTo = (env.resendReplyToEmail || '').trim()
  return replyTo || undefined
}

function isResendSandboxSender(fromEmail: string): boolean {
  return /@resend\.dev$/i.test(fromEmail)
}

export async function sendWinnerEmail(params: {
  to: string
  winnerName: string
  auctionTitle: string
  winningAmount: number
  claimToken: string
  size?: string | null
  isEscalation?: boolean
}): Promise<boolean> {
  setLastWinnerEmailError('')

  if (!resend) {
    console.warn('Resend not configured, skipping winner email')
    setLastWinnerEmailError('RESEND_API_KEY missing or invalid in backend environment')
    return false
  }

  if (!appBaseUrl) {
    console.error('[email] PUBLIC_APP_URL is not configured. Cannot build winner claim link.')
    setLastWinnerEmailError('PUBLIC_APP_URL is missing')
    return false
  }

  if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/i.test(appBaseUrl)) {
    console.error(`[email] PUBLIC_APP_URL is invalid for production: ${appBaseUrl}`)
    setLastWinnerEmailError(`PUBLIC_APP_URL is invalid for production: ${appBaseUrl}`)
    return false
  }

  const fromEmail = getFromEmail()
  if (process.env.NODE_ENV === 'production' && isResendSandboxSender(fromEmail)) {
    const reason = 'RESEND_FROM_EMAIL is using resend.dev in production. Use a verified domain sender (for example, no-reply@yourdomain.com).'
    console.error(`[email] ${reason}`)
    setLastWinnerEmailError(reason)
    return false
  }

  const { to, winnerName, auctionTitle, winningAmount, claimToken, size, isEscalation } = params
  const claimUrl = `${appBaseUrl}/winner/claim?token=${encodeURIComponent(claimToken)}`
  const subject = isEscalation
    ? `Action needed: complete payment for ${auctionTitle}`
    : `Action needed: complete your winner payment for ${auctionTitle}`
  const intro = isEscalation
    ? `The previous winner did not complete payment. The item is now offered to you.`
    : `Congratulations! You won this lot.`
  const sizeInfo = size ? `<p><strong>Size:</strong> ${escapeHtml(size)}</p>` : ''

  const safeWinnerName = escapeHtml(winnerName)
  const safeAuctionTitle = escapeHtml(auctionTitle)
  const formattedAmount = Number(winningAmount).toLocaleString('en-IN')
  const safeClaimUrl = escapeHtml(claimUrl)
  const textBody = [
    `Hello ${winnerName},`,
    '',
    intro,
    size ? `Size: ${size}` : undefined,
    `Winning amount: INR ${formattedAmount}`,
    'Payment window: 12 hours from this notification.',
    'Complete payment using your secure winner link:',
    claimUrl,
    '',
    'If you already paid, you can ignore this email.',
    '',
    'Indu Heritage Auctions'
  ].filter(Boolean).join('\n')

  try {
    console.log(`[email] Sending winner email to: ${to}, subject: ${subject}`)

    // ⚠️  Resend SDK returns { data, error } — it does NOT throw on API errors.
    // We MUST check the error field, otherwise we'll think emails succeeded when they silently failed.
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      replyTo: getReplyToEmail(),
      text: textBody,
      headers: {
        'X-Entity-Ref-ID': `winner-${claimToken}`,
        'X-Auto-Response-Suppress': 'All'
      },
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2 style="color: #2a1a12;">Winner payment details</h2>
          <p>Hello ${safeWinnerName},</p>
          <p>${escapeHtml(intro)}</p>
          ${sizeInfo}
          <p><strong>Auction:</strong> ${safeAuctionTitle}</p>
          <p><strong>Winning amount:</strong> INR ${formattedAmount}</p>
          <p><strong>Payment deadline:</strong> within 12 hours</p>
          <p>Complete payment using the secure link below:</p>
          <p><a href="${safeClaimUrl}" style="display: inline-block; padding: 12px 24px; background: #800000; color: #fff; text-decoration: none; border-radius: 8px;">Open Payment Link</a></p>
          <p style="margin-top: 18px; color: #666; font-size: 14px;">If you already completed payment, you can ignore this email.</p>
          <p style="color: #999; font-size: 12px;">Indu Heritage Auctions • Transactional notice</p>
        </div>
      `
    })

    if (error) {
      // Resend returned an API-level error (wrong from address, unverified domain, invalid recipient, etc.)
      console.error(`[email] Resend API error sending to ${to}:`, JSON.stringify(error))
      const reason = (error as any)?.message || (error as any)?.name || JSON.stringify(error)
      setLastWinnerEmailError(`Resend API rejected request: ${reason}`)
      return false
    }

    console.log(`[email] Winner email sent successfully to ${to}, Resend ID: ${data?.id}`)
    setLastWinnerEmailError('')
    return true
  } catch (e) {
    // Network-level or SDK-level error (very rare with Resend)
    console.error('[email] Winner email send threw an exception:', e)
    const reason = e instanceof Error ? e.message : String(e)
    setLastWinnerEmailError(`Email send exception: ${reason}`)
    return false
  }
}

export async function sendPaymentConfirmedEmail(to: string, winnerName: string, auctionTitle: string): Promise<boolean> {
  if (!resend) {
    console.warn('Resend not configured, skipping payment confirmation email')
    return false
  }

  const fromEmail = getFromEmail()
  if (process.env.NODE_ENV === 'production' && isResendSandboxSender(fromEmail)) {
    console.error('[email] RESEND_FROM_EMAIL is using resend.dev in production. Use a verified domain sender.')
    return false
  }

  const safeWinnerName = escapeHtml(winnerName)
  const safeAuctionTitle = escapeHtml(auctionTitle)
  const textBody = [
    `Hello ${winnerName},`,
    '',
    `We have received your payment for ${auctionTitle}.`,
    'Your order will be dispatched within 2-3 working days.',
    '',
    'Indu Heritage Auctions'
  ].join('\n')

  try {
    console.log(`[email] Sending payment confirmation to: ${to}`)

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject: `Payment received – ${auctionTitle}`,
      replyTo: getReplyToEmail(),
      text: textBody,
      headers: {
        'X-Auto-Response-Suppress': 'All'
      },
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2 style="color: #2a1a12;">Payment received</h2>
          <p>Hello ${safeWinnerName},</p>
          <p>We have received your payment for <strong>${safeAuctionTitle}</strong>.</p>
          <p>Your order will be dispatched within 2-3 working days. Pan-India shipping is included.</p>
          <p style="color: #999; font-size: 12px;">Indu Heritage Auctions • Transactional notice</p>
        </div>
      `
    })

    if (error) {
      console.error(`[email] Resend API error sending payment confirmation to ${to}:`, JSON.stringify(error))
      return false
    }

    console.log(`[email] Payment confirmation sent to ${to}, Resend ID: ${data?.id}`)
    return true
  } catch (e) {
    console.error('[email] Payment confirmed email threw an exception:', e)
    return false
  }
}
