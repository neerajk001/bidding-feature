'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import PublicShell from '@/components/public/PublicShell'

interface AuctionSummary {
  id: string
  title: string
  product_id: string
  status: string
  bidding_start_time: string
  bidding_end_time: string
  min_increment: number
  banner_image?: string | null
  current_highest_bid?: number | null
  total_bids?: number | null
  highest_bidder_name?: string | null
  winner_name?: string | null
  winning_amount?: number | null
  winner_declared_at?: string | null
}

interface ActiveAuctionResponse {
  exists: boolean
  auction_id?: string
  phase?: 'registration' | 'live'
  cta?: string
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
})

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
})

const shopifyStoreUrl = process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL || 'https://induheritage.com'
const shopifyLinkProps = shopifyStoreUrl.startsWith('http')
  ? { target: '_blank', rel: 'noreferrer' }
  : {}

const shopifyDrops = [
  {
    title: 'Banarasi Brocade Edit',
    description: 'Handwoven silks with gold zari work, curated for collectors.',
    price: 'From INR 12,900',
    tone: 'ochre',
  },
  {
    title: 'Heritage Bridal Looms',
    description: 'Archive-inspired bridal sets with couture finishing.',
    price: 'From INR 22,500',
    tone: 'rose',
  },
  {
    title: 'Festive Heirloom Capsule',
    description: 'Limited drop of richly detailed ensembles for gala nights.',
    price: 'From INR 9,800',
    tone: 'forest',
  },
] as const

const heritagePillars = [
  {
    title: 'Verified Provenance',
    description: 'Every lot is authenticated and documented before bidding opens.',
  },
  {
    title: 'Concierge Support',
    description: 'Personal bidding guidance, sizing help, and styling notes.',
  },
  {
    title: 'White-Glove Delivery',
    description: 'Premium packaging with insured, trackable delivery across India.',
  },
] as const

