import { env } from '../config/env'

export interface ShippingAddress {
  full_name: string
  phone: string
  line1: string
  line2?: string
  city: string
  state: string
  postal_code: string
  country?: string
}

export interface CreateShipmentResponse {
  success: boolean
  awb?: string
  trackingUrl?: string
  status: 'created' | 'failed'
  rawResponse?: unknown
  error?: string
  orderId?: string
  retryable?: boolean
  validationError?: boolean
}

/**
 * Create a shipment in Delhivery CMU API when dispatch is requested.
 * Uses exponential backoff retry strategy for reliability.
 */
export async function createDelhiveryShipment(
  shippingAddress: ShippingAddress,
  auctionTitle: string,
  orderId: string,
  winnerId: string
): Promise<CreateShipmentResponse> {
  const timestamp = new Date().toISOString()

  if (!env.delhiveryApiKey) {
    return { success: false, status: 'failed', error: 'Delhivery API key not configured', orderId, retryable: false }
  }

  const payload: Record<string, any> = {
    shipments: [
      {
        name: shippingAddress.full_name,
        add: `${shippingAddress.line1}${shippingAddress.line2 ? `, ${shippingAddress.line2}` : ''}`,
        pin: shippingAddress.postal_code,
        city: shippingAddress.city,
        state: shippingAddress.state,
        phone: shippingAddress.phone,
        order: orderId,
        payment_mode: 'Prepaid',
        products_desc: auctionTitle,
        quantity: 1,
        pickup_location: env.delhiveryPickupLocation
      }
    ]
  }

  const validation = validateShipmentInput(payload)
  if (validation.error) {
    return {
      success: false,
      status: 'failed',
      error: validation.error,
      orderId,
      validationError: true,
      retryable: false
    }
  }

  console.log('[Delhivery] Shipment create request', {
    timestamp,
    winnerId,
    orderId,
    endpoint: `${env.delhiveryApiBaseUrl}/cmu/create.json`,
    payload
  })

  return retryWithExponentialBackoff(
    () => sendDelhiveryRequest(payload),
    Math.min(env.delhiveryRetryAttempts || 3, 3),
    [1000, 3000],
    winnerId
  )
}

/**
 * Send request to Delhivery API to create a shipment.
 */
async function sendDelhiveryRequest(payload: unknown): Promise<CreateShipmentResponse> {
  const endpoint = `${env.delhiveryApiBaseUrl}/cmu/create.json`
  const firstShipment = (payload as any)?.shipments?.[0]
  const orderId = firstShipment?.order ? String(firstShipment.order) : undefined
  try {
    const formData = new URLSearchParams()
    formData.set('format', 'json')
    formData.set('data', JSON.stringify(payload))

    const controller = new AbortController()
    const timeoutMs = Math.min(Math.max(env.delhiveryTimeoutMs || 8000, 5000), 10000)
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.delhiveryApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: formData.toString(),
      signal: controller.signal
    })
    clearTimeout(timer)

    let data: any = null
    let textBody = ''
    try {
      textBody = await response.text()
      data = textBody ? JSON.parse(textBody) : null
    } catch {
      data = textBody || null
    }

    if (!response.ok) {
      const errorText = typeof textBody === 'string' ? textBody.substring(0, 300) : `HTTP ${response.status}`
      const validationError = response.status === 400 || response.status === 422
      console.error(`[Delhivery] API error ${response.status} for order ${orderId || 'unknown'}:`, errorText)
      return {
        success: false,
        status: 'failed',
        error: `API returned ${response.status}`,
        rawResponse: data ?? textBody,
        orderId,
        validationError,
        retryable: !validationError
      }
    }

    const awb = data?.packages?.[0]?.waybill
    if (awb) {
      console.log('[Delhivery] Shipment create response', {
        timestamp: new Date().toISOString(),
        orderId,
        awb,
        statusCode: response.status,
        response: data
      })
      return {
        success: true,
        status: 'created',
        awb,
        trackingUrl: `https://www.delhivery.com/track/package/${awb}`,
        rawResponse: data,
        orderId,
        retryable: false
      }
    }

    return {
      success: false,
      status: 'failed',
      error: data?.remark || data?.message || 'Waybill not found in Delhivery response',
      rawResponse: data,
      orderId,
      retryable: true
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    const message = aborted ? 'Delhivery request timed out' : (error instanceof Error ? error.message : String(error))
    console.error('[Delhivery] Request failed:', {
      timestamp: new Date().toISOString(),
      orderId,
      error: message.substring(0, 200)
    })
    return { success: false, status: 'failed', error: message, orderId, retryable: true }
  }
}

/**
 * Retry function with exponential backoff.
 * Attempts to execute the function, retrying on failure with increasing delays.
 */
async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delayScheduleMs: number[],
  winnerId: string
): Promise<T> {
  let lastError: any

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn()
      if ((result as any).success !== false) {
        if (attempt > 1) {
          console.log(`[Delhivery] Winner ${winnerId} succeeded after ${attempt - 1} retries`)
        }
        return result
      }

      if ((result as any).validationError || (result as any).retryable === false) {
        return result
      }

      lastError = result
    } catch (error) {
      lastError = error
    }

    if (attempt < maxAttempts) {
      const delayMs = delayScheduleMs[Math.min(attempt - 1, delayScheduleMs.length - 1)]
      console.log(`[Delhivery] Winner ${winnerId} attempt ${attempt} failed, retrying in ${delayMs}ms...`)
      await sleep(delayMs)
    }
  }

  console.error(
    `[Delhivery] Winner ${winnerId} failed after ${maxAttempts} attempts:`,
    lastError
  )
  return lastError || { success: false, status: 'failed', error: 'Max retries exceeded' }
}

function validateShipmentInput(payload: Record<string, any>): { error?: string } {
  const shipment = payload?.shipments?.[0]
  if (!shipment) return { error: 'Validation error: shipment payload missing' }

  const name = String(shipment.name || '').trim()
  const phone = String(shipment.phone || '').trim()
  const add = String(shipment.add || '').trim()
  const pin = String(shipment.pin || '').trim()
  const order = String(shipment.order || '').trim()

  if (!name) return { error: 'Validation error: name is required' }
  if (!add) return { error: 'Validation error: address is required' }
  if (!order) return { error: 'Validation error: order id is required' }
  if (!/^\d{6}$/.test(pin)) return { error: 'Validation error: pincode must be 6 digits' }

  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) {
    return { error: 'Validation error: phone must have 10 to 15 digits' }
  }

  return {}
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
