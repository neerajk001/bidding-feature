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

        <section className="py-24 bg-gray-50" id="auction-calendar">
            <div className="container mx-auto px-4">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 mb-12">
                    <div className="flex flex-col gap-2">
                        <span className="uppercase tracking-widest text-xs font-semibold text-orange-500">Upcoming Auctions</span>
                        <h2 className="text-4xl font-bold font-display text-black">Explore upcoming auctions and previews.</h2>
                        <p className="text-gray-600 max-w-lg leading-relaxed">
                            Register early to unlock preview access, bidding guides, and personal styling notes.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                        <div className="flex p-1 bg-white rounded-lg border border-gray-200">
                            <button
                                type="button"
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${auctionTab === 'upcoming'
                                    ? 'bg-black text-white shadow-sm'
                                    : 'text-gray-600 hover:text-black'
                                    }`}
                                onClick={() => setAuctionTab('upcoming')}
                            >
                                Upcoming
                            </button>
                            <button
                                type="button"
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${auctionTab === 'past'
                                    ? 'bg-black text-white shadow-sm'
                                    : 'text-gray-600 hover:text-black'
                                    }`}
                                onClick={() => setAuctionTab('past')}
                            >
                                Past Results
                            </button>
                        </div>
                        <Link href="/auctions" className="inline-flex items-center justify-center px-6 py-2 rounded-lg font-semibold text-sm transition-colors border border-gray-300 text-gray-700 hover:border-orange-500 hover:text-orange-500 hover:bg-orange-500/10">
                            Explore Calendar
                        </Link>
                    </div>
                </div>

                {auctionTab === 'upcoming' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {upcomingAuctions.length > 0 ? (
                            upcomingAuctions.map((auction) => {
                                const startAt = auction.bidding_start_time || auction.bidding_end_time
                                const startingBid = auction.base_price ?? auction.min_increment ?? auction.current_highest_bid ?? 0

                                return (
                                    <Link href={`/auction/${auction.id}`} key={auction.id} className="group relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-orange-500/50 transition-colors">
                                        <div className="aspect-[3/4] relative bg-zinc-800 overflow-hidden">
                                            {auction.banner_image ? (
                                                <div className="relative w-full h-full">
                                                    <Image
                                                        src={auction.banner_image}
                                                        alt={auction.title}
                                                        fill
                                                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                                                        sizes="(max-width: 768px) 100vw, 33vw"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600 font-medium uppercase tracking-wider text-sm">Upcoming Lot</div>
                                            )}
                                        </div>
                                        <div className="p-5 flex flex-col gap-3 flex-1">
                                            <div className="flex justify-between items-center text-xs uppercase tracking-wider font-medium text-zinc-500">
                                                <span className={`px-2 py-0.5 rounded-full border ${auction.status === 'live'
                                                    ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                                    : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                                                    }`}>{auction.status}</span>
                                                <span>
                                                    {startAt ? formatDate(startAt) : 'TBD'}
                                                </span>
                                            </div>
                                            <h3 className="text-lg font-display font-semibold text-white leading-tight">{auction.title}</h3>
                                            <div className="mt-auto pt-4 border-t border-zinc-800 flex justify-between items-end">
                                                <div>
                                                    <span className="block text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Starting bid</span>
                                                    <span className="text-sm font-semibold text-white">{formatCurrency(startingBid)}</span>
                                                </div>
                                                <span className="text-xs font-bold uppercase tracking-wider text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-1 group-hover:translate-y-0">Preview lot</span>
                                            </div>
                                        </div>
                                    </Link>
                                )
                            })
                        ) : (
                            <div className="col-span-full bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                                <h3 className="text-xl font-display font-medium text-white mb-2">No upcoming auctions yet</h3>
                                <p className="text-zinc-400">New lots are added weekly. Check back soon.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {pastAuctions.length > 0 ? (
                            pastAuctions.map((auction) => (
                                <Link href={`/auction/${auction.id}`} key={auction.id} className="group relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden grayscale hover:grayscale-0 transition-all opacity-75 hover:opacity-100">
                                    <div className="aspect-[3/4] relative bg-zinc-800 overflow-hidden">
                                        {auction.banner_image ? (
                                            <div className="relative w-full h-full">
                                                <Image
                                                    src={auction.banner_image}
                                                    alt={auction.title}
                                                    fill
                                                    className="object-cover"
                                                    sizes="(max-width: 768px) 100vw, 33vw"
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600 font-medium uppercase tracking-wider text-sm">Past Lot</div>
                                        )}
                                    </div>
                                    <div className="p-5 flex flex-col gap-3 flex-1">
                                        <div className="flex justify-between items-center text-xs uppercase tracking-wider font-medium text-zinc-500">
                                            <span className="px-2 py-0.5 rounded-full border bg-zinc-800 text-zinc-500 border-zinc-700">ended</span>
                                            <span>
                                                {auction.bidding_end_time ? formatDate(auction.bidding_end_time) : 'TBD'}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-display font-semibold text-white leading-tight">{auction.title}</h3>
                                        <div className="mt-auto pt-4 border-t border-zinc-800 flex justify-between items-end">
                                            <div>
                                                <span className="block text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Winner</span>
                                                <span className="text-sm font-semibold text-white">
                                                    {auction.winner_name ||
                                                        auction.highest_bidder_name ||
                                                        'No bids'}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Winning bid</span>
                                                <span className="text-sm font-semibold text-orange-400">
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
                            <div className="col-span-full bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                                <h3 className="text-xl font-display font-medium text-white mb-2">No past auctions yet</h3>
                                <p className="text-zinc-400">Completed auctions will appear here with winner details.</p>
                            </div>
                        )}
                    </div>
                )}

                {auctionTab === 'upcoming' && recentEndedAuction && (
                    <div className="mt-16">
                        <div className="flex flex-col gap-2 mb-6">
                            <span className="uppercase tracking-widest text-xs font-semibold text-orange-500">Latest Result</span>
                            <h3 className="text-2xl font-bold font-display text-white">Auction Results</h3>
                        </div>
                        <div className="bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm rounded-2xl p-8 max-w-2xl">
                            <span className="uppercase tracking-widest text-xs font-bold text-zinc-500 mb-2 block">Auction Ended</span>
                            <h3 className="text-2xl font-display font-bold text-white mb-1">Winner announced</h3>
                            <p className="text-lg text-zinc-300 mb-6">{recentEndedAuction.title}</p>
                            <div className="grid grid-cols-2 gap-8 mb-6 border-y border-zinc-800 py-6">
                                <div>
                                    <span className="block text-xs uppercase tracking-wider text-zinc-500 font-medium mb-1">Highest bidder</span>
                                    <span className="text-xl font-bold text-white">
                                        {recentEndedAuction.winner_name ||
                                            recentEndedAuction.highest_bidder_name ||
                                            'No bids placed'}
                                    </span>
                                </div>
                                <div>
                                    <span className="block text-xs uppercase tracking-wider text-zinc-500 font-medium mb-1">Winning bid</span>
                                    <span className="text-xl font-bold text-orange-400">
                                        {formatCurrency(
                                            recentEndedAuction.winning_amount ?? recentEndedAuction.current_highest_bid
                                        )}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-4 items-center">
                                <Link href={`/auction/${recentEndedAuction.id}`} className="inline-flex items-center justify-center px-6 py-2 rounded-lg font-semibold text-sm transition-colors border border-zinc-700 text-white hover:border-orange-500 hover:text-orange-500 hover:bg-orange-500/10">
                                    View results
                                </Link>
                                <button
                                    onClick={() => setAuctionTab('past')}
                                    className="text-zinc-400 hover:text-white underline underline-offset-4 text-sm font-medium transition-colors"
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
