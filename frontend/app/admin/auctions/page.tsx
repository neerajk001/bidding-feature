'use client'

import { useState, FormEvent, useEffect } from 'react'
import Link from 'next/link'
import { adminStyles, cn } from '@/lib/admin-styles'
import { fetchApi, parseJsonFromResponse } from '@/lib/api'

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'live' | 'ended'>('all')
  const [formData, setFormData] = useState({
    title: '',
    product_id: '',
    min_increment: '',
    base_price: '',
    banner_image: '',
    registration_end_time: '',
    bidding_start_time: '',
    bidding_end_time: '',
    status: 'draft',
    available_sizes: ''
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reelFile, setReelFile] = useState<File | null>(null)
  const [reelPreview, setReelPreview] = useState<string>('')

  useEffect(() => {
    fetchAuctions()
  }, [])

  const fetchAuctions = async () => {
    try {
      const { ok, data } = await fetchApi<{ auctions?: Auction[] }>('/api/admin/auctions')
      if (ok && data.auctions) {
        setAuctions(data.auctions)
      }
    } catch (error) {
      console.error('Failed to fetch auctions:', error)
    }
  }

  const handleDeleteAuction = async (auctionId: string, auctionTitle: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete the auction "${auctionTitle}"?\n\nThis action cannot be undone.`
    )
    
    if (!confirmed) return

    try {
      const response = await fetch(`/api/admin/auctions/${auctionId}`, {
        method: 'DELETE'
      })

      const data = await parseJsonFromResponse<{ success?: boolean; error?: string }>(response)

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete auction')
      }

      setMessage({ type: 'success', text: 'Auction deleted successfully!' })
      fetchAuctions() // Refresh the list
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to delete auction'
      })
    }
  }

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    // 1. Get signed URL from backend
    let res: Response
    try {
      res = await fetch('/api/admin/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          type: file.type,
          folder
        })
      })
    } catch (err: any) {
      const msg = err?.message?.toLowerCase?.() || ''
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed'))
        throw new Error('Upload service unavailable. Start the backend (port 3001): cd backend && npm run dev')
      throw err
    }

    if (!res.ok) {
      const hint = res.status === 502 || res.status === 504 || res.status === 0
        ? ' Ensure the backend is running: cd backend && npm run dev'
        : ''
      throw new Error(`Failed to get upload URL (${res.status})${hint}`)
    }
    const { signedUrl, publicUrl } = await parseJsonFromResponse<{ signedUrl: string; publicUrl: string }>(res)

    // 2. Upload file directly to storage
    const uploadRes = await fetch(signedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type
      }
    })

    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.statusText}`)

    return publicUrl
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      let reelUrl = ''
      if (reelFile) {
        setMessage({ type: 'info', text: 'Uploading reel video (this may take a moment)...' })
        reelUrl = await uploadFile(reelFile, 'reels')
      }

      const uploadedGalleryUrls: string[] = []
      if (galleryFiles.length > 0) {
        setMessage({ type: 'info', text: `Uploading ${galleryFiles.length} gallery images...` })
        for (const file of galleryFiles) {
          const url = await uploadFile(file, 'gallery')
          uploadedGalleryUrls.push(url)
        }
      }

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
      body.append('available_sizes', formData.available_sizes)

      if (formData.banner_image) {
        body.append('banner_image', formData.banner_image)
      }

      // Append uploaded URLs
      if (reelUrl) {
        body.append('reel_url', reelUrl)
      }

      uploadedGalleryUrls.forEach(url => {
        body.append('gallery_urls', url)
      })

      const response = await fetch('/api/admin/auctions', {
        method: 'POST',
        body
      })

      const data = await parseJsonFromResponse<{ auction?: unknown; error?: string }>(response)

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
        status: 'draft',
        available_sizes: ''
      })
      setReelFile(null)
      if (reelPreview) {
        URL.revokeObjectURL(reelPreview)
        setReelPreview('')
      }

      // Clear gallery
      galleryPreviews.forEach(url => URL.revokeObjectURL(url))
      setGalleryFiles([])
      setGalleryPreviews([])

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

  const [galleryFiles, setGalleryFiles] = useState<File[]>([])
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([])

  const handleGalleryFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newFiles: File[] = []
    const newPreviews: string[] = []

    // Max 5 images total including existing
    const currentCount = galleryFiles.length
    const maxAllowed = 5
    const remainingSlots = maxAllowed - currentCount

    if (remainingSlots <= 0) {
      setMessage({ type: 'error', text: 'Maximum 5 gallery images allowed.' })
      return
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots)

    filesToProcess.forEach(file => {
      if (!file.type.startsWith('image/')) return
      if (file.size > 5 * 1024 * 1024) return // 5MB limit

      newFiles.push(file)
      newPreviews.push(URL.createObjectURL(file))
    })

    if (newFiles.length < files.length) {
      setMessage({ type: 'success', text: `Added ${newFiles.length} images. Some were skipped (limit 5 or invalid).` })
    } else {
      setMessage({ type: 'success', text: `Added ${newFiles.length} images to gallery.` })
    }

    setGalleryFiles(prev => [...prev, ...newFiles])
    setGalleryPreviews(prev => [...prev, ...newPreviews])
  }

  const removeGalleryImage = (index: number) => {
    setGalleryFiles(prev => prev.filter((_, i) => i !== index))

    // Revoke URL to avoid memory leak
    URL.revokeObjectURL(galleryPreviews[index])
    setGalleryPreviews(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="pb-24 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 lg:mb-8">
        <h1 className={adminStyles.sectionTitle}>
          Auction Management
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className={cn(adminStyles.btn, showForm ? adminStyles.btnOutline : adminStyles.btnPrimary, 'w-full sm:w-auto')}
        >
          {showForm ? 'View All Auctions' : '+ Create New Auction'}
        </button>
      </div>

      {message && (
        <div className={cn(adminStyles.alert, message.type === 'success' ? adminStyles.alertSuccess : message.type === 'info' ? adminStyles.alertInfo : adminStyles.alertError)}>
          {message.text}
        </div>
      )}

      {!showForm ? (
        <div>
          {/* Filter Tabs */}
          <div className="mb-6">
            <div className="flex flex-wrap gap-2 border-b border-gray-200 overflow-x-auto">
              {[
                { key: 'all', label: 'All Auctions', count: auctions.length },
                { key: 'live', label: 'Live', count: auctions.filter(a => a.status === 'live').length },
                { key: 'draft', label: 'Draft', count: auctions.filter(a => a.status === 'draft').length },
                { key: 'ended', label: 'Ended', count: auctions.filter(a => a.status === 'ended').length },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key as any)}
                  className={`px-3 sm:px-4 py-2.5 sm:py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    statusFilter === tab.key
                      ? 'border-orange-500 text-orange-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 active:border-gray-400'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          </div>

          {auctions.length === 0 ? (
            <div className={adminStyles.emptyState}>
              <p>No auctions created yet.</p>
              <button onClick={() => setShowForm(true)} className={cn(adminStyles.btn, adminStyles.btnPrimary)}>
                Create Your First Auction
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {auctions
                .filter(auction => statusFilter === 'all' || auction.status === statusFilter)
                .map((auction) => (
                <div key={auction.id} className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow overflow-hidden">
                  <div className="flex flex-col lg:flex-row items-stretch">
                    {/* Left: Media Thumbnails */}
                    <div className="lg:w-40 flex lg:flex-col gap-2 p-3 lg:p-0 lg:bg-gray-50 shrink-0 overflow-x-auto lg:overflow-visible">
                      {auction.banner_image && (
                        <img
                          src={auction.banner_image}
                          alt={auction.title}
                          className="w-20 h-20 lg:w-full lg:h-32 object-cover rounded lg:rounded-none lg:rounded-tl-lg border lg:border-0 border-gray-200 shrink-0"
                        />
                      )}
                      {auction.reel_url && (
                        <video
                          src={auction.reel_url}
                          className="w-20 h-20 lg:w-full lg:h-32 object-cover rounded lg:rounded-none border lg:border-0 border-gray-200 shrink-0"
                        />
                      )}
                    </div>

                    {/* Middle: Auction Info - Scrollable on small screens */}
                    <div className="flex-1 min-w-0 overflow-x-auto">
                      <div className="p-4 lg:py-3 lg:px-4">
                        {/* Title and Status Row */}
                        <div className="flex items-center gap-2 mb-3 lg:mb-2">
                          <h3 className="text-base lg:text-lg font-bold text-black whitespace-nowrap">
                            {auction.title}
                          </h3>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${
                            auction.status === 'live' ? 'bg-green-100 text-green-700' :
                            auction.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                            auction.status === 'ended' ? 'bg-red-100 text-red-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {auction.status}
                          </span>
                        </div>

                        {/* Info Row - Horizontal Layout */}
                        <div className="flex items-center gap-4 lg:gap-6 text-sm">
                          <div className="whitespace-nowrap">
                            <span className="text-gray-500 font-semibold">ID:</span>{' '}
                            <span className="font-mono text-black">{auction.product_id}</span>
                          </div>
                          <div className="whitespace-nowrap">
                            <span className="text-gray-500 font-semibold">Min:</span>{' '}
                            <span className="text-black">₹{auction.min_increment}</span>
                          </div>
                          {auction.base_price && (
                            <div className="whitespace-nowrap">
                              <span className="text-gray-500 font-semibold">Base:</span>{' '}
                              <span className="text-black">₹{auction.base_price}</span>
                            </div>
                          )}
                          <div className="whitespace-nowrap">
                            <span className="text-gray-500 font-semibold">Date:</span>{' '}
                            <span className="text-black">
                              {new Date(auction.bidding_start_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex lg:flex-col gap-2 p-3 lg:p-2 border-t lg:border-t-0 lg:border-l border-gray-200 bg-gray-50 lg:bg-white shrink-0">
                      <Link
                        href={`/admin/bidders?auction=${auction.id}`}
                        className="flex-1 lg:flex-initial px-3 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded transition-colors font-medium text-center text-xs whitespace-nowrap"
                        title="View bidders for this auction"
                      >
                        View Bidders
                      </Link>
                      <Link
                        href={`/admin/auctions/${auction.id}`}
                        className="flex-1 lg:flex-initial px-3 py-2 bg-gray-900 hover:bg-gray-800 active:bg-gray-700 text-white rounded transition-colors font-medium text-center text-xs whitespace-nowrap"
                      >
                        Manage
                      </Link>
                      <button
                        onClick={() => handleDeleteAuction(auction.id, auction.title)}
                        className="lg:flex-initial px-3 py-2 text-red-600 hover:text-white hover:bg-red-600 active:bg-red-700 border border-red-600 rounded transition-all font-medium text-xs"
                        title="Delete auction"
                      >
                        <span className="lg:hidden">Delete</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="hidden lg:block h-4 w-4 mx-auto" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={cn(adminStyles.card, 'max-w-4xl mx-auto')}>
          <div className="border-b border-gray-200 pb-4 mb-6">
            <h2 className="text-2xl font-bold text-black">
              Create New Auction
            </h2>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label htmlFor="title" className={adminStyles.label}>Auction Title</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                placeholder="e.g., Premium Heritage Kurti"
                className={adminStyles.input}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label htmlFor="product_id" className={adminStyles.label}>Product ID</label>
                <input
                  type="text"
                  id="product_id"
                  name="product_id"
                  value={formData.product_id}
                  onChange={handleChange}
                  required
                  placeholder="123456789"
                  className={adminStyles.input}
                />
              </div>

              <div>
                <label htmlFor="min_increment" className={adminStyles.label}>Minimum Increment (₹)</label>
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
                  className={adminStyles.input}
                />
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="available_sizes" className={adminStyles.label}>Available Sizes (optional)</label>
              <input
                type="text"
                id="available_sizes"
                name="available_sizes"
                value={formData.available_sizes}
                onChange={handleChange}
                placeholder="S, M, L, XL, XXL"
                className={adminStyles.input}
              />
              <span className="text-xs text-gray-600 mt-1 block">
                Enter available sizes (e.g. S,M,L). If set, users must select one when bidding.
              </span>
            </div>

            <div className="mb-6">
              <label htmlFor="base_price" className={adminStyles.label}>Base Price (₹) - Optional</label>
              <input
                type="number"
                id="base_price"
                name="base_price"
                value={formData.base_price}
                onChange={handleChange}
                step="1"
                min="0"
                placeholder="1000"
                className={adminStyles.input}
              />
              <span className="text-xs text-gray-600 mt-1 block">
                If set, the first bid must be at least this amount. If left empty, auction starts from ₹0.
              </span>
            </div>

            <div className="mb-6">
              <label htmlFor="banner_image" className={adminStyles.label}>Banner Image (optional)</label>
              <div className="flex gap-3 items-start">
                <div className="flex-1">
                  <input
                    type="url"
                    id="banner_image"
                    name="banner_image"
                    value={formData.banner_image}
                    onChange={handleChange}
                    placeholder="https://example.com/image.jpg"
                    className={adminStyles.input}
                  />
                  <div className="flex items-center gap-4 flex-wrap mt-2">
                    <input
                      id="banner_image_upload"
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleBannerFileChange}
                    />
                    <button
                      type="button"
                      className={cn(adminStyles.btn, adminStyles.btnOutline)}
                      onClick={() => document.querySelector<HTMLInputElement>('#banner_image_upload')?.click()}
                    >
                      Upload Image
                    </button>
                    {formData.banner_image && (
                      <button
                        type="button"
                        className={cn(adminStyles.btn, adminStyles.btnOutline)}
                        onClick={() => setFormData((prev) => ({ ...prev, banner_image: '' }))}
                      >
                        Clear image
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-xs text-gray-600 mt-1 block">
                Paste a URL or select from your device gallery. Max 2MB.
              </span>
              {formData.banner_image && (
                <img
                  src={formData.banner_image}
                  alt="Banner preview"
                  className="w-32 h-32 object-cover rounded border border-gray-200 mt-2"
                />
              )}
            </div>

            <div className="mb-6">
              <label className={adminStyles.label}>Gallery Images (Max 5)</label>
              <div className="grid gap-4">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleGalleryFiles}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
                  disabled={galleryFiles.length >= 5}
                />
                <span className="text-xs text-gray-600 mt-1 block">
                  Upload up to 5 additional images for the scrolling gallery.
                </span>

                {galleryPreviews.length > 0 && (
                  <div className="flex gap-4 flex-wrap mt-3">
                    {galleryPreviews.map((src, idx) => (
                      <div key={idx} className="relative w-24 h-24">
                        <img
                          src={src}
                          alt={`Gallery ${idx}`}
                          className="w-full h-full object-cover rounded border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeGalleryImage(idx)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="reel_upload" className={adminStyles.label}>Reel Video (optional)</label>
              <div className="grid gap-3">
                <input
                  id="reel_upload"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={handleReelFileChange}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
                />
                <span className="text-xs text-gray-600 mt-1 block">
                  Upload a short reel (MP4/WebM/MOV). Max 50MB.
                </span>
                {reelPreview && (
                  <video
                    src={reelPreview}
                    controls
                    className="w-48 h-32 object-cover rounded border border-gray-200"
                  />
                )}
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="registration_end_time" className={adminStyles.label}>
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
                className={adminStyles.input}
              />
              <span className="text-xs text-gray-600 mt-1 block">
                Users must register before this time to participate.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label htmlFor="bidding_start_time" className={adminStyles.label}>
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
                  className={adminStyles.input}
                />
              </div>

              <div>
                <label htmlFor="bidding_end_time" className={adminStyles.label}>
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
                  className={adminStyles.input}
                />
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="status" className={adminStyles.label}>Initial Status</label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                required
                className={adminStyles.select}
              >
                <option value="draft">Draft (Hidden)</option>
                <option value="live">Live (Active)</option>
                <option value="ended">Ended</option>
              </select>
            </div>

            <div className="flex gap-4 justify-end pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className={cn(adminStyles.btn, adminStyles.btnOutline)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(adminStyles.btn, adminStyles.btnPrimary)}
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
