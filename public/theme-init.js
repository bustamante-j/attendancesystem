try {
  const savedTheme = localStorage.getItem('attendly_theme')
  const savedPalette = localStorage.getItem('attendly_palette:v1')
  if (savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark')
  }
  document.documentElement.dataset.palette = savedPalette === 'forest' ? 'forest' : 'ocean'
} catch {
  // Storage can be unavailable in private browsing; the app can safely use its defaults.
}
