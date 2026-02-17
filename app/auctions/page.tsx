'use client'

import { useEffect, useState } from 'react'
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
}

export default function AuctionsPage() {
  const [auctions, setAuctions] = useState<AuctionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/auctions', { cache: 'no-store' })
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load auctions')
        }

        if (isMounted) {
          setAuctions(data.auctions || [])
        }
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

  return (
    <PublicShell>
      <section className="py-12 lg:py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12 flex flex-col gap-2">
            <span className="uppercase tracking-widest text-xs font-semibold text-orange-500">The Collection</span>
            <h1 className="text-3xl lg:text-4xl font-bold font-display text-zinc-900">Current & Upcoming Auctions</h1>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md mb-8 text-center">{error}</div>}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-zinc-100 animate-pulse rounded-xl h-[400px]" />
              <div className="bg-zinc-100 animate-pulse rounded-xl h-[400px]" />
              <div className="bg-zinc-100 animate-pulse rounded-xl h-[400px]" />
            </div>
          ) : auctions.length === 0 ? (
            <div className="py-24 text-center">
              <h3 className="text-xl font-medium text-zinc-900 mb-2">No active auctions right now</h3>
              <p className="text-zinc-500">
                Check back soon for the next exclusive drop.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {auctions.map((auction) => (
                <Link href={`/auction/${auction.id}`} key={auction.id} className="group flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition-all duration-300">
                  <div className="aspect-[3/4] relative bg-zinc-100 overflow-hidden">
                    {auction.banner_image ? (
                      <img
                        src={auction.banner_image}
                        alt={auction.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-100 text-zinc-400 font-medium uppercase tracking-wider text-sm">
                        NO IMAGE
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 p-3">
                    <h3 className="text-sm font-display font-medium text-zinc-900 group-hover:text-orange-600 transition-colors line-clamp-1">{auction.title}</h3>

                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-semibold text-zinc-900">
                        {formatCurrency(auction.current_highest_bid)}
                      </span>
                      <span className="text-xs text-zinc-500 font-medium">{auction.total_bids || 0} Bids</span>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex flex-col gap-1 text-[10px] text-zinc-500 font-medium uppercase tracking-wide">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Starts</span>
                        <span>{formatDate(auction.bidding_start_time)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Ends</span>
                        <span className={auction.status === 'live' ? 'text-red-600' : ''}>{formatDate(auction.bidding_end_time)}</span>
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
  if (!value && value !== 0) return '₹0.00'
  return `₹${Number(value).toLocaleString('en-IN')}`
}

function formatDate(value: string) {
  try {
    const date = new Date(value)
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: 'numeric',
    }).format(date)
  } catch {
    return 'TBD'
  }
}
