'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Winner {
  id: string
  auction_id: string
  bidder_id: string
  winning_amount: number
  created_at: string
  bidder: {
    name: string
    phone: string
    email?: string
  }
  auction: {
    title: string
    product_id: string
  }
}

export default function WinnersPage() {
  const [winners, setWinners] = useState<Winner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchWinners()
  }, [])

  const fetchWinners = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/winners')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch winners')
      }

      setWinners(data.winners || [])
      setError('')
    } catch (err: any) {
      console.error('Error fetching winners:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ fontSize: '1.2rem', color: '#666' }}>Loading winners...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 className="admin-title">Auction Winners</h1>
          <Link href="/admin" className="admin-btn-secondary">
            Back to Dashboard
          </Link>
        </div>

        {error && (
          <div className="admin-alert admin-alert-error">
            {error}
          </div>
        )}

        {!error && winners.length === 0 && (
          <div className="admin-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏆</div>
            <h3 style={{ marginBottom: '0.5rem', color: '#333' }}>No Winners Yet</h3>
            <p style={{ color: '#666' }}>Winners will appear here once auctions end and winners are determined.</p>
          </div>
        )}

        {winners.length > 0 && (
          <div className="admin-card">
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#333' }}>
                Total Winners: {winners.length}
              </h2>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Winner Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Auction Title</th>
                    <th>Product ID</th>
                    <th>Winning Amount</th>
                    <th>Won At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {winners.map((winner) => (
                    <tr key={winner.id}>
                      <td>
                        <div style={{ fontWeight: '600', color: '#333' }}>
                          {winner.bidder.name}
                        </div>
                      </td>
                      <td>{winner.bidder.phone}</td>
                      <td>{winner.bidder.email || '-'}</td>
                      <td>
                        <div style={{ maxWidth: '250px' }}>
                          {winner.auction.title}
                        </div>
                      </td>
                      <td>{winner.auction.product_id}</td>
                      <td>
                        <div style={{ fontWeight: '700', color: '#FF6B35', fontSize: '1.1rem' }}>
                          ₹{winner.winning_amount.toLocaleString()}
                        </div>
                      </td>
                      <td>
                        {new Date(winner.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td>
                        <Link 
                          href={`/admin/auctions/${winner.auction_id}`}
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
