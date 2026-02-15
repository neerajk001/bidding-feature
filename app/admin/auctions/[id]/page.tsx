'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

interface Bidder {
  id: string
  name: string
  phone: string
  email: string
  created_at: string
  highest_bid: number | null
}

interface Bid {
  id: string
  amount: number
  created_at: string
  bidder_id: string
  bidders: {
    name: string
    phone: string
    email: string
  }
}

interface Auction {
  id: string
  title: string
  product_id: string
  status: string
  min_increment: number
  registration_end_time: string
  bidding_start_time: string
  bidding_end_time: string
}

export default function AuctionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const auctionId = params.id as string

  const [auction, setAuction] = useState<Auction | null>(null)
  const [bidders, setBidders] = useState<Bidder[]>([])
  const [bids, setBids] = useState<Bid[]>([])
  const [currentHighestBid, setCurrentHighestBid] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<Partial<Auction>>({})

  useEffect(() => {
    fetchAuctionData()
    setupRealtimeSubscription()
  }, [auctionId])

  const toLocalISO = (isoString: string) => {
    const date = new Date(isoString)
    const offsetMs = date.getTimezoneOffset() * 60 * 1000
    const localDate = new Date(date.getTime() - offsetMs)
    return localDate.toISOString().slice(0, 16)
  }

  const fetchAuctionData = async () => {
    try {
      const response = await fetch(`/api/admin/auctions/${auctionId}`)
      const data = await response.json()

      if (data.auction) {
        setAuction(data.auction)
        setBidders(data.bidders)
        setBids(data.bids)
        setCurrentHighestBid(data.current_highest_bid)
        // Pre-fill form data for editing
        setFormData({
          title: data.auction.title,
          product_id: data.auction.product_id,
          min_increment: data.auction.min_increment,
          registration_end_time: toLocalISO(data.auction.registration_end_time),
          bidding_start_time: toLocalISO(data.auction.bidding_start_time),
          bidding_end_time: toLocalISO(data.auction.bidding_end_time),
          status: data.auction.status
        })
      }
    } catch (error) {
      console.error('Failed to fetch auction:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this auction? This action cannot be undone.')) return

    try {
      const res = await fetch(`/api/admin/auctions/${auctionId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        router.push('/admin/auctions')
      } else {
        alert('Failed to delete auction')
      }
    } catch (err) {
      console.error(err)
      alert('Error deleting auction')
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch(`/api/admin/auctions/${auctionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (res.ok) {
        setIsEditing(false)
        fetchAuctionData()
        alert('Auction updated successfully')
      } else {
        alert('Failed to update auction')
      }
    } catch (err) {
      console.error(err)
      alert('Error updating auction')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel(`admin-auction-${auctionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bids',
          filter: `auction_id=eq.${auctionId}`
        },
        (payload) => {
          console.log('Bid change received:', payload)
          fetchAuctionData() // Refresh all data
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bidders',
          filter: `auction_id=eq.${auctionId}`
        },
        (payload) => {
          console.log('New bidder registered:', payload.new)
          fetchAuctionData() // Refresh all data
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>
  }

  if (!auction) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Auction not found</div>
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => router.push('/admin/auctions')}
          className="btn btn-outline"
        >
          ← Back to Auctions
        </button>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={`btn ${isEditing ? 'btn-outline' : 'btn-primary'}`}
          style={{ backgroundColor: isEditing ? 'transparent' : 'var(--color-primary)' }}
        >
          {isEditing ? 'Cancel Editing' : 'Edit Auction'}
        </button>
        <button
          onClick={handleDelete}
          className="btn btn-danger"
        >
          Delete Auction
        </button>
      </div>

      {isEditing && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>Edit Auction Details</h2>
          <form onSubmit={handleUpdate}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              <div>
                <label>Title</label>
                <input type="text" name="title" value={formData.title || ''} onChange={handleChange} required />
              </div>
              <div>
                <label>Product ID</label>
                <input type="text" name="product_id" value={formData.product_id || ''} onChange={handleChange} required />
              </div>
              <div>
                <label>Min Increment</label>
                <input type="number" name="min_increment" value={formData.min_increment || ''} onChange={handleChange} step="0.01" required />
              </div>
              <div>
                <label>Status</label>
                <select name="status" value={formData.status} onChange={handleChange}>
                  <option value="draft">Draft</option>
                  <option value="live">Live</option>
                  <option value="ended">Ended</option>
                </select>
              </div>
              <div>
                <label>Registration End</label>
                <input type="datetime-local" name="registration_end_time" value={formData.registration_end_time || ''} onChange={handleChange} required style={{ colorScheme: 'dark', color: '#fff' }} />
              </div>
              <div>
                <label>Bidding Start</label>
                <input type="datetime-local" name="bidding_start_time" value={formData.bidding_start_time || ''} onChange={handleChange} required style={{ colorScheme: 'dark', color: '#fff' }} />
              </div>
              <div>
                <label>Bidding End</label>
                <input type="datetime-local" name="bidding_end_time" value={formData.bidding_end_time || ''} onChange={handleChange} required style={{ colorScheme: 'dark', color: '#fff' }} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: '1.5rem', backgroundColor: 'var(--color-success)', border: 'none' }}>
              Save Changes
            </button>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
        <div className="card">
          <h1 style={{ marginBottom: '1rem', fontSize: '1.75rem' }}>{auction.title}</h1>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Product ID:</span>
              <div style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>{auction.product_id}</div>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Min Increment:</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>₹{auction.min_increment}</div>
            </div>
            <div>
              <span className={`badge badge-${auction.status}`}>
                {auction.status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div className="card" style={{
          background: auction.status === 'ended'
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)'
            : 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(249, 115, 22, 0.05) 100%)',
          borderColor: auction.status === 'ended' ? 'var(--color-success)' : 'var(--color-primary)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center'
        }}>
          {bids.length > 0 ? (
            <>
              <div style={{
                fontSize: '0.875rem',
                textTransform: 'uppercase',
                fontWeight: '800',
                letterSpacing: '0.1em',
                color: auction.status === 'ended' ? 'var(--color-success)' : 'var(--color-primary)',
                marginBottom: '1rem'
              }}>
                {auction.status === 'ended' ? '🎉 WINNER 🎉' : '🔥 HIGHEST BID 🔥'}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                {bids[0].bidders.name}
              </div>
              <div style={{ fontSize: '0.95rem', color: 'var(--color-success)', fontWeight: 500, marginBottom: '0.75rem' }}>
                📞 {bids[0].bidders.phone}
              </div>
              <div style={{
                fontSize: '3rem',
                fontWeight: '900',
                color: 'var(--color-text-primary)',
                marginBottom: '0.5rem'
              }}>
                ₹{bids[0].amount.toFixed(2)}
              </div>
              <div style={{ color: 'var(--color-text-secondary)' }}>
                {bids.length} total bids
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '1rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Current Status</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-text-muted)' }}>
                No bids yet
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        {/* Registered Bidders */}
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Registered Bidders ({bidders.length})</h2>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {bidders.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)' }}>No bidders registered yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name / Info</th>
                    <th>Highest Bid</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {bidders.map((bidder) => {
                    const isHighestBidder = currentHighestBid && bidder.highest_bid === currentHighestBid
                    return (
                      <tr
                        key={bidder.id}
                        style={{
                          backgroundColor: isHighestBidder ? 'rgba(249, 115, 22, 0.1)' : 'transparent'
                        }}
                      >
                        <td>
                          <div style={{ fontWeight: isHighestBidder ? 'bold' : 'normal' }}>
                            {bidder.name} {isHighestBidder && '🏆'}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: 500 }}>📞 {bidder.phone}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{bidder.email}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{bidder.id.substring(0, 8)}...</div>
                        </td>
                        <td style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                          {bidder.highest_bid !== null ? (
                            <span style={{ color: isHighestBidder ? 'var(--color-primary)' : 'inherit' }}>
                              ₹{bidder.highest_bid.toFixed(2)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No bid</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                          {new Date(bidder.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Bid History */}
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Bid History ({bids.length})</h2>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {bids.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)' }}>No bids placed yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Bidder</th>
                    <th>Amount</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map((bid, index) => (
                    <tr
                      key={bid.id}
                      style={{
                        backgroundColor: index === 0 ? 'rgba(249, 115, 22, 0.1)' : 'transparent'
                      }}
                    >
                      <td style={{ fontWeight: 'bold' }}>
                        {index === 0 ? '🏆 #1' : `#${index + 1}`}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{bid.bidders.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-success)' }}>📞 {bid.bidders.phone}</div>
                      </td>
                      <td style={{ fontWeight: 'bold', fontSize: '1.1rem', color: index === 0 ? 'var(--color-primary)' : 'inherit' }}>
                        ₹{bid.amount.toFixed(2)}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        {new Date(bid.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
