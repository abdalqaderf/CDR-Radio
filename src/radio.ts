import { createClient } from '@supabase/supabase-js'

declare const __RADIO_MODE__: 'fixture' | 'local' | 'hosted' | 'disconnected'
declare const __RADIO_PUBLISHABLE_KEY__: string
declare const __RADIO_DEPLOYED_ORIGIN__: string
export const mode = __RADIO_MODE__
export const publicListener = __RADIO_DEPLOYED_ORIGIN__ ? __RADIO_DEPLOYED_ORIGIN__ + '/listen' : ''
const base = mode === 'hosted' ? 'https://krsnebibuqbldyirfzhi.supabase.co' : 'http://127.0.0.1:54321'
const client = mode === 'local' || mode === 'hosted' ? createClient(base, __RADIO_PUBLISHABLE_KEY__) : null

const accessEvents = new EventTarget()
export function onAdminAccessLost(lock: () => void) {
  const listener = client?.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') lock()
  })
  accessEvents.addEventListener('denied', lock)
  return () => {
    listener?.data.subscription.unsubscribe()
    accessEvents.removeEventListener('denied', lock)
  }
}

function denyAccess(): never {
  accessEvents.dispatchEvent(new Event('denied'))
  throw Error('admin_required')
}

export interface Track {
  id: string
  title: string
}
export interface TimeWindow {
  date: string
  start: string
  end: string
  wholeDay: boolean
}
export interface Playlist {
  id: string
  revision: number
  title: string
  tracks: string[]
}
export interface Program extends Playlist {
  window: TimeWindow
  startsAt: string
  endsAt: string
  playback: string
  endPolicy: string
  transition: string
  status: string
  providerPlaylistId?: string | null
  verifiedAt?: string | null
  pendingAction?: 'apply' | 'cancel' | null
}
export interface Workspace {
  programs: Program[]
  playlists: Playlist[]
  dailyId: string | null
}
export interface Preview {
  startsAt: string
  endsAt: string
  conflicts: { title: string; status: string }[]
}
export interface Station {
  online?: boolean | null
  name: string
  url: string
  current: string
  next: string
  checked: number
  trackEndsAt: number | null
}

export function message(error: unknown) {
  const key = error instanceof Error ? error.message : ''
  const messages: Record<string, string> = {
    admin_required: 'يتطلب هذا القسم حساب المسؤول المخوّل.',
    revision_conflict: 'تغيّر السجل منذ فتحه. أعد تحميل الصفحة قبل المتابعة.',
    overlap_conflict: 'تتداخل الفترة مع برنامج منشور أو بانتظار التحقق.',
    sync_busy: 'هناك عملية على المحطة قيد التنفيذ أو بانتظار التحقق. أعد المحاولة أو راجع البرنامج المعلّق.',
    window_too_soon: 'اختر بداية تبعد أكثر من دقيقة عن الوقت الحالي.',
    edit_window_started: 'يمكن تعديل برنامج منشور قبل بدايته بأكثر من دقيقة.',
    unsupported_tracks: 'اختر مقطعين مختلفين على الأقل للنشر، دون تكرار المقطع أو استخدام مقاطع القائمة اليومية المحمية.',
    unsupported_policy: 'النشر يدعم فترة أقصر من ٢٤ ساعة، والتكرار بالترتيب، وطلب إكمال المقطع والعودة إلى القائمة اليومية.',
    provider_unconfirmed: 'لم يكتمل التحقق من المحطة. حدّث الصفحة ثم أعد التحقق أو ألغِ البرنامج.',
    invalid_window: 'تحقّق من التاريخ ووقتي البداية والنهاية.',
    invalid_tracks: 'اختر مقطعًا واحدًا على الأقل من المكتبة.',
    invalid_mp3: 'تعذّرت قراءة ملف MP3 صالح بهذا الاسم.',
    upload_unconfirmed: 'تعذّر تأكيد حفظ الملف. تحقّق من المكتبة قبل إعادة الرفع.',
    too_large: 'الحد الأقصى للملف ٥ ميبيبايت.',
    invalid_draft: 'تحقّق من اسم المسودة والحقول المطلوبة.',
    unavailable: 'خدمة المحطة غير متصلة.',
    login_failed: 'تعذّر الدخول. تحقّق من بيانات الحساب وصلاحياته.',
  }
  return messages[key] ?? 'تعذّر إتمام العملية. تحقّق من الاتصال ثم أعد المحاولة.'
}

