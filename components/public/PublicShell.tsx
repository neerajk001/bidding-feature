import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import logo from './logo.png'
import shopify from './shopify.png'

export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="container public-header-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Image src={logo} alt="Indu Heritage" className="brand-logo" priority />
              <span className="sr-only">Indu Heritage</span>
            </span>
          </Link>
          <nav className="public-nav">
            <Link href="/auctions" className="nav-link">
              Auctions
            </Link>
            <a href="https://induheritage.com" className="nav-link" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #8B4513', padding: '0.5rem 1rem', borderRadius: '6px' }}>
              My Store
              <Image src={shopify} alt="Shopify" width={20} height={20} />
            </a>
          </nav>
        </div>
      </header>
      <main className="public-main">{children}</main>
      <footer className="public-footer">
        <div className="container public-footer-inner">
          <div>
            <div className="brand-mark">
              <Image src={logo} alt="Indu Heritage" className="brand-logo brand-logo-footer" />
              <span className="sr-only">Indu Heritage</span>
            </div>
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
