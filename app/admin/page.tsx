'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminStyles } from '@/lib/admin-styles'

interface DashboardStats {
  totalAuctions: number
  liveAuctions: number
  draftAuctions: number
  endedAuctions: number
  totalBidders: number
  totalBids: number
  recentWinners: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalAuctions: 0,
    liveAuctions: 0,
    draftAuctions: 0,
    endedAuctions: 0,
    totalBidders: 0,
    totalBids: 0,
    recentWinners: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  const fetchDashboardStats = async () => {
    try {
      const response = await fetch('/api/admin/dashboard')
      if (response.ok) {
        const data = await response.json()
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const quickActions = [
    {
      title: 'Manage Auctions',
      description: 'Create, edit, and manage all auctions',
      icon: '🔨',
      href: '/admin/auctions',
      color: '#FF6B35'
    },
    {
      title: 'Live Auctions',
      description: 'Monitor active bidding sessions',
      icon: '🔴',
      href: '/admin/auctions?filter=live',
      color: '#ef4444'
    },
    {
      title: 'View Winners',
      description: 'See all auction winners and results',
      icon: '🏆',
      href: '/admin/winners',
      color: '#16a34a'
    },
    {
      title: 'Registered Bidders',
      description: 'View all registered participants',
      icon: '👥',
      href: '/admin/bidders',
      color: '#3b82f6'
    },
    {
      title: 'Past Auctions',
      description: 'Browse ended auction history',
      icon: '📚',
      href: '/admin/auctions?filter=ended',
      color: '#8b5cf6'
    },
    {
      title: 'Draft Auctions',
      description: 'Manage unpublished auctions',
      icon: '📝',
      href: '/admin/auctions?filter=draft',
      color: '#6b7280'
    },
    {
      title: 'Shopify Drops',
      description: 'Manage landing page product drops',
      icon: '🛍️',
      href: '/admin/shopify-drops',
      color: '#f59e0b'
    }
  ]

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-500">
        <div className="text-4xl mb-4">⏳</div>
        Loading dashboard...
      </div>
    )
  }

  return (
    <div>
      {/* Dashboard Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-black mb-2">
          Dashboard
        </h1>
        <p className="text-gray-600 text-lg">
          Welcome to your admin control center
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className={`${adminStyles.card} text-center`} style={{ background: 'linear-gradient(135deg, #fff5ed 0%, #ffffff 100%)', borderColor: '#FF6B35' }}>
          <div className="text-4xl mb-2">🎯</div>
          <div className="text-3xl font-extrabold text-black mb-1">
            {stats.totalAuctions}
          </div>
          <div className="text-sm text-gray-600 font-semibold">Total Auctions</div>
        </div>

        <div className={`${adminStyles.card} text-center`} style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)', borderColor: '#ef4444' }}>
          <div className="text-4xl mb-2">🔴</div>
          <div className="text-3xl font-extrabold text-black mb-1">
            {stats.liveAuctions}
          </div>
          <div className="text-sm text-gray-600 font-semibold">Live Now</div>
        </div>

        <div className={`${adminStyles.card} text-center`} style={{ background: 'linear-gradient(135deg, #dcfce7 0%, #ffffff 100%)', borderColor: '#16a34a' }}>
          <div className="text-4xl mb-2">🏆</div>
          <div className="text-3xl font-extrabold text-black mb-1">
            {stats.recentWinners}
          </div>
          <div className="text-sm text-gray-600 font-semibold">Winners</div>
        </div>

        <div className={`${adminStyles.card} text-center`} style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #ffffff 100%)', borderColor: '#3b82f6' }}>
          <div className="text-4xl mb-2">👥</div>
          <div className="text-3xl font-extrabold text-black mb-1">
            {stats.totalBidders}
          </div>
          <div className="text-sm text-gray-600 font-semibold">Bidders</div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
        <div className={`${adminStyles.card} p-5 text-center`}>
          <div className="text-xs text-gray-600 mb-2 uppercase tracking-wide">
            Draft Auctions
          </div>
          <div className="text-3xl font-bold text-black">
            {stats.draftAuctions}
          </div>
        </div>

        <div className={`${adminStyles.card} p-5 text-center`}>
          <div className="text-xs text-gray-600 mb-2 uppercase tracking-wide">
            Ended Auctions
          </div>
          <div className="text-3xl font-bold text-black">
            {stats.endedAuctions}
          </div>
        </div>

        <div className={`${adminStyles.card} p-5 text-center`}>
          <div className="text-xs text-gray-600 mb-2 uppercase tracking-wide">
            Total Bids
          </div>
          <div className="text-3xl font-bold text-black">
            {stats.totalBids}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-6 text-black">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={adminStyles.card}
              style={{
                textDecoration: 'none',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.12)'
                e.currentTarget.style.borderColor = action.color
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)'
                e.currentTarget.style.borderColor = '#000000'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div
                  style={{
                    fontSize: '2.5rem',
                    width: '60px',
                    height: '60px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '12px',
                    background: `${action.color}15`,
                    border: `2px solid ${action.color}40`
                  }}
                >
                  {action.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: '#000',
                    marginBottom: '0.5rem'
                  }}>
                    {action.title}
                  </h3>
                  <p style={{
                    margin: 0,
                    fontSize: '0.9rem',
                    color: '#6b7280',
                    lineHeight: '1.5'
                  }}>
                    {action.description}
                  </p>
                </div>
                <div style={{
                  fontSize: '1.25rem',
                  color: action.color,
                  marginTop: '0.25rem'
                }}>
                  →
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Additional Info */}
      <div className={adminStyles.card} style={{ marginTop: '2rem', background: '#fafafa' }}>
        <div className="flex items-center gap-4">
          <div className="text-2xl">💡</div>
          <div>
            <h3 className="m-0 text-base font-bold text-black mb-1">
              Quick Tip
            </h3>
            <p className="m-0 text-sm text-gray-600">
              Click on any card above to navigate to that section. You can also use the navigation menu at the top.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
