'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchApi } from '@/lib/api'

// --- SVG Icons (Lucide-style) ---
const SVGProps = { xmlns: "http://www.w3.org/2000/svg", width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

const TargetIcon = ({ className = "w-5 h-5" }) => <svg {...SVGProps} className={className}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
const RadioIcon = ({ className = "w-5 h-5", stroke = "currentColor" }) => <svg {...SVGProps} className={className} stroke={stroke}><circle cx="12" cy="12" r="2" /><path d="M4.93 10.93a10 10 0 0 1 14.14 0" /><path d="M2.1 8.1a14 14 0 0 1 19.8 0" /><path d="M7.76 13.76a6 6 0 0 1 8.48 0" /></svg>
const TrophyIcon = ({ className = "w-5 h-5" }) => <svg {...SVGProps} className={className}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
const UsersIcon = ({ className = "w-5 h-5" }) => <svg {...SVGProps} className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
const FileEditIcon = ({ className = "w-5 h-5" }) => <svg {...SVGProps} className={className}><path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v10" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z" /></svg>
const ArchiveIcon = ({ className = "w-5 h-5" }) => <svg {...SVGProps} className={className}><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></svg>
const LayoutGridIcon = ({ className = "w-5 h-5" }) => <svg {...SVGProps} className={className}><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /></svg>
const GavelIcon = ({ className = "w-5 h-5" }) => <svg {...SVGProps} className={className}><path d="m14.5 12.5-8 8a2.11 2.11 0 1 1-3-3l8-8" /><path d="m16 16 6-6" /><path d="m8 8 6-6" /><path d="m9 7 8 8" /><path d="m21 11-8-8" /></svg>
const MailIcon = ({ className = "w-5 h-5" }) => <svg {...SVGProps} className={className}><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
const InfoIcon = ({ className = "w-5 h-5" }) => <svg {...SVGProps} className={className}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
const ArrowRightIcon = ({ className = "w-4 h-4" }) => <svg {...SVGProps} className={className}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>

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
  const [health, setHealth] = useState<{
    ok?: boolean
    backend?: string
    supabase?: string
    message?: string
    hint?: string
  } | null>(null)
  const [emailTriggerLoading, setEmailTriggerLoading] = useState(false)
  const [emailTriggerMessage, setEmailTriggerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchDashboardStats()
    fetchHealth()
  }, [])

  const fetchHealth = async () => {
    try {
      const { data } = await fetchApi<{
        ok?: boolean
        backend?: string
        supabase?: string
        message?: string
        hint?: string
      }>('/api/health')
      setHealth(data)
    } catch {
      setHealth({ ok: false, backend: 'unreachable', message: 'Backend not running. Start it: cd backend && npm run dev' })
    }
  }

  const fetchDashboardStats = async () => {
    try {
      const { ok, data } = await fetchApi<{ stats?: DashboardStats }>('/api/admin/dashboard')
      if (ok && data.stats) setStats(data.stats)
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTriggerWinnerEmails = async () => {
    setEmailTriggerLoading(true)
    setEmailTriggerMessage(null)

    try {
      const response = await fetch('/api/admin/trigger-winner-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to trigger emails')

      if (data.sent === 0 && (data.failed === 0 || data.failed === undefined)) {
        let debugText = 'No winners pending notification'
        if (data.debug?.allWinnersInDb?.length > 0) debugText += ` (DB has ${data.debug.allWinnersInDb.length} winners, all notified)`
        setEmailTriggerMessage({ type: 'success', text: debugText })
      } else {
        let text = `Successfully sent ${data.sent} email(s)`
        if (data.failed > 0) text += `, ${data.failed} failed`
        setEmailTriggerMessage({ type: data.sent > 0 ? 'success' : 'error', text })
      }
    } catch (error) {
      setEmailTriggerMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to trigger emails' })
    } finally {
      setEmailTriggerLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-500">
        <svg className="animate-spin w-8 h-8 mb-4 text-zinc-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p className="text-sm font-medium">Loading dashboard...</p>
      </div>
    )
  }

  const quickActions = [
    { title: 'Manage Auctions', description: 'Create and edit auctions', icon: GavelIcon, href: '/admin/auctions', colorGroup: 'blue' },
    { title: 'Live Auctions', description: 'Active bidding sessions', icon: RadioIcon, href: '/admin/auctions?filter=live', colorGroup: 'red' },
    { title: 'View Winners', description: 'Auction results & payments', icon: TrophyIcon, href: '/admin/winners', colorGroup: 'green' },
    { title: 'Registered Bidders', description: 'Participant database', icon: UsersIcon, href: '/admin/bidders', colorGroup: 'amber' },
  ]

  const getColorClasses = (group: string) => {
    switch (group) {
      case 'blue': return 'bg-blue-50 text-blue-600 border-blue-100'
      case 'red': return 'bg-red-50 text-red-600 border-red-100'
      case 'green': return 'bg-emerald-50 text-emerald-600 border-emerald-100'
      case 'amber': return 'bg-amber-50 text-amber-600 border-amber-100'
      case 'zinc': return 'bg-zinc-100 text-zinc-600 border-zinc-200'
      default: return 'bg-zinc-50 text-zinc-600 border-zinc-100'
    }
  }

  return (
    <div className="max-w-6xl mx-auto pb-24 lg:pb-12 px-4 sm:px-0">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-1 tracking-tight">Dashboard Overview</h1>
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">System performance and core metrics</p>
      </div>

      {health && (
        <div className={`mb-6 sm:mb-8 flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border text-xs sm:text-sm font-medium shadow-sm ${
          health.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className={`w-2 h-2 rounded-full shrink-0 ${health.ok ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
          <span>Backend: {health.backend === 'running' ? 'Active' : 'Offline'}</span>
          <span className="text-emerald-300 hidden sm:inline">·</span>
          <span>Supabase: {health.supabase === 'connected' ? 'Connected' : 'Offline'}</span>
        </div>
      )}

      {/* Metrics Overview */}
      <section className="mb-8 sm:mb-10">
        <h2 className="text-xs sm:text-sm font-bold text-zinc-800 uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
          <TargetIcon className="w-4 h-4 text-zinc-400" />
          Metrics Overview
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

          <div className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex justify-between items-start mb-3 sm:mb-4">
              <span className="text-xs sm:text-sm font-semibold text-zinc-500">Total Auctions</span>
              <GavelIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-zinc-900">{stats.totalAuctions}</div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex justify-between items-start mb-3 sm:mb-4">
              <span className="text-xs sm:text-sm font-semibold text-zinc-500">Live Now</span>
              <RadioIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" stroke="currentColor" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-zinc-900">{stats.liveAuctions}</div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex justify-between items-start mb-3 sm:mb-4">
              <span className="text-xs sm:text-sm font-semibold text-zinc-500">Winners</span>
              <TrophyIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-zinc-900">{stats.recentWinners}</div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex justify-between items-start mb-3 sm:mb-4">
              <span className="text-xs sm:text-sm font-semibold text-zinc-500">Bidders</span>
              <UsersIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-zinc-900">{stats.totalBidders}</div>
          </div>

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-3 sm:mt-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-3 sm:p-4 shadow-sm flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-2.5 bg-zinc-100 rounded-lg text-zinc-500 shrink-0"><FileEditIcon className="w-4 h-4" /></div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Drafts</div>
              <div className="text-lg sm:text-xl font-bold text-zinc-900">{stats.draftAuctions}</div>
            </div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-3 sm:p-4 shadow-sm flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-2.5 bg-zinc-100 rounded-lg text-zinc-500 shrink-0"><ArchiveIcon className="w-4 h-4" /></div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Ended</div>
              <div className="text-lg sm:text-xl font-bold text-zinc-900">{stats.endedAuctions}</div>
            </div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-3 sm:p-4 shadow-sm flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-2.5 bg-zinc-100 rounded-lg text-zinc-500 shrink-0"><LayoutGridIcon className="w-4 h-4" /></div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Total Bids</div>
              <div className="text-lg sm:text-xl font-bold text-zinc-900">{stats.totalBids}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="mb-8 sm:mb-10">
        <h2 className="text-xs sm:text-sm font-bold text-zinc-800 uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
          <RadioIcon className="w-4 h-4 text-zinc-400" />
          Auction Management
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex flex-col justify-between bg-white border border-zinc-200 hover:border-zinc-300 active:border-zinc-400 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md active:shadow-lg transition-all duration-200"
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className={`p-2.5 sm:p-3 rounded-lg border shrink-0 transition-colors ${getColorClasses(action.colorGroup)}`}>
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-zinc-900 mb-1 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                      <span className="break-words">{action.title}</span>
                      <ArrowRightIcon className="w-3.5 h-3.5 shrink-0 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-500 leading-snug">
                      {action.description}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* System Actions */}
      <section>
        <h2 className="text-xs sm:text-sm font-bold text-zinc-800 uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2">
          <MailIcon className="w-4 h-4 text-zinc-400" />
          System Tools
        </h2>
        <div className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-4 sm:gap-6">
          <div className="flex items-start gap-3 sm:gap-4 flex-1">
            <div className="p-2.5 sm:p-3 bg-zinc-100 text-zinc-600 border border-zinc-200 rounded-lg shrink-0">
              <MailIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-zinc-900 mb-1">Trigger Winner Email Notifications</h3>
              <p className="text-xs sm:text-sm text-zinc-500 leading-snug">
                Manually dispatch emails to unpaid winners who haven't been notified yet. The system automatically runs this every 5 minutes in production environments.
              </p>
              {emailTriggerMessage && (
                <div className={`mt-3 px-3 py-2 rounded-md text-xs font-semibold border inline-flex ${emailTriggerMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {emailTriggerMessage.text}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleTriggerWinnerEmails}
            disabled={emailTriggerLoading}
            className="shrink-0 inline-flex justify-center items-center px-4 py-3 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
          >
            {emailTriggerLoading ? (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : null}
            {emailTriggerLoading ? 'Sending Tasks' : 'Dispatch Emails'}
          </button>
        </div>
      </section>

    </div>
  )
}
