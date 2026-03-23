'use client'

import { type ReactNode, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

const logoSrc = '/logo.png'

export default function PublicShell({ children }: { children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="relative min-h-screen bg-cream text-text font-body selection:bg-primary/20">
      <header className="sticky top-0 z-50 p-2 lg:p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3 bg-white/90 backdrop-blur-md border border-secondary/20 shadow-sm rounded-xl">
          <a href="https://induheritage.com" className="flex items-center gap-2 flex-shrink-0">
            <span className="flex items-center gap-2">
              <Image src={logoSrc} alt="Indu Heritage" width={215} height={178} className="h-10 w-auto" priority />
              <span className="sr-only">Indu Heritage</span>
            </span>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/auctions" className="text-xs font-bold uppercase tracking-widest text-text/80 hover:text-primary transition-colors font-display">
              Live Auction
            </Link>
            <Link href="/#auction-rules" className="text-xs font-bold uppercase tracking-widest text-text/80 hover:text-primary transition-colors font-display">
              Auction Rules
            </Link>
          </nav>

          {/* Mobile Navigation Toggle */}
          <div className="md:hidden relative">
            <button
              className={`flex items-center gap-2 px-3 py-2 bg-white border rounded text-xs font-bold uppercase tracking-widest transition-colors ${isMenuOpen
                ? 'border-primary text-primary'
                : 'border-secondary/30 text-text/60 hover:text-text'
                }`}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              <span>Menu</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {isMenuOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </>
                ) : (
                  <>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                  </>
                )}
              </svg>
            </button>

            {isMenuOpen && (
              <nav className="absolute top-full right-0 mt-2 w-56 bg-white border border-secondary/20 rounded-lg shadow-xl flex flex-col p-2 z-50 animate-in fade-in slide-in-from-top-2">
                <Link
                  href="/auctions"
                  className="px-4 py-3 text-sm font-medium text-text hover:bg-primary/5 hover:text-primary rounded-md transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Live Auction
                </Link>
                <Link
                  href="/#auction-rules"
                  className="px-4 py-3 text-sm font-medium text-text hover:bg-primary/5 hover:text-primary rounded-md transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Auction Rules
                </Link>
              </nav>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="border-t border-secondary/30 py-8 lg:py-16 mt-10 lg:mt-20 bg-primary/5 text-text/80">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-start gap-8 lg:gap-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Image src={logoSrc} alt="Indu Heritage" width={215} height={178} className="h-8 w-auto opacity-80" />
              <span className="sr-only">Indu Heritage</span>
            </div>
            <p className="text-sm text-text/70 max-w-xs leading-relaxed font-body">
              Cozy, premium womenswear auctions with verified, real-time bidding.
            </p>
          </div>
          <div className="flex flex-col gap-4 text-sm font-medium font-display tracking-wide">
            <Link href="/auctions" className="hover:text-primary transition-colors">Live Auction</Link>
            <Link href="/#auction-rules" className="hover:text-primary transition-colors">Auction Rules</Link>
            <a href="https://induheritage.com" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
              Shop Indu Heritage
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