async function fixture<T>(path: string, options?: RequestInit): Promise<T> {
  if (mode !== 'fixture') throw Error('unavailable')
  const response = await fetch('/__fixture/' + path, {
    ...options,
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  if (response.status === 401) denyAccess()
  const data = await response.json()
  if (!response.ok) throw Error(data.error)
  return data
}
async function rpc<T>(name: string, args: Record<string, unknown> = {}, timeout = 18000): Promise<T> {
  if (mode === 'fixture')
    return fixture('rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
  if (!client) throw Error('unavailable')
  const { data, error } = await client.auth.getSession()
  if (error && ![400, 401, 403].includes(error.status ?? 0)) throw error
  if (!data.session) denyAccess()
  const response = await fetch(base + '/functions/v1/admin-drafts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: __RADIO_PUBLISHABLE_KEY__,
      Authorization: 'Bearer ' + data.session.access_token,
    },
    body: JSON.stringify({ name, args }),
    signal: AbortSignal.timeout(timeout),
  })
  if (response.status === 401) denyAccess()
  const result = await response.json()
  if (response.status === 403 && result.error === 'admin_required') denyAccess()
  if (!response.ok) throw Error(result.error)
  return result as T
}
export async function login(email: string, password: string) {
  if (mode === 'fixture') {
    await fixture('login', { method: 'POST' })
    return
  }
  if (!client) throw Error('unavailable')
  const result = await client.auth.signInWithPassword({ email, password })
  if (result.error) throw Error('login_failed')
  try {
    const verified = await client.auth.getUser()
    if (verified.error || !verified.data.user) throw Error('login_failed')
    await getWorkspace()
  } catch (error) {
    await client.auth.signOut({ scope: 'local' })
    throw error
  }
}
export async function logout() {
  if (mode === 'fixture') await fixture('logout', { method: 'POST' })
  else if (client) {
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) throw error
  }
}
export const getWorkspace = () => rpc<Workspace>('radio_workspace')
export const saveDraft = (
  kind: 'program' | 'playlist',
  id: string,
  revision: number,
  doc: Record<string, unknown>,
) => rpc<number>('radio_save_draft', { p_kind: kind, p_id: id, p_revision: revision, p_doc: doc })
export const previewWindow = (window: TimeWindow, id: string) =>
  rpc<Preview>('radio_preview_window', { p_window: window, p_id: id })
export const discardProgram = (p_id: string, p_revision: number) =>
  rpc<boolean>('radio_delete_program_draft', { p_id, p_revision })
export const syncProgram = (
  p_action: 'publish' | 'edit' | 'retry' | 'cancel',
  p_id: string,
  p_revision: number,
  p_doc?: Record<string, unknown>,
) => rpc<{ status: string; revision: number; error?: string }>('program_sync', { p_action, p_id, p_revision, p_doc }, 52000)

async function hostedMedia<T>(file?: File): Promise<T> {
  if (!client) throw Error('unavailable')
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  if (!data.session) denyAccess()
  const url = new URL('/functions/v1/admin-media', base)
  if (file) url.searchParams.set('name', file.name)
  const response = await fetch(url, {
    method: file ? 'POST' : 'GET',
    headers: {
      apikey: __RADIO_PUBLISHABLE_KEY__,
      Authorization: 'Bearer ' + data.session.access_token,
      ...(file && { 'Content-Type': file.type || 'application/octet-stream' }),
    },
    body: file, redirect: 'error', signal: AbortSignal.timeout(60000),
  }).catch(() => { throw Error(file ? 'upload_unconfirmed' : 'unavailable') })
  const result = await response.json()
  if (response.status === 401 || (response.status === 403 && result.error === 'admin_required')) denyAccess()
  if (!response.ok) throw Error(result.error)
  return result as T
}

export const stationApi = {
  async snapshot(): Promise<Station> {
    if (mode === 'fixture')
      return {
        name: 'راديو الفروع',
        url: '/__fixture/marker',
        current: 'إشارة منخفضة',
        next: '',
        checked: Date.now(),
        trackEndsAt: null,
      }
    if (!client) throw Error('unavailable')
    const res = await fetch(base + '/functions/v1/station', {
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) throw Error('unavailable')
    return res.json()
  },
  list: () => mode === 'hosted' ? hostedMedia<Track[]>() : fixture<Track[]>('media'),
  async upload(file: File) {
    if (file.size > 5 * 1024 * 1024) throw Error('too_large')
    if (!file.size || !/\.mp3$/i.test(file.name)) throw Error('invalid_mp3')
    if (mode === 'hosted') return hostedMedia<Track>(file)
    return fixture<Track>('media?name=' + encodeURIComponent(file.name), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
  },
}

export const ammanDate = (value: string | number) =>
  new Intl.DateTimeFormat('ar-JO', {
    timeZone: 'Asia/Amman',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
