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
                  <AuctionMediaCarousel
                    banner={auction.banner_image}
                    gallery={auction.gallery_images}
                    reel={auction.reel_url}
                    title={auction.title}
                  />
                  <div className="auction-detail-body">
                    <div className="auction-detail-header">
                      <div>
                        <span className="eyebrow">Auction</span>
                        <h1>{auction.title}</h1>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span className={`badge badge-${auction.status}`}>{auction.status}</span>
                          <span className={pillClass}>{phaseLabel}</span>
                        </div>

                        {/* Bid form in header when auction is live and user is registered */}
                        {showLiveBid && bidderId && (
                          <div style={{ marginTop: '0.5rem', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>

                            {auction.available_sizes && auction.available_sizes.length > 0 && (
                              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {/* Size Label or Icon could go here */}
                                {auction.available_sizes.map(size => (
                                  <button
                                    key={size}
                                    type="button"
                                    onClick={() => setSelectedSize(size)}
                                    style={{
                                      padding: '0.25rem 0.6rem',
                                      fontSize: '0.8rem',
                                      border: selectedSize === size ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                                      borderRadius: '4px',
                                      background: selectedSize === size ? 'var(--color-primary)' : 'transparent',
                                      color: selectedSize === size ? '#fff' : 'var(--color-text-secondary)',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s',
                                      fontWeight: selectedSize === size ? 600 : 400
                                    }}
                                  >
                                    {size}
                                  </button>
                                ))}
                              </div>
                            )}

                            <form onSubmit={handleBidSubmit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                                style={{
                                  width: '140px',
                                  padding: '0.5rem 0.75rem',
                                  fontSize: '0.95rem',
                                  border: '2px solid var(--color-primary)',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--color-surface)',
                                  color: 'var(--color-text-primary)'
                                }}
                              />
                              <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={bidSubmitting}
                                style={{
                                  whiteSpace: 'nowrap',
                                  padding: '0.5rem 1rem',
                                  fontSize: '0.95rem'
                                }}
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
                      <div className={`notice notice-${message.type}`} style={{ marginTop: '1rem' }}>
                        {message.text}
                      </div>
                    )}

                    <div className="auction-detail-stats">
                      <div>
                        <span className="metric-label">Current bid</span>
                        <span className="metric-value">
                          {formatCurrency(auction.current_highest_bid)}
                          {auction.highest_bid_size && (
                            <span style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.8rem',
                              padding: '2px 6px',
                              border: '1px solid var(--color-border)',
                              borderRadius: '4px',
                              background: 'var(--color-surface-light)',
                              verticalAlign: 'middle',
                              fontWeight: 'normal',
                              color: 'var(--color-text-secondary)'
                            }}>
                              Size: {auction.highest_bid_size}
                            </span>
                          )}
                        </span>
                        <span className="metric-caption">
                          {auction.highest_bidder_name
                            ? `Leader: ${auction.highest_bidder_name}`
                            : 'Be the first bidder'}
                        </span>
                      </div>
                      {auction.base_price && (
                        <div>
                          <span className="metric-label">Base price</span>
                          <span className="metric-value">
                            {formatCurrency(auction.base_price)}
                          </span>
                          <span className="metric-caption">
                            Starting price
                          </span>
                        </div>
                      )}
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
                        <span className={pillClass}>
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
                        ? 'Auction Status'
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
                            ? 'Live bidding is in progress. Place your bid at the top.'
                            : 'Check back for future auctions.'}
                    </p>
                  </div>

                  {message && !showLiveBid && (
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

                  {showRegistration && !bidderId && checkingUser && (
                    <div className="empty-state">
                      <p>Checking your verification status...</p>
                    </div>
                  )}

                  {showRegistration && !bidderId && !checkingUser && !profile && (
                    <div className="stack">
                      <EmailOtpVerification
                        auctionId={auction.id}
                        onVerificationComplete={handleVerificationSuccess}
                        onError={handleVerificationError}
                      />
                    </div>
                  )}

                  {showRegistration && !bidderId && !checkingUser && profile && (
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
                    <div className="empty-state">
                      <h3>Bidding is active</h3>
                      <p>
                        Current lead: {formatCurrency(auction.current_highest_bid)}.
                        Next bid must be at least {formatCurrency(minimumBid)}.
                      </p>
                      <div className="metric-caption" style={{ marginTop: '1rem' }}>
                        💡 Use the bid form at the top to place your bid. Auction extends automatically on last-minute bids.
                      </div>
                    </div>
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
