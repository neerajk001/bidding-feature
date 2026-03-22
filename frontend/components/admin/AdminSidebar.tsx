'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useState } from 'react'

// SVG Icons
const SVGProps = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
}

const DashboardIcon = () => (
  <svg {...SVGProps}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
)

const AuctionsIcon = () => (
  <svg {...SVGProps}>
    <path d="m14.5 12.5-8 8a2.11 2.11 0 1 1-3-3l8-8" />
    <path d="m16 16 6-6" />
    <path d="m8 8 6-6" />
    <path d="m9 7 8 8" />
    <path d="m21 11-8-8" />
  </svg>
)

const BiddersIcon = () => (
  <svg {...SVGProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const WinnersIcon = () => (
  <svg {...SVGProps}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
)

const SettingsIcon = () => (
  <svg {...SVGProps}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const UserIcon = () => (
  <svg {...SVGProps}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const GlobeIcon = () => (
  <svg {...SVGProps}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
)

const LogoutIcon = () => (
  <svg {...SVGProps}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

const MenuIcon = () => (
  <svg {...SVGProps} width={24} height={24}>
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
)

const CloseIcon = () => (
  <svg {...SVGProps} width={24} height={24}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  badge?: number
}

export default function AdminSidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [isOpen, setIsOpen] = useState(false)

  const primaryItems: NavItem[] = [
    { label: 'Dashboard', href: '/admin', icon: <DashboardIcon /> },
    { label: 'Auctions', href: '/admin/auctions', icon: <AuctionsIcon /> },
    { label: 'Bidders', href: '/admin/bidders', icon: <BiddersIcon /> },
    { label: 'Winners', href: '/admin/winners', icon: <WinnersIcon /> },
  ]

  const secondaryItems: NavItem[] = [
    { label: 'Settings', href: '/admin/settings', icon: <SettingsIcon /> },
  ]

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin'
    }
    return pathname?.startsWith(href)
  }

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href)

    return (
      <Link
        href={item.href}
        onClick={() => setIsOpen(false)}
        className={`mx-2 flex items-center gap-3 rounded-lg px-3.5 py-2.5 transition-all active:scale-95 ${
          active
            ? 'bg-white/10 text-white font-semibold border border-white/15'
            : 'text-slate-300 hover:bg-white/5 hover:text-white'
        }`}
      >
        <span className="shrink-0 opacity-90">{item.icon}</span>
        <span className="text-sm font-medium">{item.label}</span>
        {item.badge && (
          <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {item.badge}
          </span>
        )}
      </Link>
    )
  }

  return (
    <>
      {/* Mobile Menu Button - Fixed at bottom for easier thumb access */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed bottom-6 right-6 z-50 p-4 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-lg transition-all active:scale-95"
        aria-label="Toggle menu"
      >
        {isOpen ? <CloseIcon /> : <MenuIcon />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-60 z-30 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 lg:w-56 bg-slate-950 text-white z-40 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } flex flex-col border-r border-slate-800 shadow-xl`}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sm">IH</span>
              <h1 className="text-base font-semibold tracking-wide text-slate-100">Admin Panel</h1>
            </div>
            {/* Close button for mobile - top corner */}
            <button
              onClick={() => setIsOpen(false)}
              className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Close menu"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto">
          {/* Primary Menu */}
          <div className="py-3 space-y-1">
            {primaryItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-800 my-2 mx-3" />

          {/* Secondary Menu */}
          <div className="py-3 space-y-1">
            {secondaryItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800 py-3">
          {session?.user?.email && (
            <div className="flex items-center gap-2 px-3 py-2 text-slate-400 text-xs">
              <UserIcon />
              <span className="truncate">{session.user.email}</span>
            </div>
          )}
          
          <Link
            href="/"
            onClick={() => setIsOpen(false)}
            className="mx-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-300 hover:bg-white/5 hover:text-white transition-all"
          >
            <GlobeIcon />
            <span className="text-sm font-medium">View Site</span>
          </Link>

          <button
            onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="mx-2 flex items-center gap-3 rounded-lg px-3 py-2.5 w-[calc(100%-1rem)] text-left text-rose-300 hover:bg-white/5 hover:text-rose-200 transition-all"
          >
            <LogoutIcon />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  )
}

