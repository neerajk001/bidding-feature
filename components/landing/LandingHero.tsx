'use client'

import { useRef, useEffect, useState } from 'react'
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
    nextUpcomingAuction?: AuctionSummary | null
}

type HeroVariant = 'live' | 'registration' | 'upcoming' | 'closed' | 'empty'

type HeroCta = {
    label: string
    href: string
}

export default function LandingHero({ activeAuction, activeDetail, endedDetail, nextUpcomingAuction }: LandingHeroProps) {
    const heroRef = useRef<HTMLElement>(null)
    const [isRegistered, setIsRegistered] = useState<boolean | null>(null)

    // Check if user is registered for the active live auction
    useEffect(() => {
        const checkRegistration = async () => {
            // Only check if we have a live auction
            if (activeAuction?.phase !== 'live' || !activeDetail?.id) {
                // If not live, registration status doesn't matter for this specific logic
                // Set to true so we don't interfere with standard display
                setIsRegistered(true)
                return
            }

            const userId = localStorage.getItem('user_id')
            if (!userId) {
                // Guest user -> Not registered
                setIsRegistered(false)
                return
            }

            try {
                const res = await fetch(`/api/check-registration?user_id=${userId}&auction_id=${activeDetail.id}`)
                const data = await res.json()
                setIsRegistered(!!data.registered)
            } catch (error) {
                console.error('Failed to check registration:', error)
                setIsRegistered(false)
            }
        }

        checkRegistration()
    }, [activeAuction, activeDetail])

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

    // Determine effective state based on registration
    // If Live AND Not Registered -> Show Next Upcoming
    const showLive = isLive && (isRegistered === true || isRegistered === null) // Optimistically show live while checking? or wait?
    // User requested: "if someone didnt registered... replace with upcoming"
    // So if isRegistered is false, we force upcoming.

    // Better logic:
    // Base State
    let effectiveDetail = activeDetail
    let effectiveVariant: HeroVariant = 'empty'

    if (activeDetail) {
        if (isLive) {
            // If checking (null), show Live (or loading? lets show Live). 
            // If check finishes and is false, show Upcoming.
            if (isRegistered === false) {
                // Not registered. Fallback to next upcoming.
                if (nextUpcomingAuction) {
                    effectiveDetail = nextUpcomingAuction
                    effectiveVariant = 'upcoming'
                } else {
                    // No upcoming? Show empty or keep showing live (as locked)?
                    // "replace with upcoming" implies there is one. 
                    // If none, maybe show "Curating Next Lot".
                    effectiveDetail = null
                    effectiveVariant = 'empty'
                }
            } else {
                effectiveVariant = 'live'
            }
        } else if (isRegistration) {
            effectiveVariant = 'registration'
        } else {
            effectiveVariant = 'upcoming'
        }
    } else if (endedDetail) {
        effectiveDetail = endedDetail
        effectiveVariant = 'closed'
    } else {
        effectiveVariant = 'empty'
    }

    // Force upcoming if we replaced the live auction
    // The logic above handles it. But wait, `isRegistered` starts as null.
    // Ideally we want to avoid layout shift. 
    // If we defaults `isRegistered` to null, we show Live. Then it snaps to upcoming.
    // If we default to false, we show Upcoming. Then snaps to Live.
    // Since most users are guests, defaulting to false might be smoother for them?
    // But logged in users would see a flash of upcoming.
    // Let's stick to null (Live) and swap if needed. 

    // Re-calculating helpers based on effectiveDetail and effectiveVariant
    const detail = effectiveDetail

    const heroEyebrow = effectiveVariant === 'live'
        ? 'Live Auction'
        : effectiveVariant === 'registration'
            ? 'Registration Open'
            : effectiveVariant === 'upcoming'
                ? 'Upcoming Auction'
                : effectiveVariant === 'closed'
                    ? 'Auction Closed'
                    : 'Curating Next Lot'

    const heroTitle = effectiveVariant === 'live'
        ? `Live now: ${effectiveDetail?.title || 'Heritage Auction'}`
        : effectiveVariant === 'registration'
            ? `Registration open for ${effectiveDetail?.title || 'the next auction'}`
            : effectiveVariant === 'upcoming'
                ? `Next up: ${effectiveDetail?.title || 'Heritage Auction'}`
                : effectiveVariant === 'closed'
                    ? 'Auction closed. Winner announced.'
                    : 'The next heritage lot is in curation.'

    const heroSubtitle = effectiveVariant === 'live'
        ? `Real-time bidding is open until ${formatDateTime(effectiveDetail?.bidding_end_time)}.`
        : effectiveVariant === 'registration'
            ? `Reserve your paddle before ${formatDateTime(effectiveDetail?.registration_end_time)}.`
            : effectiveVariant === 'upcoming'
                ? `Preview the lot and set a reminder for ${formatDateTime(effectiveDetail?.bidding_start_time)}.`
                : effectiveVariant === 'closed'
                    ? `See the final bid and explore what's coming next.`
                    : 'Our curators are preparing the next release. Explore the calendar and curated drops.'

    const heroBadges = effectiveVariant === 'closed'
        ? ['Winner verified', 'Archive stored', 'Next drop soon']
        : effectiveVariant === 'empty'
            ? ['Curated weekly', 'Verified provenance', 'Concierge support']
            : ['Verified authenticity', 'Real-time bidding', 'Premium delivery']

    const primaryCta: HeroCta | null = effectiveVariant === 'empty'
        ? { label: 'Browse auction calendar', href: '#auction-calendar' }
        : effectiveVariant === 'closed'
            ? { label: 'View results', href: detail ? `/auction/${detail.id}` : '/auctions' }
            : detail
                ? {
                    label: effectiveVariant === 'registration'
                        ? 'Register to bid'
                        : effectiveVariant === 'live'
                            ? 'Enter live auction'
                            : 'Preview lot',
                    href: `/auction/${detail.id}`,
                }
                : { label: 'Browse auction calendar', href: '#auction-calendar' }

    const secondaryCta: HeroCta | null = effectiveVariant === 'empty'
        ? { label: 'Shop curated drops', href: '#shopify-drops' }
        : { label: 'Browse auction calendar', href: '#auction-calendar' }

    const cardStatusLabel = effectiveVariant === 'live'
        ? 'Live Auction'
        : effectiveVariant === 'registration'
            ? 'Registration Open'
            : effectiveVariant === 'upcoming'
                ? 'Upcoming Auction'
                : effectiveVariant === 'closed'
                    ? 'Auction Closed'
                    : 'No Live Auction'

    const cardStatusMeta = effectiveVariant === 'live'
        ? `Ends ${formatDateTime(effectiveDetail?.bidding_end_time)}`
        : effectiveVariant === 'registration'
            ? `Closes ${formatDateTime(effectiveDetail?.registration_end_time)}`
            : effectiveVariant === 'upcoming'
                ? `Starts ${formatDateTime(effectiveDetail?.bidding_start_time)}`
                : effectiveVariant === 'closed'
                    ? `Ended ${formatDateTime(endedDetail?.bidding_end_time)}`
                    : 'Next drop in preparation'

    const winnerName = endedDetail?.winner_name || endedDetail?.highest_bidder_name || 'No bids'
    // Logic for winning amount display if we are showing closed variant
    const winningAmount = endedDetail?.winning_amount ?? endedDetail?.current_highest_bid
    const winningBidDisplay = winningAmount === null || winningAmount === undefined
        ? 'No bids'
        : formatCurrency(winningAmount)

    const cardTitle = effectiveVariant === 'empty'
        ? 'Next lot in curation'
        : detail?.title || 'Heritage Auction'

    const cardSummary = effectiveVariant === 'live'
        ? (effectiveDetail?.current_highest_bid
            ? `Current lead at ${formatCurrency(effectiveDetail.current_highest_bid)}.`
            : 'Bidding is open. Be the first to place a bid.')
        : effectiveVariant === 'registration'
            ? `Registration closes ${formatDateTime(effectiveDetail?.registration_end_time)}.`
            : effectiveVariant === 'upcoming'
                ? `Auction opens on ${formatDateTime(effectiveDetail?.bidding_start_time)}.`
                : effectiveVariant === 'closed'
                    ? (winnerName === 'No bids'
                        ? 'No bids were placed. See the full result.'
                        : `Winner ${winnerName} with ${winningBidDisplay}.`)
                    : 'Our curators are assembling a new collection of heirloom pieces.'

    const cardMetrics = effectiveVariant === 'live'
        ? [
            { label: 'Current bid', value: formatCurrency(effectiveDetail?.current_highest_bid) },
            { label: 'Active bids', value: `${effectiveDetail?.total_bids || 0}` },
            { label: 'Ends', value: formatDateTime(effectiveDetail?.bidding_end_time) },
        ]
        : effectiveVariant === 'registration'
            ? [
                { label: 'Registration ends', value: formatDateTime(effectiveDetail?.registration_end_time) },
                { label: 'Auction starts', value: formatDateTime(effectiveDetail?.bidding_start_time) },
                ...(effectiveDetail?.base_price ? [{ label: 'Base price', value: formatCurrency(effectiveDetail?.base_price) }] : []),
                { label: 'Bid increment', value: formatCurrency(effectiveDetail?.min_increment) },
            ]
            : effectiveVariant === 'upcoming'
                ? [
                    { label: 'Auction starts', value: formatDateTime(effectiveDetail?.bidding_start_time) },
                    { label: 'Registration closes', value: formatDateTime(effectiveDetail?.registration_end_time) },
                    ...(effectiveDetail?.base_price ? [{ label: 'Base price', value: formatCurrency(effectiveDetail?.base_price) }] : []),
                    { label: 'Bid increment', value: formatCurrency(effectiveDetail?.min_increment) },
                ]
                : effectiveVariant === 'closed'
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
    const heroArtBadge = effectiveVariant === 'closed'
        ? 'Archive Result'
        : effectiveVariant === 'empty'
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
        <section className="relative py-8 lg:py-12 overflow-hidden bg-gray-50" data-variant={effectiveVariant} ref={heroRef}>

            <div className="max-w-[2200px] mx-auto px-6 lg:px-8 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
                    <div className="flex flex-col gap-6 lg:gap-8">
                        <span className="text-orange-500 font-semibold tracking-widest uppercase text-sm">{heroEyebrow}</span>
                        <h1 className="text-4xl lg:text-7xl font-bold font-display tracking-tight text-black leading-[1.1]">{heroTitle}</h1>
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

                        <div className="relative bg-white border-2 border-gray-200 rounded-3xl overflow-hidden shadow-2xl hover:shadow-orange-500/10 transition-all duration-500" data-variant={effectiveVariant}>
                            {/* Horizontal layout: content left, media right on desktop */}
                            <div className="flex flex-col lg:flex-row">
                                {/* Content Section - Wider on desktop */}
                                <div className="lg:w-[55%] p-5 lg:p-6 bg-gradient-to-br from-white to-gray-50/50">
                                    {/* Status Header */}
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${getStatusPillClass(effectiveVariant)}`}>
                                            {effectiveVariant === 'live' && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                                            {cardStatusLabel}
                                        </span>
                                        {cardStatusMeta ? (
                                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-100 px-2.5 py-1 rounded-full">{cardStatusMeta}</span>
                                        ) : null}
                                    </div>

                                    {/* Title & Summary */}
                                    <h3 className="text-xl lg:text-2xl font-bold font-display text-black mb-2 leading-tight bg-gradient-to-r from-black to-gray-700 bg-clip-text">{cardTitle}</h3>
                                    <p className="text-gray-600 mb-4 leading-relaxed text-xs lg:text-sm">{cardSummary}</p>

                                    {/* Metrics or Steps - Single Row Layout */}
                                    {effectiveVariant === 'empty' ? (
                                        <div className="space-y-2.5 mb-4">
                                            {emptySteps.map((step, idx) => (
                                                <div
                                                    className="flex items-center justify-between p-3 bg-gradient-to-r from-orange-50 to-pink-50 rounded-2xl border-2 border-orange-200 hover:border-orange-400 hover:shadow-md transition-all duration-300 group"
                                                    key={step.label}
                                                    style={{ animationDelay: `${idx * 100}ms` }}
                                                >
                                                    <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">{step.label}</span>
                                                    <span className="text-sm font-semibold text-black group-hover:text-orange-600 transition-colors">{step.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mb-4 pb-4 border-b-2 border-orange-100">
                                            <div className="flex justify-between gap-3">
                                                {cardMetrics.map((metric, idx) => (
                                                    <div
                                                        key={metric.label}
                                                        className="flex-1 text-center group hover:scale-105 transition-transform duration-300"
                                                        style={{ animationDelay: `${idx * 100}ms` }}
                                                    >
                                                        <div className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1.5 group-hover:text-orange-700 transition-colors">{metric.label}</div>
                                                        <div className="text-sm lg:text-base font-bold text-black group-hover:text-orange-600 transition-colors break-words leading-tight">{metric.value}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* CTA Buttons */}
                                    <div className="mt-auto">
                                        {effectiveVariant === 'live' && effectiveDetail ? (
                                            <div className="flex flex-col gap-3">
                                                <input
                                                    type="text"
                                                    disabled
                                                    placeholder={`Next bid: ${formatCurrency(
                                                        (effectiveDetail.current_highest_bid || 0) > 0
                                                            ? (effectiveDetail.current_highest_bid || 0) + (effectiveDetail.min_increment || 0)
                                                            : (effectiveDetail.base_price || effectiveDetail.min_increment || 0)
                                                    )}`}
                                                    className="w-full bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-gray-300 rounded-2xl px-4 py-3 text-black text-sm font-semibold focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all placeholder:text-gray-500 shadow-inner"
                                                />
                                                <Link href={`/auction/${effectiveDetail.id}`} className="w-full px-6 py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold text-base hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg hover:shadow-orange-500/50 hover:-translate-y-1 text-center transform duration-300">
                                                    🔥 Bid now
                                                </Link>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-3">
                                                {renderCta(primaryCta, 'w-full inline-flex items-center justify-center px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-300 bg-gradient-to-r from-black to-gray-800 text-white hover:from-gray-800 hover:to-black shadow-xl hover:shadow-2xl hover:-translate-y-1 transform')}
                                                {effectiveVariant !== 'empty' && (
                                                    <Link href="/auctions" className="w-full inline-flex items-center justify-center px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-300 bg-white border-2 border-black text-black hover:bg-black hover:text-white hover:-translate-y-1 transform shadow-md hover:shadow-xl">
                                                        View all auctions →
                                                    </Link>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Media Section - Enhanced */}
                                <div className="relative lg:w-[45%] aspect-[3/4] lg:aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 border-t-2 lg:border-t-0 lg:border-l-2 border-gray-200 overflow-hidden group">
                                    {/* Subtle overlay gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent z-10 pointer-events-none" />
                                    <HeroMedia
                                        detail={detail}
                                        heroVariant={effectiveVariant}
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
