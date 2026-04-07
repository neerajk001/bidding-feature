'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
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

function formatTimeOnly(value: string | null | undefined) {
    const date = parseDate(value)
    if (!date) return 'TBD'
    return timeFormatter.format(date)
}

function formatCountdown(msRemaining: number) {
    const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
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
    const [_liveBidData, setLiveBidData] = useState<{ amount: number, total: number } | null>(null)
    const [isLeaderTab, setIsLeaderTab] = useState(true)
    const isLeaderTabRef = useRef<boolean>(true)
    const syncChannelRef = useRef<BroadcastChannel | null>(null)
    const tabIdRef = useRef<string>(
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    )

    const applyBidMessage = useCallback((message: { amount: number }) => {
        const newAmount = Number(message.amount)
        if (!Number.isFinite(newAmount) || newAmount <= 0) return

        setLiveBidData(prev => {
            if (prev && newAmount <= prev.amount) return prev
            return {
                amount: newAmount,
                total: (prev?.total || activeDetail?.total_bids || 0) + 1
            }
        })
    }, [activeDetail?.total_bids])

    const broadcastToFollowers = (message: { type: 'bid'; payload: { auction_id: string; amount: number; v: number } }) => {
        if (!isLeaderTabRef.current) return
        const channel = syncChannelRef.current
        if (!channel) return
        channel.postMessage(message)
    }

    useEffect(() => {
        if (activeAuction?.phase !== 'live' || !activeDetail?.id || typeof window === 'undefined') {
            setIsLeaderTab(true)
            isLeaderTabRef.current = true
            if (syncChannelRef.current) {
                syncChannelRef.current.close()
                syncChannelRef.current = null
            }
            return
        }

        const lockKey = `landing-hero-leader:${activeDetail.id}`
        const ttlMs = 12000
        const heartbeatMs = 4000
        const channel = new BroadcastChannel(`landing-hero-sync:${activeDetail.id}`)
        syncChannelRef.current = channel

        const setLeaderStatus = (value: boolean) => {
            isLeaderTabRef.current = value
            setIsLeaderTab(value)
        }

        const readLock = (): { owner: string; expiresAt: number } | null => {
            try {
                const raw = localStorage.getItem(lockKey)
                if (!raw) return null
                const parsed = JSON.parse(raw) as { owner?: string; expiresAt?: number }
                if (!parsed?.owner || typeof parsed.expiresAt !== 'number') return null
                return { owner: parsed.owner, expiresAt: parsed.expiresAt }
            } catch {
                return null
            }
        }

        const writeLock = () => {
            const lockValue = {
                owner: tabIdRef.current,
                expiresAt: Date.now() + ttlMs
            }
            localStorage.setItem(lockKey, JSON.stringify(lockValue))
        }

        const releaseLock = () => {
            const lock = readLock()
            if (lock?.owner === tabIdRef.current) {
                localStorage.removeItem(lockKey)
            }
        }

        const electLeader = () => {
            const lock = readLock()
            const nowTs = Date.now()
            const canClaim = !lock || lock.expiresAt <= nowTs || lock.owner === tabIdRef.current
            if (canClaim) {
                writeLock()
                setLeaderStatus(true)
            } else {
                setLeaderStatus(false)
            }
        }

        electLeader()

        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                electLeader()
            }
        }

        const heartbeat = setInterval(() => {
            if (isLeaderTabRef.current) {
                writeLock()
            } else {
                electLeader()
            }
        }, heartbeatMs)

        channel.onmessage = (event: MessageEvent<{ type?: 'bid'; payload?: { auction_id: string; amount: number; v: number } }>) => {
            const message = event.data
            if (!message || message.type !== 'bid' || !message.payload) return
            if (message.payload.auction_id !== activeDetail.id) return
            applyBidMessage({ amount: message.payload.amount })
        }

        window.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('beforeunload', releaseLock)

        return () => {
            clearInterval(heartbeat)
            window.removeEventListener('visibilitychange', onVisibility)
            window.removeEventListener('beforeunload', releaseLock)
            releaseLock()
            if (syncChannelRef.current) {
                syncChannelRef.current.close()
                syncChannelRef.current = null
            }
            setLeaderStatus(true)
        }
    }, [activeAuction?.phase, activeDetail?.id, activeDetail?.total_bids, applyBidMessage])

    // Realtime Subscription
    useEffect(() => {
        // FREE TIER PROTECTION: Only connect if auction is LIVE
        if (activeAuction?.phase !== 'live' || !activeDetail?.id || !isLeaderTab) return

        const channel = supabase
            .channel(`landing-hero-${activeDetail.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_id=eq.${activeDetail.id}` },
                (payload: { new: Record<string, unknown> }) => {
                    const newBid = payload.new
                    const minimal = {
                        auction_id: activeDetail.id,
                        amount: Number(newBid.amount || 0),
                        v: Date.now()
                    }
                    applyBidMessage({ amount: minimal.amount })
                    broadcastToFollowers({
                        type: 'bid',
                        payload: minimal
                    })
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscription keyed by phase and id
    }, [activeAuction?.phase, activeDetail?.id, isLeaderTab])

    const [nowTs, setNowTs] = useState(() => Date.now())

    useEffect(() => {
        const timer = window.setInterval(() => setNowTs(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [])

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

    const cardTitle = effectiveVariant === 'empty'
        ? 'Next lot in curation'
        : detail?.title || 'Heritage Auction'

    const countdownTargetIso = effectiveVariant === 'registration'
        ? effectiveDetail?.registration_end_time
        : effectiveVariant === 'upcoming'
            ? effectiveDetail?.bidding_start_time
            : effectiveVariant === 'live'
                ? effectiveDetail?.bidding_end_time
                : null

    const countdownTargetTs = countdownTargetIso ? new Date(countdownTargetIso).getTime() : Number.NaN
    const hasCountdown = Number.isFinite(countdownTargetTs)
    const countdownText = hasCountdown
        ? formatCountdown(Math.max(0, countdownTargetTs - nowTs))
        : null

    const cardStatusLabel = effectiveVariant === 'registration' || effectiveVariant === 'live'
        ? `Open${countdownText ? ` · Closes in ${countdownText}` : ''}`
        : effectiveVariant === 'upcoming'
            ? `Upcoming${countdownText ? ` · Starts in ${countdownText}` : ''}`
            : effectiveVariant === 'closed'
                ? 'Closed'
                : 'Upcoming Soon'

    const cardStatusClass = effectiveVariant === 'registration' || effectiveVariant === 'live'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : effectiveVariant === 'upcoming'
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : effectiveVariant === 'closed'
                ? 'bg-zinc-100 text-zinc-700 border-zinc-300'
                : 'bg-zinc-100 text-zinc-600 border-zinc-200'

    const cardSubline = effectiveVariant === 'upcoming'
        ? `Starts today at ${formatTimeOnly(effectiveDetail?.bidding_start_time)}`
        : effectiveVariant === 'closed'
            ? `Closed at ${formatDateTime(endedDetail?.bidding_end_time)}`
            : `Closes today at ${formatTimeOnly(
                effectiveVariant === 'registration'
                    ? effectiveDetail?.registration_end_time
                    : effectiveDetail?.bidding_end_time
            )}`

    const cardMetaItems = detail
        ? [
            { label: 'Starts', value: formatDateTime(detail.bidding_start_time) },
            { label: 'Base', value: formatCurrency(detail.base_price ?? 0) },
            { label: '+', value: formatCurrency(detail.min_increment ?? 0) }
        ]
        : [
            { label: 'Starts', value: 'TBD' },
            { label: 'Base', value: '₹0' },
            { label: '+', value: '₹0' }
        ]

    const cardPrimaryCta = detail
        ? {
            href: `/auction/${detail.id}`,
            label: effectiveVariant === 'closed' ? 'View Results' : 'Register to Bid'
        }
        : {
            href: '/auctions',
            label: 'View Auctions'
        }

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

                        <div className="relative bg-white/85 backdrop-blur-md border border-secondary/20 rounded-[1.25rem] overflow-hidden shadow-2xl hover:shadow-secondary/10 transition-all duration-500" data-variant={effectiveVariant}>
                            {/* Horizontal layout: content left, media right on desktop */}
                            <div className="flex flex-col lg:flex-row">
                                {/* Content Section - Wider on desktop */}
                                <div className="lg:w-[55%] p-4 lg:p-6 bg-gradient-to-br from-white via-cream to-white space-y-5 lg:space-y-6">
                                    <div className="flex items-start justify-between gap-3">
                                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide border ${cardStatusClass}`}>
                                            {(effectiveVariant === 'live' || effectiveVariant === 'registration') && (
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            )}
                                            {cardStatusLabel}
                                        </span>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-2xl lg:text-3xl font-bold font-display text-[#2D2420] leading-tight">{cardTitle}</h3>
                                        <p className="text-sm text-[#5E5248]">{cardSubline}</p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#7B6F63]">
                                        {cardMetaItems.map((item, index) => (
                                            <div key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5 rounded-lg border border-secondary/15 bg-white/80 px-2.5 py-1.5">
                                                <span className="font-medium text-[#8A7E72]">{item.label}:</span>
                                                <span className="font-semibold text-[#2D2420]">{item.value}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="pt-2 space-y-2">
                                        <Link href={cardPrimaryCta.href} className="w-full inline-flex items-center justify-center px-6 py-3.5 rounded-xl font-bold text-lg transition-all duration-300 bg-[#3D2E1F] text-cream hover:bg-primary shadow-lg hover:shadow-xl hover:-translate-y-0.5 tracking-wide">
                                            {cardPrimaryCta.label}
                                        </Link>
                                        {effectiveVariant !== 'closed' && (
                                            <p className="text-xs text-center text-[#7B6F63]">No charges until you win</p>
                                        )}
                                    </div>

                                    <TermsAndConditionsModal
                                        showAgreementText={false}
                                        wrapperClassName="pt-1 flex items-center justify-center"
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
