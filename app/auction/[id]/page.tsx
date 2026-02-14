'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import PublicShell from '@/components/public/PublicShell'
import PhoneOtpVerification from '@/components/auth/PhoneOtpVerification'

interface AuctionDetail {
  id: string
  title: string
  product_id: string
  status: string
  registration_end_time: string
  bidding_start_time: string
  bidding_end_time: string
  min_increment: number
  banner_image?: string | null
  reel_url?: string | null
  current_highest_bid?: number | null
  total_bids?: number | null
  highest_bidder_name?: string | null
  winner_name?: string | null
  winning_amount?: number | null
  winner_declared_at?: string | null
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
    if (phase === 'live') return 'Live bidding'
    if (phase === 'ended') return 'Auction ended'
    return 'Loading'
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
    return current + auction.min_increment
  }, [auction])

  const handleVerificationSuccess = (payload: VerificationProfile) => {
    setProfile(payload)
    setRegistrationForm({
      name: payload.name,
      email: payload.email,
      phone: payload.phone
    })
    setMessage({ type: 'success', text: 'Phone verified. Complete registration to bid.' })

    localStorage.setItem('auction_user_phone', payload.phone)
    localStorage.setItem('auction_user_email', payload.email)
    localStorage.setItem('auction_user_name', payload.name)
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

    try {
      const response = await fetch('/api/place-bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auction_id: auction.id,
          bidder_id: bidderId,
          amount: amountValue
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
      <section className="section section-tight">
        <div className="container">
          <Link href="/auctions" className="btn btn-outline" style={{ marginBottom: '1.5rem' }}>
            Back to auctions
          </Link>

          {loading ? (
            <div className="card skeleton-card" />
          ) : error ? (
            <div className="card notice notice-error">{error}</div>
          ) : auction ? (
            <>
              <div className="auction-detail-grid">
                <div className="card auction-detail-card">
                  {auction.banner_image && (
                    <div className="auction-detail-image">
                      <img src={auction.banner_image} alt={auction.title} />
                    </div>
                  )}
                  {auction.reel_url && (
                    <div className="auction-detail-video">
                      <video
                        src={auction.reel_url}
                        controls
                        playsInline
                        preload="metadata"
                      />
                    </div>
                  )}
                  <div className="auction-detail-body">
                    <div className="auction-detail-header">
                      <div>
                        <span className="eyebrow">Auction</span>
                        <h1>{auction.title}</h1>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <span className={`badge badge-${auction.status}`}>{auction.status}</span>
                        <span className="pill pill-neutral">{phaseLabel}</span>
                      </div>
                    </div>

                    <div className="auction-detail-stats">
                      <div>
                        <span className="metric-label">Current bid</span>
                        <span className="metric-value">
                          {formatCurrency(auction.current_highest_bid)}
                        </span>
                        <span className="metric-caption">
                          {auction.highest_bidder_name
                            ? `Leader: ${auction.highest_bidder_name}`
                            : 'Be the first bidder'}
                        </span>
                      </div>
                      <div>
                        <span className="metric-label">Minimum increment</span>
                        <span className="metric-value">
                          {formatCurrency(auction.min_increment)}
                        </span>
                        <span className="metric-caption">
                          {auction.total_bids ? `${auction.total_bids} bids` : 'No bids yet'}
                        </span>
                      </div>
                    </div>

                    <div className="timeline-grid">
                      <div>
                        <span className="metric-label">Registration ends</span>
                        <span className="metric-value">
                          {formatDateTime(auction.registration_end_time)}
                        </span>
                      </div>
                      <div>
                        <span className="metric-label">Bidding starts</span>
                        <span className="metric-value">
                          {formatDateTime(auction.bidding_start_time)}
                        </span>
                      </div>
                      <div>
                        <span className="metric-label">Bidding ends</span>
                        <span className="metric-value">
                          {formatDateTime(auction.bidding_end_time)}
                        </span>
                      </div>
                    </div>

                    {countdownTarget && (
                      <div className="countdown-banner">
                        <span className="pill pill-neutral">
                          {phase === 'registration'
                            ? 'Registration closes in'
                            : phase === 'upcoming'
                              ? 'Bidding opens in'
                              : 'Auction ends in'}
                        </span>
                        <span className="countdown-value">
                          {formatCountdown(countdownTarget, now)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="card auction-action-card">
                  <div className="auction-action-header">
                    <h2>
                      {phase === 'live'
                        ? 'Place a bid'
                        : phase === 'ended'
                          ? 'Auction ended'
                          : 'Register to bid'}
                    </h2>
                    <p className="metric-caption">
                      {phase === 'registration'
                        ? 'Complete phone verification once and register to join.'
                        : phase === 'upcoming'
                          ? 'Registration is closed. Bidding opens soon.'
                          : phase === 'live'
                            ? 'Bidding is live for registered bidders.'
                            : 'Check back for future auctions.'}
                    </p>
                  </div>

                  {message && (
                    <div className={`notice notice-${message.type}`}>{message.text}</div>
                  )}

                  {phase === 'ended' && (
                    <div className="empty-state">
                      <h3>Auction complete</h3>
                      <p>
                        Final bid: {formatCurrency(auction.current_highest_bid)}. Winner:{' '}
                        {auction.winner_name || auction.highest_bidder_name || 'TBD'}
                      </p>
                      <Link href="/auctions" className="btn btn-outline">
                        Browse other auctions
                      </Link>
                    </div>
                  )}

                  {showRegistration && !bidderId && !profile && (
                    <div className="stack">
                      <PhoneOtpVerification
                        onVerificationSuccess={handleVerificationSuccess}
                        onVerificationError={handleVerificationError}
                        headline="Verify to join"
                        supportingText="You only need to verify once per device."
                      />
                    </div>
                  )}

                  {showRegistration && !bidderId && profile && (
                    <form onSubmit={handleRegister} className="stack">
                      <div>
                        <label htmlFor="name">Full name</label>
                        <input
                          id="name"
                          name="name"
                          type="text"
                          value={registrationForm.name}
                          onChange={(event) =>
                            setRegistrationForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="email">Email</label>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          value={registrationForm.email}
                          onChange={(event) =>
                            setRegistrationForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="phone">Verified phone</label>
                        <input id="phone" name="phone" type="tel" value={registrationForm.phone} readOnly />
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={registrationSubmitting}>
                        {registrationSubmitting ? 'Registering...' : 'Complete registration'}
                      </button>
                    </form>
                  )}

                  {showRegistration && bidderId && (
                    <div className="empty-state">
                      <h3>Registration confirmed</h3>
                      <p>You are registered and ready to bid when the auction opens.</p>
                      {countdownTarget && (
                        <div className="countdown-mini">
                          Bidding starts in {formatCountdown(countdownTarget, now)}
                        </div>
                      )}
                    </div>
                  )}

                  {phase === 'upcoming' && !bidderId && (
                    <div className="empty-state">
                      <h3>Registration closed</h3>
                      <p>Only registered bidders can participate once bidding opens.</p>
                    </div>
                  )}

                  {showLiveBid && bidderId && (
                    <form onSubmit={handleBidSubmit} className="stack">
                      <div>
                        <label htmlFor="bid-amount">Your bid</label>
                        <input
                          id="bid-amount"
                          name="bid-amount"
                          type="number"
                          min={minimumBid}
                          step="0.01"
                          value={bidAmount}
                          onChange={(event) => setBidAmount(event.target.value)}
                          placeholder={`Minimum ${formatCurrency(minimumBid)}`}
                          required
                        />
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={bidSubmitting}>
                        {bidSubmitting ? 'Placing bid...' : 'Place bid'}
                      </button>
                      <div className="metric-caption">
                        Minimum bid: {formatCurrency(minimumBid)}. Bidding extends automatically on last-minute bids.
                      </div>
                    </form>
                  )}

                  {showLiveBid && !bidderId && (
                    <div className="empty-state">
                      <h3>Registration closed</h3>
                      <p>You need to register before bidding goes live to place bids.</p>
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
  if (!value && value !== 0) return '$0.00'
  return `$${Number(value).toFixed(2)}`
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
