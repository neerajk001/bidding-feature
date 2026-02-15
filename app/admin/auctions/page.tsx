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
  base_price?: number | null
  banner_image?: string | null
  reel_url?: string | null
}

export default function AdminAuctionsPage() {
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    product_id: '',
    min_increment: '',
    base_price: '',
    banner_image: '',
    registration_end_time: '',
    bidding_start_time: '',
    bidding_end_time: '',
    status: 'draft'
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reelFile, setReelFile] = useState<File | null>(null)
  const [reelPreview, setReelPreview] = useState<string>('')

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
      const body = new FormData()
      body.append('title', formData.title)
      body.append('product_id', formData.product_id)
      body.append('min_increment', formData.min_increment)
      if (formData.base_price) {
        body.append('base_price', formData.base_price)
      }
      body.append('registration_end_time', formData.registration_end_time)
      body.append('bidding_start_time', formData.bidding_start_time)
      body.append('bidding_end_time', formData.bidding_end_time)
      body.append('status', formData.status)

      if (formData.banner_image) {
        body.append('banner_image', formData.banner_image)
      }

      if (reelFile) {
        body.append('reel', reelFile)
      }

      const response = await fetch('/api/admin/auctions', {
        method: 'POST',
        body
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
        base_price: '',
        banner_image: '',
        registration_end_time: '',
        bidding_start_time: '',
        bidding_end_time: '',
        status: 'draft'
      })
      setReelFile(null)
      if (reelPreview) {
        URL.revokeObjectURL(reelPreview)
        setReelPreview('')
      }
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

  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select a valid image file.' })
      return
    }

    const maxSizeMb = 2
    if (file.size > maxSizeMb * 1024 * 1024) {
      setMessage({ type: 'error', text: `Image must be under ${maxSizeMb}MB.` })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result) {
        setMessage({ type: 'error', text: 'Failed to read image file.' })
        return
      }
      setFormData((prev) => ({ ...prev, banner_image: result }))
      setMessage({ type: 'success', text: 'Banner image loaded from device.' })
    }
    reader.onerror = () => {
      setMessage({ type: 'error', text: 'Failed to read image file.' })
    }
    reader.readAsDataURL(file)
  }

  const handleReelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('video/')) {
      setMessage({ type: 'error', text: 'Please select a valid video file.' })
      return
    }

    const maxSizeMb = 50
    if (file.size > maxSizeMb * 1024 * 1024) {
      setMessage({ type: 'error', text: `Video must be under ${maxSizeMb}MB.` })
      return
    }

    if (reelPreview) {
      URL.revokeObjectURL(reelPreview)
    }

    const previewUrl = URL.createObjectURL(file)
    setReelFile(file)
    setReelPreview(previewUrl)
    setMessage({ type: 'success', text: 'Reel video ready to upload.' })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="admin-section-title">
          Auction Management
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`admin-btn ${showForm ? 'admin-btn-outline' : 'admin-btn-primary'}`}
        >
          {showForm ? 'View All Auctions' : '+ Create New Auction'}
        </button>
      </div>

      {message && (
        <div className={`admin-alert ${message.type === 'success' ? 'admin-alert-success' : 'admin-alert-error'}`}>
          {message.text}
        </div>
      )}

      {!showForm ? (
        <div>
          <h2 style={{ marginBottom: '1.5rem', color: '#6b7280', fontSize: '1.25rem', fontWeight: 600 }}>All Auctions</h2>
          {auctions.length === 0 ? (
            <div className="admin-empty-state">
              <p>No auctions created yet.</p>
              <button onClick={() => setShowForm(true)} className="admin-btn admin-btn-primary">
                Create Your First Auction
              </button>
            </div>
          ) : (
            <div className="admin-auction-list">
              {auctions.map((auction) => (
                <div key={auction.id} className="admin-auction-item">
                  <div className="admin-auction-info">
                    <h3 className="admin-auction-title">
                      {auction.title}
                      <span className={`admin-badge admin-badge-${auction.status}`}>
                        {auction.status}
                      </span>
                    </h3>

                    {auction.banner_image && (
                      <div style={{ margin: '0.75rem 0' }}>
                        <img
                          src={auction.banner_image}
                          alt={auction.title}
                          className="admin-image-preview"
                        />
                      </div>
                    )}

                    {auction.reel_url && (
                      <div style={{ margin: '0.75rem 0' }}>
                        <video
                          src={auction.reel_url}
                          controls
                          className="admin-video-preview"
                        />
                      </div>
                    )}

                    <div className="admin-auction-meta">
                      <div className="admin-meta-item">
                        <span className="admin-meta-label">Product ID</span>
                        <span className="admin-meta-value" style={{ fontFamily: 'monospace' }}>{auction.product_id}</span>
                      </div>
                      <div className="admin-meta-item">
                        <span className="admin-meta-label">Min Increment</span>
                        <span className="admin-meta-value">₹{auction.min_increment}</span>
                      </div>
                      {auction.base_price && (
                        <div className="admin-meta-item">
                          <span className="admin-meta-label">Base Price</span>
                          <span className="admin-meta-value">₹{auction.base_price}</span>
                        </div>
                      )}
                      <div className="admin-meta-item">
                        <span className="admin-meta-label">Bidding Window</span>
                        <span className="admin-meta-value">
                          {new Date(auction.bidding_start_time).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/admin/auctions/${auction.id}`}
                    className="admin-btn admin-btn-primary"
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
        <div className="admin-card" style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="admin-card-header">
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
              Create New Auction
            </h2>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="admin-form-group">
              <label htmlFor="title" className="admin-label">Auction Title</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                placeholder="e.g., Premium Heritage Kurti"
                className="admin-input"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div className="admin-form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="product_id" className="admin-label">Product ID (Shopify)</label>
                <input
                  type="text"
                  id="product_id"
                  name="product_id"
                  value={formData.product_id}
                  onChange={handleChange}
                  required
                  placeholder="123456789"
                  className="admin-input"
                />
              </div>

              <div className="admin-form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="min_increment" className="admin-label">Minimum Increment (₹)</label>
                <input
                  type="number"
                  id="min_increment"
                  name="min_increment"
                  value={formData.min_increment}
                  onChange={handleChange}
                  required
                  step="1"
                  min="0"
                  placeholder="50"
                  className="admin-input"
                />
              </div>
            </div>

            <div className="admin-form-group">
              <label htmlFor="base_price" className="admin-label">Base Price (₹) - Optional</label>
              <input
                type="number"
                id="base_price"
                name="base_price"
                value={formData.base_price}
                onChange={handleChange}
                step="1"
                min="0"
                placeholder="Leave empty to start from ₹0"
                className="admin-input"
              />
              <span className="admin-helper-text">
                If set, the first bid must be at least this amount. If left empty, auction starts from ₹0.
              </span>
            </div>

            <div className="admin-form-group">
              <label htmlFor="banner_image" className="admin-label">Banner Image (optional)</label>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <input
                  type="url"
                  id="banner_image"
                  name="banner_image"
                  value={formData.banner_image}
                  onChange={handleChange}
                  placeholder="https://cdn.example.com/banner.jpg"
                  className="admin-input"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBannerFileChange}
                    className="admin-file-input"
                  />
                  {formData.banner_image && (
                    <button
                      type="button"
                      className="admin-btn admin-btn-outline"
                      onClick={() => setFormData((prev) => ({ ...prev, banner_image: '' }))}
                    >
                      Clear image
                    </button>
                  )}
                </div>
                <span className="admin-helper-text">
                  Paste a URL or select from your device gallery. Max 2MB.
                </span>
                {formData.banner_image && (
                  <img
                    src={formData.banner_image}
                    alt="Banner preview"
                    className="admin-image-preview"
                    style={{ maxWidth: '520px', height: '160px' }}
                  />
                )}
              </div>
            </div>

            <div className="admin-form-group">
              <label htmlFor="reel_upload" className="admin-label">Reel Video (optional)</label>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <input
                  id="reel_upload"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={handleReelFileChange}
                  className="admin-file-input"
                />
                <span className="admin-helper-text">
                  Upload a short reel (MP4/WebM/MOV). Max 50MB.
                </span>
                {reelPreview && (
                  <video
                    src={reelPreview}
                    controls
                    className="admin-video-preview"
                    style={{ maxWidth: '520px', height: '220px' }}
                  />
                )}
              </div>
            </div>

            <div className="admin-form-group">
              <label htmlFor="registration_end_time" className="admin-label">
                Registration Deadline
              </label>
              <input
                type="datetime-local"
                id="registration_end_time"
                name="registration_end_time"
                value={formData.registration_end_time}
                onChange={handleChange}
                required
                min={new Date().toISOString().slice(0, 16)}
                className="admin-input"
              />
              <span className="admin-helper-text">
                Users must register before this time to participate.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div className="admin-form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="bidding_start_time" className="admin-label">
                  Bidding Start Time
                </label>
                <input
                  type="datetime-local"
                  id="bidding_start_time"
                  name="bidding_start_time"
                  value={formData.bidding_start_time}
                  onChange={handleChange}
                  required
                  min={new Date().toISOString().slice(0, 16)}
                  className="admin-input"
                />
              </div>

              <div className="admin-form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="bidding_end_time" className="admin-label">
                  Bidding End Time
                </label>
                <input
                  type="datetime-local"
                  id="bidding_end_time"
                  name="bidding_end_time"
                  value={formData.bidding_end_time}
                  onChange={handleChange}
                  required
                  min={new Date().toISOString().slice(0, 16)}
                  className="admin-input"
                />
              </div>
            </div>

            <div className="admin-form-group">
              <label htmlFor="status" className="admin-label">Initial Status</label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                required
                className="admin-select"
              >
                <option value="draft">Draft (Hidden)</option>
                <option value="live">Live (Active)</option>
                <option value="ended">Ended</option>
              </select>
            </div>

            <div className="admin-form-actions">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="admin-btn admin-btn-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="admin-btn admin-btn-primary"
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
