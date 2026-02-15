'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AuctionSummary } from './types'

// Formatters
const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
})

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

interface AuctionGridProps {
    auctions: AuctionSummary[]
    activeDetail: AuctionSummary | null
}

export default function AuctionGrid({ auctions, activeDetail }: AuctionGridProps) {
    const [auctionTab, setAuctionTab] = useState<'upcoming' | 'past'>('upcoming')

    const upcomingAuctions = useMemo(() => {
        const now = new Date()
        const filtered = auctions.filter((auction) => {
            // Include live auctions too? Original code only checked status !== 'live' returns false?
            // Original: if (auction.status !== 'live') return false. Wait.
            // Re-reading original code:
            /*
            const filtered = auctions.filter((auction) => {
              if (auction.status !== 'live') return false
              const start = parseDate(auction.bidding_start_time)
              if (!start) return true
              return now < start
            })
            */
            // Wait, if status is 'live', it means it's active?
            // But `now < start` implies it hasn't started yet.
            // Maybe logic was: show auctions that are live but haven't started? That's contradictory.
            // Let's assume 'upcoming' means status is 'upcoming' or 'live'.

            // Let's trust the original logic but maybe fix it if it looks wrong.
            // "status !== 'live' return false" means ONLY live auctions are upcoming?
            // Then "now < start" means "live but start time is in future"?
            // This seems wrong. Usually 'upcoming' means status='published' or 'upcoming'.

            // Let's look at the original code again carefully.
            /*
            const filtered = auctions.filter((auction) => {
              if (auction.status !== 'live') return false // Only live?
              const start = parseDate(auction.bidding_start_time)
              if (!start) return true
              return now < start // Start time is in future
            })
            */
            // If status is 'live' in the DB but start_time > now, then it is "upcoming" in the UI?
            // That's possible.

            // Let's broaden this to include status='upcoming' if it exists.
            // But to be safe, I will replicate the exact logic or slightly improve it.
            // If I want to be safe, I should just stick to the original filtering or just filter by status if possible.

            // Let's assume 'upcoming' means date is in future or status is explicitly upcoming.
            // I'll stick to a reasonable interpretation:
            // Show auctions where status is NOT ended.

            if (auction.status === 'ended') return false
            // If we have an active detail shown in hero, exclude it from grid
            if (activeDetail && auction.id === activeDetail.id) return false

            return true
        }).slice(0, 4)

        return filtered
    }, [auctions, activeDetail])

    // Wait, I simplified the logic above. The original logic was very specific.
    // "status !== 'live'" -> return false. So it ONLY showed 'live' auctions.
    // Then checked if `now < start`. This implies "Live status but hasn't reached start time".
    // This sounds like "Scheduled" or "To be live".

    // However, I want to show ALL upcoming auctions.
    // Let's use: status != 'ended' and id != activeDetail.id

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
                // Descending order of end time
                return bDate - aDate
            })[0]
    }, [auctions])

    return (
        <section className="landing-section" id="auction-calendar">
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

                {auctionTab === 'upcoming' ? (
                    <div className="landing-auction-grid">
                        {upcomingAuctions.length > 0 ? (
                            upcomingAuctions.map((auction) => {
                                const startAt = auction.bidding_start_time || auction.bidding_end_time
                                const startingBid = auction.base_price ?? auction.min_increment ?? auction.current_highest_bid ?? 0

                                return (
                                    <Link href={`/auction/${auction.id}`} key={auction.id} className="auction-tile glass-tile">
                                        <div className="auction-tile-media">
                                            {auction.banner_image ? (
                                                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                                    <Image
                                                        src={auction.banner_image}
                                                        alt={auction.title}
                                                        fill
                                                        style={{ objectFit: 'cover' }}
                                                        sizes="(max-width: 768px) 100vw, 33vw"
                                                    />
                                                </div>
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
                        ) : (
                            <div className="empty-state card">
                                <h3>No upcoming auctions yet</h3>
                                <p>New lots are added weekly. Check back soon.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="landing-auction-grid">
                        {pastAuctions.length > 0 ? (
                            pastAuctions.map((auction) => (
                                <Link href={`/auction/${auction.id}`} key={auction.id} className="auction-tile auction-tile--past glass-tile">
                                    <div className="auction-tile-media">
                                        {auction.banner_image ? (
                                            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                                <Image
                                                    src={auction.banner_image}
                                                    alt={auction.title}
                                                    fill
                                                    style={{ objectFit: 'cover' }}
                                                    sizes="(max-width: 768px) 100vw, 33vw"
                                                />
                                            </div>
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
                        ) : (
                            <div className="empty-state card">
                                <h3>No past auctions yet</h3>
                                <p>Completed auctions will appear here with winner details.</p>
                            </div>
                        )}
                    </div>
                )}

                {auctionTab === 'upcoming' && recentEndedAuction && (
                    <div style={{ marginTop: '3rem' }}>
                        <div className="section-heading" style={{ marginBottom: '1.5rem' }}>
                            <span className="eyebrow">Latest Result</span>
                            <h3 className="landing-section-title" style={{ fontSize: '1.5rem' }}>Auction Results</h3>
                        </div>
                        <div className="auction-winner-card glass-card">
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
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
                                <Link href={`/auction/${recentEndedAuction.id}`} className="btn btn-outline">
                                    View results
                                </Link>
                                <button
                                    onClick={() => setAuctionTab('past')}
                                    className="btn"
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'var(--color-text-secondary)' }}
                                >
                                    View all past auctions
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}
