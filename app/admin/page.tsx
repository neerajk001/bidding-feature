'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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
      <div style={{ textAlign: 'center', padding: '4rem', color: '#6b7280' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        Loading dashboard...
      </div>
    )
  }

  return (
    <div>
      {/* Dashboard Header */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h1 className="admin-section-title" style={{ marginBottom: '0.5rem' }}>
          Dashboard
        </h1>
        <p style={{ color: '#6b7280', fontSize: '1.05rem' }}>
          Welcome to your admin control center
        </p>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="admin-card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, #fff5ed 0%, #ffffff 100%)', borderColor: '#FF6B35' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎯</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#000', marginBottom: '0.25rem' }}>
            {stats.totalAuctions}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 600 }}>Total Auctions</div>
        </div>

        <div className="admin-card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)', borderColor: '#ef4444' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔴</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#000', marginBottom: '0.25rem' }}>
            {stats.liveAuctions}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 600 }}>Live Now</div>
        </div>

        <div className="admin-card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, #dcfce7 0%, #ffffff 100%)', borderColor: '#16a34a' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏆</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#000', marginBottom: '0.25rem' }}>
            {stats.recentWinners}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 600 }}>Winners</div>
        </div>

        <div className="admin-card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, #dbeafe 0%, #ffffff 100%)', borderColor: '#3b82f6' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>👥</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#000', marginBottom: '0.25rem' }}>
            {stats.totalBidders}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 600 }}>Bidders</div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        <div className="admin-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Draft Auctions
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#000' }}>
            {stats.draftAuctions}
          </div>
        </div>

        <div className="admin-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Ended Auctions
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#000' }}>
            {stats.endedAuctions}
          </div>
        </div>

        <div className="admin-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Bids
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#000' }}>
            {stats.totalBids}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: '#000' }}>
          Quick Actions
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="admin-card"
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
      <div className="admin-card" style={{ marginTop: '2rem', background: '#fafafa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '1.5rem' }}>💡</div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#000', marginBottom: '0.25rem' }}>
              Quick Tip
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>
              Click on any card above to navigate to that section. You can also use the navigation menu at the top.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
