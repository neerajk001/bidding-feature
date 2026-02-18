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
    year: 'numeric',
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

function formatDate(value: string) {
    const date = parseDate(value)
    if (!date) return 'TBD'
    return dateFormatter.format(date)
}

function formatDateTime(value: string) {
    const date = parseDate(value)
    if (!date) return 'TBD'
    return `${dateFormatter.format(date)} · ${timeFormatter.format(date)}`
}

interface AuctionGridProps {
    auctions: AuctionSummary[]
    activeDetail: AuctionSummary | null
}

export default function AuctionGrid({ auctions, activeDetail }: AuctionGridProps) {
    const [auctionTab, setAuctionTab] = useState<'upcoming' | 'past'>('upcoming')

    const upcomingAuctions = useMemo(() => {
        const filtered = auctions.filter((auction) => {
            if (auction.status === 'ended') return false
            if (activeDetail && auction.id === activeDetail.id) return false
            return true
        }).slice(0, 4)

        return filtered
    }, [auctions, activeDetail])

    const pastAuctions = useMemo(() => {
        return auctions
            .filter((auction) => auction.status === 'ended')
            .sort((a, b) => {
                const aTime = new Date(a.bidding_end_time).getTime()
                const bTime = new Date(b.bidding_end_time).getTime()
                return bTime - aTime
            })
            .slice(0, 6)
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

    return (

        <section className="py-16 lg:py-20 bg-white" id="auction-calendar">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
                    <div className="flex flex-col gap-2">
                        <span className="uppercase tracking-widest text-xs font-bold text-secondary font-display">Auction Calendar</span>
                        <h2 className="text-3xl lg:text-4xl font-bold font-display text-black">Explore Auctions</h2>
                        <p className="text-gray-600 max-w-2xl leading-relaxed text-sm">
                            Register early to unlock preview access, bidding guides, and personal styling notes.
                        </p>
                    </div>
                    <div className="flex gap-2 p-1 bg-gray-100 rounded-lg border border-gray-200">
                        <button
                            type="button"
                            className={`px-5 py-2.5 rounded-md text-sm font-semibold transition-all ${auctionTab === 'upcoming'
                                ? 'bg-white text-black shadow-sm'
                                : 'text-gray-600 hover:text-black'
                                }`}
                            onClick={() => setAuctionTab('upcoming')}
                        >
                            Upcoming
                        </button>
                        <button
                            type="button"
                            className={`px-5 py-2.5 rounded-md text-sm font-semibold transition-all ${auctionTab === 'past'
                                ? 'bg-white text-black shadow-sm'
                                : 'text-gray-600 hover:text-black'
                                }`}
                            onClick={() => setAuctionTab('past')}
                        >
                            Past Results
                        </button>
                    </div>
                </div>

                {auctionTab === 'upcoming' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {upcomingAuctions.length > 0 ? (
                            upcomingAuctions.map((auction) => {
                                const startAt = auction.bidding_start_time || auction.bidding_end_time
                                const startingBid = auction.base_price ?? auction.min_increment ?? auction.current_highest_bid ?? 0

                                return (
                                    <Link
                                        href={`/auction/${auction.id}`}
                                        key={auction.id}
                                        className="group relative flex flex-col bg-white border border-secondary/20 rounded-xl overflow-hidden hover:border-primary hover:shadow-lg transition-all duration-300"
                                    >
                                        <div className="aspect-[4/5] relative bg-gray-100 overflow-hidden">
                                            {auction.banner_image ? (
                                                <div className="relative w-full h-full">
                                                    <Image
                                                        src={auction.banner_image}
                                                        alt={auction.title}
                                                        fill
                                                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                                                        sizes="(max-width: 768px) 100vw, 33vw"
                                                    />
                                                    {/* Gradient overlay */}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400 font-medium uppercase tracking-wider text-sm">
                                                    Upcoming Lot
                                                </div>
                                            )}

                                            {/* Status Badge */}
                                            <div className="absolute top-3 left-3">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-sm ${auction.status === 'live'
                                                    ? 'bg-red-500 text-white shadow-lg'
                                                    : 'bg-white/90 text-gray-700 border border-gray-200'
                                                    }`}>
                                                    {auction.status}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-4 flex flex-col gap-3 flex-1 bg-white">
                                            <div className="flex justify-between items-start gap-2">
                                                <h3 className="text-base font-display font-bold text-black leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                                                    {auction.title}
                                                </h3>
                                            </div>

                                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <span className="font-medium">
                                                    {startAt ? formatDateTime(startAt) : 'TBD'}
                                                </span>
                                            </div>

                                            <div className="mt-auto pt-3 border-t border-gray-200 flex justify-between items-center">
                                                <div>
                                                    <span className="block text-xs uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Starting Bid</span>
                                                    <span className="text-base font-bold text-black">{formatCurrency(startingBid)}</span>
                                                </div>
                                                <div className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-xs font-bold uppercase tracking-wider">View</span>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                )
                            })
                        ) : (
                            <div className="col-span-full bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
                                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-display font-bold text-gray-900 mb-2">No upcoming auctions yet</h3>
                                <p className="text-gray-600">New lots are added weekly. Check back soon.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pastAuctions.length > 0 ? (
                            pastAuctions.map((auction) => (
                                <Link
                                    href={`/auction/${auction.id}`}
                                    key={auction.id}
                                    className="group relative flex flex-col bg-white border-2 border-gray-200 rounded-xl overflow-hidden hover:border-gray-400 transition-all duration-300"
                                >
                                    <div className="aspect-[4/5] relative bg-gray-100 overflow-hidden">
                                        {auction.banner_image ? (
                                            <div className="relative w-full h-full grayscale group-hover:grayscale-0 transition-all duration-500">
                                                <Image
                                                    src={auction.banner_image}
                                                    alt={auction.title}
                                                    fill
                                                    className="object-cover"
                                                    sizes="(max-width: 768px) 100vw, 33vw"
                                                />
                                                <div className="absolute inset-0 bg-black/20" />
                                            </div>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400 font-medium uppercase tracking-wider text-sm">
                                                Past Lot
                                            </div>
                                        )}

                                        {/* Ended Badge */}
                                        <div className="absolute top-3 left-3">
                                            <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-gray-900/80 text-white backdrop-blur-sm">
                                                Ended
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-4 flex flex-col gap-3 flex-1 bg-white">
                                        <div className="flex justify-between items-start gap-2">
                                            <h3 className="text-base font-display font-bold text-black leading-tight line-clamp-2">
                                                {auction.title}
                                            </h3>
                                        </div>

                                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="font-medium">
                                                {auction.bidding_end_time ? formatDate(auction.bidding_end_time) : 'TBD'}
                                            </span>
                                        </div>

                                        <div className="mt-auto pt-3 border-t border-gray-200">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <span className="block text-xs uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Winner</span>
                                                    <span className="text-sm font-bold text-black line-clamp-1">
                                                        {auction.winner_name || auction.highest_bidder_name || 'No bids'}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="block text-xs uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Final Bid</span>
                                                    <span className="text-sm font-bold text-primary">
                                                        {formatCurrency(auction.winning_amount ?? auction.current_highest_bid)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <div className="col-span-full bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
                                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-display font-bold text-gray-900 mb-2">No past auctions yet</h3>
                                <p className="text-gray-600">Completed auctions will appear here with winner details.</p>
                            </div>
                        )}
                    </div>
                )}

                {auctionTab === 'upcoming' && recentEndedAuction && (
                    <div className="mt-16">
                        <div className="flex flex-col gap-2 mb-6">
                            <span className="uppercase tracking-widest text-xs font-bold text-secondary font-display">Latest Result</span>
                            <h3 className="text-2xl lg:text-3xl font-bold font-display text-black">Recent Winner</h3>
                        </div>
                        <div className="bg-gradient-to-br from-primary/5 to-secondary/10 border border-secondary/20 rounded-2xl p-6 lg:p-8 max-w-3xl">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-gray-900 text-white">
                                    Auction Ended
                                </span>
                            </div>
                            <h3 className="text-xl lg:text-2xl font-display font-bold text-black mb-1">Winner Announced</h3>
                            <p className="text-base lg:text-lg text-gray-700 mb-6">{recentEndedAuction.title}</p>
                            <div className="grid grid-cols-2 gap-6 mb-6 pb-6 border-b border-orange-200">
                                <div>
                                    <span className="block text-xs uppercase tracking-wider text-secondary font-bold mb-1">Highest Bidder</span>
                                    <span className="text-lg lg:text-xl font-bold text-black">
                                        {recentEndedAuction.winner_name ||
                                            recentEndedAuction.highest_bidder_name ||
                                            'No bids placed'}
                                    </span>
                                </div>
                                <div>
                                    <span className="block text-xs uppercase tracking-wider text-secondary font-bold mb-1">Winning Bid</span>
                                    <span className="text-lg lg:text-xl font-bold text-primary font-display">
                                        {formatCurrency(
                                            recentEndedAuction.winning_amount ?? recentEndedAuction.current_highest_bid
                                        )}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                                <Link
                                    href={`/auction/${recentEndedAuction.id}`}
                                    className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-bold text-sm transition-all bg-black text-white hover:bg-gray-800 shadow-lg hover:shadow-xl"
                                >
                                    View Full Results
                                </Link>
                                <button
                                    onClick={() => setAuctionTab('past')}
                                    className="text-gray-700 hover:text-black underline underline-offset-4 text-sm font-semibold transition-colors"
                                >
                                    View all past auctions →
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}
