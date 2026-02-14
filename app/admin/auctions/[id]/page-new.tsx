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
          fetchAuctionData()
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
          fetchAuctionData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#000' }}>Loading...</div>
  }

  if (!auction) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#000' }}>Auction not found</div>
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => router.push('/admin/auctions')}
          className="admin-btn admin-btn-outline"
        >
          ← Back to Auctions
        </button>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={`admin-btn ${isEditing ? 'admin-btn-outline' : 'admin-btn-primary'}`}
        >
          {isEditing ? 'Cancel Editing' : 'Edit Auction'}
        </button>
        <button
          onClick={handleDelete}
          className="admin-btn admin-btn-danger"
        >
          Delete Auction
        </button>
      </div>

      {isEditing && (
        <div className="admin-card" style={{ marginBottom: '2rem' }}>
          <div className="admin-card-header">
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Edit Auction Details</h2>
          </div>
          <form onSubmit={handleUpdate}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              <div className="admin-form-group">
                <label className="admin-label">Title</label>
                <input className="admin-input" type="text" name="title" value={formData.title || ''} onChange={handleChange} required />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Product ID</label>
                <input className="admin-input" type="text" name="product_id" value={formData.product_id || ''} onChange={handleChange} required />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Min Increment</label>
                <input className="admin-input" type="number" name="min_increment" value={formData.min_increment || ''} onChange={handleChange} step="1" required />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Status</label>
                <select className="admin-select" name="status" value={formData.status} onChange={handleChange}>
                  <option value="draft">Draft</option>
                  <option value="live">Live</option>
                  <option value="ended">Ended</option>
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Registration End</label>
                <input className="admin-input" type="datetime-local" name="registration_end_time" value={formData.registration_end_time || ''} onChange={handleChange} required />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Bidding Start</label>
                <input className="admin-input" type="datetime-local" name="bidding_start_time" value={formData.bidding_start_time || ''} onChange={handleChange} required />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Bidding End</label>
                <input className="admin-input" type="datetime-local" name="bidding_end_time" value={formData.bidding_end_time || ''} onChange={handleChange} required />
              </div>
            </div>
            <button type="submit" className="admin-btn admin-btn-primary" style={{ marginTop: '1.5rem' }}>
              Save Changes
            </button>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
        <div className="admin-card">
          <h1 style={{ marginBottom: '1rem', fontSize: '1.75rem', color: '#000' }}>{auction.title}</h1>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Product ID:</span>
              <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: '#000' }}>{auction.product_id}</div>
            </div>
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Min Increment:</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#000' }}>₹{auction.min_increment}</div>
            </div>
            <div>
              <span className={`admin-badge admin-badge-${auction.status}`}>
                {auction.status}
              </span>
            </div>
          </div>
        </div>

        <div className="admin-card" style={{
          background: auction.status === 'ended' ? '#dcfce7' : '#fff5ed',
          borderColor: auction.status === 'ended' ? '#166534' : '#FF6B35',
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
                color: auction.status === 'ended' ? '#166534' : '#FF6B35',
                marginBottom: '1rem'
              }}>
                {auction.status === 'ended' ? '🎉 WINNER 🎉' : '🔥 HIGHEST BID 🔥'}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem', color: '#000' }}>
                {bids[0].bidders.name}
              </div>
              <div style={{ fontSize: '0.95rem', color: '#16a34a', fontWeight: 500, marginBottom: '0.75rem' }}>
                📞 {bids[0].bidders.phone}
              </div>
              <div style={{
                fontSize: '3rem',
                fontWeight: '900',
                color: '#000',
                marginBottom: '0.5rem'
              }}>
                ₹{bids[0].amount}
              </div>
              <div style={{ color: '#6b7280' }}>
                {bids.length} total bids
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '1rem', color: '#6b7280', marginBottom: '0.5rem' }}>Current Status</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#9ca3af' }}>
                No bids yet
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        {/* Registered Bidders */}
        <div className="admin-card">
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', color: '#000', fontWeight: 700 }}>Registered Bidders ({bidders.length})</h2>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {bidders.length === 0 ? (
              <p style={{ color: '#6b7280' }}>No bidders registered yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>Name / Info</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>Highest Bid</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {bidders.map((bidder) => {
                    const isHighestBidder = currentHighestBid && bidder.highest_bid === currentHighestBid
                    return (
                      <tr
                        key={bidder.id}
                        style={{
                          backgroundColor: isHighestBidder ? '#fff5ed' : 'transparent',
                          borderBottom: '1px solid #f3f4f6'
                        }}
                      >
                        <td style={{ padding: '0.75rem' }}>
                          <div style={{ fontWeight: isHighestBidder ? 'bold' : 'normal', color: '#000' }}>
                            {bidder.name} {isHighestBidder && '🏆'}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#16a34a', fontWeight: 500 }}>📞 {bidder.phone}</div>
                          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{bidder.email}</div>
                        </td>
                        <td style={{ fontWeight: 'bold', fontSize: '1.1rem', padding: '0.75rem' }}>
                          {bidder.highest_bid !== null ? (
                            <span style={{ color: isHighestBidder ? '#FF6B35' : '#000' }}>
                              ₹{bidder.highest_bid}
                            </span>
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: '0.9rem', fontStyle: 'italic' }}>No bid</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem', color: '#6b7280', padding: '0.75rem' }}>
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
        <div className="admin-card">
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', color: '#000', fontWeight: 700 }}>Bid History ({bids.length})</h2>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {bids.length === 0 ? (
              <p style={{ color: '#6b7280' }}>No bids placed yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>Rank</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>Bidder</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>Amount</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map((bid, index) => (
                    <tr
                      key={bid.id}
                      style={{
                        backgroundColor: index === 0 ? '#fff5ed' : 'transparent',
                        borderBottom: '1px solid #f3f4f6'
                      }}
                    >
                      <td style={{ fontWeight: 'bold', padding: '0.75rem', color: '#000' }}>
                        {index === 0 ? '🏆 #1' : `#${index + 1}`}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: 500, color: '#000' }}>{bid.bidders.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#16a34a' }}>📞 {bid.bidders.phone}</div>
                      </td>
                      <td style={{ fontWeight: 'bold', fontSize: '1.1rem', color: index === 0 ? '#FF6B35' : '#000', padding: '0.75rem' }}>
                        ₹{bid.amount}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: '#6b7280', padding: '0.75rem' }}>
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
