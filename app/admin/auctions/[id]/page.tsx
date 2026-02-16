'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { adminStyles, cn } from '@/lib/admin-styles'

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
    return <div className="text-center py-16 text-gray-500">Loading...</div>
  }

  if (!auction) {
    return <div className="text-center py-16 text-gray-500">Auction not found</div>
  }

  return (
    <div>
      <div className="mb-8 flex gap-4 flex-wrap">
        <button
          onClick={() => router.push('/admin/auctions')}
          className={cn(adminStyles.btn, adminStyles.btnOutline)}
        >
          ← Back to Auctions
        </button>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={cn(adminStyles.btn, isEditing ? adminStyles.btnOutline : adminStyles.btnPrimary)}
        >
          {isEditing ? 'Cancel Editing' : 'Edit Auction'}
        </button>
        <button
          onClick={handleDelete}
          className={cn(adminStyles.btn, adminStyles.btnDanger)}
        >
          Delete Auction
        </button>
      </div>

      {isEditing && (
        <div className={cn(adminStyles.card, "mb-8")}>
          <h2 className="text-2xl font-bold text-black mb-6 pb-4 border-b border-gray-200">Edit Auction Details</h2>
          <form onSubmit={handleUpdate}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className={adminStyles.formGroup}>
                <label htmlFor="title" className={adminStyles.label}>Title</label>
                <input type="text" id="title" name="title" value={formData.title || ''} onChange={handleChange} required className={adminStyles.input} />
              </div>
              <div className={adminStyles.formGroup}>
                <label htmlFor="product_id" className={adminStyles.label}>Product ID</label>
                <input type="text" id="product_id" name="product_id" value={formData.product_id || ''} onChange={handleChange} required className={adminStyles.input} />
              </div>
              <div className={adminStyles.formGroup}>
                <label htmlFor="min_increment" className={adminStyles.label}>Min Increment</label>
                <input type="number" id="min_increment" name="min_increment" value={formData.min_increment || ''} onChange={handleChange} step="0.01" required className={adminStyles.input} />
              </div>
              <div className={adminStyles.formGroup}>
                <label htmlFor="status" className={adminStyles.label}>Status</label>
                <select id="status" name="status" value={formData.status} onChange={handleChange} className={adminStyles.select}>
                  <option value="draft">Draft</option>
                  <option value="live">Live</option>
                  <option value="ended">Ended</option>
                </select>
              </div>
              <div className={adminStyles.formGroup}>
                <label htmlFor="registration_end_time" className={adminStyles.label}>Registration End</label>
                <input type="datetime-local" id="registration_end_time" name="registration_end_time" value={formData.registration_end_time || ''} onChange={handleChange} required className={adminStyles.input} />
              </div>
              <div className={adminStyles.formGroup}>
                <label htmlFor="bidding_start_time" className={adminStyles.label}>Bidding Start</label>
                <input type="datetime-local" id="bidding_start_time" name="bidding_start_time" value={formData.bidding_start_time || ''} onChange={handleChange} required className={adminStyles.input} />
              </div>
              <div className={adminStyles.formGroup}>
                <label htmlFor="bidding_end_time" className={adminStyles.label}>Bidding End</label>
                <input type="datetime-local" id="bidding_end_time" name="bidding_end_time" value={formData.bidding_end_time || ''} onChange={handleChange} required className={adminStyles.input} />
              </div>
            </div>
            <button type="submit" className={cn(adminStyles.btn, adminStyles.btnPrimary, "mt-6")}>
              Save Changes
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className={adminStyles.card}>
          <h1 className="text-3xl font-bold text-black mb-4">{auction.title}</h1>
          <div className="space-y-4">
            <div>
              <span className="block text-sm text-gray-600 mb-1">Product ID:</span>
              <div className="font-mono text-lg text-black">{auction.product_id}</div>
            </div>
            <div>
              <span className="block text-sm text-gray-600 mb-1">Min Increment:</span>
              <div className="text-xl font-semibold text-black">₹{auction.min_increment}</div>
            </div>
            <div>
              <span className={cn(
                adminStyles.badge,
                auction.status === 'live' ? adminStyles.badgeLive :
                  auction.status === 'draft' ? adminStyles.badgeDraft :
                    adminStyles.badgeEnded
              )}>
                {auction.status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div className={cn(adminStyles.card, "flex flex-col justify-center items-center text-center")}>
          {bids.length > 0 ? (
            <>
              <div className={cn(
                "text-sm uppercase font-extrabold tracking-widest mb-4",
                auction.status === 'ended' ? 'text-green-600' : 'text-orange-500'
              )}>
                {auction.status === 'ended' ? '🎉 WINNER 🎉' : '🔥 HIGHEST BID 🔥'}
              </div>
              <div className="text-2xl font-semibold mb-2 text-black">
                {bids[0].bidders.name}
              </div>
              <div className="text-base text-green-600 font-medium mb-3">
                📞 {bids[0].bidders.phone}
              </div>
              <div className="text-5xl font-black text-black mb-2">
                ₹{bids[0].amount.toFixed(2)}
              </div>
              <div className="text-gray-600">
                {bids.length} total bids
              </div>
            </>
          ) : (
            <>
              <div className="text-base text-gray-600 mb-2">Current Status</div>
              <div className="text-2xl font-bold text-gray-400">
                No bids yet
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Registered Bidders */}
        <div className={adminStyles.card}>
          <h2 className="text-xl font-bold text-black mb-6">Registered Bidders ({bidders.length})</h2>
          <div className="max-h-96 overflow-y-auto">
            {bidders.length === 0 ? (
              <p className="text-gray-600">No bidders registered yet.</p>
            ) : (
              <table className={adminStyles.table}>
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
                        className={isHighestBidder ? 'bg-orange-50' : ''}
                      >
                        <td>
                          <div className={isHighestBidder ? 'font-bold' : ''}>
                            {bidder.name} {isHighestBidder && '🏆'}
                          </div>
                          <div className="text-sm text-green-600 font-medium">📞 {bidder.phone}</div>
                          <div className="text-xs text-gray-600">{bidder.email}</div>
                          <div className="text-xs text-gray-400">{bidder.id.substring(0, 8)}...</div>
                        </td>
                        <td className="font-bold text-lg">
                          {bidder.highest_bid !== null ? (
                            <span className={isHighestBidder ? 'text-orange-500' : ''}>
                              ₹{bidder.highest_bid.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm italic">No bid</span>
                          )}
                        </td>
                        <td className="text-sm text-gray-600">
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
        <div className={adminStyles.card}>
          <h2 className="text-xl font-bold text-black mb-6">Bid History ({bids.length})</h2>
          <div className="max-h-96 overflow-y-auto">
            {bids.length === 0 ? (
              <p className="text-gray-600">No bids placed yet.</p>
            ) : (
              <table className={adminStyles.table}>
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
                      className={index === 0 ? 'bg-orange-50' : ''}
                    >
                      <td className="font-bold">
                        {index === 0 ? '🏆 #1' : `#${index + 1}`}
                      </td>
                      <td>
                        <div className="font-medium">{bid.bidders.name}</div>
                        <div className="text-xs text-green-600">📞 {bid.bidders.phone}</div>
                      </td>
                      <td className={cn("font-bold text-lg", index === 0 ? 'text-orange-500' : '')}>
                        ₹{bid.amount.toFixed(2)}
                      </td>
                      <td className="text-sm text-gray-600">
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
