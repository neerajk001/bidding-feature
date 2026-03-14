'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { fetchApi } from '@/lib/api'

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

interface AuctionGroup {
  auction_id: string
  auction_title: string
  auction_status: string
  product_id: string
  bidders: Bidder[]
}

export default function BiddersPage() {
  const searchParams = useSearchParams()
  const auctionIdFromUrl = searchParams.get('auction')
  
  const [bidders, setBidders] = useState<Bidder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedAuctions, setExpandedAuctions] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchBidders()
  }, [])
  
  useEffect(() => {
    if (auctionIdFromUrl && bidders.length > 0) {
      setExpandedAuctions(new Set([auctionIdFromUrl]))
    }
  }, [auctionIdFromUrl, bidders.length])

  const fetchBidders = async () => {
    try {
      setLoading(true)
      const { ok, data } = await fetchApi<{ bidders?: Bidder[]; error?: string }>('/api/admin/bidders')
      if (!ok) {
        throw new Error((data as { error?: string }).error || 'Failed to fetch bidders')
      }

      setBidders(data.bidders || [])
      setError('')
    } catch (err: unknown) {
      console.error('Error fetching bidders:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Group bidders by auction
  const groupedBidders: AuctionGroup[] = bidders.reduce((groups, bidder) => {
    const existingGroup = groups.find(g => g.auction_id === bidder.auction_id)
    
    if (existingGroup) {
      existingGroup.bidders.push(bidder)
    } else {
      groups.push({
        auction_id: bidder.auction_id,
        auction_title: bidder.auction.title,
        auction_status: bidder.auction.status,
        product_id: bidder.auction.product_id,
        bidders: [bidder]
      })
    }
    
    return groups
  }, [] as AuctionGroup[])

  // Apply search filter
  const filteredGroups = groupedBidders
    .map(group => ({
      ...group,
      bidders: group.bidders.filter(b => {
        if (!searchQuery.trim()) return true
        const query = searchQuery.toLowerCase()
        return (
          b.name.toLowerCase().includes(query) ||
          b.phone.includes(query) ||
          b.email?.toLowerCase().includes(query)
        )
      })
    }))
    .filter(group => {
      if (!searchQuery.trim()) return true
      // Also include if auction title matches
      return group.bidders.length > 0 || group.auction_title.toLowerCase().includes(searchQuery.toLowerCase())
    })

  const totalBidders = filteredGroups.reduce((sum, group) => sum + group.bidders.length, 0)

  const toggleAuction = (auctionId: string) => {
    setExpandedAuctions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(auctionId)) {
        newSet.delete(auctionId)
      } else {
        newSet.add(auctionId)
      }
      return newSet
    })
  }

  const toggleAll = () => {
    if (expandedAuctions.size === filteredGroups.length) {
      setExpandedAuctions(new Set())
    } else {
      setExpandedAuctions(new Set(filteredGroups.map(g => g.auction_id)))
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex justify-center items-center h-96">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mb-4"></div>
            <div className="text-lg text-gray-600">Loading bidders...</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Registered Bidders</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Manage and view all bidders grouped by auction</p>
          </div>
          <Link  
            href="/admin" 
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 rounded-lg transition-colors font-medium text-center"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg mb-6">
            <div className="flex gap-3">
              <div className="shrink-0 pt-0.5">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {!error && bidders.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Bidders Yet</h3>
            <p className="text-gray-600">Registered bidders will appear here once users register for auctions.</p>
          </div>
        )}
      </div>

      {bidders.length > 0 && (
        <div>
          {/* Search and Controls */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="w-full">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by name, phone, or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 sm:py-3.5 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                  <svg className="absolute left-3 top-3.5 sm:top-4 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              
              <div className="flex gap-2 sm:gap-3">
                <button
                  onClick={toggleAll}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 rounded-lg transition-colors font-medium text-sm sm:text-base"
                >
                  {expandedAuctions.size === filteredGroups.length ? 'Collapse All' : 'Expand All'}
                </button>
                <div className="px-3 sm:px-4 py-3 bg-orange-50 text-orange-700 rounded-lg font-semibold border border-orange-200 whitespace-nowrap text-sm sm:text-base">
                  {totalBidders} {totalBidders === 1 ? 'Bidder' : 'Bidders'}
                </div>
              </div>
            </div>
          </div>

          {/* Auction Groups */}
          {filteredGroups.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No matches found</h3>
              <p className="text-gray-600">Try adjusting your search query</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((group) => {
                const isExpanded = expandedAuctions.has(group.auction_id)
                const statusColors = {
                  live: 'bg-green-100 text-green-700 border-green-200',
                  ended: 'bg-gray-100 text-gray-700 border-gray-200',
                  draft: 'bg-yellow-100 text-yellow-700 border-yellow-200',
                  upcoming: 'bg-blue-100 text-blue-700 border-blue-200'
                }
                
                return (
                  <div key={group.auction_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    {/* Auction Header - Clickable */}
                    <div 
                      onClick={() => toggleAuction(group.auction_id)}
                      className="p-4 sm:p-5 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`shrink-0 p-2.5 sm:p-3 rounded-lg ${isExpanded ? 'bg-orange-100' : 'bg-gray-100'}`}>
                            <svg className="h-5 w-5 sm:h-6 sm:w-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 break-words">{group.auction_title}</h3>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs sm:text-sm text-gray-600 font-mono">ID: {group.product_id}</span>
                              <span className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-semibold border uppercase ${statusColors[group.auction_status as keyof typeof statusColors] || statusColors.draft}`}>
                                {group.auction_status}
                              </span>
                              <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-orange-500 text-white rounded-md text-[10px] sm:text-xs font-bold">
                                {group.bidders.length} {group.bidders.length === 1 ? 'Bidder' : 'Bidders'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center">
                          <Link
                            href={`/admin/auctions/${group.auction_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-900 hover:bg-gray-800 active:bg-gray-700 text-white rounded-lg transition-colors font-medium text-xs sm:text-sm"
                          >
                            View Auction
                          </Link>
                          <svg 
                            className={`h-5 w-5 sm:h-6 sm:w-6 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Bidders List - Expandable */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 bg-gray-50">
                        {group.bidders.length === 0 ? (
                          <div className="p-8 text-center text-gray-600">
                            No bidders match your search in this auction
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-200">
                            {group.bidders.map((bidder) => (
                              <div key={bidder.id} className="p-4 sm:p-5 hover:bg-white transition-colors">
                                <div className="flex flex-col gap-4">
                                  {/* Bidder Info */}
                                  <div className="flex-1">
                                    <div className="flex items-start gap-3">
                                      <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-orange-100 rounded-full flex items-center justify-center">
                                        <span className="text-orange-700 font-bold text-sm sm:text-base">
                                          {bidder.name.charAt(0).toUpperCase()}
                                        </span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h4 className="text-base sm:text-lg font-bold text-gray-900 mb-2 break-words">{bidder.name}</h4>
                                        <div className="flex flex-col gap-2 text-sm sm:text-base text-gray-600">
                                          <a href={`tel:${bidder.phone}`} className="flex items-center gap-2 hover:text-orange-600 active:text-orange-700 transition-colors">
                                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                            </svg>
                                            <span className="break-all">{bidder.phone}</span>
                                          </a>
                                          {bidder.email && (
                                            <a href={`mailto:${bidder.email}`} className="flex items-center gap-2 hover:text-orange-600 active:text-orange-700 transition-colors">
                                              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                              </svg>
                                              <span className="break-all">{bidder.email}</span>
                                            </a>
                                          )}
                                          <span className="flex items-center gap-2 text-gray-500">
                                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            {new Date(bidder.registered_at).toLocaleDateString('en-IN', {
                                              day: 'numeric',
                                              month: 'short',
                                              year: 'numeric'
                                            })}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Bidder Stats - Full width on mobile */}
                                  <div className="flex gap-6 bg-white border border-gray-200 rounded-lg p-4">
                                    <div className="flex-1 text-center">
                                      <div className="text-2xl sm:text-3xl font-bold text-gray-900">{bidder.bids_count}</div>
                                      <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wide mt-1">Total Bids</div>
                                    </div>
                                    <div className="w-px bg-gray-300"></div>
                                    <div className="flex-1 text-center">
                                      {bidder.highest_bid ? (
                                        <>
                                          <div className="text-2xl sm:text-3xl font-bold text-orange-600">₹{bidder.highest_bid.toLocaleString()}</div>
                                          <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wide mt-1">Highest Bid</div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="text-2xl sm:text-3xl font-bold text-gray-400">—</div>
                                          <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide mt-1">No Bids</div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
