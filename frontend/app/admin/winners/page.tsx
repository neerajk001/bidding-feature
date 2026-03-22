'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchApi } from '@/lib/api'

interface ShippingAddress {
  full_name?: string
  phone?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

interface Winner {
  id: string
  auction_id: string
  bidder_id: string
  winning_amount: number
  size?: string | null
  created_at: string
  payment_due_at?: string | null
  payment_status?: string | null
  payment_completed_at?: string | null
  payment_proof_note?: string | null
  payment_proof_url?: string | null
  payment_verified_by_admin?: boolean
  razorpay_order_id?: string | null
  razorpay_payment_id?: string | null
  instagram_handle?: string | null
  shipping_address?: ShippingAddress | null
  shipping_address_submitted_at?: string | null
  dispatched_at?: string | null
  escalation_done?: boolean
  winner_email_sent_at?: string | null
  bidder: {
    name: string
    phone: string
    email?: string
  }
  auction: {
    title: string
    product_id: string
    bidding_start_time?: string | null
    bidding_end_time?: string | null
  }
}

type PaymentFilter = 'all' | 'pending' | 'completed' | 'forfeited'

function formatDateTime(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value)
}

function paymentStatusLabel(status?: string | null): string {
  if (!status) return 'pending'
  return status
}

function paymentStatusClass(status?: string | null): string {
  const normalized = paymentStatusLabel(status)
  if (normalized === 'completed') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (normalized === 'overdue') return 'bg-amber-100 text-amber-800 border-amber-200'
  if (normalized === 'forfeited') return 'bg-rose-100 text-rose-800 border-rose-200'
  return 'bg-indigo-100 text-indigo-800 border-indigo-200'
}

function toPaymentFilterBucket(status?: string | null): PaymentFilter {
  if (status === 'completed') return 'completed'
  if (status === 'forfeited') return 'forfeited'
  return 'pending'
}

function formatShippingAddressLines(address?: ShippingAddress | null): string[] {
  if (!address) return []
  const lineCity = [address.city, address.state, address.postal_code].filter(Boolean).join(', ')
  return [address.full_name, address.phone, address.line1, address.line2, lineCity, address.country].filter(Boolean) as string[]
}

