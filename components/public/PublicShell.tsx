'use client'

import { type ReactNode, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import logo from './logo.png'
import shopify from './shopify.png'

export default function PublicShell({ children }: { children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="public-shell">
      <style jsx global>{`
        /* Scoped Navbar Styles */
        .public-header-inner {
          width: min(1280px, calc(100% - 2rem));
          margin: 0 auto;
          margin-top: 0.15rem;
          padding: 0.75rem 1rem;
          display: flex;
          flex-flow: row nowrap;
          justify-content: space-between;
          align-items: center;
          background: rgba(252, 250, 248, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid var(--color-border);
          border-radius: 0;
          box-shadow: var(--shadow-md);
          position: relative;
          min-height: 60px;
        }

        .brand {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          color: var(--color-text-primary);
          align-items: flex-start;
          position: relative;
          flex-shrink: 1;
          min-width: 0;
          max-width: calc(100% - 90px);
        }

        .desktop-nav {
          display: none;
        }

        .mobile-toggle-wrapper {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        .nav-toggle-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: transparent;
          border: 1px solid var(--color-border, #e5e5e5);
          padding: 0.5rem 0.75rem;
          border-radius: 4px;
          cursor: pointer;
          color: var(--color-text-secondary, #666);
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .nav-toggle-btn.active {
          background: var(--color-surface, #fff);
          color: var(--color-primary, #F97316);
          border-color: var(--color-primary, #F97316);
        }

        .nav-menu-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          width: 200px;
          background: #fff;
          border: 1px solid #e5e5e5;
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          display: flex;
          flex-direction: column;
          padding: 0.5rem;
          z-index: 100;
        }

        .nav-dropdown-item {
          padding: 0.75rem;
          font-size: 0.9rem;
          color: #333;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-radius: 4px;
        }

        .nav-dropdown-item:hover {
          background: #f5f5f5;
          color: #F97316;
        }

        @media (min-width: 768px) {
          .desktop-nav {
            display: flex;
            align-items: center;
            gap: 1.5rem;
          }
          
          .mobile-toggle-wrapper {
            display: none;
          }

          .desktop-link {
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--color-text-primary, #333);
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }

          .desktop-link:hover {
            color: var(--color-primary, #F97316);
          }

          .desktop-cta {
            border: 1px solid var(--color-border, #e5e5e5);
            padding: 0.5rem 1rem;
            border-radius: 4px;
          }
           
          .desktop-cta:hover {
            border-color: var(--color-primary, #F97316);
            background: rgba(249, 115, 22, 0.05);
          }
        }
      `}</style>

      <header className="public-header">
        <div className="container public-header-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Image src={logo} alt="Indu Heritage" className="brand-logo" priority />
              <span className="sr-only">Indu Heritage</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="desktop-nav">
            <Link href="/auctions" className="desktop-link">
              Auctions
            </Link>
            <a
              href="https://induheritage.com"
              className="desktop-link desktop-cta"
              target="_blank"
              rel="noreferrer"
            >
              <span>My Store</span>
              <Image src={shopify} alt="Shopify" width={16} height={16} />
            </a>
          </nav>

          {/* Mobile Navigation Toggle */}
          <div className="mobile-toggle-wrapper">
            <button
              className={`nav-toggle-btn ${isMenuOpen ? 'active' : ''}`}
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
              <nav className="nav-menu-dropdown">
                <Link
                  href="/auctions"
                  className="nav-dropdown-item"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Auctions
                </Link>
                <a
                  href="https://induheritage.com"
                  className="nav-dropdown-item"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <span>My Store</span>
                  <Image src={shopify} alt="Shopify" width={16} height={16} style={{ opacity: 0.8 }} />
                </a>
              </nav>
            )}
          </div>
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
