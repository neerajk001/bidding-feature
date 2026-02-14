'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Bidder {
  id: string
  name: string
  phone: string
  email?: string
  auction_id: string
  registered_at: string
  auction: {
    title: string
    product_id: string
    status: string
  }
  bids_count: number
  highest_bid: number | null
}

export default function BiddersPage() {
  const [bidders, setBidders] = useState<Bidder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterAuction, setFilterAuction] = useState('all')
  const [auctions, setAuctions] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    fetchBidders()
  }, [])

  const fetchBidders = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/bidders')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch bidders')
      }

      setBidders(data.bidders || [])
      
      // Extract unique auctions for filter
      const uniqueAuctions = Array.from(
        new Map(
          (data.bidders || []).map((b: Bidder) => [
            b.auction_id,
            { id: b.auction_id, title: b.auction.title }
          ])
        ).values()
      ) as { id: string; title: string }[]
      setAuctions(uniqueAuctions)
      setError('')
    } catch (err: any) {
      console.error('Error fetching bidders:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredBidders = filterAuction === 'all' 
    ? bidders 
    : bidders.filter(b => b.auction_id === filterAuction)

  if (loading) {
    return (
      <div className="admin-container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ fontSize: '1.2rem', color: '#666' }}>Loading bidders...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 className="admin-title">Registered Bidders</h1>
          <Link href="/admin" className="admin-btn-secondary">
            Back to Dashboard
          </Link>
        </div>

        {error && (
          <div className="admin-alert admin-alert-error">
            {error}
          </div>
        )}

        {!error && bidders.length === 0 && (
          <div className="admin-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
            <h3 style={{ marginBottom: '0.5rem', color: '#333' }}>No Bidders Yet</h3>
            <p style={{ color: '#666' }}>Registered bidders will appear here once users register for auctions.</p>
          </div>
        )}

        {bidders.length > 0 && (
          <div className="admin-card">
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#333' }}>
                Total Bidders: {filteredBidders.length}
              </h2>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label htmlFor="auction-filter" style={{ fontWeight: '500', color: '#333' }}>
                  Filter by Auction:
                </label>
                <select
                  id="auction-filter"
                  value={filterAuction}
                  onChange={(e) => setFilterAuction(e.target.value)}
                  className="admin-input"
                  style={{ width: 'auto', minWidth: '200px' }}
                >
                  <option value="all">All Auctions ({bidders.length})</option>
                  {auctions.map(auction => {
                    const count = bidders.filter(b => b.auction_id === auction.id).length
                    return (
                      <option key={auction.id} value={auction.id}>
                        {auction.title} ({count})
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Bidder Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Auction</th>
                    <th>Status</th>
                    <th>Total Bids</th>
                    <th>Highest Bid</th>
                    <th>Registered At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBidders.map((bidder) => (
                    <tr key={bidder.id}>
                      <td>
                        <div style={{ fontWeight: '600', color: '#333' }}>
                          {bidder.name}
                        </div>
                      </td>
                      <td>{bidder.phone}</td>
                      <td>{bidder.email || '-'}</td>
                      <td>
                        <div style={{ maxWidth: '200px' }}>
                          {bidder.auction.title}
                        </div>
                      </td>
                      <td>
                        <span className={`admin-badge admin-badge-${bidder.auction.status}`}>
                          {bidder.auction.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ textAlign: 'center', fontWeight: '600', color: '#333' }}>
                          {bidder.bids_count}
                        </div>
                      </td>
                      <td>
                        {bidder.highest_bid ? (
                          <div style={{ fontWeight: '700', color: '#FF6B35' }}>
                            ₹{bidder.highest_bid.toLocaleString()}
                          </div>
                        ) : (
                          <span style={{ color: '#999' }}>No bids</span>
                        )}
                      </td>
                      <td>
                        {new Date(bidder.registered_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td>
                        <Link 
                          href={`/admin/auctions/${bidder.auction_id}`}
                          className="admin-btn-secondary"
                          style={{ padding: '0.4rem 0.9rem', fontSize: '0.875rem' }}
                        >
                          View Auction
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
