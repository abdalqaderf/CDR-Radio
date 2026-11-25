import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AudioLines, BookOpen, FlaskConical, Mic, Music2, X } from 'lucide-react'
import { message, stationApi, type Track } from './radio'

export const categories = {
  music: { label: 'موسيقى هادئة', icon: Music2 },
  quran: { label: 'تلاوات القرآن', icon: BookOpen },
  welcome: { label: 'رسائل ترحيب', icon: Mic },
  diagnostic: { label: 'ملفات التحقق', icon: FlaskConical },
  other: { label: 'غير مصنّف', icon: AudioLines },
}
export const count = new Intl.NumberFormat('ar-JO')
export const orderLimit = 250
export const unknownTitle = 'مقطع غير متاح في المكتبة'
export const localHint = 'الاستماع التجريبي على جهازك فقط.'

export function trackDuration(seconds?: number) {
  if (!(seconds && Number.isFinite(seconds) && seconds > 0)) return null
  const total = Math.round(seconds)
  const time = [Math.floor(total / 60) % 60, total % 60]
  if (total >= 3600) time.unshift(Math.floor(total / 3600))
  return time.map((part, i) => i ? String(part).padStart(2, '0') : String(part)).join(':')
}

export function trackMatches(track: Track, filter: string, query: string) {
  const category = track.category ?? 'other'
  return (filter === 'all' || filter === category) &&
    track.title.normalize('NFKC').toLocaleLowerCase('ar').includes(query.trim().normalize('NFKC').toLocaleLowerCase('ar'))
}

export function Modal({ open, close, title, children, sheet = false, busy = false }: {
  open: boolean
  close: () => void
  title: string
  children: ReactNode
  sheet?: boolean
  busy?: boolean
}) {
  const name = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element || !open) return
    const previous = document.activeElement
    element.showModal()
    const viewport = window.visualViewport
    const fit = () => {
      if (!viewport) return
      element.style.setProperty('--modal-height', viewport.height + 'px')
      element.style.setProperty('--modal-bottom', Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) + 'px')
    }
    fit()
    viewport?.addEventListener('resize', fit)
    viewport?.addEventListener('scroll', fit)
    return () => {
      viewport?.removeEventListener('resize', fit)
      viewport?.removeEventListener('scroll', fit)
      element.close()
      if (previous instanceof HTMLElement && previous.isConnected && !previous.matches(':disabled'))
        previous.focus({ preventScroll: true })
    }
  }, [open])
  return <dialog ref={dialog} aria-labelledby={name} className={'state-panel modal' + (sheet ? ' track-sheet' : '')}
    onCancel={(e) => { e.preventDefault(); if (!busy) close() }}>
    <div className="modal-layout">
      <div className="modal-heading">
        <h2 id={name}>{title}</h2>
        <button type="button" className="icon-button" aria-label="إغلاق" disabled={busy} onClick={close}><X size={20} /></button>
      </div>
      {children}
    </div>
  </dialog>
}

export function usePreview() {
  const generation = useRef(0)
  const [state, setState] = useState<{ id: string; title: string; blob?: Blob; error?: string } | null>(null)
  function stop() {
    generation.current++
    setState(null)
  }
  async function toggle(track: Track) {
    if (state?.id === track.id) { stop(); return }
    const request = ++generation.current
    const target = { id: track.id, title: track.title }
    setState(target)
    try {
      const blob = await stationApi.preview(track.id)
      if (generation.current === request) setState({ ...target, blob })
    } catch (error) {
      if (generation.current === request) setState({ ...target, error: message(error) })
    }
  }
  useEffect(() => {
    window.addEventListener('pagehide', stop)
    return () => {
      generation.current++
      window.removeEventListener('pagehide', stop)
    }
  }, [])
  return { state, stop, toggle }
}

export function PreviewAudio({ preview }: { preview: ReturnType<typeof usePreview>['state'] }) {
  if (!preview) return null
  if (preview.error) return <p className="validation" role="alert">{preview.error}</p>
  if (!preview.blob) return <p className="muted" role="status">جارٍ تجهيز الاستماع التجريبي…</p>
  return <LocalAudio key={preview.id} source={preview.blob} title={preview.title} />
}

function LocalAudio({ source, title }: { source: Blob; title: string }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const element = audio.current!
    const url = URL.createObjectURL(source)
    element.src = url
    // When a browser requires a fresh gesture after fetching, native Play remains available.
    void element.play().catch(() => { })
    const stop = () => {
      element.pause()
      element.removeAttribute('src')
      element.load()
      URL.revokeObjectURL(url)
    }
    window.addEventListener('pagehide', stop)
    return () => { window.removeEventListener('pagehide', stop); stop() }
  }, [source])
  return <div className="local-preview">
    <strong>استماع تجريبي · <bdi>{title}</bdi></strong>
    <audio ref={audio} controls aria-label={'استماع تجريبي إلى ' + title} onError={() => setFailed(true)} />
    {failed && <p className="validation" role="alert">تعذّر تشغيل هذا الملف الصوتي.</p>}
  </div>
}
