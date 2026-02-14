'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface ShopifyDrop {
  id: string
  title: string
  description: string
  price: string
  link_url: string
  image_url?: string | null
  tone: 'ochre' | 'rose' | 'forest'
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function ShopifyDropsPage() {
  const [drops, setDrops] = useState<ShopifyDrop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingDrop, setEditingDrop] = useState<ShopifyDrop | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    link_url: '',
    image_url: '',
    tone: 'ochre' as 'ochre' | 'rose' | 'forest',
    display_order: 0,
    is_active: true,
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetchDrops()
  }, [])

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setFormData((prev) => ({ ...prev, image_url: result }))
      setMessage({ type: 'success', text: 'Image loaded successfully.' })
    }
    reader.onerror = () => {
      setMessage({ type: 'error', text: 'Failed to read image file.' })
    }
    reader.readAsDataURL(file)
  }

  const fetchDrops = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/shopify-drops')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch drops')
      }

      setDrops(data.drops || [])
      setError('')
    } catch (err: any) {
      console.error('Error fetching drops:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      const url = '/api/admin/shopify-drops'
      const method = editingDrop ? 'PATCH' : 'POST'
      const body = editingDrop
        ? { id: editingDrop.id, ...formData }
        : formData

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save drop')
      }

      setMessage({ type: 'success', text: data.message || 'Drop saved successfully!' })
      resetForm()
      fetchDrops()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this drop?')) return

    try {
      const response = await fetch(`/api/admin/shopify-drops?id=${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete drop')
      }

      setMessage({ type: 'success', text: 'Drop deleted successfully!' })
      fetchDrops()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const handleEdit = (drop: ShopifyDrop) => {
    setEditingDrop(drop)
    setFormData({
      title: drop.title,
      description: drop.description,
      price: drop.price,
      link_url: drop.link_url,
      image_url: drop.image_url || '',
      tone: drop.tone,
      display_order: drop.display_order,
      is_active: drop.is_active,
    })
    setShowForm(true)
    setMessage(null)
  }

  const resetForm = () => {
    setEditingDrop(null)
    setFormData({
      title: '',
      description: '',
      price: '',
      link_url: '',
      image_url: '',
      tone: 'ochre',
      display_order: 0,
      is_active: true,
    })
    setShowForm(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    })
  }

  if (loading) {
    return (
      <div className="admin-container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ fontSize: '1.2rem', color: '#666' }}>Loading Shopify drops...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-container">
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 className="admin-title">Shopify Drops</h1>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => {
                if (showForm) {
                  resetForm()
                } else {
                  setShowForm(true)
                  setMessage(null)
                }
              }}
              className={`admin-btn ${showForm ? 'admin-btn-outline' : 'admin-btn-primary'}`}
            >
              {showForm ? 'Cancel' : '+ Add New Drop'}
            </button>
            <Link href="/admin" className="admin-btn-secondary">
              Back to Dashboard
            </Link>
          </div>
        </div>

        {error && (
          <div className="admin-alert admin-alert-error">
            {error}
          </div>
        )}

        {message && (
          <div className={`admin-alert admin-alert-${message.type}`}>
            {message.text}
          </div>
        )}

        {showForm && (
          <div className="admin-card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: '600', color: '#333' }}>
              {editingDrop ? 'Edit Shopify Drop' : 'Add New Shopify Drop'}
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                <div className="admin-form-group">
                  <label htmlFor="title" className="admin-label">Title *</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    className="admin-input"
                    placeholder="e.g., Banarasi Brocade Edit"
                    required
                  />
                </div>

                <div className="admin-form-group">
                  <label htmlFor="description" className="admin-label">Description *</label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    className="admin-textarea"
                    rows={3}
                    placeholder="Describe the collection..."
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="admin-form-group">
                    <label htmlFor="price" className="admin-label">Price *</label>
                    <input
                      type="text"
                      id="price"
                      name="price"
                      value={formData.price}
                      onChange={handleChange}
                      className="admin-input"
                      placeholder="e.g., From INR 12,900"
                      required
                    />
                  </div>

                  <div className="admin-form-group">
                    <label htmlFor="tone" className="admin-label">Color Tone</label>
                    <select
                      id="tone"
                      name="tone"
                      value={formData.tone}
                      onChange={handleChange}
                      className="admin-input"
                    >
                      <option value="ochre">Ochre (Warm Yellow/Orange)</option>
                      <option value="rose">Rose (Pink)</option>
                      <option value="forest">Forest (Green)</option>
                    </select>
                  </div>
                </div>

                <div className="admin-form-group">
                  <label htmlFor="link_url" className="admin-label">Link URL *</label>
                  <input
                    type="url"
                    id="link_url"
                    name="link_url"
                    value={formData.link_url}
                    onChange={handleChange}
                    className="admin-input"
                    placeholder="https://induheritage.com/collection"
                    required
                  />
                  <span className="admin-helper-text">Full URL where users will be redirected when they click</span>
                </div>

                <div className="admin-form-group">
                  <label htmlFor="image_url" className="admin-label">Image (Optional)</label>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <input
                      type="url"
                      id="image_url"
                      name="image_url"
                      value={formData.image_url}
                      onChange={handleChange}
                      className="admin-input"
                      placeholder="https://example.com/image.jpg"
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="admin-file-input"
                      />
                      {formData.image_url && (
                        <button
                          type="button"
                          className="admin-btn admin-btn-outline"
                          onClick={() => setFormData((prev) => ({ ...prev, image_url: '' }))}
                        >
                          Clear image
                        </button>
                      )}
                    </div>
                    <span className="admin-helper-text">
                      Paste a URL or upload from your device. Max 2MB.
                    </span>
                    {formData.image_url && (
                      <img
                        src={formData.image_url}
                        alt="Preview"
                        className="admin-image-preview"
                        style={{ maxWidth: '100%', height: 'auto', maxHeight: '200px', objectFit: 'contain' }}
                      />
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="admin-form-group">
                    <label htmlFor="display_order" className="admin-label">Display Order</label>
                    <input
                      type="number"
                      id="display_order"
                      name="display_order"
                      value={formData.display_order}
                      onChange={handleChange}
                      className="admin-input"
                      placeholder="0"
                    />
                    <span className="admin-helper-text">Lower numbers appear first</span>
                  </div>

                  <div className="admin-form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        name="is_active"
                        checked={formData.is_active}
                        onChange={handleChange}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span className="admin-label" style={{ marginBottom: 0 }}>Active (visible on site)</span>
                    </label>
                  </div>
                </div>

                <div className="admin-form-actions">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="admin-btn admin-btn-outline"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="admin-btn admin-btn-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Saving...' : editingDrop ? 'Update Drop' : 'Create Drop'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {!error && drops.length === 0 && !showForm && (
          <div className="admin-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛍️</div>
            <h3 style={{ marginBottom: '0.5rem', color: '#333' }}>No Shopify Drops Yet</h3>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>Create your first drop to showcase on the landing page.</p>
            <button onClick={() => setShowForm(true)} className="admin-btn admin-btn-primary">
              + Add New Drop
            </button>
          </div>
        )}

        {drops.length > 0 && (
          <div className="admin-card">
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#333' }}>
                Total Drops: {drops.length}
              </h2>
            </div>

            <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {drops.map((drop) => (
                <div
                  key={drop.id}
                  style={{
                    border: '1px solid #000',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    background: drop.tone === 'ochre' ? 'linear-gradient(135deg, #fff8ee, #f4e1c6)' :
                                drop.tone === 'rose' ? 'linear-gradient(135deg, #fff5f5, #f2d6d2)' :
                                'linear-gradient(135deg, #f7faf5, #dbe8d3)',
                    position: 'relative',
                  }}
                >
                  {!drop.is_active && (
                    <div style={{
                      position: 'absolute',
                      top: '0.75rem',
                      right: '0.75rem',
                      background: '#999',
                      color: 'white',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '999px',
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      letterSpacing: '0.05em',
                    }}>
                      INACTIVE
                    </div>
                  )}

                  {drop.image_url && (
                    <div style={{ marginBottom: '1rem', position: 'relative', height: '150px', borderRadius: '8px', overflow: 'hidden' }}>
                      <Image src={drop.image_url} alt={drop.title} fill style={{ objectFit: 'cover' }} />
                    </div>
                  )}

                  <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      background: 'rgba(0,0,0,0.08)',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '999px',
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                    }}>
                      Shopify Drop
                    </span>
                    <span style={{ fontWeight: '700', color: '#8B4513', fontSize: '0.95rem' }}>
                      {drop.price}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem', color: '#2a1a12' }}>
                    {drop.title}
                  </h3>

                  <p style={{ fontSize: '0.9rem', color: '#6b4b3f', marginBottom: '1rem', lineHeight: '1.5' }}>
                    {drop.description}
                  </p>

                  <div style={{ fontSize: '0.75rem', color: '#999', marginBottom: '1rem' }}>
                    Order: {drop.display_order} | Tone: {drop.tone}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleEdit(drop)}
                      className="admin-btn-secondary"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', flex: '1', minWidth: '100px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(drop.id)}
                      className="admin-btn admin-btn-danger"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
