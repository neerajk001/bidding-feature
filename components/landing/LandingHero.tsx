'use client'

import { useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ActiveAuctionResponse, AuctionSummary } from './types'

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

function formatDateTime(value: string | null | undefined) {
    const date = parseDate(value)
    if (!date) return 'TBD'
    return `${dateFormatter.format(date)} · ${timeFormatter.format(date)}`
}

interface LandingHeroProps {
    activeAuction: ActiveAuctionResponse | null
    activeDetail: AuctionSummary | null
    endedDetail?: AuctionSummary | null
}

type HeroVariant = 'live' | 'registration' | 'upcoming' | 'closed' | 'empty'

type HeroCta = {
    label: string
    href: string
}

export default function LandingHero({ activeAuction, activeDetail, endedDetail }: LandingHeroProps) {
    const heroRef = useRef<HTMLElement>(null)

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

    const isLive = activeAuction?.phase === 'live'
    const isRegistration = activeAuction?.phase === 'registration'
    const hasActive = Boolean(activeDetail)
    const hasEnded = !hasActive && Boolean(endedDetail)

    const heroVariant: HeroVariant = hasActive
        ? (isLive ? 'live' : isRegistration ? 'registration' : 'upcoming')
        : hasEnded
            ? 'closed'
            : 'empty'

    const detail = activeDetail ?? endedDetail ?? null

    const heroEyebrow = heroVariant === 'live'
        ? 'Live Auction'
        : heroVariant === 'registration'
            ? 'Registration Open'
            : heroVariant === 'upcoming'
                ? 'Upcoming Auction'
                : heroVariant === 'closed'
                    ? 'Auction Closed'
                    : 'Curating Next Lot'

    const heroTitle = heroVariant === 'live'
        ? `Live now: ${activeDetail?.title || 'Heritage Auction'}`
        : heroVariant === 'registration'
            ? `Registration open for ${activeDetail?.title || 'the next auction'}`
            : heroVariant === 'upcoming'
                ? `Next up: ${activeDetail?.title || 'Heritage Auction'}`
                : heroVariant === 'closed'
                    ? 'Auction closed. Winner announced.'
                    : 'The next heritage lot is in curation.'

    const heroSubtitle = heroVariant === 'live'
        ? `Real-time bidding is open until ${formatDateTime(activeDetail?.bidding_end_time)}.`
        : heroVariant === 'registration'
            ? `Reserve your paddle before ${formatDateTime(activeDetail?.registration_end_time)}.`
            : heroVariant === 'upcoming'
                ? `Preview the lot and set a reminder for ${formatDateTime(activeDetail?.bidding_start_time)}.`
                : heroVariant === 'closed'
                    ? `See the final bid and explore what's coming next.`
                    : 'Our curators are preparing the next release. Explore the calendar and curated drops.'

    const heroBadges = heroVariant === 'closed'
        ? ['Winner verified', 'Archive stored', 'Next drop soon']
        : heroVariant === 'empty'
            ? ['Curated weekly', 'Verified provenance', 'Concierge support']
            : ['Verified authenticity', 'Real-time bidding', 'Premium delivery']

    const primaryCta: HeroCta | null = heroVariant === 'empty'
        ? { label: 'Browse auction calendar', href: '#auction-calendar' }
        : heroVariant === 'closed'
            ? { label: 'View results', href: detail ? `/auction/${detail.id}` : '/auctions' }
            : detail
                ? {
                    label: heroVariant === 'registration'
                        ? 'Register to bid'
                        : heroVariant === 'live'
                            ? 'Enter live auction'
                            : 'Preview lot',
                    href: `/auction/${detail.id}`,
                }
                : { label: 'Browse auction calendar', href: '#auction-calendar' }

    const secondaryCta: HeroCta | null = heroVariant === 'empty'
        ? { label: 'Shop curated drops', href: '#shopify-drops' }
        : { label: 'Browse auction calendar', href: '#auction-calendar' }

    const cardStatusLabel = heroVariant === 'live'
        ? 'Live Auction'
        : heroVariant === 'registration'
            ? 'Registration Open'
            : heroVariant === 'upcoming'
                ? 'Upcoming Auction'
                : heroVariant === 'closed'
                    ? 'Auction Closed'
                    : 'No Live Auction'

    const cardStatusMeta = heroVariant === 'live'
        ? `Ends ${formatDateTime(activeDetail?.bidding_end_time)}`
        : heroVariant === 'registration'
            ? `Closes ${formatDateTime(activeDetail?.registration_end_time)}`
            : heroVariant === 'upcoming'
                ? `Starts ${formatDateTime(activeDetail?.bidding_start_time)}`
                : heroVariant === 'closed'
                    ? `Ended ${formatDateTime(endedDetail?.bidding_end_time)}`
                    : 'Next drop in preparation'

    const winnerName = endedDetail?.winner_name || endedDetail?.highest_bidder_name || 'No bids'
    const winningAmount = endedDetail?.winning_amount ?? endedDetail?.current_highest_bid
    const winningBidDisplay = winningAmount === null || winningAmount === undefined
        ? 'No bids'
        : formatCurrency(winningAmount)

    const cardTitle = heroVariant === 'empty'
        ? 'Next lot in curation'
        : detail?.title || 'Heritage Auction'

    const cardSummary = heroVariant === 'live'
        ? (activeDetail?.current_highest_bid
            ? `Current lead at ${formatCurrency(activeDetail.current_highest_bid)}.`
            : 'Bidding is open. Be the first to place a bid.')
        : heroVariant === 'registration'
            ? `Registration closes ${formatDateTime(activeDetail?.registration_end_time)}.`
            : heroVariant === 'upcoming'
                ? `Auction opens on ${formatDateTime(activeDetail?.bidding_start_time)}.`
                : heroVariant === 'closed'
                    ? (winnerName === 'No bids'
                        ? 'No bids were placed. See the full result.'
                        : `Winner ${winnerName} with ${winningBidDisplay}.`)
                    : 'Our curators are assembling a new collection of heirloom pieces.'

    const cardMetrics = heroVariant === 'live'
        ? [
            { label: 'Current bid', value: formatCurrency(activeDetail?.current_highest_bid) },
            { label: 'Active bids', value: `${activeDetail?.total_bids || 0}` },
            { label: 'Ends', value: formatDateTime(activeDetail?.bidding_end_time) },
        ]
        : heroVariant === 'registration'
            ? [
                { label: 'Registration ends', value: formatDateTime(activeDetail?.registration_end_time) },
                { label: 'Auction starts', value: formatDateTime(activeDetail?.bidding_start_time) },
                ...(activeDetail?.base_price ? [{ label: 'Base price', value: formatCurrency(activeDetail?.base_price) }] : []),
                { label: 'Bid increment', value: formatCurrency(activeDetail?.min_increment) },
            ]
            : heroVariant === 'upcoming'
                ? [
                    { label: 'Auction starts', value: formatDateTime(activeDetail?.bidding_start_time) },
                    { label: 'Registration closes', value: formatDateTime(activeDetail?.registration_end_time) },
                    ...(activeDetail?.base_price ? [{ label: 'Base price', value: formatCurrency(activeDetail?.base_price) }] : []),
                    { label: 'Bid increment', value: formatCurrency(activeDetail?.min_increment) },
                ]
                : heroVariant === 'closed'
                    ? [
                        { label: 'Winner', value: winnerName },
                        { label: 'Winning bid', value: winningBidDisplay },
                        { label: 'Total bids', value: `${endedDetail?.total_bids || 0}` },
                    ]
                    : []

    const emptySteps = [
        { label: 'Step 01', value: 'Browse the auction calendar' },
        { label: 'Step 02', value: 'Preview curated lots' },
        { label: 'Step 03', value: 'Join the next live bidding' },
    ]

    const renderCta = (cta: HeroCta | null, className: string) => {
        if (!cta) return null
        if (cta.href.startsWith('#')) {
            return (
                <a href={cta.href} className={className}>
                    {cta.label}
                </a>
            )
        }
        return (
            <Link href={cta.href} className={className}>
                {cta.label}
            </Link>
        )
    }

    const heroArtLabel = detail?.title || 'Indu Heritage'
    const heroArtBadge = heroVariant === 'closed'
        ? 'Archive Result'
        : heroVariant === 'empty'
            ? 'Next Drop'
            : 'Curated Lot'

    return (
        <section className="landing-hero redesigned" data-variant={heroVariant} ref={heroRef}>
            <div className="container landing-hero-inner">
                <div className="landing-hero-copy">
                    <span className="eyebrow">{heroEyebrow}</span>
                    <h1 className="landing-hero-title">{heroTitle}</h1>
                    <p className="landing-hero-subtitle">{heroSubtitle}</p>
                    <div className="landing-hero-actions">
                        {renderCta(primaryCta, 'btn btn-primary')}
                        {renderCta(secondaryCta, 'btn btn-outline')}
                    </div>
                    <div className="landing-hero-badges">
                        {heroBadges.map((badge) => (
                            <span className="landing-badge" key={badge}>{badge}</span>
                        ))}
                    </div>
                </div>

                <div className="landing-hero-card">
                    <div className="hero-auction hero-card-horizontal" data-variant={heroVariant}>
                        <div className="hero-auction-body">
                            <div className="hero-card-status">
                                <span className={`hero-status-pill ${heroVariant === 'empty' ? 'is-muted' : ''}`}>
                                    {cardStatusLabel}
                                </span>
                                {cardStatusMeta ? (
                                    <span className="hero-status-time">{cardStatusMeta}</span>
                                ) : null}
                            </div>

                            <h3 className="hero-card-title">{cardTitle}</h3>
                            <p className="hero-card-summary">{cardSummary}</p>

                            {heroVariant === 'empty' ? (
                                <div className="hero-card-list">
                                    {emptySteps.map((step) => (
                                        <div className="hero-card-list-item" key={step.label}>
                                            <span className="hero-card-list-label">{step.label}</span>
                                            <span className="hero-card-list-value">{step.value}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="hero-card-metrics">
                                    {cardMetrics.map((metric) => (
                                        <div key={metric.label}>
                                            <span className="metric-label">{metric.label}</span>
                                            <span className="metric-value">{metric.value}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="hero-card-actions">
                                {heroVariant === 'live' && activeDetail ? (
                                    <div className="hero-bid-row">
                                        <input
                                            type="text"
                                            disabled
                                            placeholder={`Next bid: ${formatCurrency(
                                                (activeDetail.current_highest_bid || 0) > 0 
                                                    ? (activeDetail.current_highest_bid || 0) + (activeDetail.min_increment || 0)
                                                    : (activeDetail.base_price || activeDetail.min_increment || 0)
                                            )}`}
                                            className="hero-bid-input"
                                        />
                                        <Link href={`/auction/${activeDetail.id}`} className="btn hero-bid-button">
                                            Bid now
                                        </Link>
                                    </div>
                                ) : (
                                    <>
                                        {renderCta(primaryCta, 'btn btn-primary')}
                                        {heroVariant !== 'empty' && (
                                            <Link href="/auctions" className="hero-card-link">
                                                View all auctions
                                            </Link>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="hero-auction-media">
                            {detail?.banner_image ? (
                                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                    <Image
                                        src={detail.banner_image}
                                        alt={detail.title}
                                        fill
                                        sizes="(max-width: 900px) 100vw, 50vw"
                                        style={{ objectFit: 'cover' }}
                                        priority
                                    />
                                    {heroVariant === 'closed' && (
                                        <span className="hero-media-badge">Sold</span>
                                    )}
                                </div>
                            ) : (
                                <div className="hero-card-art">
                                    <span className="hero-card-art-label">{heroArtLabel}</span>
                                    <span className="hero-card-art-badge">{heroArtBadge}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
