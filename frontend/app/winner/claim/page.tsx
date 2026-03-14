'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
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
      handler: (response: { razorpay_payment_id: string; razorpay_order_id: string }) => void
      prefill?: { name?: string }
      theme?: { color: string }
      modal?: { ondismiss?: () => void }
    }) => { open: () => void }
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
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

function ClaimContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [data, setData] = useState<{
    claim: boolean
    status?: string
    message?: string
    auction_title?: string
    winning_amount?: number
    payment_due_at?: string | null
    size?: string | null
    bidder_name?: string
    razorpay_key_id?: string
  } | null>(null)
  const [loading, setLoading] = useState(!!token)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [instagramHandle, setInstagramHandle] = useState('')

  const fetchClaim = useCallback(() => {
    if (!token) return
    fetch(`/api/winner/claim?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((json) => {
        setData(json)
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

  const handlePayWithRazorpay = async () => {
    if (!token || !data?.razorpay_key_id) return
    setPaying(true)
    setError('')
    try {
      const orderRes = await fetch('/api/winner/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
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
        prefill: { name: data.bidder_name || undefined },
        theme: { color: '#800000' },
        modal: { ondismiss: () => setPaying(false) },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string }) => {
          try {
            const verifyRes = await fetch('/api/winner/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                instagram_handle: instagramHandle.trim() || undefined
              })
            })
            const verifyJson = await verifyRes.json()
            if (!verifyRes.ok) throw new Error(verifyJson.error || 'Verification failed')
            setData((prev) => (prev ? { ...prev, status: 'completed' } : null))
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
    } finally {
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
          <Link href="/" className="text-primary font-semibold hover:underline">Back to home</Link>
        </div>
      </PublicShell>
    )
  }

  const isCompleted = data?.status === 'completed'
  const canPay = (data?.status === 'pending' || data?.status === 'overdue') && data?.razorpay_key_id

  return (
    <PublicShell>
      <div className="max-w-xl mx-auto px-4 py-6 lg:py-12">
        <h1 className="text-2xl font-display font-bold text-[#2D2420] mb-4 lg:mb-6">
          {isCompleted ? 'Payment completed' : 'You won – complete payment'}
        </h1>

        {data?.message && <p className="text-gray-600 mb-4">{data.message}</p>}

        {data?.claim && (
          <div className="bg-white border border-secondary/20 rounded-2xl p-4 lg:p-6 mb-6 lg:mb-8">
            <p className="font-semibold text-[#2D2420]">{data.auction_title}</p>
            {data.size && <p className="text-sm text-gray-500">Size: {data.size}</p>}
            <p className="text-xl font-bold text-primary mt-2">{data.winning_amount != null && formatCurrency(data.winning_amount)}</p>
            <p className="text-sm text-gray-600 mt-2">Payment due by: {formatDateTime(data.payment_due_at ?? null)}</p>
          </div>
        )}

        {canPay && (
          <>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instagram handle (optional, for LIVE announcement)</label>
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
                {paying ? 'Opening payment…' : `Pay ${data.winning_amount != null ? formatCurrency(data.winning_amount) : ''} with Razorpay`}
              </button>
            </div>
            <p className="text-sm text-gray-500">Secure payment via Razorpay (cards, UPI, netbanking). You will be redirected to complete payment.</p>
          </>
        )}

        {data?.claim && (data?.status === 'pending' || data?.status === 'overdue') && !data?.razorpay_key_id && (
          <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4">Payment gateway is not configured. Please contact support to complete your payment.</p>
        )}

        <p className="text-sm text-gray-500 mt-8">Shipping is included. Dispatch in 2–3 working days, Pan-India.</p>
        <Link href="/" className="inline-block mt-4 text-primary font-medium hover:underline">Back to home</Link>
      </div>
    </PublicShell>
  )
}

export default function WinnerClaimPage() {
  return (
    <Suspense fallback={
      <PublicShell>
        <div className="min-h-[40vh] flex items-center justify-center"><p className="text-gray-500">Loading...</p></div>
      </PublicShell>
    }>
      <ClaimContent />
    </Suspense>
  )
}
