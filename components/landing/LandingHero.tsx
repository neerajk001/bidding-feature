'use client'

import { useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ActiveAuctionResponse, AuctionSummary } from './types'
import HeroMedia from './HeroMedia'

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

    const getStatusPillClass = (variant: HeroVariant) => {
        switch (variant) {
            case 'live': return 'bg-red-500/10 text-red-500 ring-1 ring-red-500/20'
            case 'registration': return 'bg-orange-500/10 text-orange-500 ring-1 ring-orange-500/20'
            case 'upcoming': return 'bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20'
            case 'closed': return 'bg-zinc-800 text-zinc-400'
            case 'empty': return 'bg-zinc-800/50 text-zinc-500'
            default: return 'bg-zinc-800 text-zinc-400'
        }
    }

    return (
        <section className="relative py-8 lg:py-12 overflow-hidden bg-gray-50" data-variant={heroVariant} ref={heroRef}>

            <div className="max-w-[2000px] mx-auto px-6 lg:px-8 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
                    <div className="flex flex-col gap-6 lg:gap-8">
                        <span className="text-orange-500 font-semibold tracking-widest uppercase text-sm">{heroEyebrow}</span>
                        <h1 className="text-5xl lg:text-7xl font-bold font-display tracking-tight text-black leading-[1.1]">{heroTitle}</h1>
                        <p className="text-lg text-gray-600 max-w-lg leading-relaxed">{heroSubtitle}</p>
                        <div className="flex flex-wrap gap-4 mt-2">
                            {renderCta(primaryCta, 'inline-flex items-center justify-center px-8 py-4 rounded-full font-semibold text-sm transition-all duration-200 bg-orange-500 text-white hover:bg-orange-600 shadow-lg hover:shadow-orange-500/25 hover:-translate-y-0.5')}
                            {renderCta(secondaryCta, 'inline-flex items-center justify-center px-8 py-4 rounded-full font-semibold text-sm transition-all duration-200 border border-black text-black hover:border-orange-500 hover:text-orange-500 hover:bg-orange-500/10')}
                        </div>
                        <div className="flex flex-wrap gap-3 items-center pt-4">
                            {heroBadges.map((badge) => (
                                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 border border-gray-300 text-gray-700" key={badge}>{badge}</span>
                            ))}
                        </div>
                    </div>

                    <div className="relative">
                        {/* Enhanced glow effect behind card */}
                        <div className="absolute -inset-6 bg-gradient-to-br from-orange-500/20 via-orange-600/10 to-pink-500/20 rounded-3xl blur-3xl opacity-40 animate-pulse" />

                        <div className="relative bg-white border-2 border-gray-200 rounded-3xl overflow-hidden shadow-2xl hover:shadow-orange-500/10 transition-all duration-500" data-variant={heroVariant}>
                            {/* Horizontal layout: content left, media right on desktop */}
                            <div className="flex flex-col lg:flex-row">
                                {/* Content Section - Wider on desktop */}
                                <div className="lg:w-[55%] p-6 lg:p-8 bg-gradient-to-br from-white to-gray-50/50">
                                    {/* Status Header */}
                                    <div className="flex items-center justify-between gap-4 mb-4">
                                        <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${getStatusPillClass(heroVariant)}`}>
                                            {heroVariant === 'live' && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                                            {cardStatusLabel}
                                        </span>
                                        {cardStatusMeta ? (
                                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-100 px-3 py-1.5 rounded-full">{cardStatusMeta}</span>
                                        ) : null}
                                    </div>

                                    {/* Title & Summary */}
                                    <h3 className="text-2xl lg:text-3xl font-bold font-display text-black mb-2 leading-tight bg-gradient-to-r from-black to-gray-700 bg-clip-text">{cardTitle}</h3>
                                    <p className="text-gray-600 mb-6 leading-relaxed text-sm lg:text-base">{cardSummary}</p>

                                    {/* Metrics or Steps - Single Row Layout */}
                                    {heroVariant === 'empty' ? (
                                        <div className="space-y-3 mb-6">
                                            {emptySteps.map((step, idx) => (
                                                <div
                                                    className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-pink-50 rounded-2xl border-2 border-orange-200 hover:border-orange-400 hover:shadow-md transition-all duration-300 group"
                                                    key={step.label}
                                                    style={{ animationDelay: `${idx * 100}ms` }}
                                                >
                                                    <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">{step.label}</span>
                                                    <span className="text-sm font-semibold text-black group-hover:text-orange-600 transition-colors">{step.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mb-6 pb-6 border-b-2 border-orange-100">
                                            <div className="flex justify-between gap-4">
                                                {cardMetrics.map((metric, idx) => (
                                                    <div
                                                        key={metric.label}
                                                        className="flex-1 text-center group hover:scale-105 transition-transform duration-300"
                                                        style={{ animationDelay: `${idx * 100}ms` }}
                                                    >
                                                        <div className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-2 group-hover:text-orange-700 transition-colors">{metric.label}</div>
                                                        <div className="text-lg lg:text-xl font-bold text-black group-hover:text-orange-600 transition-colors break-words">{metric.value}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* CTA Buttons */}
                                    <div className="mt-auto">
                                        {heroVariant === 'live' && activeDetail ? (
                                            <div className="flex flex-col gap-3">
                                                <input
                                                    type="text"
                                                    disabled
                                                    placeholder={`Next bid: ${formatCurrency(
                                                        (activeDetail.current_highest_bid || 0) > 0
                                                            ? (activeDetail.current_highest_bid || 0) + (activeDetail.min_increment || 0)
                                                            : (activeDetail.base_price || activeDetail.min_increment || 0)
                                                    )}`}
                                                    className="w-full bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-gray-300 rounded-2xl px-4 py-3 text-black text-sm font-semibold focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all placeholder:text-gray-500 shadow-inner"
                                                />
                                                <Link href={`/auction/${activeDetail.id}`} className="w-full px-6 py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold text-base hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg hover:shadow-orange-500/50 hover:-translate-y-1 text-center transform duration-300">
                                                    🔥 Bid now
                                                </Link>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-3">
                                                {renderCta(primaryCta, 'w-full inline-flex items-center justify-center px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-300 bg-gradient-to-r from-black to-gray-800 text-white hover:from-gray-800 hover:to-black shadow-xl hover:shadow-2xl hover:-translate-y-1 transform')}
                                                {heroVariant !== 'empty' && (
                                                    <Link href="/auctions" className="w-full inline-flex items-center justify-center px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-300 bg-white border-2 border-black text-black hover:bg-black hover:text-white hover:-translate-y-1 transform shadow-md hover:shadow-xl">
                                                        View all auctions →
                                                    </Link>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Media Section - Enhanced */}
                                <div className="relative lg:w-[45%] aspect-[16/9] lg:aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 border-t-2 lg:border-t-0 lg:border-l-2 border-gray-200 overflow-hidden group">
                                    {/* Subtle overlay gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent z-10 pointer-events-none" />
                                    <HeroMedia
                                        detail={detail}
                                        heroVariant={heroVariant}
                                        heroArtLabel={heroArtLabel}
                                        heroArtBadge={heroArtBadge}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
