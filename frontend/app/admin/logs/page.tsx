'use client'

export default function AuditLogsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <div className="text-6xl mb-6">📝</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Audit Logs
        </h1>
        <p className="text-lg text-gray-600 mb-6">
          This feature is coming soon. Here you&apos;ll be able to view admin action history, 
          bid logs, system events, and track all changes made in the system.
        </p>
        <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-800 px-4 py-2 rounded-md">
          <span className="font-semibold">🚧 Under Development</span>
        </div>
      </div>
    </div>
  )
}
