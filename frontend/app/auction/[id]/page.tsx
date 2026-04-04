'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import PublicShell from '@/components/public/PublicShell'
import EmailOtpVerification from '@/components/auth/EmailOtpVerification'
import AuctionMediaCarousel from '@/components/public/AuctionMediaCarousel'

interface AuctionDetail {
  id: string
  title: string
  product_id: string
  status: string
  registration_end_time: string
  bidding_start_time: string
  bidding_end_time: string
  min_increment: number
  base_price?: number | null
  banner_image?: string | null
  reel_url?: string | null
  current_highest_bid?: number | null
  total_bids?: number | null
  highest_bidder_name?: string | null
  winner_name?: string | null
  winning_amount?: number | null
  winner_declared_at?: string | null
  winners_by_size?: { size: string | null; winning_amount: number; winner_name?: string | null; declared_at?: string | null }[] | null
  highest_bids_by_size?: { size: string; amount: number; bid_count: number; bidder_name: string | null }[] | null
  available_sizes?: string[] | null
  gallery_images?: string[] | null
  highest_bid_size?: string | null
}

type StatusMessage = { type: 'success' | 'error' | 'info'; text: string }

type VerificationProfile = {
  userId: string
  name: string
  email: string
  phone: string
  idToken?: string
}

export default function AuctionDetailPage() {
  const params = useParams<{ id: string }>()
  const auctionId = params?.id
  const [auction, setAuction] = useState<AuctionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<StatusMessage | null>(null)
  const [bidderId, setBidderId] = useState<string | null>(null)
  const [profile, setProfile] = useState<VerificationProfile | null>(null)
  const [registrationForm, setRegistrationForm] = useState({
    name: '',
    email: '',
    phone: ''
  })
  const [bidAmount, setBidAmount] = useState('')
  const [registrationSubmitting, setRegistrationSubmitting] = useState(false)
  const [bidSubmitting, setBidSubmitting] = useState(false)
  const [now, setNow] = useState(new Date())
  const [selectedSize, setSelectedSize] = useState<string>('')
  const [bidderLockedSize, setBidderLockedSize] = useState<string | null>(null)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadAuction = async () => {
      setLoading(true)
      setError(null)

      try {
        if (!auctionId) {
          throw new Error('Auction ID is missing')
        }

        const res = await fetch(`/api/auction/${auctionId}`, { cache: 'no-store' })
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load auction')
        }

        if (isMounted) {
          setAuction(data)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load auction')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadAuction()
    return () => {
      isMounted = false
    }
  }, [auctionId])

  useEffect(() => {
    if (!auction) return
    const savedBidderId = localStorage.getItem(`bidder_${auction.id}`)
    if (savedBidderId) {
      setBidderId(savedBidderId)
    }

    const savedPhone = localStorage.getItem('auction_user_phone') || ''
    const savedEmail = localStorage.getItem('auction_user_email') || ''
    const savedName = localStorage.getItem('auction_user_name') || ''

    if (!savedPhone && !savedEmail && !savedName) return

    // Prefill forms, but do not auto-mark verification as complete.
    setRegistrationForm({
      name: savedName,
      email: savedEmail,
      phone: savedPhone
    })
  }, [auction])

  const refreshBidderSizeLock = async (auctionIdParam: string, bidderIdParam: string) => {
    try {
      const url = `/api/bidder-size-lock?auction_id=${encodeURIComponent(auctionIdParam)}&bidder_id=${encodeURIComponent(bidderIdParam)}`
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        const locked = String(data?.locked_size ?? '').trim()
        setBidderLockedSize(locked || null)
      }
    } catch {
      // Silent failure: backend still enforces lock in place-bid.
    }
  }

  useEffect(() => {
    if (!auction?.id || !bidderId) {
      setBidderLockedSize(null)
      return
    }
    const sizes = Array.isArray(auction.available_sizes) ? auction.available_sizes : []
    if (sizes.length === 0) {
      setBidderLockedSize(null)
      return
    }
    refreshBidderSizeLock(auction.id, bidderId)
  }, [auction?.id, auction?.available_sizes, bidderId])

  useEffect(() => {
    if (!auction) return
    const sizes = Array.isArray(auction.available_sizes) ? auction.available_sizes : []
    if (sizes.length === 0) return

    if (bidderLockedSize) {
      if (selectedSize !== bidderLockedSize) {
        setSelectedSize(bidderLockedSize)
      }
      return
    }

    if (!selectedSize || !sizes.includes(selectedSize)) {
      setSelectedSize(sizes[0])
    }
  }, [auction, bidderLockedSize, selectedSize])

  // Ref for throttling refresh calls
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const seenBidIdsRef = useRef<Set<string>>(new Set())

  const phase = useMemo(() => {
    if (!auction) return 'loading'
    if (auction.status === 'ended') return 'ended'

    const registrationEnd = new Date(auction.registration_end_time)
    const biddingStart = new Date(auction.bidding_start_time)
    const biddingEnd = new Date(auction.bidding_end_time)

    if (now > biddingEnd) return 'ended'
    if (now >= biddingStart && now <= biddingEnd) return 'live'
    if (now < registrationEnd) return 'registration'
    if (now >= registrationEnd && now < biddingStart) return 'upcoming'
    return 'upcoming'
  }, [auction, now])

  const refreshAuction = useCallback(async () => {
    try {
      if (!auctionId) return
      const res = await fetch(`/api/auction/${auctionId}`, { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        setAuction(data)
      }
    } catch {
      // Silent refresh failure
    }
  }, [auctionId])

  useEffect(() => {
    seenBidIdsRef.current.clear()
  }, [auction?.id])

  useEffect(() => {
    // Subscribe exactly when live phase is active for this client.
    // This avoids missing updates when the page was opened before bidding started.
    const liveAuctionId = auction?.id
    if (!liveAuctionId || phase !== 'live') return

    // Throttle the full refresh to avoid hammering the API
    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) return
      refreshTimeoutRef.current = setTimeout(() => {
        refreshAuction()
        refreshTimeoutRef.current = null
      }, 12000) // Keep DB reads low while still reconciling periodically
    }

    setIsRealtimeConnected(false)
    const channel = supabase
      .channel(`auction-room-${liveAuctionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_id=eq.${liveAuctionId}` },
        (payload: { new: { id?: string; amount: number; size?: string } }) => {
          const newBid = payload.new
          const newBidId = String(newBid.id || '').trim()
          if (newBidId) {
            if (seenBidIdsRef.current.has(newBidId)) return
            seenBidIdsRef.current.add(newBidId)
          }

          // Optimistically update the UI immediately
          setAuction((prev) => {
            if (!prev) return null
            const newAmount = Number(newBid.amount)
            const bidSize = newBid.size ?? undefined

            // Update highest_bids_by_size for multi-size auctions
            let updatedHighestBidsBySize = prev.highest_bids_by_size
            if (bidSize && prev.available_sizes && prev.available_sizes.length > 0) {
              const existingIndex = updatedHighestBidsBySize?.findIndex((b) => b.size === bidSize) ?? -1

              if (existingIndex >= 0 && updatedHighestBidsBySize) {
                // Update existing size entry
                const currentSizeAmount = updatedHighestBidsBySize[existingIndex].amount
                updatedHighestBidsBySize = [...updatedHighestBidsBySize]
                updatedHighestBidsBySize[existingIndex] = {
                  ...updatedHighestBidsBySize[existingIndex],
                  amount: Math.max(currentSizeAmount, newAmount),
                  bid_count: Number(updatedHighestBidsBySize[existingIndex].bid_count || 0) + 1
                }
              } else if (!updatedHighestBidsBySize) {
                // Create new array with this size
                updatedHighestBidsBySize = [{
                  size: bidSize,
                  amount: newAmount,
                  bid_count: 1,
                  bidder_name: null
                }]
              } else {
                // Add new size entry
                updatedHighestBidsBySize = [...updatedHighestBidsBySize, {
                  size: bidSize,
                  amount: newAmount,
                  bid_count: 1,
                  bidder_name: null
                }]
              }
            }

            // If the new bid is higher globally, update display
            const isHigher = newAmount > (prev.current_highest_bid || 0)

            return {
              ...prev,
              current_highest_bid: isHigher ? newAmount : prev.current_highest_bid,
              total_bids: (prev.total_bids || 0) + 1,
              highest_bids_by_size: updatedHighestBidsBySize,
              highest_bidder_name: prev.highest_bidder_name
            }
          })
          scheduleRefresh()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auctions', filter: `id=eq.${liveAuctionId}` },
        (payload: { new: { bidding_end_time: string; status: string } }) => {
          const updatedAuction = payload.new
          setAuction((prev) => {
            if (!prev) return null
            return {
              ...prev,
              bidding_end_time: updatedAuction.bidding_end_time,
              status: updatedAuction.status
            }
          })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtimeConnected(true)
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setIsRealtimeConnected(false)
          // Pull latest data if realtime connection is interrupted.
          refreshAuction()
        }
      })

    return () => {
      setIsRealtimeConnected(false)
      supabase.removeChannel(channel)
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [auction?.id, phase, refreshAuction])

  useEffect(() => {
    if (!auctionId || phase !== 'live' || isRealtimeConnected) return
    const interval = setInterval(() => {
      refreshAuction()
    }, 15000)
    return () => clearInterval(interval)
  }, [auctionId, phase, isRealtimeConnected, refreshAuction])

  const phaseLabel = useMemo(() => {
    if (phase === 'registration') return 'Registration open'
    if (phase === 'upcoming') return 'Bidding soon'
    if (phase === 'live') return 'Auction live'
    if (phase === 'ended') return 'Auction ended'
    return 'Loading'
  }, [phase])

  const countdownTarget = useMemo(() => {
    if (!auction) return null
    if (phase === 'registration') return new Date(auction.registration_end_time)
    if (phase === 'upcoming') return new Date(auction.bidding_start_time)
    if (phase === 'live') return new Date(auction.bidding_end_time)
    return null
  }, [auction, phase])

  const minimumBid = useMemo(() => {
    if (!auction) return 0
    // For multi-size: use highest bid for the SELECTED size only (so Small bid doesn't affect Medium)
    let current = 0
    if (auction.available_sizes && auction.available_sizes.length > 0 && selectedSize) {
      const forSize = auction.highest_bids_by_size?.find((r) => r.size === selectedSize)
      current = forSize?.amount ?? 0
    } else {
      current = auction.current_highest_bid || 0
    }
    // If no bids yet (current = 0), use base_price if set, otherwise use min_increment
    if (current === 0) {
      return auction.base_price || auction.min_increment
    }
    // If there are bids for this size, next bid must be current + min_increment
    return current + auction.min_increment
  }, [auction, selectedSize])

  const handleVerificationSuccess = (userId: string, userInfo: { name: string; email: string; phone?: string }) => {
    const payload: VerificationProfile = {
      userId,
      name: userInfo.name,
      email: userInfo.email,
      phone: userInfo.phone || ''
    }
    setProfile(payload)
    setRegistrationForm({
      name: payload.name,
      email: payload.email,
      phone: payload.phone
    })

    // Store verification details in localStorage
    localStorage.setItem('auction_user_id', userId)
    localStorage.setItem('auction_user_phone', payload.phone)
    localStorage.setItem('auction_user_email', payload.email)
    localStorage.setItem('auction_user_name', payload.name)

    setMessage({ type: 'success', text: 'Email verified. Complete registration to bid.' })
  }

  const handleVerificationError = (errorText: string) => {
    setMessage({ type: 'error', text: errorText })
  }

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!auction) return

    setRegistrationSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/register-bidder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auction_id: auction.id,
          name: registrationForm.name,
          email: registrationForm.email,
          phone: registrationForm.phone,
          user_id: profile?.userId || undefined
        })
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.requires_verification) {
          setProfile(null)
          setMessage({ type: 'error', text: data.message || 'Phone verification required.' })
          return
        }
        throw new Error(data.error || 'Registration failed')
      }

      localStorage.setItem(`bidder_${auction.id}`, data.bidder_id)
      setBidderId(data.bidder_id)
      setMessage({ type: 'success', text: 'Registration complete. You are ready to bid.' })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to register'
      })
    } finally {
      setRegistrationSubmitting(false)
    }
  }

  const handleBidSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!auction || !bidderId) return

    setBidSubmitting(true)
    setMessage(null)

    const amountValue = Number(bidAmount)
    if (!amountValue || amountValue < minimumBid) {
      setMessage({
        type: 'error',
        text: `Bid must be at least ${formatCurrency(minimumBid)}`
      })
      setBidSubmitting(false)
      return
    }

    if (auction.available_sizes && auction.available_sizes.length > 0 && !selectedSize) {
      setMessage({
        type: 'error',
        text: 'Please select a size.'
      })
      setBidSubmitting(false)
      return
    }

    if (bidderLockedSize && selectedSize !== bidderLockedSize) {
      setMessage({
        type: 'error',
        text: `Your size is locked to ${bidderLockedSize}.`
      })
      setBidSubmitting(false)
      return
    }

    try {
      const response = await fetch('/api/place-bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auction_id: auction.id,
          bidder_id: bidderId,
          amount: amountValue,
          size: selectedSize
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to place bid')
      }

      setBidAmount('')
      setMessage({ type: 'success', text: 'Bid placed successfully.' })
      refreshAuction()
      await refreshBidderSizeLock(auction.id, bidderId)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to place bid'
      })
    } finally {
      setBidSubmitting(false)
    }
  }

  const showRegistration = phase === 'registration'
  const showLiveBid = phase === 'live'

  return (
    <PublicShell>
      <section className="py-4 lg:py-12 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <Link href="/auctions" className="hidden lg:inline-flex items-center text-sm font-medium text-zinc-500 hover:text-orange-600 mb-6 gap-1 transition-colors group">
            <span className="group-hover:-translate-x-1 transition-transform">←</span> Back to auctions
          </Link>

          {loading ? (
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm h-[600px] animate-pulse" />
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
          ) : auction ? (
            <>
              {/* Main Layout (mobile-first ordering via CSS order in flex parent) */}
              <div className="flex flex-col gap-4 lg:gap-6 lg:grid lg:grid-cols-[1fr_380px] lg:items-start">

                {/* Left Column - Image & Details */}
                <div className="contents lg:flex lg:flex-col lg:gap-6">

                  {/* Auction Info Card */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 lg:p-6 flex flex-col gap-4 lg:gap-5 order-2 lg:order-none">

                    {/* Header */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex flex-col gap-2">
                        <span className="uppercase tracking-widest text-xs font-bold text-zinc-500">Auction</span>
                        <h1 className="text-xl lg:text-2xl font-bold font-display text-black leading-tight">{auction.title}</h1>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${phase === 'live'
                          ? 'bg-red-500 text-white animate-pulse'
                          : phase === 'ended'
                            ? 'bg-gray-200 text-gray-600'
                            : 'bg-orange-100 text-orange-700'
                          }`}>
                          {phaseLabel}
                        </span>
                      </div>
                    </div>

                    {/* Result / Current Bid Highlight */}
                    <div className="bg-linear-to-br from-orange-50 to-pink-50 border-2 border-orange-200 rounded-lg p-4 lg:p-5">
                      {phase === 'ended' && auction.winners_by_size && auction.winners_by_size.length > 0 ? (
                        <div>
                          <span className="text-xs uppercase tracking-wider text-emerald-700 font-bold mb-3 block">Winning bids by size</span>
                          <div className="space-y-1.5">
                            {auction.winners_by_size.map((w) => (
                              <div key={w.size ?? 'one'} className="flex justify-between items-center gap-3 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-emerald-800 bg-white px-2 py-1 rounded border border-emerald-300">
                                    {w.size ? `Size ${w.size}` : 'One size'}
                                  </span>
                                  <span className="font-medium text-gray-900 truncate max-w-[180px]">
                                    {w.winner_name ?? 'Winner TBD'}
                                  </span>
                                </div>
                                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                                  {formatCurrency(w.winning_amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="text-right mt-3 pt-2 border-t border-orange-200">
                            <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Total bids</span>
                            <span className="text-sm font-bold text-black ml-2">{auction.total_bids || 0}</span>
                          </div>
                        </div>
                      ) : auction.highest_bids_by_size && auction.highest_bids_by_size.length > 0 ? (
                        <div>
                          <span className="text-xs uppercase tracking-wider text-orange-700 font-bold mb-3 block">Current Bid by Size</span>
                          <div className="space-y-2">
                            {auction.highest_bids_by_size.map((row) => (
                              <div key={row.size} className="flex justify-between items-center py-2 border-b border-orange-100 last:border-0">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-orange-700 bg-white px-2 py-1 rounded border border-orange-300">Size {row.size}</span>
                                    <span className="text-lg font-bold text-black">{formatCurrency(row.amount)}</span>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1">
                                    {row.bidder_name && <span className="text-xs text-gray-600">Leader: {row.bidder_name}</span>}
                                    <span className="text-xs text-gray-500">• {row.bid_count} {row.bid_count === 1 ? 'bid' : 'bids'}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="text-right mt-3 pt-2 border-t border-orange-200">
                            <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Total bids</span>
                            <span className="text-xl font-bold text-black ml-2">{auction.total_bids || 0}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center gap-4">
                          <div>
                            <span className="text-xs uppercase tracking-wider text-orange-700 font-bold mb-1.5 block">Current Bid</span>
                            <div className="flex items-baseline gap-2.5">
                              <span className="text-2xl lg:text-3xl font-bold text-black">{formatCurrency(auction.current_highest_bid)}</span>
                              {auction.highest_bid_size && (
                                <span className="text-xs px-2 py-1 border border-orange-300 bg-white rounded text-orange-700 font-semibold">
                                  Size: {auction.highest_bid_size}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-600 mt-1.5 block">
                              {auction.highest_bidder_name ? `Leader: ${auction.highest_bidder_name}` : 'Be the first bidder'}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1.5 block">Total bids</span>
                            <span className="text-2xl font-bold text-black">{auction.total_bids || 0}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Product media */}
                  <div className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm order-1 lg:order-none">
                    <div className="aspect-video relative overflow-hidden">
                      <div className="absolute inset-0">
                        <AuctionMediaCarousel
                          banner={auction.banner_image}
                          gallery={auction.gallery_images}
                          reel={auction.reel_url}
                          title={auction.title}
                          fillParent
                        />
                      </div>
                    </div>
                  </div>

                  {/* Additional details / timeline (collapsed by default on mobile) */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 lg:p-6 order-4 lg:order-none">
                    <details className="group">
                      <summary className="list-none flex items-center justify-between gap-3 cursor-pointer select-none">
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Details</h3>
                          <p className="text-xs text-gray-500 mt-1">Base price, increment, and timeline</p>
                        </div>
                        <span className="text-xs font-bold text-orange-600 group-open:hidden">Show</span>
                        <span className="text-xs font-bold text-gray-600 hidden group-open:inline">Hide</span>
                      </summary>

                      <div className="mt-4 flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-4">
                          {auction.base_price && (
                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                              <span className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-1.5 block">Base Price</span>
                              <span className="text-xl font-bold text-black block">{formatCurrency(auction.base_price)}</span>
                            </div>
                          )}
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <span className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-1.5 block">Min Increment</span>
                            <span className="text-xl font-bold text-black block">{formatCurrency(auction.min_increment)}</span>
                          </div>
                        </div>

                        <div className="border-t border-gray-200 pt-4">
                          <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Timeline</h4>
                          <div className="grid grid-cols-1 gap-3">
                            <div className="flex justify-between items-center py-1">
                              <span className="text-xs text-gray-600 font-medium">Registration Ends</span>
                              <span className="text-sm font-semibold text-black">{formatDateTime(auction.registration_end_time)}</span>
                            </div>
                            <div className="flex justify-between items-center py-1">
                              <span className="text-xs text-gray-600 font-medium">Bidding Starts</span>
                              <span className="text-sm font-semibold text-black">{formatDateTime(auction.bidding_start_time)}</span>
                            </div>
                            <div className="flex justify-between items-center py-1">
                              <span className="text-xs text-gray-600 font-medium">Bidding Ends</span>
                              <span className="text-sm font-semibold text-black">{formatDateTime(auction.bidding_end_time)}</span>
                            </div>
                          </div>
                        </div>

                        {countdownTarget && (
                          <div className="bg-black text-white rounded-lg p-4 flex justify-between items-center">
                            <span className="text-xs font-bold uppercase tracking-wider">
                              {phase === 'registration' ? 'Registration closes in' : phase === 'upcoming' ? 'Bidding opens in' : 'Auction ends in'}
                            </span>
                            <span className="text-xl font-bold font-mono">{formatCountdown(countdownTarget, now)}</span>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                </div>

                {/* Right Column - Bidding Panel */}
                <div className="lg:sticky lg:top-24 order-3 lg:order-none">
                  <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg overflow-hidden">

                    {/* Panel Header */}
                    <div className="p-4 lg:p-5 bg-white lg:bg-linear-to-r lg:from-orange-500 lg:to-orange-600 text-gray-900 lg:text-white border-b border-gray-200 lg:border-0">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-base lg:text-xl font-bold">
                          {phase === 'live' ? 'Place Your Bid' : phase === 'ended' ? 'Auction Ended' : 'Register to Bid'}
                        </h2>
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${phase === 'live'
                          ? 'bg-red-500 text-white'
                          : phase === 'ended'
                            ? 'bg-gray-200 text-gray-700'
                            : 'bg-orange-100 text-orange-700'
                          }`}>
                          {phase === 'live' ? 'Live' : phase === 'ended' ? 'Closed' : 'Upcoming'}
                        </span>
                      </div>
                      <p className="hidden lg:block text-sm text-orange-100 mt-1">
                        {phase === 'registration'
                          ? 'Complete verification and register to join'
                          : phase === 'upcoming'
                            ? 'Registration closed. Bidding opens soon'
                            : phase === 'live'
                              ? 'Live bidding in progress'
                              : 'Check back for future auctions'}
                      </p>
                    </div>

                    {/* Panel Content */}
                    <div className="p-5">

                      {/* Messages */}
                      {message && (
                        <div className={`px-4 py-3 rounded-lg text-sm mb-4 ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
                          }`}>
                          {message.text}
                        </div>
                      )}

                      {/* Live Bidding Form */}
                      {showLiveBid && bidderId && (
                        <div className="flex flex-col gap-4">

                          {/* Size Selection */}
                          {auction.available_sizes && auction.available_sizes.length > 0 && (
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">Select Size</label>
                              <div className="flex gap-2 flex-wrap">
                                {auction.available_sizes.map(size => {
                                  const isLockedOut = Boolean(bidderLockedSize) && size !== bidderLockedSize
                                  return (
                                  <button
                                    key={size}
                                    type="button"
                                    onClick={() => {
                                      if (isLockedOut) return
                                      setSelectedSize(size)
                                    }}
                                    disabled={isLockedOut}
                                    className={`px-4 py-2 text-sm rounded-lg font-semibold transition-all border-2 ${selectedSize === size
                                      ? 'bg-orange-500 border-orange-500 text-white'
                                      : isLockedOut
                                        ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-70'
                                        : 'border-gray-300 text-gray-700 hover:border-orange-300 hover:bg-orange-50'
                                      }`}
                                  >
                                    {size}
                                  </button>
                                  )
                                })}
                              </div>
                              {bidderLockedSize && (
                                <p className="text-xs text-orange-700 mt-2 font-medium">
                                  Your size is locked for this auction: {bidderLockedSize}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Bid Amount Form */}
                          <form onSubmit={handleBidSubmit} className="flex flex-col gap-3">
                            <div>
                              <label htmlFor="bid-amount" className="block text-sm font-semibold text-gray-700 mb-2">
                                Your Bid Amount
                              </label>
                              <input
                                id="bid-amount"
                                name="bid-amount"
                                type="number"
                                min={minimumBid}
                                step="0.01"
                                value={bidAmount}
                                onChange={(event) => setBidAmount(event.target.value)}
                                placeholder={`Minimum: ₹${minimumBid}`}
                                required
                                className="w-full px-4 py-3 text-lg font-semibold border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                              />
                              <p className="text-xs text-gray-500 mt-1">Minimum bid: {formatCurrency(minimumBid)}</p>
                            </div>
                            <button
                              type="submit"
                              className="w-full px-6 py-4 bg-linear-to-r from-orange-500 to-orange-600 text-white rounded-lg font-bold text-base hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={bidSubmitting || Boolean(bidderLockedSize && selectedSize !== bidderLockedSize)}
                            >
                              {bidSubmitting ? 'Placing Bid...' : '🔥 Place Bid Now'}
                            </button>
                          </form>

                        </div>
                      )}

                      {/* Live but Not Registered */}
                      {showLiveBid && !bidderId && (
                        <div className="text-center py-8">
                          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">🔒</span>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900 mb-2">Registration Closed</h3>
                          <p className="text-sm text-gray-600">You need to register before bidding goes live to participate.</p>
                        </div>
                      )}

                      {/* Ended State */}
                      {phase === 'ended' && (
                        <div className="text-center py-8">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">🏁</span>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900 mb-2">Auction Complete</h3>
                          {auction.winners_by_size && auction.winners_by_size.length > 0 ? (
                            <div className="text-left space-y-2 mb-6">
                              <p className="text-sm font-semibold text-gray-700">Winners:</p>
                              {auction.winners_by_size.map((w) => (
                                <p key={w.size ?? 'one'} className="text-sm text-gray-800 flex justify-between gap-2">
                                  <span>
                                    {w.size ? `Size ${w.size}` : 'One size'} —{' '}
                                    <span className="font-semibold">{w.winner_name ?? 'TBD'}</span>
                                  </span>
                                  <span className="font-semibold tabular-nums">{formatCurrency(w.winning_amount)}</span>
                                </p>
                              ))}
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-gray-600 mb-1">
                                Final bid:{' '}
                                <span className="font-semibold text-black">
                                  {formatCurrency(auction.current_highest_bid)}
                                </span>
                              </p>
                              <p className="text-sm text-gray-600 mb-6">
                                Winner:{' '}
                                <span className="font-semibold text-black">
                                  {auction.winner_name || auction.highest_bidder_name || 'TBD'}
                                </span>
                              </p>
                            </>
                          )}
                          <Link
                            href="/auctions"
                            className="inline-flex justify-center px-6 py-3 border-2 border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 hover:border-orange-500 hover:text-orange-600 transition-colors"
                          >
                            Browse Other Auctions
                          </Link>
                        </div>
                      )}

                      {/* Registration - OTP Verification */}
                      {showRegistration && !bidderId && !profile && (
                        <div className="flex flex-col gap-4">
                          <EmailOtpVerification
                            auctionId={auction.id}
                            initialValues={registrationForm}
                            onVerificationComplete={handleVerificationSuccess}
                            onError={handleVerificationError}
                          />
                        </div>
                      )}

                      {/* Registration - Complete Form */}
                      {showRegistration && !bidderId && profile && (
                        <form onSubmit={handleRegister} className="flex flex-col gap-4">
                          <div>
                            <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">Full Name</label>
                            <input
                              id="name"
                              name="name"
                              type="text"
                              value={registrationForm.name}
                              onChange={(event) => setRegistrationForm((prev) => ({ ...prev, name: event.target.value }))}
                              required
                              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                            <input
                              id="email"
                              name="email"
                              type="email"
                              value={registrationForm.email}
                              required
                              readOnly
                              className="w-full px-4 py-3 border-2 border-gray-200 bg-gray-50 text-gray-600 rounded-lg cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                            <input
                              id="phone"
                              name="phone"
                              type="tel"
                              value={registrationForm.phone}
                              onChange={(event) => setRegistrationForm((prev) => ({ ...prev, phone: event.target.value }))}
                              required
                              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            />
                          </div>
                          <button
                            type="submit"
                            className="w-full px-6 py-4 bg-linear-to-r from-orange-500 to-orange-600 text-white rounded-lg font-bold text-base hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
                            disabled={registrationSubmitting}
                          >
                            {registrationSubmitting ? 'Registering...' : 'Complete Registration'}
                          </button>
                        </form>
                      )}

                      {/* Registration Confirmed */}
                      {showRegistration && bidderId && (
                        <div className="text-center py-8">
                          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">✓</span>
                          </div>
                          <h3 className="text-lg font-bold text-green-700 mb-2">Registration Confirmed</h3>
                          <p className="text-sm text-gray-600 mb-4">You are registered and ready to bid when the auction opens.</p>
                          {countdownTarget && (
                            <div className="inline-block px-4 py-2 bg-orange-50 text-orange-700 rounded-lg text-sm font-bold uppercase tracking-wider">
                              Bidding starts in {formatCountdown(countdownTarget, now)}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Upcoming - Not Registered */}
                      {phase === 'upcoming' && !bidderId && (
                        <div className="text-center py-8">
                          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">⏰</span>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900 mb-2">Registration Closed</h3>
                          <p className="text-sm text-gray-600">Only registered bidders can participate once bidding opens.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:hidden pt-2">
                <Link
                  href="/auctions"
                  className="inline-flex w-full items-center justify-center px-4 py-3 border-2 border-gray-200 rounded-lg text-sm font-semibold text-gray-800 bg-white hover:bg-gray-50 transition-colors"
                >
                  ← Back to auctions
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </PublicShell>
  )
}

function formatCurrency(value: number | null | undefined) {
  if (!value && value !== 0) return '₹0.00'
  return `₹${Number(value).toFixed(2)}`
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return 'TBD'
  }
}

function formatCountdown(target: Date, now: Date) {
  const totalMs = Math.max(target.getTime() - now.getTime(), 0)
  const seconds = Math.floor(totalMs / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  parts.push(`${hours.toString().padStart(2, '0')}h`)
  parts.push(`${minutes.toString().padStart(2, '0')}m`)
  parts.push(`${remainingSeconds.toString().padStart(2, '0')}s`)
  return parts.join(' ')
}
