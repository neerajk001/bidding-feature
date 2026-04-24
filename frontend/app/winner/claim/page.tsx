'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PublicShell from '@/components/public/PublicShell'

declare global {
  interface Window {
    Razorpay: new (options: {
      key: string
      amount: number
      currency: string
      order_id: string
      name?: string
      description?: string
      handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void
      prefill?: { name?: string }
      theme?: { color: string }
      modal?: { ondismiss?: () => void }
    }) => { open: () => void }
  }
}

type ShippingAddress = {
  full_name: string
  phone: string
  line1: string
  line2: string
  city: string
  state: string
  postal_code: string
  country: string
}

type ClaimData = {
  claim: boolean
  status?: string
  message?: string
  auction_title?: string
  winning_amount?: number
  payment_due_at?: string | null
  payment_completed_at?: string | null
  payment_proof_note?: string | null
  razorpay_order_id?: string | null
  razorpay_payment_id?: string | null
  size?: string | null
  bidder_name?: string
  razorpay_key_id?: string
  shipping_address?: ShippingAddress | null
  shipping_address_submitted_at?: string | null
  dispatched_at?: string | null
  delhivery_awb?: string | null
  delhivery_tracking_url?: string | null
  delhivery_status?: string | null
  error?: string
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

function formatDateTime(iso: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay'))
    document.body.appendChild(script)
  })
}

function createEmptyShippingAddress(): ShippingAddress {
  return {
    full_name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'India'
  }
}

function toShippingAddress(input: unknown): ShippingAddress {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return createEmptyShippingAddress()
  }
  const raw = input as Record<string, unknown>
  return {
    full_name: String(raw.full_name ?? '').trim(),
    phone: String(raw.phone ?? '').trim(),
    line1: String(raw.line1 ?? '').trim(),
    line2: String(raw.line2 ?? '').trim(),
    city: String(raw.city ?? '').trim(),
    state: String(raw.state ?? '').trim(),
    postal_code: String(raw.postal_code ?? '').trim(),
    country: String(raw.country ?? '').trim() || 'India'
  }
}

function validateShippingAddress(address: ShippingAddress): string | null {
  if (!address.full_name) return 'Please enter full name.'
  if (!address.phone) return 'Please enter phone number.'
  if (!address.line1) return 'Please enter address line 1.'
  if (!address.city) return 'Please enter city.'
  if (!address.state) return 'Please enter state.'
  if (!address.postal_code) return 'Please enter postal code.'
  if (address.postal_code.length < 4 || address.postal_code.length > 12) return 'Please enter a valid postal code.'
  if (address.phone.length < 8 || address.phone.length > 20) return 'Please enter a valid phone number.'
  return null
}

function buildAddressLines(address: ShippingAddress | null | undefined): string[] {
  if (!address) return []
  const lineCity = [address.city, address.state, address.postal_code].filter(Boolean).join(', ')
  return [address.full_name, address.phone, address.line1, address.line2, lineCity, address.country].filter(Boolean)
}

function ClaimContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [data, setData] = useState<ClaimData | null>(null)
  const [loading, setLoading] = useState(!!token)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [instagramHandle, setInstagramHandle] = useState('')
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>(createEmptyShippingAddress())

  const fetchClaim = useCallback(() => {
    if (!token) return
    fetch(`/api/winner/claim?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((json: ClaimData) => {
        setData(json)
        if (json.shipping_address) {
          setShippingAddress(toShippingAddress(json.shipping_address))
        } else if (json.bidder_name) {
          setShippingAddress((prev) => ({ ...prev, full_name: prev.full_name || json.bidder_name || '' }))
        }
        if (json.error) setError(json.error)
      })
      .catch(() => setError('Failed to load claim'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!token) {
      setError('Missing claim token. Use the link from your winner email.')
      setLoading(false)
      return
    }
    fetchClaim()
  }, [token, fetchClaim])

  const handleAddressChange = (field: keyof ShippingAddress, value: string) => {
    setShippingAddress((prev) => ({ ...prev, [field]: value }))
  }

  const handlePayWithRazorpay = async () => {
    if (!token || !data?.razorpay_key_id) return

    const validationError = validateShippingAddress(shippingAddress)
    if (validationError) {
      setError(validationError)
      return
    }

    setPaying(true)
    setError('')
    try {
      const orderRes = await fetch('/api/winner/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          shipping_address: shippingAddress
        })
      })
      const orderJson = await orderRes.json()
      if (!orderRes.ok) throw new Error(orderJson.error || 'Failed to create order')

      const { key_id, order_id, amount, currency } = orderJson
      await loadRazorpayScript()

      const rzp = new window.Razorpay({
        key: key_id,
        amount: Number(amount),
        currency: currency || 'INR',
        order_id,
        name: 'Indu Heritage Auctions',
        description: data.auction_title || 'Auction winner payment',
        prefill: { name: shippingAddress.full_name || data.bidder_name || undefined },
        theme: { color: '#800000' },
        modal: { ondismiss: () => setPaying(false) },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            const verifyRes = await fetch('/api/winner/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                instagram_handle: instagramHandle.trim() || undefined
              })
            })
            const verifyJson = await verifyRes.json()
            if (!verifyRes.ok) throw new Error(verifyJson.error || 'Verification failed')
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'completed',
                    payment_completed_at: new Date().toISOString(),
                    payment_proof_note: 'Verified via Razorpay API',
                    razorpay_payment_id: verifyJson.razorpay_payment_id || prev.razorpay_payment_id,
                    razorpay_order_id: verifyJson.razorpay_order_id || prev.razorpay_order_id,
                    shipping_address: shippingAddress,
                    shipping_address_submitted_at: new Date().toISOString()
                  }
                : null
            )
            setError('')
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Payment verification failed')
          } finally {
            setPaying(false)
          }
        }
      })
      rzp.open()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start payment')
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <PublicShell>
        <div className="min-h-[40vh] flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </PublicShell>
    )
  }

  if (error && !data?.claim) {
    return (
      <PublicShell>
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link href="/" className="text-primary font-semibold hover:underline">
            Back to home
          </Link>
        </div>
      </PublicShell>
    )
  }

  const isCompleted = data?.status === 'completed'
  const canPay = (data?.status === 'pending' || data?.status === 'overdue') && data?.razorpay_key_id
  const savedAddress = data?.shipping_address ? toShippingAddress(data.shipping_address) : shippingAddress
  const addressLines = buildAddressLines(savedAddress)

  return (
    <PublicShell>
      <div className="max-w-xl mx-auto px-4 py-6 lg:py-12">
        <h1 className="text-2xl font-display font-bold text-[#2D2420] mb-4 lg:mb-6">
          {isCompleted ? 'Payment completed' : 'You won - confirm address and pay'}
        </h1>

        {data?.message && <p className="text-gray-600 mb-4">{data.message}</p>}

        {data?.claim && (
          <div className="bg-white border border-secondary/20 rounded-2xl p-4 lg:p-6 mb-6 lg:mb-8">
            <p className="font-semibold text-[#2D2420]">{data.auction_title}</p>
            {data.size && <p className="text-sm text-gray-500">Size: {data.size}</p>}
            <p className="text-xl font-bold text-primary mt-2">{data.winning_amount != null && formatCurrency(data.winning_amount)}</p>
            <p className="text-sm text-gray-600 mt-2">Payment due by: {formatDateTime(data.payment_due_at ?? null)}</p>

            {isCompleted && (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900 space-y-1">
                <p className="font-semibold">Payment proof</p>
                {data.payment_completed_at && <p>Paid at: {formatDateTime(data.payment_completed_at)}</p>}
                {data.razorpay_payment_id && <p>Payment ID: {data.razorpay_payment_id}</p>}
                {data.razorpay_order_id && <p>Order ID: {data.razorpay_order_id}</p>}
                {data.payment_proof_note && <p>Note: {data.payment_proof_note}</p>}
              </div>
            )}

            {isCompleted && (data.dispatched_at || data.delhivery_tracking_url || data.delhivery_awb) && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 space-y-1">
                <p className="font-semibold">Shipment details</p>
                {data.dispatched_at && <p>Dispatched at: {formatDateTime(data.dispatched_at)}</p>}
                {data.delhivery_awb && <p>AWB: {data.delhivery_awb}</p>}
                {data.delhivery_status && <p>Status: {data.delhivery_status}</p>}
                {data.delhivery_tracking_url && (
                  <p>
                    <a
                      href={data.delhivery_tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      Track your shipment
                    </a>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {canPay && (
          <>
            <div className="bg-white border border-secondary/20 rounded-2xl p-4 lg:p-6 mb-6 lg:mb-8 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[#2D2420]">Delivery address</h2>
                <p className="text-sm text-gray-600">Required before payment confirmation.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={shippingAddress.full_name}
                    onChange={(e) => handleAddressChange('full_name', e.target.value)}
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={shippingAddress.phone}
                    onChange={(e) => handleAddressChange('phone', e.target.value)}
                    placeholder="Phone number"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address line 1</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={shippingAddress.line1}
                    onChange={(e) => handleAddressChange('line1', e.target.value)}
                    placeholder="House / street / locality"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address line 2 (optional)</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={shippingAddress.line2}
                    onChange={(e) => handleAddressChange('line2', e.target.value)}
                    placeholder="Apartment, landmark"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={shippingAddress.city}
                    onChange={(e) => handleAddressChange('city', e.target.value)}
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={shippingAddress.state}
                    onChange={(e) => handleAddressChange('state', e.target.value)}
                    placeholder="State"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal code</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={shippingAddress.postal_code}
                    onChange={(e) => handleAddressChange('postal_code', e.target.value)}
                    placeholder="PIN / ZIP"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    value={shippingAddress.country}
                    onChange={(e) => handleAddressChange('country', e.target.value)}
                    placeholder="Country"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Instagram handle (optional, for LIVE announcement)
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="@username"
                  value={instagramHandle}
                  onChange={(e) => setInstagramHandle(e.target.value)}
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="button"
                onClick={handlePayWithRazorpay}
                disabled={paying}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {paying
                  ? 'Opening payment...'
                  : `Pay ${data.winning_amount != null ? formatCurrency(data.winning_amount) : ''} with Razorpay`}
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Secure payment via Razorpay (cards, UPI, netbanking). You will be redirected to complete payment.
            </p>
          </>
        )}

        {!canPay && addressLines.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 mb-6">
            <p className="font-semibold mb-1">Saved delivery address</p>
            <div className="space-y-0.5">
              {addressLines.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
            {data?.shipping_address_submitted_at && (
              <p className="text-xs text-emerald-800 mt-2">
                Submitted: {formatDateTime(data.shipping_address_submitted_at)}
              </p>
            )}
          </div>
        )}

        {data?.claim && (data?.status === 'pending' || data?.status === 'overdue') && !data?.razorpay_key_id && (
          <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
            Payment gateway is not configured. Please contact support to complete your payment.
          </p>
        )}

        <p className="text-sm text-gray-500 mt-8">Shipping is included. Dispatch in 2-3 working days, Pan-India.</p>
        <Link href="/" className="inline-block mt-4 text-primary font-medium hover:underline">
          Back to home
        </Link>
      </div>
    </PublicShell>
  )
}

export default function WinnerClaimPage() {
  return (
    <Suspense
      fallback={
        <PublicShell>
          <div className="min-h-[40vh] flex items-center justify-center">
            <p className="text-gray-500">Loading...</p>
          </div>
        </PublicShell>
      }
    >
      <ClaimContent />
    </Suspense>
  )
}