export default function WinnersPage() {
  const [winners, setWinners] = useState<Winner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [auctionFilter, setAuctionFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [openActionId, setOpenActionId] = useState<string | null>(null)
  const [selectedWinner, setSelectedWinner] = useState<Winner | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchWinners()
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-actions-root="true"]')) return
      setOpenActionId(null)
    }
    document.addEventListener('mousedown', closeMenu)
    return () => document.removeEventListener('mousedown', closeMenu)
  }, [])

  const fetchWinners = async () => {
    try {
      setLoading(true)
      const { ok, data } = await fetchApi<{ winners?: Winner[]; error?: string }>('/api/admin/winners')
      if (!ok) throw new Error(data.error || 'Failed to fetch winners')
      setWinners(data.winners || [])
      setError('')
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err)
      setError(text)
      setToast({ type: 'error', text })
    } finally {
      setLoading(false)
    }
  }

  const patchWinner = async (id: string, body: { payment_status?: string; dispatched_at?: boolean | string }) => {
    setActioningId(id)
    try {
      const { ok, data } = await fetchApi<{ winner?: Winner; error?: string }>(`/api/admin/winners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!ok) throw new Error(data.error || 'Failed to update winner')
      if (data.winner) {
        setWinners((prev) => prev.map((w) => (w.id === id ? { ...w, ...data.winner } : w)))
      } else {
        await fetchWinners()
      }
      setToast({ type: 'success', text: 'Winner updated successfully.' })
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err)
      setError(text)
      setToast({ type: 'error', text })
    } finally {
      setActioningId(null)
      setOpenActionId(null)
    }
  }

  const resendWinnerEmail = async (winner: Winner) => {
    setResendingId(winner.id)
    try {
      const { ok, data } = await fetchApi<{ ok?: boolean; error?: string }>(`/api/admin/winners/${winner.id}/resend-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!ok) throw new Error(data.error || 'Failed to send email')
      setToast({ type: 'success', text: `Email sent to ${winner.bidder.email || 'bidder'}.` })
      await fetchWinners()
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err)
      setToast({ type: 'error', text })
    } finally {
      setResendingId(null)
      setOpenActionId(null)
    }
  }

  const openPaymentProof = (winner: Winner) => {
    if (winner.payment_proof_url) {
      window.open(winner.payment_proof_url, '_blank', 'noopener,noreferrer')
      setOpenActionId(null)
      return
    }
    setSelectedWinner(winner)
    setOpenActionId(null)
  }

  const counts = useMemo(() => {
    const buckets: Record<PaymentFilter, number> = {
      all: winners.length,
      pending: 0,
      completed: 0,
      forfeited: 0
    }
    winners.forEach((winner) => {
      const bucket = toPaymentFilterBucket(winner.payment_status)
      buckets[bucket] += 1
    })
    return buckets
  }, [winners])

  const auctionOptions = useMemo(() => {
    const unique = new Set<string>()
    winners.forEach((winner) => {
      if (winner.auction?.title) unique.add(winner.auction.title)
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [winners])

  const filteredWinners = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()
    return winners.filter((winner) => {
      const bucket = toPaymentFilterBucket(winner.payment_status)
      if (paymentFilter !== 'all' && bucket !== paymentFilter) return false
      if (auctionFilter !== 'all' && winner.auction.title !== auctionFilter) return false

      const wonDate = new Date(winner.created_at)
      if (dateFrom) {
        const fromDate = new Date(`${dateFrom}T00:00:00`)
        if (!Number.isNaN(fromDate.getTime()) && wonDate < fromDate) return false
      }
      if (dateTo) {
        const toDate = new Date(`${dateTo}T23:59:59`)
        if (!Number.isNaN(toDate.getTime()) && wonDate > toDate) return false
      }

      if (!normalizedSearch) return true

      const shippingText = formatShippingAddressLines(winner.shipping_address).join(' ').toLowerCase()
      return (
        winner.bidder.name.toLowerCase().includes(normalizedSearch) ||
        winner.bidder.phone.toLowerCase().includes(normalizedSearch) ||
        winner.bidder.email?.toLowerCase().includes(normalizedSearch) ||
        winner.auction.title.toLowerCase().includes(normalizedSearch) ||
        shippingText.includes(normalizedSearch)
      )
    })
  }, [auctionFilter, dateFrom, dateTo, paymentFilter, searchQuery, winners])

  const tabs: Array<{ key: PaymentFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Payment Pending' },
    { key: 'completed', label: 'Completed' },
    { key: 'forfeited', label: 'Forfeited' }
  ]

  return (
    <div className="space-y-6 pb-10">
      {toast && (
        <div className="fixed top-4 right-4 z-50">
          <div
            className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Winners</h1>
          <p className="text-sm text-slate-500 mt-1">Track payment completion, dispatch, and communications.</p>
        </div>
        <Link
          href="/admin"
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to dashboard
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = paymentFilter === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPaymentFilter(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {counts[tab.key]}
                </span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search winner, phone, email, auction..."
            className="xl:col-span-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <select
            value={auctionFilter}
            onChange={(event) => setAuctionFilter(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="all">All auctions</option>
            {auctionOptions.map((auctionTitle) => (
              <option key={auctionTitle} value={auctionTitle}>
                {auctionTitle}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              aria-label="From date"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              aria-label="To date"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="h-11 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredWinners.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="text-lg font-medium text-slate-900">No winners found</h3>
            <p className="text-sm text-slate-500 mt-2">
              Try changing filters or search terms.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-semibold tracking-wide uppercase text-slate-500">
                  <th className="px-4 py-3 w-[28%]">Winner</th>
                  <th className="px-4 py-3 w-[15%]">Phone</th>
                  <th className="px-4 py-3 w-[16%]">Winning Amount</th>
                  <th className="px-4 py-3 w-[14%]">Payment</th>
                  <th className="px-4 py-3 w-[12%]">Dispatch</th>
                  <th className="px-4 py-3 w-[15%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWinners.map((winner) => (
                  <tr key={winner.id} className="align-middle">
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{winner.bidder.name}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{winner.bidder.email || '-'}</p>
                        <p className="text-xs text-slate-400 truncate mt-1">
                          {winner.auction.title} • {formatDateTime(winner.created_at)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 truncate">{winner.bidder.phone}</td>
                    <td className="px-4 py-3">
                      <span className="text-base font-semibold text-rose-700">{formatMoney(winner.winning_amount)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${paymentStatusClass(
                          winner.payment_status
                        )}`}
                      >
                        {paymentStatusLabel(winner.payment_status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {winner.dispatched_at ? (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          Dispatched
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative" data-actions-root="true" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenActionId((prev) => (prev === winner.id ? null : winner.id))
                          }}
                          disabled={actioningId === winner.id || resendingId === winner.id}
                        >
                          {actioningId === winner.id || resendingId === winner.id ? 'Working...' : 'Actions'}
                        </button>

                        {openActionId === winner.id && (
                          <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              onClick={() => {
                                setSelectedWinner(winner)
                                setOpenActionId(null)
                              }}
                            >
                              View Details
                            </button>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                              onClick={() => resendWinnerEmail(winner)}
                              disabled={!winner.bidder.email || resendingId === winner.id}
                            >
                              Send Email
                            </button>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                              onClick={() => patchWinner(winner.id, { dispatched_at: true })}
                              disabled={winner.payment_status !== 'completed' || Boolean(winner.dispatched_at)}
                            >
                              Mark Dispatched
                            </button>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              onClick={() => openPaymentProof(winner)}
                            >
                              View Payment Proof
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {selectedWinner && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setSelectedWinner(null)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white border-l border-slate-200 shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Winner Details</h2>
              <button
                type="button"
                onClick={() => setSelectedWinner(null)}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="p-5 overflow-y-auto h-[calc(100%-65px)] space-y-5">
              <section>
                <h3 className="text-xs font-semibold tracking-wide uppercase text-slate-500 mb-2">Winner</h3>
                <div className="space-y-1 text-sm text-slate-700">
                  <p><span className="font-medium text-slate-900">Name:</span> {selectedWinner.bidder.name}</p>
                  <p><span className="font-medium text-slate-900">Phone:</span> {selectedWinner.bidder.phone}</p>
                  <p className="truncate"><span className="font-medium text-slate-900">Email:</span> {selectedWinner.bidder.email || '-'}</p>
                  <p><span className="font-medium text-slate-900">Auction:</span> {selectedWinner.auction.title}</p>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold tracking-wide uppercase text-slate-500 mb-2">Shipping Address</h3>
                {formatShippingAddressLines(selectedWinner.shipping_address).length > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 space-y-1">
                    {formatShippingAddressLines(selectedWinner.shipping_address).map((line, idx) => (
                      <p key={`${selectedWinner.id}-shipping-${idx}`}>{line}</p>
                    ))}
                    <p className="text-xs text-slate-500 mt-2">
                      Submitted: {formatDateTime(selectedWinner.shipping_address_submitted_at)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Address not submitted.</p>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold tracking-wide uppercase text-slate-500 mb-2">Payment</h3>
                <div className="rounded-lg border border-slate-200 p-3 text-sm space-y-2">
                  <p><span className="font-medium text-slate-900">Winning Amount:</span> {formatMoney(selectedWinner.winning_amount)}</p>
                  <p><span className="font-medium text-slate-900">Status:</span> {paymentStatusLabel(selectedWinner.payment_status)}</p>
                  <p><span className="font-medium text-slate-900">Due:</span> {formatDateTime(selectedWinner.payment_due_at)}</p>
                  <p><span className="font-medium text-slate-900">Completed:</span> {formatDateTime(selectedWinner.payment_completed_at)}</p>
                  <p className="truncate"><span className="font-medium text-slate-900">Razorpay Order:</span> {selectedWinner.razorpay_order_id || '-'}</p>
                  <p className="truncate"><span className="font-medium text-slate-900">Razorpay Payment:</span> {selectedWinner.razorpay_payment_id || '-'}</p>
                  <p className="break-words"><span className="font-medium text-slate-900">Payment Note:</span> {selectedWinner.payment_proof_note || '-'}</p>
                  {selectedWinner.payment_proof_url ? (
                    <a
                      href={selectedWinner.payment_proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      Open payment proof
                    </a>
                  ) : (
                    <p><span className="font-medium text-slate-900">Proof URL:</span> -</p>
                  )}
                </div>
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
