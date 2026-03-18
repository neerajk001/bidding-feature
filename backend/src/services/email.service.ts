import { resend } from '../config/services'
import { env } from '../config/env'

const appBaseUrl = env.publicAppUrl
let lastWinnerEmailError: string | null = null

export function getLastWinnerEmailError(): string | null {
  return lastWinnerEmailError
}

function setLastWinnerEmailError(reason: string) {
  lastWinnerEmailError = reason
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

  const { to, winnerName, auctionTitle, winningAmount, claimToken, size, isEscalation } = params
  const claimUrl = `${appBaseUrl}/winner/claim?token=${encodeURIComponent(claimToken)}`
  const subject = isEscalation
    ? `You're now the winner – ${auctionTitle} – Pay within 12 hours`
    : `You won! ${auctionTitle} – Pay within 12 hours`
  const intro = isEscalation
    ? `The previous winner did not complete payment. The item is now offered to you.`
    : `Congratulations! You won this lot.`
  const sizeInfo = size ? `<p><strong>Size:</strong> ${size}</p>` : ''

  try {
    console.log(`[email] Sending winner email to: ${to}, subject: ${subject}`)

    // ⚠️  Resend SDK returns { data, error } — it does NOT throw on API errors.
    // We MUST check the error field, otherwise we'll think emails succeeded when they silently failed.
    const { data, error } = await resend.emails.send({
      from: env.resendFromEmail || 'onboarding@resend.dev',
      to,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2 style="color: #2a1a12;">${subject}</h2>
          <p>Hello ${winnerName},</p>
          <p>${intro}</p>
          ${sizeInfo}
          <p><strong>Winning amount: ₹${Number(winningAmount).toLocaleString()}</strong></p>
          <p>Payment must be completed within <strong>12 hours</strong> or the offer will be cancelled.</p>
          <p><strong>Payment method:</strong> Secure online payment via Razorpay (UPI, cards, net banking, wallets).</p>
          <p>Click the button below to complete your payment and optionally share your Instagram handle:</p>
          <p><a href="${claimUrl}" style="display: inline-block; padding: 12px 24px; background: #800000; color: #fff; text-decoration: none; border-radius: 8px;">Pay Now &amp; Claim Your Item</a></p>
          <p style="color: #666; font-size: 14px;">Shipping is included. Dispatch in 2–3 working days, Pan-India.</p>
          <p style="color: #999; font-size: 12px;">Indu Heritage Auctions</p>
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

  try {
    console.log(`[email] Sending payment confirmation to: ${to}`)

    const { data, error } = await resend.emails.send({
      from: env.resendFromEmail || 'onboarding@resend.dev',
      to,
      subject: `Payment received – ${auctionTitle}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2 style="color: #2a1a12;">Payment received</h2>
          <p>Hello ${winnerName},</p>
          <p>We have received your payment for <strong>${auctionTitle}</strong>.</p>
          <p>Your order will be dispatched within 2–3 working days. Pan-India shipping is included.</p>
          <p style="color: #999; font-size: 12px;">Indu Heritage Auctions</p>
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