export default function HomePage() {
  const heroRef = useRef<HTMLDivElement | null>(null)
  const [activeAuction, setActiveAuction] = useState<ActiveAuctionResponse | null>(null)
  const [activeDetail, setActiveDetail] = useState<AuctionSummary | null>(null)
  const [auctions, setAuctions] = useState<AuctionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [auctionTab, setAuctionTab] = useState<'upcoming' | 'past'>('upcoming')

  useEffect(() => {
    let isMounted = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const [activeRes, auctionsRes] = await Promise.all([
          fetch('/api/auction/active', { cache: 'no-store' }),
          fetch('/api/auctions?includeEnded=true', { cache: 'no-store' }),
        ])

        const activeData = await activeRes.json()
        const auctionsData = await auctionsRes.json()

        if (!activeRes.ok) {
          throw new Error(activeData.error || 'Failed to load active auction')
        }

        if (!auctionsRes.ok) {
          throw new Error(auctionsData.error || 'Failed to load auctions')
        }

        if (!isMounted) return

        const auctionList = auctionsData.auctions || []
        setActiveAuction(activeData)
        setAuctions(auctionList)

        if (activeData?.exists && activeData.auction_id) {
          try {
            const detailRes = await fetch(`/api/auction/${activeData.auction_id}`, {
              cache: 'no-store',
            })
            const detailData = await detailRes.json()
            if (detailRes.ok) {
              setActiveDetail(detailData)
              return
            }
          } catch {
            // fall through
          }
        }

        // Fallback to first non-ended auction if no active one, for display purposes
        const fallbackAuction =
          auctionList.find((auction: AuctionSummary) => auction.status !== 'ended') ||
          null
        setActiveDetail(fallbackAuction)
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load auctions')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return

    let ticking = false

    const updateParallax = () => {
      const offset = Math.min(window.scrollY * 0.2, 140)
      hero.style.setProperty('--hero-parallax', `${offset}px`)
      ticking = false
    }

    const handleScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(updateParallax)
    }

    updateParallax()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const upcomingAuctions = useMemo(() => {
    const now = new Date()
    const filtered = auctions.filter((auction) => {
      if (auction.status !== 'live') return false
      const start = parseDate(auction.bidding_start_time)
      if (!start) return true
      return now < start
    })
    if (activeDetail) {
      return filtered.filter((auction) => auction.id !== activeDetail.id).slice(0, 4)
    }
    return filtered.slice(0, 4)
  }, [auctions, activeDetail])

  const pastAuctions = useMemo(() => {
    return auctions.filter((auction) => auction.status === 'ended').slice(0, 6)
  }, [auctions])

  const recentEndedAuction = useMemo(() => {
    const ended = auctions.filter((auction) => auction.status === 'ended')
    if (ended.length === 0) return null
    return ended
      .slice()
      .sort((a, b) => {
        const aDate = parseDate(a.bidding_end_time)?.getTime() ?? 0
        const bDate = parseDate(b.bidding_end_time)?.getTime() ?? 0
        return bDate - aDate
      })[0]
  }, [auctions])

  const heroCtaLabel = activeAuction?.phase === 'live' ? 'Enter Live Auction' : 'Reserve Auction Seat'
  const heroEyebrow = activeAuction?.phase === 'live' ? 'Live Auction' : 'Upcoming Auction'
  const heroTime = activeAuction?.phase === 'live'
    ? activeDetail?.bidding_end_time
    : activeDetail?.bidding_start_time

  return (
    <PublicShell>
      <section className="landing-hero" ref={heroRef}>
        <div className="container landing-hero-inner">
          <div className="landing-hero-copy">
            <span className="eyebrow">Indu Heritage Auction House</span>
            <h1 className="landing-hero-title">Traditional couture, curated for modern collectors.</h1>
            <p className="landing-hero-subtitle">
              Bid on heirloom-worthy pieces from India&apos;s master ateliers. Discover live auctions,
              reserve upcoming lots, and shop curated drops between events.
            </p>
            <div className="landing-hero-actions">
              <Link
                href={activeDetail ? `/auction/${activeDetail.id}` : '/auctions'}
                className="btn btn-primary"
              >
                {heroCtaLabel}
              </Link>
              <Link href="/auctions" className="btn btn-outline">
                Explore Upcoming Auctions
              </Link>
            </div>
            <div className="landing-hero-badges">
              <span className="landing-badge">Verified authenticity</span>
              <span className="landing-badge">Real-time bidding</span>
              <span className="landing-badge">Premium delivery</span>
            </div>
          </div>

          <div className="landing-hero-card">
            {loading ? (
              <div className="stack">
                <div className="skeleton-block" style={{ height: '320px' }} />
                <div className="skeleton-line" style={{ width: '70%' }} />
                <div className="skeleton-line" style={{ width: '50%' }} />
                <div className="skeleton-block" style={{ height: '120px' }} />
              </div>
            ) : activeDetail ? (
              <div className="hero-auction">
                <div className="hero-auction-media">
                  {activeDetail.banner_image ? (
                    <img src={activeDetail.banner_image} alt={activeDetail.title} />
                  ) : (
                    <div className="hero-auction-fallback">Indu Heritage</div>
                  )}
                </div>
                <div className="hero-auction-body">
                  <div className="hero-auction-top">
                    <span className={`pill ${activeAuction?.phase === 'live' ? '' : 'pill-neutral'}`}>
                      {heroEyebrow}
                    </span>
                    <span className="hero-auction-tag">Lot spotlight</span>
                  </div>
                  <h3>{activeDetail.title}</h3>
                  <p className="hero-auction-copy">
                    Hand-finished pieces from master ateliers with verified provenance.
                  </p>
                  <div className="hero-auction-metrics">
                    <div>
                      <span className="metric-label">Current bid</span>
                      <span className="metric-value">
                        {formatCurrency(activeDetail.current_highest_bid)}
                      </span>
                      <span className="metric-caption">
                        {activeDetail.total_bids
                          ? `${activeDetail.total_bids} bids placed`
                          : 'Collector preview open'}
                      </span>
                    </div>
                    <div>
                      <span className="metric-label">
                        {activeAuction?.phase === 'live' ? 'Ends' : 'Starts'}
                      </span>
                      <span className="metric-value">
                        {heroTime ? formatDate(heroTime) : 'TBD'}
                      </span>
                      <span className="metric-caption">
                        {heroTime ? formatTime(heroTime) : 'Time to be announced'}
                      </span>
                    </div>
                    <div>
                      <span className="metric-label">Highest bidder</span>
                      <span className="metric-value">
                        {activeDetail.highest_bidder_name || 'No bids yet'}
                      </span>
                      <span className="metric-caption">Highest bid</span>
                      <span className="metric-value">
                        {formatCurrency(activeDetail.current_highest_bid)}
                      </span>
                    </div>
                  </div>
                  <div className="hero-auction-actions">
                    <Link href={`/auction/${activeDetail.id}`} className="btn btn-primary">
                      {activeAuction?.phase === 'live' ? 'Place Bid' : 'Register to Bid'}
                    </Link>
                    <Link href="/auctions" className="btn btn-outline">
                      View All Auctions
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <span className="eyebrow">Indu Heritage</span>
                <h3>New lots are being curated</h3>
                <p className="hero-auction-copy">
                  Follow the upcoming auction calendar and reserve your seat.
                </p>
                <Link href="/auctions" className="btn btn-outline">
                  Browse Auction Calendar
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="container">
          <div className="landing-section-header">
            <div className="section-heading">
              <span className="eyebrow">Upcoming Auctions</span>
              <h2 className="landing-section-title">Explore upcoming auctions and previews.</h2>
              <p className="landing-section-subtitle">
                Register early to unlock preview access, bidding guides, and personal styling notes.
              </p>
            </div>
            <div className="landing-section-actions">
              <div className="tab-group">
                <button
                  type="button"
                  className={`tab-button ${auctionTab === 'upcoming' ? 'is-active' : ''}`}
                  onClick={() => setAuctionTab('upcoming')}
                >
                  Upcoming
                </button>
                <button
                  type="button"
                  className={`tab-button ${auctionTab === 'past' ? 'is-active' : ''}`}
                  onClick={() => setAuctionTab('past')}
                >
                  Past Auctions
                </button>
              </div>
              <Link href="/auctions" className="btn btn-outline">
                Explore Calendar
              </Link>
            </div>
          </div>

          {error && <div className="notice notice-error">{error}</div>}

          {auctionTab === 'upcoming' ? (
            <div className="landing-auction-grid">
              {loading
                ? Array.from({ length: 3 }).map((_, index) => (
                    <div className="auction-tile skeleton-card" key={`auction-skeleton-${index}`} />
                  ))
                : upcomingAuctions.length > 0
                ? upcomingAuctions.map((auction) => {
                    const startAt = auction.bidding_start_time || auction.bidding_end_time
                    const startingBid = auction.min_increment ?? auction.current_highest_bid ?? 0

                    return (
                      <Link href={`/auction/${auction.id}`} key={auction.id} className="auction-tile">
                        <div className="auction-tile-media">
                          {auction.banner_image ? (
                            <img src={auction.banner_image} alt={auction.title} />
                          ) : (
                            <div className="hero-auction-fallback">Upcoming Lot</div>
                          )}
                        </div>
                        <div className="auction-tile-body">
                          <div className="auction-tile-top">
                            <span className={`badge badge-${auction.status}`}>{auction.status}</span>
                            <span className="auction-tile-date">
                              {startAt ? formatDate(startAt) : 'TBD'}
                            </span>
                          </div>
                          <h3>{auction.title}</h3>
                          <div className="auction-tile-footer">
                            <div>
                              <span className="metric-label">Starting bid</span>
                              <span className="metric-value">{formatCurrency(startingBid)}</span>
                            </div>
                            <span className="auction-tile-cta">Preview lot</span>
                          </div>
                        </div>
                      </Link>
                    )
                  })
                : (
                  <div className="empty-state card">
                    <h3>No upcoming auctions yet</h3>
                    <p>New lots are added weekly. Check back soon.</p>
                  </div>
                )}
            </div>
          ) : (
            <div className="landing-auction-grid">
              {loading
                ? Array.from({ length: 3 }).map((_, index) => (
                    <div className="auction-tile skeleton-card" key={`past-skeleton-${index}`} />
                  ))
                : pastAuctions.length > 0
                ? pastAuctions.map((auction) => (
                    <Link href={`/auction/${auction.id}`} key={auction.id} className="auction-tile auction-tile--past">
                      <div className="auction-tile-media">
                        {auction.banner_image ? (
                          <img src={auction.banner_image} alt={auction.title} />
                        ) : (
                          <div className="hero-auction-fallback">Past Lot</div>
                        )}
                      </div>
                      <div className="auction-tile-body">
                        <div className="auction-tile-top">
                          <span className="badge badge-ended">ended</span>
                          <span className="auction-tile-date">
                            {auction.bidding_end_time ? formatDate(auction.bidding_end_time) : 'TBD'}
                          </span>
                        </div>
                        <h3>{auction.title}</h3>
                        <div className="auction-tile-footer">
                          <div>
                            <span className="metric-label">Winner</span>
                            <span className="metric-value">
                              {auction.winner_name ||
                                auction.highest_bidder_name ||
                                'No bids'}
                            </span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span className="metric-label">Winning bid</span>
                            <span className="metric-value">
                              {formatCurrency(
                                auction.winning_amount ?? auction.current_highest_bid
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                : (
                  <div className="empty-state card">
                    <h3>No past auctions yet</h3>
                    <p>Completed auctions will appear here with winner details.</p>
                  </div>
                )}
            </div>
          )}

          {auctionTab === 'upcoming' && !loading && upcomingAuctions.length === 0 && recentEndedAuction && (
            <div style={{ marginTop: '1.5rem' }}>
              <div className="auction-winner-card">
                <span className="eyebrow">Auction Ended</span>
                <h3>Winner announced</h3>
                <p className="winner-title">{recentEndedAuction.title}</p>
                <div className="winner-details">
                  <div>
                    <span className="metric-label">Highest bidder</span>
                    <span className="metric-value">
                      {recentEndedAuction.winner_name ||
                        recentEndedAuction.highest_bidder_name ||
                        'No bids placed'}
                    </span>
                  </div>
                  <div>
                    <span className="metric-label">Winning bid</span>
                    <span className="metric-value">
                      {formatCurrency(
                        recentEndedAuction.winning_amount ?? recentEndedAuction.current_highest_bid
                      )}
                    </span>
                  </div>
                </div>
                <Link href={`/auction/${recentEndedAuction.id}`} className="btn btn-outline">
                  View results
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="landing-section landing-section-alt">
        <div className="container">
          <div className="landing-section-header">
            <div className="section-heading">
              <span className="eyebrow">Shopify Drops</span>
              <h2 className="landing-section-title">New drops to check out and buy.</h2>
              <p className="landing-section-subtitle">
                Limited-run collections curated for direct purchase while the auction house prepares the next lot.
              </p>
            </div>
            <a href={shopifyStoreUrl} className="btn btn-primary" {...shopifyLinkProps}>
              Check it out and buy
            </a>
          </div>

          <div className="landing-drops-grid">
            {shopifyDrops.map((drop) => (
              <div className={`drop-card drop-card-${drop.tone}`} key={drop.title}>
                <div className="drop-card-top">
                  <span className="pill pill-neutral">Shopify drop</span>
                  <span className="drop-card-price">{drop.price}</span>
                </div>
                <h3>{drop.title}</h3>
                <p>{drop.description}</p>
                <a href={shopifyStoreUrl} className="drop-card-link" {...shopifyLinkProps}>
                  Check it out and buy
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="container">
          <div className="landing-section-header">
            <div className="section-heading">
              <span className="eyebrow">Heritage Promise</span>
              <h2 className="landing-section-title">A premium auction house for collectors.</h2>
              <p className="landing-section-subtitle">
                Our process protects provenance, delivers concierge support, and keeps bidding transparent.
              </p>
            </div>
          </div>

          <div className="landing-heritage-grid">
            {heritagePillars.map((pillar) => (
              <div className="heritage-card" key={pillar.title}>
                <h4>{pillar.title}</h4>
                <p>{pillar.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  )
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return currencyFormatter.format(0)
  return currencyFormatter.format(Number(value))
}

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function formatDate(value: string) {
  const date = parseDate(value)
  if (!date) return 'TBD'
  return dateFormatter.format(date)
}

function formatTime(value: string) {
  const date = parseDate(value)
  if (!date) return 'TBD'
  return timeFormatter.format(date)
}
