'use client'

import { useState, FormEvent, useEffect } from 'react'
import Link from 'next/link'

interface Auction {
  id: string
  title: string
  product_id: string
  status: string
  bidding_start_time: string
  bidding_end_time: string
  min_increment: number
}

export default function AdminAuctionsPage() {
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    product_id: '',
    min_increment: '',
    registration_end_time: '',
    bidding_start_time: '',
    bidding_end_time: '',
    status: 'draft'
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetchAuctions()
  }, [])

  const fetchAuctions = async () => {
    try {
      const response = await fetch('/api/admin/auctions')
      const data = await response.json()
      if (data.auctions) {
        setAuctions(data.auctions)
      }
    } catch (error) {
      console.error('Failed to fetch auctions:', error)
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/auctions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          min_increment: parseFloat(formData.min_increment),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create auction')
      }

      setMessage({ type: 'success', text: 'Auction created successfully!' })
      // Reset form
      setFormData({
        title: '',
        product_id: '',
        min_increment: '',
        registration_end_time: '',
        bidding_start_time: '',
        bidding_end_time: '',
        status: 'draft'
      })
      setShowForm(false)
      fetchAuctions() // Refresh the list
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }


  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', background: 'linear-gradient(to right, #fff, #999)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Auction Management
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`btn ${showForm ? 'btn-outline' : 'btn-primary'}`}
        >
          {showForm ? 'View All Auctions' : '+ Create New Auction'}
        </button>
      </div>

      {message && (
        <div style={{
          padding: '1rem',
          marginBottom: '1.5rem',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: message?.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
          color: message?.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
          border: `1px solid ${message?.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
        }}>
          {message?.text}
        </div>
      )}

      {!showForm ? (
        <div>
          <h2 style={{ marginBottom: '1.5rem', color: 'var(--color-text-secondary)', fontSize: '1.25rem' }}>All Auctions</h2>
          {auctions.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', marginBottom: '1.5rem' }}>No auctions created yet.</p>
              <button onClick={() => setShowForm(true)} className="btn btn-primary">
                Create Your First Auction
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              {auctions.map((auction) => (
                <div key={auction.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{auction.title}</h3>
                      <span className={`badge badge-${auction.status}`}>
                        {auction.status.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'block' }}>Product ID</span>
                        <span style={{ fontFamily: 'monospace' }}>{auction.product_id}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'block' }}>Min Increment</span>
                        <span>${auction.min_increment}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'block' }}>Bidding Window</span>
                        <span style={{ fontSize: '0.9rem' }}>
                          {new Date(auction.bidding_start_time).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/admin/auctions/${auction.id}`}
                    className="btn btn-outline"
                    style={{ marginLeft: '2rem' }}
                  >
                    Manage Auction
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ marginBottom: '2rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
            Create New Auction
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="title">Auction Title</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                placeholder="e.g., Premium Wireless Headphones"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <label htmlFor="product_id">Product ID (Shopify)</label>
                <input
                  type="text"
                  id="product_id"
                  name="product_id"
                  value={formData.product_id}
                  onChange={handleChange}
                  required
                  placeholder="123456789"
                />
              </div>

              <div>
                <label htmlFor="min_increment">Minimum Increment ($)</label>
                <input
                  type="number"
                  id="min_increment"
                  name="min_increment"
                  value={formData.min_increment}
                  onChange={handleChange}
                  required
                  step="0.01"
                  min="0"
                  placeholder="5.00"
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="registration_end_time" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Registration Deadline
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
                  (Click to select date & time)
                </span>
              </label>
              <input
                type="datetime-local"
                id="registration_end_time"
                name="registration_end_time"
                value={formData.registration_end_time}
                onChange={handleChange}
                required
                min={new Date().toISOString().slice(0, 16)}
                style={{ 
                  backgroundColor: 'var(--color-surface)',
                  border: '2px solid var(--color-border)'
                }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Users must register before this time to participate.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <label htmlFor="bidding_start_time" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Bidding Start Time
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
                    (Click to select)
                  </span>
                </label>
                <input
                  type="datetime-local"
                  id="bidding_start_time"
                  name="bidding_start_time"
                  value={formData.bidding_start_time}
                  onChange={handleChange}
                  required
                  min={new Date().toISOString().slice(0, 16)}
                  style={{ 
                    backgroundColor: 'var(--color-surface)',
                    border: '2px solid var(--color-border)'
                  }}
                />
              </div>

              <div>
                <label htmlFor="bidding_end_time" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Bidding End Time
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
                    (Click to select)
                  </span>
                </label>
                <input
                  type="datetime-local"
                  id="bidding_end_time"
                  name="bidding_end_time"
                  value={formData.bidding_end_time}
                  onChange={handleChange}
                  required
                  min={new Date().toISOString().slice(0, 16)}
                  style={{ 
                    backgroundColor: 'var(--color-surface)',
                    border: '2px solid var(--color-border)'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <label htmlFor="status">Initial Status</label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                required
              >
                <option value="draft">Draft (Hidden)</option>
                <option value="live">Live (Active)</option>
                <option value="ended">Ended</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn btn-outline"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary"
                style={{ flex: 2 }}
              >
                {isSubmitting ? 'Creating...' : 'Create Auction'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
