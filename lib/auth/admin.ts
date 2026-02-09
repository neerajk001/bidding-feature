const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

export function isAdminEmail(email?: string | null) {
  if (!email) return false
  if (adminEmails.length === 0) return false
  return adminEmails.includes(email.toLowerCase())
}

export function getAdminEmails() {
  return adminEmails
}
