const usernamePattern = /^[a-z0-9_.]+$/

export function normalizeUsername(username: string) {
  const normalized = username.trim().toLowerCase()
  if (normalized.length < 3 || normalized.length > 40 || !usernamePattern.test(normalized)) {
    throw new Error('Username must be 3-40 characters using letters, numbers, underscore, or dot.')
  }
  return normalized
}

export function usernameToInternalEmail(username: string) {
  return `${normalizeUsername(username)}@attendance.kcp.local`
}
