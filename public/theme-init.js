try {
  const savedTheme = localStorage.getItem('attendly_theme')
  if (savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark')
  }
} catch {
  // Storage can be unavailable in private browsing; the app can safely use light mode.
}
