'use client'

import { type ReactNode, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import logo from './logo.png'
import shopify from './shopify.png'

export default function PublicShell({ children }: { children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="relative min-h-screen bg-gray-50 text-[#2D2420] font-sans">
      <header className="sticky top-0 z-50 p-2 lg:p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur-md border border-zinc-200 shadow-sm rounded-xl">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <span className="flex items-center gap-2">
              <Image src={logo} alt="Indu Heritage" className="h-10 w-auto" priority />
              <span className="sr-only">Indu Heritage</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/auctions" className="text-xs font-bold uppercase tracking-widest text-zinc-600 hover:text-orange-600 transition-colors">
              Auctions
            </Link>
            <a
              href="https://induheritage.com"
              className="group flex items-center gap-2 px-4 py-2 rounded border border-zinc-200 text-xs font-bold uppercase tracking-widest text-zinc-600 transition-colors hover:border-orange-500 hover:text-orange-600 hover:bg-orange-50/50"
              target="_blank"
              rel="noreferrer"
            >
              <span>My Store</span>
              <Image src={shopify} alt="Shopify" width={16} height={16} className="opacity-60 group-hover:opacity-100 transition-opacity" />
            </a>
          </nav>

          {/* Mobile Navigation Toggle */}
          <div className="md:hidden relative">
            <button
              className={`flex items-center gap-2 px-3 py-2 bg-white border rounded text-xs font-bold uppercase tracking-widest transition-colors ${isMenuOpen
                ? 'border-orange-500 text-orange-600'
                : 'border-zinc-200 text-zinc-500 hover:text-zinc-800'
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
              <nav className="absolute top-full right-0 mt-2 w-56 bg-white border border-zinc-200 rounded-lg shadow-xl flex flex-col p-2 z-50 animate-in fade-in slide-in-from-top-2">
                <Link
                  href="/auctions"
                  className="px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:text-orange-600 rounded-md transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Auctions
                </Link>
                <a
                  href="https://induheritage.com"
                  className="px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:text-orange-600 rounded-md transition-colors flex justify-between items-center"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <span>My Store</span>
                  <Image src={shopify} alt="Shopify" width={16} height={16} className="opacity-60" />
                </a>
              </nav>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="border-t border-zinc-800 py-16 mt-20 bg-zinc-950 text-zinc-400">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-start gap-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Image src={logo} alt="Indu Heritage" className="h-8 w-auto brightness-0 invert opacity-80" />
              <span className="sr-only">Indu Heritage</span>
            </div>
            <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
              Cozy, premium womenswear auctions with verified, real-time bidding.
            </p>
          </div>
          <div className="flex flex-col gap-4 text-sm font-medium">
            <Link href="/auctions" className="hover:text-white transition-colors">Browse Auctions</Link>
            <a href="https://induheritage.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              Shop Indu Heritage
            </a>
            <Link href="/admin/auctions" className="hover:text-white transition-colors">Admin Panel</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
