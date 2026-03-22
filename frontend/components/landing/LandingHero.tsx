'use client'

import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { ActiveAuctionResponse, AuctionSummary } from './types'
import HeroMedia from './HeroMedia'
import TermsAndConditionsModal from './TermsAndConditionsModal'

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

export default function LandingHero({ activeAuction, activeDetail, endedDetail, nextUpcomingAuction: _nextUpcomingAuction }: LandingHeroProps) {
    const isLive = activeAuction?.phase === 'live'
    const isRegistration = activeAuction?.phase === 'registration'

    // Determine effective state
    // We want to show the Live auction to EVERYONE (guests included).
    // Previously we hid it for non-registered users, which caused the "blank card" issue.

    let effectiveDetail = activeDetail
    let effectiveVariant: HeroVariant = 'empty'

    if (activeDetail) {
        if (isLive) {
            effectiveVariant = 'live'
        } else if (isRegistration) {
            effectiveVariant = 'registration'
        } else {
            effectiveVariant = 'upcoming'
        }
    } else if (_nextUpcomingAuction) {
        effectiveDetail = _nextUpcomingAuction
        effectiveVariant = 'upcoming'
    } else if (endedDetail) {
        effectiveDetail = endedDetail
        effectiveVariant = 'closed'
    } else {
        effectiveVariant = 'empty'
    }

    const detail = effectiveDetail

    // Force upcoming if we replaced the live auction
    // The logic above handles it. But wait, `isRegistered` starts as null.
    // Ideally we want to avoid layout shift. 
    // If we defaults `isRegistered` to null, we show Live. Then it snaps to upcoming.
    // If we default to false, we show Upcoming. Then snaps to Live.
    // Since most users are guests, defaulting to false might be smoother for them?
    // But logged in users would see a flash of upcoming.
    // Let's stick to null (Live) and swap if needed. 

    // State for realtime bid updates
    const [liveBidData, setLiveBidData] = useState<{ amount: number, total: number } | null>(null)

    // Realtime Subscription
    useEffect(() => {
        // FREE TIER PROTECTION: Only connect if auction is LIVE
        if (activeAuction?.phase !== 'live' || !activeDetail?.id) return

        const channel = supabase
            .channel(`landing-hero-${activeDetail.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_id=eq.${activeDetail.id}` },
                (payload: { new: Record<string, unknown> }) => {
                    const newBid = payload.new
                    setLiveBidData(prev => {
                        const newAmount = Number(newBid.amount)
                        // Only update if higher
                        if (prev && newAmount <= prev.amount) return prev
                        return {
                            amount: newAmount,
                            total: (prev?.total || activeDetail.total_bids || 0) + 1
                        }
                    })
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscription keyed by phase and id
    }, [activeAuction?.phase, activeDetail?.id])

    // Use live data if available, otherwise fall back to prop data
    const displayPrice = liveBidData?.amount ?? activeDetail?.current_highest_bid ?? 0
    const displayTotalBids = liveBidData?.total ?? activeDetail?.total_bids ?? 0

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

    const heroEyebrow = effectiveVariant === 'live'
        ? 'Live Auction'
        : effectiveVariant === 'registration'
            ? 'Registration Open'
            : effectiveVariant === 'upcoming'
                ? 'Upcoming Auction'
                : effectiveVariant === 'closed'
                    ? 'Auction Closed'
                    : 'Exclusive Heritage Auction'

    const heroTitle = effectiveVariant === 'live'
        ? `Live now: ${effectiveDetail?.title || 'Heritage Auction'}`
        : effectiveVariant === 'registration'
            ? `Registration open for ${effectiveDetail?.title || 'the next auction'}`
            : effectiveVariant === 'upcoming'
                ? `Next up: ${effectiveDetail?.title || 'Heritage Auction'}`
                : effectiveVariant === 'closed'
                    ? 'Auction closed. Winner announced.'
                    : 'A Limited Collection, Now Open for Bidding.'

    const heroSubtitle = effectiveVariant === 'live'
        ? `Real-time bidding is open until ${formatDateTime(effectiveDetail?.bidding_end_time)}.`
        : effectiveVariant === 'registration'
            ? `Reserve your paddle before ${formatDateTime(effectiveDetail?.registration_end_time)}.`
            : effectiveVariant === 'upcoming'
                ? `Preview the lot and set a reminder for ${formatDateTime(effectiveDetail?.bidding_start_time)}.`
                : effectiveVariant === 'closed'
                    ? `See the final bid and explore what's coming next.`
                    : 'Secure your favourite before the bidding window closes. Explore upcoming auctions.'

    const heroBadges = effectiveVariant === 'closed'
        ? ['Winner verified', 'Archive stored', 'Next drop soon']
        : effectiveVariant === 'empty'
            ? []
            : ['Verified authenticity', 'Real-time bidding', 'Premium delivery']

    const primaryCta: HeroCta | null = effectiveVariant === 'empty'
        ? { label: 'View Upcoming Auctions', href: '#auction-calendar' }
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
                : { label: 'View Upcoming Auctions', href: '#auction-calendar' }

    const secondaryCta: HeroCta | null = effectiveVariant === 'empty'
        ? null
        : { label: 'View Upcoming Auctions', href: '#auction-calendar' }

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

    const winnersBySize = (endedDetail?.winners_by_size ?? []).filter((w) => w && w.winning_amount !== null && w.winning_amount !== undefined)
    const hasWinnersBySize = winnersBySize.length > 0
    const winnersSummary = hasWinnersBySize
        ? `Bidding has concluded across all sizes. See the winning bids below.`
        : ''

    const cardTitle = effectiveVariant === 'empty'
        ? 'Next lot in curation'
        : detail?.title || 'Heritage Auction'

    const cardSummary = effectiveVariant === 'live'
        ? (effectiveDetail?.highest_bids_by_size && effectiveDetail.highest_bids_by_size.length > 0
            ? `Size-wise bidding: ${effectiveDetail.highest_bids_by_size.map(b => `${b.size}: ${formatCurrency(b.amount)}`).join(', ')}`
            : effectiveDetail?.current_highest_bid
                ? `Current lead at ${formatCurrency(displayPrice)}.`
                : 'Bidding is open. Be the first to place a bid.')
        : effectiveVariant === 'registration'
            ? `Registration closes ${formatDateTime(effectiveDetail?.registration_end_time)}.`
            : effectiveVariant === 'upcoming'
                ? `Auction opens on ${formatDateTime(effectiveDetail?.bidding_start_time)}.`
                : effectiveVariant === 'closed'
                    ? (hasWinnersBySize
                        ? winnersSummary
                        : winnerName === 'No bids'
                            ? 'No bids were placed. See the full result.'
                            : `Winner ${winnerName} with ${winningBidDisplay}.`)
                    : 'Our curators are assembling a new collection of heirloom pieces.'

    const cardMetrics = effectiveVariant === 'live'
        ? (effectiveDetail?.highest_bids_by_size && effectiveDetail.highest_bids_by_size.length > 0
            ? effectiveDetail.highest_bids_by_size.slice(0, 3).map(bid => ({
                label: `Size ${bid.size}`,
                value: `${formatCurrency(bid.amount)} (${bid.bid_count} ${bid.bid_count === 1 ? 'bid' : 'bids'})`
            }))
            : [
                { label: 'Current bid', value: formatCurrency(displayPrice) },
                { label: 'Active bids', value: `${displayTotalBids}` },
                { label: 'Ends', value: formatDateTime(effectiveDetail?.bidding_end_time) },
            ])
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
                    ? (hasWinnersBySize
                        ? (() => {
                            if (winnersBySize.length > 3) {
                                // If 4 or 5 sizes exist, truncate into a single aggregate box to avoid UI breaking
                                const metrics = [
                                    {
                                        label: 'Winners Found',
                                        value: `${winnersBySize.length} unique sizes claimed`
                                    },
                                    {
                                        label: 'Total Value',
                                        value: formatCurrency(winnersBySize.reduce((acc, curr) => acc + (curr.winning_amount || 0), 0))
                                    },
                                    {
                                        label: 'Total Bids',
                                        value: `${endedDetail?.total_bids || 0}`
                                    }
                                ]
                                return metrics
                            }
                            // Original logic for 1, 2, or 3 sizes
                            const metrics = winnersBySize.slice(0, 3).map(w => ({
                                label: w.size ? `Size ${w.size}` : 'Winner',
                                value: `${w.winner_name || 'Winner'} \u2022 ${formatCurrency(w.winning_amount)}`
                            }))
                            if (metrics.length < 3) {
                                metrics.push({ label: 'Total bids', value: `${endedDetail?.total_bids || 0}` })
                            }
                            return metrics
                        })()
                        : [
                            { label: 'Winner', value: winnerName },
                            { label: 'Winning bid', value: winningBidDisplay },
                            { label: 'Total bids', value: `${endedDetail?.total_bids || 0}` },
                        ])
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
            case 'live': return 'bg-red-900/10 text-red-800 border-red-900/20'
            case 'registration': return 'bg-secondary/10 text-secondary border-secondary/20'
            case 'upcoming': return 'bg-primary/10 text-primary border-primary/20'
            case 'closed': return 'bg-zinc-800 text-zinc-300 border-zinc-700'
            case 'empty': return 'bg-zinc-800/50 text-zinc-500 border-zinc-700'
            default: return 'bg-zinc-800 text-zinc-400'
        }
    }

    return (
        <section className="relative pb-4 lg:pb-12 overflow-hidden bg-cream" data-variant={effectiveVariant} ref={heroRef}>

            <div className="max-w-[2200px] mx-auto px-4 lg:px-8 relative z-10">
                {/* Mobile-first: card first (order-1), then headline (order-2). Desktop: side-by-side. */}
                <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-24 items-center ${effectiveVariant === 'empty' ? 'lg:place-items-center text-center' : ''}`}>
                    {/* Headline block — on mobile appears below the card */}
                    <div className={`flex flex-col gap-4 lg:gap-10 relative order-2 lg:order-1 ${effectiveVariant === 'empty' ? 'items-center mx-auto max-w-2xl' : ''}`}>
                        {/* Decorative Background for aesthetics */}
                        <div className="absolute -left-20 -top-20 w-96 h-96 bg-secondary/5 rounded-full blur-3xl -z-10 pointer-events-none" />

                        <div className="relative w-full">
                            <span className={`text-secondary font-bold tracking-[0.2em] uppercase text-xs font-display flex items-center gap-3 mb-3 lg:mb-4 ${effectiveVariant === 'empty' ? 'justify-center' : ''}`}>
                                <span className="w-12 h-[1px] bg-secondary hidden lg:block"></span>
                                {heroEyebrow}
                            </span>
                            <h1 className="text-2xl sm:text-3xl lg:text-7xl xl:text-8xl font-medium font-display tracking-tight text-text leading-[1.05]">
                                {heroTitle}
                            </h1>
                        </div>

                        <p className="text-base lg:text-xl text-text/80 max-w-lg leading-relaxed font-body font-light">
                            {heroSubtitle}
                        </p>

                        <div className={`flex flex-wrap gap-4 mt-2 ${effectiveVariant === 'empty' ? 'justify-center' : ''}`}>
                            {renderCta(primaryCta, 'inline-flex items-center justify-center px-8 py-4 rounded-xl font-bold text-sm transition-all duration-300 bg-primary text-cream hover:bg-primary/90 border border-primary shadow-[0_4px_14px_0_rgba(128,0,0,0.39)] hover:shadow-[0_6px_20px_rgba(128,0,0,0.23)] hover:-translate-y-0.5 tracking-wider font-display')}
                            {renderCta(secondaryCta, 'inline-flex items-center justify-center px-8 py-4 rounded-xl font-bold text-sm transition-all duration-300 bg-transparent border border-secondary/30 text-text/80 hover:border-secondary hover:text-secondary hover:bg-secondary/5 tracking-wider font-display')}
                        </div>

                        {heroBadges.length > 0 ? (
                            <div className="flex flex-wrap gap-x-8 gap-y-3 items-center pt-6 border-t border-secondary/10 w-full max-w-lg">
                                {heroBadges.map((badge) => (
                                    <span className="flex items-center gap-2 text-sm font-medium text-text/70 font-display tracking-wide" key={badge}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                                        {badge}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    {/* Auction card — on mobile first (order-1), on desktop right column */}
                    <div className="relative order-1 lg:order-2">
                        {/* Enhanced glow effect behind card */}
                        <div className="absolute -inset-6 bg-gradient-to-br from-primary/10 via-secondary/10 to-primary/5 rounded-3xl blur-3xl opacity-60 animate-pulse" />

                        <div className="relative bg-white border border-secondary/20 rounded-t-[2.5rem] rounded-b-[2rem] overflow-hidden shadow-2xl hover:shadow-secondary/10 transition-all duration-500" data-variant={effectiveVariant}>
                            {/* Horizontal layout: content left, media right on desktop */}
                            <div className="flex flex-col lg:flex-row">
                                {/* Content Section - Wider on desktop */}
                                <div className="lg:w-[55%] p-4 lg:p-8 bg-gradient-to-br from-white via-cream to-white">
                                    {/* Status Header */}
                                    <div className="flex items-center justify-between gap-3 mb-4">
                                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm border ${getStatusPillClass(effectiveVariant)}`}>
                                            {effectiveVariant === 'live' && <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />}
                                            {cardStatusLabel}
                                        </span>
                                        {cardStatusMeta ? (
                                            <span className="text-xs font-semibold text-text/60 uppercase tracking-wide bg-cream border border-secondary/10 px-2.5 py-1 rounded-full">{cardStatusMeta}</span>
                                        ) : null}
                                    </div>

                                    {/* Title & Summary */}
                                    <div className="flex flex-wrap items-center gap-3 mb-3">
                                        <h3 className="text-2xl lg:text-3xl font-bold font-display text-[#2D2420] leading-tight">{cardTitle}</h3>
                                        {effectiveDetail?.registration_count ? (
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50/80 border border-blue-100 backdrop-blur-sm">
                                                <span className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                                </span>
                                                <span className="text-xs font-semibold text-blue-700 font-sans tracking-wide">
                                                    {effectiveDetail.registration_count} registered
                                                </span>
                                            </div>
                                        ) : null}
                                    </div>
                                    <p className="text-[#6B5E53] mb-6 leading-relaxed text-sm font-body">{cardSummary}</p>

                                    {/* Metrics or Steps */}
                                    {effectiveVariant === 'empty' ? (
                                        <div className="space-y-2.5 mb-6">
                                            {emptySteps.map((step) => (
                                                <div
                                                    className="flex items-center gap-4 p-3 bg-white rounded-xl border border-secondary/10 hover:border-primary/20 hover:shadow-sm transition-all duration-300 group"
                                                    key={step.label}
                                                >
                                                    <span className="shrink-0 inline-block min-w-[56px] text-center text-[10px] font-extrabold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200/60 rounded-md px-2 py-1">{step.label}</span>
                                                    <span className="text-sm font-semibold text-text/80 group-hover:text-primary transition-colors">{step.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mb-6 pb-6 border-b border-secondary/10">
                                            <div className="flex justify-between gap-2">
                                                {cardMetrics.map((metric, idx) => (
                                                    <div
                                                        key={metric.label}
                                                        className="flex-1 text-center group"
                                                        style={{ animationDelay: `${idx * 100}ms` }}
                                                    >
                                                        <div className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2 group-hover:text-primary transition-colors">{metric.label}</div>
                                                        <div className="text-sm lg:text-base font-bold text-text group-hover:text-primary transition-colors break-words leading-tight font-display">{metric.value}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* CTA Buttons */}
                                    <div className="mt-auto">
                                        {effectiveVariant === 'live' && effectiveDetail ? (
                                            <div className="flex flex-col gap-3">
                                                <div className="relative">
                                                    <span className="absolute inset-y-0 left-4 flex items-center text-text/40 font-display italic">Bid</span>
                                                    <input
                                                        type="text"
                                                        disabled
                                                        placeholder={`Next bid: ${formatCurrency(
                                                            (displayPrice > 0 ? displayPrice : (effectiveDetail.base_price || 0)) + (effectiveDetail.min_increment || 50)
                                                        )}`}
                                                        className="w-full bg-white border border-secondary/20 rounded-xl pl-12 pr-4 py-3 text-text text-sm font-semibold font-body focus:ring-1 focus:ring-secondary focus:border-secondary outline-none transition-all placeholder:text-text/40 shadow-sm"
                                                    />
                                                </div>
                                                <Link href={`/auction/${effectiveDetail.id}`} className="w-full px-6 py-3 rounded-xl bg-primary text-cream font-bold text-base hover:bg-primary/90 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 text-center transform duration-300 font-display tracking-wide border border-transparent hover:border-secondary">
                                                    Place Bid via App
                                                </Link>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-3">
                                                {renderCta(primaryCta, 'w-full inline-flex items-center justify-center px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 bg-[#3D2E1F] text-cream hover:bg-primary shadow-lg hover:shadow-xl hover:-translate-y-0.5 transform tracking-wide')}
                                                {effectiveVariant !== 'empty' && (
                                                    <Link href="/auctions" className="w-full inline-flex items-center justify-center px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 bg-transparent border border-text/20 text-text hover:border-primary hover:text-primary hover:bg-primary/5 transform tracking-wide">
                                                        View all auctions →
                                                    </Link>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <TermsAndConditionsModal
                                        showAgreementText={false}
                                        wrapperClassName="mt-3 flex items-center justify-center"
                                        triggerClassName="inline-flex items-center text-blue-600 underline underline-offset-2 hover:text-blue-700 text-xs font-medium leading-none"
                                    />
                                </div>

                                {/* Media Section - full height of column so image/reel fill the space */}
                                <div className="relative lg:w-[45%] min-h-0 aspect-[3/4] lg:aspect-auto lg:min-h-0 bg-gray-100 border-t lg:border-t-0 lg:border-l border-secondary/10 overflow-hidden group">
                                    {/* Vintage texture overlay */}
                                    <div className="absolute inset-0 bg-secondary/5 opacity-20 mix-blend-multiply z-10 pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.05\' fill-rule=\'evenodd\'%3E%3Cpath d=\'M5 0h1L0 6V5zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")' }} />
                                    <div className="absolute inset-0 w-full h-full">
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
            </div>
        </section>
    )
}
