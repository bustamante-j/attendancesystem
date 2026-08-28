export type ScanFeedbackTone = 'success' | 'warning' | 'error'

let audioContext: AudioContext | null = null

function getAudioContext() {
  if (!audioContext) audioContext = new AudioContext()
  return audioContext
}

export async function primeScanFeedback() {
  try {
    const context = getAudioContext()
    if (context.state === 'suspended') await context.resume()
  } catch {
    // Audio feedback is optional; scanning must continue if the browser blocks it.
  }
}

function scheduleTone(context: AudioContext, frequency: number, start: number, duration: number) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

export function playScanFeedback(tone: ScanFeedbackTone) {
  try {
    const context = getAudioContext()
    const start = context.currentTime
    if (tone === 'success') scheduleTone(context, 880, start, 0.13)
    else if (tone === 'warning') {
      scheduleTone(context, 620, start, 0.1)
      scheduleTone(context, 620, start + 0.14, 0.1)
    } else scheduleTone(context, 220, start, 0.22)
  } catch {
    // Vibration and the visual result remain available when audio is unsupported.
  }

  if ('vibrate' in navigator) {
    navigator.vibrate(tone === 'success' ? 80 : tone === 'warning' ? [60, 50, 60] : 180)
  }
}
