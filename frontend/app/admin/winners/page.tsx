'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchApi } from '@/lib/api'

interface Winner {
  id: string
  auction_id: string
  bidder_id: string
  winning_amount: number
  size?: string | null
  created_at: string
  payment_due_at?: string | null
  payment_status?: string | null
  payment_completed_at?: string | null
  payment_proof_note?: string | null
  payment_proof_url?: string | null
  payment_verified_by_admin?: boolean
  razorpay_order_id?: string | null
  razorpay_payment_id?: string | null
  instagram_handle?: string | null
  dispatched_at?: string | null
  escalation_done?: boolean
  winner_email_sent_at?: string | null
  claim_token?: string | null
  bidder: {
    name: string
    phone: string
    email?: string
  }
  auction: {
    title: string
    product_id: string
    bidding_start_time?: string | null
    bidding_end_time?: string | null
  }
}

interface AuctionGroup {
  auction_id: string
  auction: {
    title: string
    product_id: string
    bidding_start_time?: string | null
    bidding_end_time?: string | null
  }
  winners: Winner[]
}

export default function WinnersPage() {
  const [winners, setWinners] = useState<Winner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [resendMsg, setResendMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null)
  const [expandedAuctionId, setExpandedAuctionId] = useState<string | null>(null)
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'paid' | 'verified'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchWinners()
  }, [])

  const fetchWinners = async () => {
    try {
      setLoading(true)
      const { ok, data } = await fetchApi<{ winners?: Winner[]; error?: string }>('/api/admin/winners')

      if (!ok) {
        throw new Error(data.error || 'Failed to fetch winners')
      }

      setWinners(data.winners || [])
      setError('')
    } catch (err: any) {
      console.error('Error fetching winners:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const patchWinner = async (id: string, body: { payment_status?: string; dispatched_at?: boolean | string }) => {
    setActioningId(id)
    try {
      const { ok, data } = await fetchApi<{ winner?: Winner; error?: string }>(`/api/admin/winners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!ok) throw new Error(data.error || 'Failed to update')
      if (data.winner) {
        setWinners((prev) => prev.map((w) => (w.id === id ? { ...w, ...data.winner } : w)))
      } else {
        await fetchWinners()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActioningId(null)
    }
  }

  const resendWinnerEmail = async (winner: Winner) => {
    setResendingId(winner.id)
    setResendMsg(null)
    try {
      const { ok, data } = await fetchApi<{ ok?: boolean; error?: string }>(`/api/admin/winners/${winner.id}/resend-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!ok) throw new Error((data as any).error || 'Failed to resend')
      setResendMsg({ id: winner.id, text: `Email resent to ${winner.bidder.email || 'bidder'}`, ok: true })
      await fetchWinners()
    } catch (err: any) {
      setResendMsg({ id: winner.id, text: err.message, ok: false })
    } finally {
      setResendingId(null)
    }
  }

  // Group winners by auction
  const filteredWinners = winners
    .filter(w => {
      if (paymentFilter === 'all') return true
      if (paymentFilter === 'pending') return !w.payment_status || w.payment_status === 'pending'
      if (paymentFilter === 'paid') return w.payment_status === 'paid' && !w.payment_verified_by_admin
      if (paymentFilter === 'verified') return w.payment_verified_by_admin
      return true
    })
    .filter(w => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      return (
        w.bidder.name.toLowerCase().includes(query) ||
        w.bidder.phone.includes(query) ||
        w.bidder.email?.toLowerCase().includes(query) ||
        w.auction.title.toLowerCase().includes(query)
      )
    })

  const exportToCSV = () => {
    const headers = ['Auction', 'Winner Name', 'Phone', 'Email', 'Winning Amount', 'Size', 'Payment Status', 'Dispatched', 'Email Sent', 'Created At']
    const rows = filteredWinners.map(w => [
      w.auction.title,
      w.bidder.name,
      w.bidder.phone,
      w.bidder.email || '-',
      `₹${w.winning_amount}`,
      w.size || '-',
      w.payment_verified_by_admin ? 'Verified' : (w.payment_status || 'Pending'),
      w.dispatched_at ? 'Yes' : 'No',
      w.winner_email_sent_at ? 'Yes' : 'No',
      new Date(w.created_at).toLocaleString()
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `winners-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const groupedWinners = filteredWinners.reduce<AuctionGroup[]>((acc, winner) => {
    let group = acc.find(g => g.auction_id === winner.auction_id)
    if (!group) {
      group = {
        auction_id: winner.auction_id,
        auction: winner.auction,
        winners: []
      }
      acc.push(group)
    }
    group.winners.push(winner)
    return acc
  }, [])

  if (loading) {
    return (
      <div className="admin-container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ fontSize: '1.2rem', color: '#666' }}>Loading winners...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-container" style={{ paddingBottom: '4rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 className="admin-title">Auction Winners</h1>
          <Link href="/admin" className="admin-btn-secondary">
            Back to Dashboard
          </Link>
        </div>

        {error && (
          <div className="admin-alert admin-alert-error">
            {error}
          </div>
        )}

        {!error && winners.length === 0 && (
          <div className="admin-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏆</div>
            <h3 style={{ marginBottom: '0.5rem', color: '#333' }}>No Winners Yet</h3>
            <p style={{ color: '#666' }}>Winners will appear here once auctions end and winners are determined.</p>
          </div>
        )}

        {groupedWinners.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Controls */}
            <div className="admin-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#333' }}>
                  Total Winners: {filteredWinners.length} / {winners.length}
                </h2>
                <button
                  onClick={exportToCSV}
                  className="admin-btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export CSV
                </button>
              </div>

              {/* Payment Status Filter Tabs */}
              <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
                {[
                  { key: 'all', label: 'All', count: winners.length },
                  { key: 'pending', label: 'Payment Pending', count: winners.filter(w => !w.payment_status || w.payment_status === 'pending').length },
                  { key: 'paid', label: 'Paid (Unverified)', count: winners.filter(w => w.payment_status === 'paid' && !w.payment_verified_by_admin).length },
                  { key: 'verified', label: 'Verified', count: winners.filter(w => w.payment_verified_by_admin).length },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setPaymentFilter(tab.key as any)}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      borderBottom: paymentFilter === tab.key ? '2px solid #FF6B35' : '2px solid transparent',
                      color: paymentFilter === tab.key ? '#FF6B35' : '#666',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder="Search by winner name, phone, email, or auction..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="admin-input"
              />
            </div>

            {filteredWinners.length === 0 ? (
              <div className="admin-card" style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                No winners match your filter criteria.
              </div>
            ) : (
              <div>

            {groupedWinners.map((group) => {
              const isExpanded = expandedAuctionId === group.auction_id

              return (
                <div key={group.auction_id} className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Auction Header Card */}
                  <div style={{ padding: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderBottom: isExpanded ? '1px solid #edf2f7' : 'none' }}>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <Link href={`/admin/auctions/${group.auction_id}`} className="hover:underline">
                        <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#1e293b' }}>
                          {group.auction.title}
                        </h3>
                      </Link>
                      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        Product ID: {group.auction.product_id}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '600', letterSpacing: '0.05em' }}>Start Date</span>
                        <span style={{ fontSize: '0.9rem', color: '#334155', fontWeight: '500' }}>
                          {group.auction.bidding_start_time ? new Date(group.auction.bidding_start_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '600', letterSpacing: '0.05em' }}>End Date</span>
                        <span style={{ fontSize: '0.9rem', color: '#334155', fontWeight: '500' }}>
                          {group.auction.bidding_end_time ? new Date(group.auction.bidding_end_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '600', letterSpacing: '0.05em' }}>Winners</span>
                        <span style={{ fontSize: '0.9rem', color: '#334155', fontWeight: '700' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#e0e7ff', color: '#4f46e5', borderRadius: '999px', minWidth: '1.5rem', height: '1.5rem', padding: '0 0.4rem', fontSize: '0.8rem' }}>
                            {group.winners.length}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div style={{ marginLeft: 'auto' }}>
                      <button
                        onClick={() => setExpandedAuctionId(isExpanded ? null : group.auction_id)}
                        className="admin-btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem', fontSize: '0.875rem' }}
                      >
                        {isExpanded ? 'Hide Winners' : 'View Winners'}
                        <svg style={{ width: '1rem', height: '1rem', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>

                  </div>

                  {/* Expanded Winners Table */}
                  {isExpanded && (
                    <div style={{ padding: '1rem', overflowX: 'auto', background: '#fff' }}>
                      <table className="admin-table" style={{ margin: 0 }}>
                        <thead style={{ background: '#f1f5f9' }}>
                          <tr>
                            <th>Winner Name</th>
                            <th>Phone</th>
                            <th>Email</th>
                            <th>Size</th>
                            <th>Winning Amount</th>
                            <th>Payment Status</th>
                            <th>Action / Proof</th>
                            <th>Admin Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.winners.map((winner) => (
                            <tr key={winner.id}>
                              <td>
                                <div style={{ fontWeight: '600', color: '#333' }}>
                                  {winner.bidder.name}
                                  {winner.escalation_done && <span style={{ marginLeft: 4, fontSize: '0.7rem', color: '#666' }}>(escalated)</span>}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                                  Won: {new Date(winner.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </td>
                              <td>{winner.bidder.phone}</td>
                              <td>{winner.bidder.email || '-'}</td>
                              <td>{winner.size ? <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 'bold' }}>{winner.size}</span> : '—'}</td>
                              <td>
                                <div style={{ fontWeight: '700', color: '#FF6B35', fontSize: '1rem' }}>
                                  ₹{winner.winning_amount.toLocaleString()}
                                </div>
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-start' }}>
                                  <span style={{
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    background: winner.payment_status === 'completed' ? '#d1fae5' : winner.payment_status === 'forfeited' ? '#fee2e2' : winner.payment_status === 'overdue' ? '#fef3c7' : '#e0e7ff',
                                    color: winner.payment_status === 'completed' ? '#065f46' : winner.payment_status === 'forfeited' ? '#991b1b' : winner.payment_status === 'overdue' ? '#92400e' : '#3730a3'
                                  }}>
                                    {winner.payment_status || 'pending'}
                                  </span>
                                  {winner.payment_due_at && winner.payment_status !== 'completed' && winner.payment_status !== 'forfeited' && (
                                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                      Due: {new Date(winner.payment_due_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ maxWidth: '200px', fontSize: '0.8rem' }}>
                                {winner.razorpay_payment_id && <div style={{ marginBottom: '2px' }} title={winner.razorpay_payment_id}>Razorpay: {winner.razorpay_payment_id.slice(0, 15)}…</div>}
                                {winner.payment_proof_note && <div style={{ marginBottom: '2px', fontStyle: 'italic', color: '#475569' }} title={winner.payment_proof_note}>"{winner.payment_proof_note.slice(0, 30)}{winner.payment_proof_note.length > 30 ? '…' : ''}"</div>}
                                {winner.payment_proof_url && <div><a href={winner.payment_proof_url} target="_blank" rel="noreferrer" style={{ color: '#6366f1', textDecoration: 'underline' }}>View Proof</a></div>}
                                {winner.instagram_handle && <div style={{ marginTop: 2 }}>@{winner.instagram_handle.replace(/^@/, '')}</div>}
                                {!winner.razorpay_payment_id && !winner.payment_proof_note && !winner.payment_proof_url && !winner.instagram_handle && <span style={{ color: '#94a3b8' }}>No proof added</span>}
                                {winner.dispatched_at && (
                                  <div style={{ marginTop: '0.4rem', color: '#10b981', fontWeight: 'bold' }}>
                                    ✓ Dispatched {new Date(winner.dispatched_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                  </div>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: '160px' }}>
                                  {/* Mark Paid button */}
                                  {winner.payment_status === 'pending' || winner.payment_status === 'overdue' ? (
                                    <button
                                      type="button"
                                      className="admin-btn-primary"
                                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                      disabled={actioningId === winner.id}
                                      onClick={() => patchWinner(winner.id, { payment_status: 'completed' })}
                                    >
                                      {actioningId === winner.id ? '…' : 'Mark paid'}
                                    </button>
                                  ) : null}

                                  {/* Mark Dispatched button */}
                                  {winner.payment_status === 'completed' && !winner.dispatched_at ? (
                                    <button
                                      type="button"
                                      className="admin-btn-secondary"
                                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                      disabled={actioningId === winner.id}
                                      onClick={() => patchWinner(winner.id, { dispatched_at: true })}
                                    >
                                      {actioningId === winner.id ? '…' : 'Mark dispatched'}
                                    </button>
                                  ) : null}

                                  {/* Resend Email button */}
                                  {winner.bidder.email ? (
                                    <button
                                      type="button"
                                      style={{
                                        padding: '0.35rem 0.75rem',
                                        fontSize: '0.8rem',
                                        background: winner.winner_email_sent_at ? '#f3f4f6' : '#6366f1',
                                        color: winner.winner_email_sent_at ? '#6b7280' : '#fff',
                                        border: 'none',
                                        borderRadius: 6,
                                        cursor: resendingId === winner.id ? 'not-allowed' : 'pointer',
                                        fontWeight: 600,
                                        width: '100%',
                                        textAlign: 'center'
                                      }}
                                      disabled={resendingId === winner.id}
                                      onClick={() => resendWinnerEmail(winner)}
                                      title={winner.winner_email_sent_at
                                        ? `Email sent at ${new Date(winner.winner_email_sent_at).toLocaleString('en-IN')} — click to resend`
                                        : `Send winner email to ${winner.bidder.email}`}
                                    >
                                      {resendingId === winner.id ? '…' : winner.winner_email_sent_at ? '✉ Resend Email' : '✉ Send Email'}
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: '0.75rem', color: '#ef4444', padding: '0.4rem 0', width: '100%', textAlign: 'center', background: '#fef2f2', borderRadius: '4px' }}>No email saved</span>
                                  )}

                                  {resendMsg?.id === winner.id && (
                                    <div style={{
                                      width: '100%',
                                      marginTop: 4,
                                      fontSize: '0.7rem',
                                      color: resendMsg.ok ? '#16a34a' : '#dc2626',
                                      fontWeight: 500,
                                      textAlign: 'center'
                                    }}>
                                      {resendMsg.text}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
    </div>
  )
}
