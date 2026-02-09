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
      <section className="section section-tight">
        <div className="container">
          <div className="section-heading" style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <span className="eyebrow">The Collection</span>
            <h1>All Active Auctions</h1>
          </div>

          {error && <div className="notice notice-error">{error}</div>}

          {loading ? (
            <div className="grid grid-3">
              <div className="skeleton-block" style={{ height: '400px' }} />
              <div className="skeleton-block" style={{ height: '400px' }} />
              <div className="skeleton-block" style={{ height: '400px' }} />
            </div>
          ) : auctions.length === 0 ? (
            <div className="empty-state" style={{ padding: '4rem 0' }}>
              <h3>No live auctions right now</h3>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Check back soon for the next exclusive drop.
              </p>
            </div>
          ) : (
            <div className="grid grid-3">
              {auctions.map((auction) => (
                <Link href={`/auction/${auction.id}`} key={auction.id} className="auction-card">
                  <div className="auction-card-image">
                    {auction.banner_image ? (
                      <img src={auction.banner_image} alt={auction.title} />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background: 'var(--color-surface-light)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        NO IMAGE
                      </div>
                    )}
                  </div>
                  <div className="auction-card-body" style={{ padding: '1rem 0' }}>
                    <div className="stack" style={{ gap: '0.25rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '500' }}>{auction.title}</h3>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="metric-value" style={{ fontSize: '1rem' }}>
                          {formatCurrency(auction.current_highest_bid)}
                        </span>
                        <span className={`badge badge-${auction.status}`} style={{ fontSize: '0.65rem' }}>
                          {auction.status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                        <span>Ends {formatDate(auction.bidding_end_time)}</span>
                        <span>{auction.total_bids || 0} Bids</span>
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
