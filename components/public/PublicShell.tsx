import type { ReactNode } from 'react'
import Link from 'next/link'

export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="container public-header-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">Indu Heritage</span>
            <span className="brand-subtitle">Premium womenswear auctions</span>
          </Link>
          <nav className="public-nav">
            <Link href="/auctions" className="nav-link">
              Auctions
            </Link>
            <a href="https://induheritage.com" className="nav-link" target="_blank" rel="noreferrer">
              Shop
            </a>
            <Link href="/admin/auctions" className="nav-link nav-cta">
              Admin Panel
            </Link>
          </nav>
        </div>
      </header>
      <main className="public-main">{children}</main>
      <footer className="public-footer">
        <div className="container public-footer-inner">
          <div>
            <div className="brand-mark">Indu Heritage</div>
            <p className="footer-note">
              Cozy, premium womenswear auctions with verified, real-time bidding.
            </p>
          </div>
          <div className="footer-links">
            <Link href="/auctions">Browse Auctions</Link>
            <a href="https://induheritage.com" target="_blank" rel="noreferrer">
              Shop Indu Heritage
            </a>
            <Link href="/admin/auctions">Admin Panel</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
