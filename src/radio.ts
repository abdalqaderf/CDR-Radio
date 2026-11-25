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
  category?: 'music' | 'quran' | 'welcome' | 'diagnostic'
  seconds?: number
  daily?: boolean
  previewable?: boolean
  broadcastRestricted?: boolean
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
  unpublishedEdit?: ProgramDocument | null
}
export interface ProgramDocument {
  title: string
  tracks: string[]
  window: TimeWindow
  playback: string
  endPolicy: string
  transition: string
}
export interface Workspace {
  programs: Program[]
  playlists: Playlist[]
  collections: Playlist[]
  dailyEditorId: string | null
}
export interface Preview {
  startsAt: string
  endsAt: string
  conflicts: { title: string; status: string }[]
}
export interface DailyPlayback {
  playlistId: string
  providerName: string
  canReorder: boolean
  title: string
  tracks: string[]
  verifiedAt: string
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
    revision_conflict: 'حُفظت نسخة أحدث في جلسة أخرى. تعديلاتك ما زالت هنا. راجع النسخة المحفوظة قبل المتابعة.',
    overlap_conflict: 'تتداخل الفترة مع برنامج منشور أو بانتظار التحقق.',
    sync_busy: 'هناك عملية على المحطة قيد التنفيذ أو بانتظار التحقق. أعد المحاولة أو راجع البرنامج المعلّق.',
    daily_changed: 'تغيّرت القائمة في المحطة. حدّث حالة المحطة وراجع الترتيب مجددًا.',
    daily_membership: 'تغيير المقاطع المضمّنة يتطلب تحديث القائمة في لوحة المحطة.',
    window_too_soon: 'اختر بداية تبعد أكثر من دقيقة عن الوقت الحالي.',
    edit_window_started: 'يمكن تعديل برنامج منشور قبل بدايته بأكثر من دقيقة.',
    unsupported_tracks: 'يتطلب النشر مقطعين مختلفين على الأقل دون تكرار التسجيل.',
    protected_daily_media: 'يتضمّن البرنامج مقاطع من قائمة البث اليومي أو الاستعادة المحمية. اختر مقاطع أخرى للبرنامج.',
    recording_restricted: 'يتضمّن الترتيب تسجيلًا لا يسمح إذنه بالبث. راجع حقوق التسجيل أو اختر بديلًا.',
    media_not_ready: 'بعض الملفات مفقودة أو لم تكتمل معالجتها في المحطة. حدّث المكتبة وراجع المقاطع.',
    unsupported_policy: 'النشر يدعم فترة أقصر من ٢٤ ساعة، والتكرار بالترتيب، وطلب إكمال المقطع والعودة إلى القائمة اليومية.',
    provider_unconfirmed: 'لم تتأكد نتيجة العملية بعد. تحقّق من الحالة قبل إعادة المحاولة.',
    invalid_window: 'تحقّق من التاريخ ووقتي البداية والنهاية.',
    invalid_tracks: 'اختر مقطعًا واحدًا على الأقل من المكتبة.',
    invalid_mp3: 'تعذّرت قراءة ملف MP3 صالح بهذا الاسم.',
    upload_unconfirmed: 'تعذّر تأكيد حفظ الملف. تحقّق من المكتبة قبل إعادة الرفع.',
    too_large: 'الحد الأقصى للملف ٥ ميبيبايت.',
    preview_unavailable: 'تعذّر الاستماع التجريبي. يدعم ملفات MP3 حتى ٥ ميبيبايت.',
    invalid_draft: 'تحقّق من الاسم والحقول المطلوبة.',
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
export const saveDaily = (p_id: string, p_revision: number, p_doc: { title: string; tracks: string[] }) =>
  rpc<number>('radio_save_daily', { p_id, p_revision, p_doc })
export const saveCollection = (p_id: string, p_revision: number, p_doc: { title: string; tracks: string[] }) =>
  rpc<number>('radio_save_collection', { p_id, p_revision, p_doc })
export const updateDailyOrder = (p_id: string, p_revision: number, reviewed: DailyPlayback) =>
  rpc<DailyPlayback & { outcome?: 'already_current' | 'order_confirmed_after_write' }>(
    'daily_order', { p_id, p_revision, p_playlist: reviewed.playlistId, p_order: reviewed.tracks }, 55000)
export const saveDraft = (
  kind: 'program' | 'playlist',
  id: string,
  revision: number,
  doc: Record<string, unknown>,
) => rpc<number>('radio_save_draft', { p_kind: kind, p_id: id, p_revision: revision, p_doc: doc })
export const previewWindow = (window: TimeWindow, id: string) =>
  rpc<Preview>('radio_preview_window', { p_window: window, p_id: id })
export const saveProgramEdit = (id: string, revision: number, doc: ProgramDocument) =>
  rpc<number>('radio_save_program_edit', { p_id: id, p_revision: revision, p_doc: doc })
export const discardProgram = (p_id: string, p_revision: number) =>
  rpc<boolean>('radio_delete_program_draft', { p_id, p_revision })
export const syncProgram = (
  p_action: 'publish' | 'edit' | 'retry' | 'cancel',
  p_id: string,
  p_revision: number,
  p_doc?: ProgramDocument,
) => rpc<{ status: string; revision: number; verifiedAt?: string; error?: string }>('program_sync',
  { p_action, p_id, p_revision, p_doc }, 52000)

async function mediaRequest(params: Record<string, string>) {
  if (!client) throw Error('unavailable')
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  if (!data.session) denyAccess()
  const url = new URL('/functions/v1/admin-media', base)
  url.search = new URLSearchParams(params).toString()
  return { url, headers: { apikey: __RADIO_PUBLISHABLE_KEY__, Authorization: 'Bearer ' + data.session.access_token } }
}

function checkMediaAccess(status: number, error?: string) {
  if (status === 401 || (status === 403 && error === 'admin_required')) denyAccess()
}

async function hostedMedia<T>(params: Record<string, string> = {}): Promise<T> {
  const { url, headers } = await mediaRequest(params)
  const response = await fetch(url, { headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(36000) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    checkMediaAccess(response.status, result.error)
    throw Error(result.error || 'unavailable')
  }
  if (params.preview) {
    if (response.headers.get('Content-Type') !== 'audio/mpeg') throw Error('preview_unavailable')
    return await response.blob() as T
  }
  return response.json()
}

export function validateUpload(file: File) {
  if (file.size > 5 * 1024 * 1024) return 'too_large'
  if (!file.size || !/\.mp3$/i.test(file.name) || file.name.length > 180 ||
    /[\\/:*?"<>|\p{Cc}\p{Cf}]/u.test(file.name) ||
    !['', 'audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(file.type)) return 'invalid_mp3'
}

async function uploadMedia(file: File, key: string, progress: (value: number) => void) {
  const params = { name: file.name, key }
  const request = mode === 'hosted' ? await mediaRequest(params) :
    { url: '/__fixture/media?' + new URLSearchParams(params), headers: {} }
  return new Promise<Track | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', request.url)
    xhr.responseType = 'json'
    xhr.timeout = 60000
    for (const [name, value] of Object.entries(request.headers)) {
      if (value) xhr.setRequestHeader(name, value)
    }
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(event.loaded / event.total) }
    xhr.upload.onload = () => progress(1)
    xhr.onerror = xhr.ontimeout = () => reject(Error('upload_unconfirmed'))
    xhr.onload = () => {
      try {
        checkMediaAccess(xhr.status, xhr.response?.error)
        if (xhr.status === 201) resolve(xhr.response)
        else if (xhr.status === 202) resolve(null)
        else reject(Error(xhr.status >= 500 ? 'upload_unconfirmed' : xhr.response?.error || 'unavailable'))
      } catch (e) { reject(e) }
    }
    xhr.send(file)
  })
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
  daily: () => mode === 'hosted' ? hostedMedia<DailyPlayback | null>({ daily: '1' }) :
    mode === 'fixture' ? fixture<DailyPlayback>('media?daily=1') : Promise.resolve(null),
  async preview(id: string): Promise<Blob> {
    if (mode === 'hosted') return hostedMedia<Blob>({ preview: id })
    if (mode !== 'fixture') throw Error('preview_unavailable')
    const response = await fetch('/__fixture/media?preview=' + encodeURIComponent(id), {
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    })
    if (response.status === 401) denyAccess()
    if (!response.ok) throw Error('preview_unavailable')
    return response.blob()
  },
  async upload(file: File, key: string, progress: (value: number) => void) {
    const validation = validateUpload(file)
    if (validation) throw Error(validation)
    if (mode !== 'hosted' && mode !== 'fixture') throw Error('unavailable')
    return uploadMedia(file, key, progress)
  },
  uploadStatus(file: File, key: string) {
    const params = { name: file.name, size: String(file.size), key }
    return mode === 'hosted' ? hostedMedia<Track | null>(params) :
      fixture<Track | null>('media?' + new URLSearchParams(params))
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
  }).format(new Date(value)).replace(/ ([صم])$/u, '\u00a0$1')
