'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import PublicShell from '@/components/public/PublicShell'
import EmailOtpVerification from '@/components/auth/EmailOtpVerification'
import AuctionMediaCarousel from '@/components/public/AuctionMediaCarousel'

interface AuctionDetail {
  id: string
  title: string
  product_id: string
  status: string
  registration_end_time: string
  bidding_start_time: string
  bidding_end_time: string
  min_increment: number
  base_price?: number | null
  banner_image?: string | null
  reel_url?: string | null
  current_highest_bid?: number | null
  total_bids?: number | null
  highest_bidder_name?: string | null
  winner_name?: string | null
  winning_amount?: number | null
  winner_declared_at?: string | null
  available_sizes?: string[] | null
  gallery_images?: string[] | null
  highest_bid_size?: string | null
}

type StatusMessage = { type: 'success' | 'error' | 'info'; text: string }

type VerificationProfile = {
  userId: string
  name: string
  email: string
  phone: string
  idToken?: string
}

export default function AuctionDetailPage() {
  const params = useParams<{ id: string }>()
  const auctionId = params?.id
  const [auction, setAuction] = useState<AuctionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<StatusMessage | null>(null)
  const [bidderId, setBidderId] = useState<string | null>(null)
  const [profile, setProfile] = useState<VerificationProfile | null>(null)
  const [registrationForm, setRegistrationForm] = useState({
    name: '',
    email: '',
    phone: ''
  })
  const [bidAmount, setBidAmount] = useState('')
  const [registrationSubmitting, setRegistrationSubmitting] = useState(false)
  const [bidSubmitting, setBidSubmitting] = useState(false)
  const [now, setNow] = useState(new Date())
  const [checkingUser, setCheckingUser] = useState(false)
  const [selectedSize, setSelectedSize] = useState<string>('')

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadAuction = async () => {
      setLoading(true)
      setError(null)

      try {
        if (!auctionId) {
          throw new Error('Auction ID is missing')
        }

        const res = await fetch(`/api/auction/${auctionId}`, { cache: 'no-store' })
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load auction')
        }

        if (isMounted) {
          setAuction(data)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load auction')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadAuction()
    return () => {
      isMounted = false
    }
  }, [auctionId])

  useEffect(() => {
    if (!auction) return
    const savedBidderId = localStorage.getItem(`bidder_${auction.id}`)
    if (savedBidderId) {
      setBidderId(savedBidderId)
    }

    const savedPhone = localStorage.getItem('auction_user_phone') || ''
    const savedEmail = localStorage.getItem('auction_user_email') || ''
    const savedName = localStorage.getItem('auction_user_name') || ''

    if (!savedPhone && !savedEmail) return

    const verifySavedUser = async () => {
      setCheckingUser(true)
      try {
        const res = await fetch('/api/auth/check-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: savedPhone, email: savedEmail })
        })
        const data = await res.json()
        if (data.verified && data.user) {
          const verifiedProfile: VerificationProfile = {
            userId: data.user_id || '',
            name: data.user.name || savedName,
            email: data.user.email || savedEmail,
            phone: data.user.phone || savedPhone
          }
          setProfile(verifiedProfile)
          setRegistrationForm({
            name: verifiedProfile.name,
            email: verifiedProfile.email,
            phone: verifiedProfile.phone
          })
        }
      } catch {
        // Ignore check errors and fall back to OTP flow
      } finally {
        setCheckingUser(false)
      }
    }

    verifySavedUser()
  }, [auction])

  useEffect(() => {
    if (!auction) return

    const channel = supabase
      .channel(`auction-bids-${auction.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_id=eq.${auction.id}` },
        () => {
          refreshAuction()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [auction])

  const refreshAuction = async () => {
    try {
      if (!auctionId) return
      const res = await fetch(`/api/auction/${auctionId}`, { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        setAuction(data)
      }
    } catch {
      // Silent refresh failure
    }
  }


  const phase = useMemo(() => {
    if (!auction) return 'loading'
    if (auction.status === 'ended') return 'ended'

    const registrationEnd = new Date(auction.registration_end_time)
    const biddingStart = new Date(auction.bidding_start_time)
    const biddingEnd = new Date(auction.bidding_end_time)

    if (now > biddingEnd) return 'ended'
    if (now >= biddingStart && now <= biddingEnd) return 'live'
    if (now < registrationEnd) return 'registration'
    if (now >= registrationEnd && now < biddingStart) return 'upcoming'
    return 'upcoming'
  }, [auction, now])

  const phaseLabel = useMemo(() => {
    if (phase === 'registration') return 'Registration open'
    if (phase === 'upcoming') return 'Bidding soon'
    if (phase === 'live') return 'Auction live'
    if (phase === 'ended') return 'Auction ended'
    return 'Loading'
  }, [phase])

  const pillClass = useMemo(() => {
    if (phase === 'live') return 'pill pill-live'
    return 'pill pill-neutral'
  }, [phase])

  const countdownTarget = useMemo(() => {
    if (!auction) return null
    if (phase === 'registration') return new Date(auction.registration_end_time)
    if (phase === 'upcoming') return new Date(auction.bidding_start_time)
    if (phase === 'live') return new Date(auction.bidding_end_time)
    return null
  }, [auction, phase])

  const minimumBid = useMemo(() => {
    if (!auction) return 0
    const current = auction.current_highest_bid || 0
    // If no bids yet (current = 0), use base_price if set, otherwise use min_increment
    if (current === 0) {
      return auction.base_price || auction.min_increment
    }
    // If there are bids, next bid must be current + min_increment
    return current + auction.min_increment
  }, [auction])

  const handleVerificationSuccess = (userId: string, userInfo: { name: string; email: string; phone?: string }) => {
    const payload: VerificationProfile = {
      userId,
      name: userInfo.name,
      email: userInfo.email,
      phone: userInfo.phone || ''
    }
    setProfile(payload)
    setRegistrationForm({
      name: payload.name,
      email: payload.email,
      phone: payload.phone
    })

    // Store verification details in localStorage
    localStorage.setItem('auction_user_id', userId)
    localStorage.setItem('auction_user_phone', payload.phone)
    localStorage.setItem('auction_user_email', payload.email)
    localStorage.setItem('auction_user_name', payload.name)

    setMessage({ type: 'success', text: 'Email verified. Complete registration to bid.' })
  }

  const handleVerificationError = (errorText: string) => {
    setMessage({ type: 'error', text: errorText })
  }

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!auction) return

    setRegistrationSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/register-bidder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auction_id: auction.id,
          name: registrationForm.name,
          email: registrationForm.email,
          phone: registrationForm.phone
        })
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.requires_verification) {
          setProfile(null)
          setMessage({ type: 'error', text: data.message || 'Phone verification required.' })
          return
        }
        throw new Error(data.error || 'Registration failed')
      }

      localStorage.setItem(`bidder_${auction.id}`, data.bidder_id)
      setBidderId(data.bidder_id)
      setMessage({ type: 'success', text: 'Registration complete. You are ready to bid.' })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to register'
      })
    } finally {
      setRegistrationSubmitting(false)
    }
  }

  const handleBidSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!auction || !bidderId) return

    setBidSubmitting(true)
    setMessage(null)

    const amountValue = Number(bidAmount)
    if (!amountValue || amountValue < minimumBid) {
      setMessage({
        type: 'error',
        text: `Bid must be at least ${formatCurrency(minimumBid)}`
      })
      setBidSubmitting(false)
      return
    }

    if (auction.available_sizes && auction.available_sizes.length > 0 && !selectedSize) {
      setMessage({
        type: 'error',
        text: 'Please select a size.'
      })
      setBidSubmitting(false)
      return
    }

    try {
      const response = await fetch('/api/place-bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auction_id: auction.id,
          bidder_id: bidderId,
          amount: amountValue,
          size: selectedSize
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to place bid')
      }

      setBidAmount('')
      setMessage({ type: 'success', text: 'Bid placed successfully.' })
      refreshAuction()
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to place bid'
      })
    } finally {
      setBidSubmitting(false)
    }
  }

  const showRegistration = phase === 'registration'
  const showLiveBid = phase === 'live'
  return (
    <PublicShell>
      <section className="py-12 lg:py-20">
        <div className="max-w-7xl mx-auto px-4">
          <Link href="/auctions" className="inline-flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900 mb-8 gap-1 transition-colors group">
            <span className="group-hover:-translate-x-1 transition-transform">←</span> Back to auctions
          </Link>

          {loading ? (
            <div className="bg-white border border-zinc-200 rounded-xl shadow-sm h-[600px] animate-pulse" />
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
          ) : auction ? (
            <>
              <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
                <div className="rounded-xl overflow-hidden">
                  <AuctionMediaCarousel
                    banner={auction.banner_image}
                    gallery={auction.gallery_images}
                    reel={auction.reel_url}
                    title={auction.title}
                  />
                  <div className="p-6 lg:p-8 flex flex-col gap-8">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                      <div className="flex flex-col gap-2">
                        <span className="uppercase tracking-widest text-xs font-semibold text-orange-500">Auction</span>
                        <h1 className="text-3xl lg:text-4xl font-bold font-display text-black">{auction.title}</h1>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <div className="flex gap-2 items-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${auction.status === 'live' ? 'bg-green-100 text-green-700' :
                            auction.status === 'ended' ? 'bg-gray-100 text-gray-500' :
                              'bg-orange-100 text-orange-700'
                            }`}>{auction.status}</span>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${phase === 'live' ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-600'
                            }`}>{phaseLabel}</span>
                        </div>

                        {/* Bid form in header when auction is live and user is registered */}
                        {showLiveBid && bidderId && (
                          <div className="mt-2 w-full flex flex-col items-end gap-3">
                            {auction.available_sizes && auction.available_sizes.length > 0 && (
                              <div className="flex gap-1 flex-wrap justify-end">
                                {auction.available_sizes.map(size => (
                                  <button
                                    key={size}
                                    type="button"
                                    onClick={() => setSelectedSize(size)}
                                    className={`px-3 py-1 text-xs rounded transition-all border ${selectedSize === size
                                      ? 'bg-orange-500 border-orange-500 text-white font-semibold'
                                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                                      }`}
                                  >
                                    {size}
                                  </button>
                                ))}
                              </div>
                            )}

                            <form onSubmit={handleBidSubmit} className="flex gap-2 items-center">
                              <input
                                id="bid-amount"
                                name="bid-amount"
                                type="number"
                                min={minimumBid}
                                step="0.01"
                                value={bidAmount}
                                onChange={(event) => setBidAmount(event.target.value)}
                                placeholder={`₹${minimumBid}`}
                                required
                                className="w-32 px-3 py-2 text-sm border-2 border-orange-500 rounded bg-white text-black focus:outline-none focus:ring-2 focus:ring-orange-200"
                              />
                              <button
                                type="submit"
                                className="px-4 py-2 bg-orange-500 text-white rounded font-semibold text-sm hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                disabled={bidSubmitting}
                              >
                                {bidSubmitting ? 'Placing...' : 'Place Bid'}
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Show message if bid was placed */}
                    {message && showLiveBid && (
                      <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                        }`}>
                        {message.text}
                      </div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 border-t border-gray-200 pt-6">
                      <div>
                        <span className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-1 block">Current bid</span>
                        <span className="text-2xl font-bold text-black block flex items-center gap-2">
                          {formatCurrency(auction.current_highest_bid)}
                          {auction.highest_bid_size && (
                            <span className="text-xs px-2 py-0.5 border border-gray-200 bg-gray-50 rounded text-gray-500 font-normal">
                              Size: {auction.highest_bid_size}
                            </span>
                          )}
                        </span>
                        <span className="text-sm text-gray-600 mt-1 block">
                          {auction.highest_bidder_name
                            ? `Leader: ${auction.highest_bidder_name}`
                            : 'Be the first bidder'}
                        </span>
                      </div>
                      {auction.base_price && (
                        <div>
                          <span className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-1 block">Base price</span>
                          <span className="text-2xl font-bold text-black block">
                            {formatCurrency(auction.base_price)}
                          </span>
                          <span className="text-sm text-gray-600 mt-1 block">
                            Starting price
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-1 block">Minimum increment</span>
                        <span className="text-2xl font-bold text-black block">
                          {formatCurrency(auction.min_increment)}
                        </span>
                        <span className="text-sm text-gray-600 mt-1 block">
                          {auction.total_bids ? `${auction.total_bids} bids` : 'No bids yet'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-gray-200">
                      <div>
                        <span className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-1 block">Registration ends</span>
                        <span className="text-sm font-medium text-black">
                          {formatDateTime(auction.registration_end_time)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-1 block">Bidding starts</span>
                        <span className="text-sm font-medium text-black">
                          {formatDateTime(auction.bidding_start_time)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-1 block">Bidding ends</span>
                        <span className="text-sm font-medium text-black">
                          {formatDateTime(auction.bidding_end_time)}
                        </span>
                      </div>
                    </div>

                    {countdownTarget && (
                      <div className="flex justify-between items-center p-4 bg-orange-50 border border-orange-200 rounded-xl">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${phase === 'live' ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-white text-orange-700 border border-orange-200'
                          }`}>
                          {phase === 'registration'
                            ? 'Registration closes in'
                            : phase === 'upcoming'
                              ? 'Bidding opens in'
                              : 'Auction ends in'}
                        </span>
                        <span className="text-xl font-bold font-mono text-orange-700">
                          {formatCountdown(countdownTarget, now)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="sticky top-24 flex flex-col gap-6 p-6 bg-white border border-zinc-200 rounded-xl shadow-sm">
                  <div className="flex flex-col gap-2 border-b border-zinc-100 pb-4">
                    <h2 className="text-xl font-bold text-zinc-900">
                      {phase === 'live'
                        ? 'Auction Status'
                        : phase === 'ended'
                          ? 'Auction ended'
                          : 'Register to bid'}
                    </h2>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                      {phase === 'registration'
                        ? 'Complete phone verification once and register to join.'
                        : phase === 'upcoming'
                          ? 'Registration is closed. Bidding opens soon.'
                          : phase === 'live'
                            ? 'Live bidding is in progress. Place your bid at the top.'
                            : 'Check back for future auctions.'}
                    </p>
                  </div>

                  {message && !showLiveBid && (
                    <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                      }`}>{message.text}</div>
                  )}

                  {phase === 'ended' && (
                    <div className="text-center py-8">
                      <h3 className="text-lg font-bold text-zinc-900 mb-2">Auction complete</h3>
                      <p className="text-zinc-500 mb-6 text-sm">
                        Final bid: {formatCurrency(auction.current_highest_bid)}. Winner:{' '}
                        {auction.winner_name || auction.highest_bidder_name || 'TBD'}
                      </p>
                      <Link href="/auctions" className="inline-flex justify-center w-full px-4 py-2 border border-zinc-200 rounded-lg text-sm font-medium hover:bg-zinc-50 hover:text-orange-600 transition-colors">
                        Browse other auctions
                      </Link>
                    </div>
                  )}

                  {showRegistration && !bidderId && checkingUser && (
                    <div className="text-center py-8 text-zinc-500">
                      <p>Checking your verification status...</p>
                    </div>
                  )}

                  {showRegistration && !bidderId && !checkingUser && !profile && (
                    <div className="flex flex-col gap-4">
                      <EmailOtpVerification
                        auctionId={auction.id}
                        onVerificationComplete={handleVerificationSuccess}
                        onError={handleVerificationError}
                      />
                    </div>
                  )}

                  {showRegistration && !bidderId && !checkingUser && profile && (
                    <form onSubmit={handleRegister} className="flex flex-col gap-4">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1">Full name</label>
                        <input
                          id="name"
                          name="name"
                          type="text"
                          value={registrationForm.name}
                          onChange={(event) =>
                            setRegistrationForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                          required
                          className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          value={registrationForm.email}
                          onChange={(event) =>
                            setRegistrationForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                          required
                          className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-zinc-700 mb-1">Verified phone</label>
                        <input id="phone" name="phone" type="tel" value={registrationForm.phone} readOnly className="w-full px-3 py-2 border border-zinc-200 bg-zinc-50 text-zinc-500 rounded-md text-sm cursor-not-allowed" />
                      </div>
                      <button type="submit" className="w-full px-4 py-2 bg-orange-500 text-white rounded font-semibold text-sm hover:bg-orange-600 transition-colors disabled:opacity-50" disabled={registrationSubmitting}>
                        {registrationSubmitting ? 'Registering...' : 'Complete registration'}
                      </button>
                    </form>
                  )}

                  {showRegistration && bidderId && (
                    <div className="text-center py-8">
                      <h3 className="text-lg font-bold text-zinc-900 mb-2">Registration confirmed</h3>
                      <p className="text-zinc-500 text-sm mb-4">You are registered and ready to bid when the auction opens.</p>
                      {countdownTarget && (
                        <div className="inline-block px-3 py-1 bg-orange-50 text-orange-700 rounded text-xs font-bold uppercase tracking-wider">
                          Bidding starts in {formatCountdown(countdownTarget, now)}
                        </div>
                      )}
                    </div>
                  )}

                  {phase === 'upcoming' && !bidderId && (
                    <div className="text-center py-8">
                      <h3 className="text-lg font-bold text-zinc-900 mb-2">Registration closed</h3>
                      <p className="text-zinc-500 text-sm">Only registered bidders can participate once bidding opens.</p>
                    </div>
                  )}

                  {showLiveBid && bidderId && (
                    <div className="text-center py-8">
                      <h3 className="text-lg font-bold text-zinc-900 mb-2">Bidding is active</h3>
                      <p className="text-zinc-600 text-sm mb-4">
                        Current lead: <span className="font-semibold text-zinc-900">{formatCurrency(auction.current_highest_bid)}</span>.
                        Next bid must be at least <span className="font-semibold text-zinc-900">{formatCurrency(minimumBid)}</span>.
                      </p>
                      <div className="text-xs text-zinc-500 bg-zinc-50 p-3 rounded border border-zinc-100">
                        💡 Use the bid form at the top to place your bid. Auction extends automatically on last-minute bids.
                      </div>
                    </div>
                  )}

                  {showLiveBid && !bidderId && (
                    <div className="text-center py-8">
                      <h3 className="text-lg font-bold text-zinc-900 mb-2">Registration closed</h3>
                      <p className="text-zinc-500 text-sm">You need to register before bidding goes live to place bids.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </PublicShell>
  )
}

function formatCurrency(value: number | null | undefined) {
  if (!value && value !== 0) return '₹0.00'
  return `₹${Number(value).toFixed(2)}`
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return 'TBD'
  }
}

function formatCountdown(target: Date, now: Date) {
  const totalMs = Math.max(target.getTime() - now.getTime(), 0)
  const seconds = Math.floor(totalMs / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  parts.push(`${hours.toString().padStart(2, '0')}h`)
  parts.push(`${minutes.toString().padStart(2, '0')}m`)
  parts.push(`${remainingSeconds.toString().padStart(2, '0')}s`)
  return parts.join(' ')
}
