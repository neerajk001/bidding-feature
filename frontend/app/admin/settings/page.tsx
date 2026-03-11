'use client'

import { useEffect, useState } from 'react'
import { fetchApi } from '@/lib/api'

interface AdminEmailsData {
  adminEmails: string[]
  envEmails: string[]
  source: string
}

export default function SettingsPage() {
  const [adminEmails, setAdminEmails] = useState<string[]>([])
  const [envEmails, setEnvEmails] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchAdminEmails()
  }, [])

  const fetchAdminEmails = async () => {
    try {
      setLoading(true)
      const { ok, data } = await fetchApi<AdminEmailsData>('/api/admin/settings/admin-emails')
      if (ok) {
        setAdminEmails(data.adminEmails || [])
        setEnvEmails(data.envEmails || [])
      }
    } catch (error) {
      console.error('Failed to fetch admin emails:', error)
      setMessage({ type: 'error', text: 'Failed to load admin emails' })
    } finally {
      setLoading(false)
    }
  }

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim()) return

    setActionLoading('add')
    setMessage(null)

    try {
      const response = await fetch('/api/admin/settings/admin-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim() })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add admin email')
      }

      setMessage({ type: 'success', text: `Admin email "${newEmail.trim()}" added successfully!` })
      setNewEmail('')
      await fetchAdminEmails()
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to add admin email'
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemoveEmail = async (email: string) => {
    if (!window.confirm(`Are you sure you want to remove "${email}" from admin access?`)) {
      return
    }

    setActionLoading(email)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/settings/admin-emails', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove admin email')
      }

      setMessage({ type: 'success', text: `Admin email "${email}" removed successfully!` })
      await fetchAdminEmails()
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to remove admin email'
      })
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading settings...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600">Manage admin access and system configuration</p>
      </div>

      {/* Messages */}
      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Admin Email Management */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-orange-100 rounded-lg">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-600">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Admin Email Addresses</h2>
            <p className="text-sm text-gray-600">Manage who can access the admin panel</p>
          </div>
        </div>

        {/* Add New Email Form */}
        <form onSubmit={handleAddEmail} className="mb-6">
          <label htmlFor="newEmail" className="block text-sm font-semibold text-gray-700 mb-2">
            Add New Admin Email
          </label>
          <div className="flex gap-3">
            <input
              type="email"
              id="newEmail"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="admin@example.com"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              disabled={actionLoading === 'add'}
            />
            <button
              type="submit"
              disabled={!newEmail.trim() || actionLoading === 'add'}
              className="px-6 py-2 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {actionLoading === 'add' ? 'Adding...' : 'Add Admin'}
            </button>
          </div>
        </form>

        {/* Current Admin Emails */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Current Admin Emails</h3>
          {adminEmails.length === 0 && envEmails.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-500">No admin emails configured</p>
              <p className="text-sm text-gray-400 mt-1">Add an email address above to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Database Emails (Removable) */}
              {adminEmails.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-green-100 rounded">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{email}</div>
                      <div className="text-xs text-gray-500">Database • Can be removed</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveEmail(email)}
                    disabled={actionLoading === email || adminEmails.length === 1}
                    className="px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={adminEmails.length === 1 ? 'Cannot remove the last admin' : 'Remove admin access'}
                  >
                    {actionLoading === email ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}

              {/* Environment Emails (Read-only) */}
              {envEmails.map((email) => (
                <div
                  key={`env-${email}`}
                  className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-blue-100 rounded">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{email}</div>
                      <div className="text-xs text-blue-600">Environment Variable • Protected</div>
                    </div>
                  </div>
                  <span className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-100 rounded-lg">
                    Protected
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Alert */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600 shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">About Admin Access:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>Database emails can be managed through this interface</li>
                <li>Environment variable emails are permanent and require server restart to change</li>
                <li>Changes take effect immediately for database emails</li>
                <li>At least one admin email must exist at all times</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
