'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import PublicShell from '@/components/public/PublicShell'

interface AuctionSummary {
  id: string
  title: string
  status: string
  bidding_end_time: string
  banner_image?: string | null
  current_highest_bid?: number | null
  highest_bidder_name?: string | null
  winner_name?: string | null
  winning_amount?: number | null
  winners_count?: number
  top_winning_amount?: number | null
}

export default function PastAuctionsPage() {
  const [auctions, setAuctions] = useState<AuctionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/auctions?includeEnded=true&view=past&limit=120')
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load past auctions')
        }

        const list = Array.isArray(data.auctions) ? data.auctions : []
        const ended = list
          .filter((auction: AuctionSummary) => auction.status === 'ended')
          .sort((a: AuctionSummary, b: AuctionSummary) => {
            const aTime = new Date(a.bidding_end_time).getTime()
            const bTime = new Date(b.bidding_end_time).getTime()
            return bTime - aTime
          })

        if (mounted) {
          setAuctions(ended)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load past auctions')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  const totalLabel = useMemo(() => {
    const count = auctions.length
    return `${count} ${count === 1 ? 'auction' : 'auctions'}`
  }, [auctions.length])

  return (
    <PublicShell>
      <section className="py-8 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col gap-3 mb-8 lg:mb-12">
            <Link
              href="/#auction-calendar"
              className="text-sm font-semibold text-gray-600 hover:text-black transition-colors"
            >
              Back to auction calendar
            </Link>
            <span className="uppercase tracking-widest text-xs font-bold text-secondary font-display">Past Results</span>
            <h1 className="text-3xl lg:text-4xl font-bold font-display text-black">All Past Auctions</h1>
            <p className="text-sm text-gray-600">{totalLabel}</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md mb-8">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-zinc-100 animate-pulse rounded-xl h-[280px]" />
              <div className="bg-zinc-100 animate-pulse rounded-xl h-[280px]" />
              <div className="bg-zinc-100 animate-pulse rounded-xl h-[280px]" />
            </div>
          ) : auctions.length === 0 ? (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
              <h3 className="text-xl font-display font-bold text-gray-900 mb-2">No past auctions yet</h3>
              <p className="text-gray-600">Completed auctions will appear here with winner details.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {auctions.map((auction) => (
                <Link
                  href={`/auction/${auction.id}`}
                  key={auction.id}
                  className="group relative flex flex-col bg-white border-2 border-gray-200 rounded-xl overflow-hidden hover:border-gray-400 transition-all duration-300"
                >
                  <div className="aspect-[5/4] relative bg-gray-100 overflow-hidden">
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
                    <div className="absolute top-3 left-3">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-gray-900/80 text-white backdrop-blur-sm">
                        Ended
                      </span>
                    </div>
                  </div>

                  <div className="p-4 flex flex-col gap-3 flex-1 bg-white">
                    <h3 className="text-base font-display font-bold text-black leading-tight line-clamp-2">
                      {auction.title}
                    </h3>

                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="font-medium">
                        {auction.bidding_end_time ? formatDate(auction.bidding_end_time) : 'TBD'}
                      </span>
                    </div>

                    <div className="mt-auto pt-3 border-t border-gray-200">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="block text-xs uppercase tracking-wider text-gray-500 font-semibold mb-0.5">Winner</span>
                          <span className="text-sm font-bold text-black line-clamp-1">
                            {Number(auction.winners_count || 0) > 1
                              ? `${auction.winners_count} Winners`
                              : auction.winner_name || auction.highest_bidder_name || 'No bids'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block text-xs uppercase tracking-wider text-gray-500 font-semibold mb-0.5">
                            {Number(auction.winners_count || 0) > 1 ? 'Top Bid' : 'Final Bid'}
                          </span>
                          <span className="text-sm font-bold text-primary">
                            {formatCurrency(
                              Number(auction.winners_count || 0) > 1
                                ? (auction.top_winning_amount ?? auction.winning_amount ?? auction.current_highest_bid)
                                : (auction.winning_amount ?? auction.current_highest_bid)
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </PublicShell>
  )
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Rs 0'
  return `Rs ${Number(value).toLocaleString('en-IN')}`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBD'
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
