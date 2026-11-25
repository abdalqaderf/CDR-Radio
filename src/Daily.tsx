import { useEffect, useState, type SetStateAction } from 'react'
import { ArrowUpRight, ListMusic, Radio, RefreshCw } from 'lucide-react'
import { TaskNotice, useEditorGuard, useTask } from './AdminFeedback'
import { EditorActions, sameOrder, TrackSummary, type EditorProps } from './EditorContent'
import { count, Modal } from './PlaylistControls'
import { ammanDate, message, mode, saveDaily, stationApi, updateDailyOrder, type DailyPlayback, type Playlist, type Workspace } from './radio'
import { TrackOrder } from './TrackOrder'

const fallbackName = 'البث اليومي'
const fromWorkspace = (workspace: Workspace) => workspace.playlists.find((list) => list.id === workspace.dailyEditorId)
const canUpdate = (active: DailyPlayback | null, ids: string[]) => active?.canReorder &&
  new Set(ids).size === ids.length && sameOrder([...active.tracks].sort(), [...ids].sort())
const stationDashboard = 'https://quintastream.cl/station/12/playlists'

function StationHandoff({ active }: { active: DailyPlayback | null }) {
  return <div className="publication-note">
    <strong>حفظ للتحضير فقط</strong>
    {mode === 'hosted' ? <>
      <p>لتطبيق التغيير، افتح <a href={stationDashboard} target="_blank" rel="noopener">لوحة Quintastream للمحطة 12</a> واتبع الخطوات التالية.</p>
      <ol>
        <li>تحقّق من اسم قائمة التشغيل اليومية المخصّصة في إعداد المحطة. أبقِ قائمة الاستعادة محفوظة{active ? <>. القائمة المفعّلة عند آخر تحقق هي <bdi>{active.providerName}</bdi></> : ''}.</li>
        <li>من «ملفات الموسيقى»، عدّل عضوية قائمة التشغيل اليومية المخصّصة باستخدام التسجيلات الجاهزة والمأذون ببثها. أبقِ الملفات وعضويتها في القوائم الأخرى.</li>
        <li>من «قوائم التشغيل»، احفظ الترتيب التسلسلي للقائمة المخصّصة دون جدول زمني. إذا كانت قائمة الاستعادة تعمل، جهّز اليومية وهي معطّلة ثم بدّل القائمتين في موعد التبديل.</li>
        <li>اضغط «تحديث حالة المحطة» هنا وقارن الترتيب. تحقّق بالاستماع بعد التبديل.</li>
      </ol>
    </> : <p>يُحفظ الترتيب في مساحة التجربة.</p>}
  </div>
}

export function Daily({ workspace, ...props }: EditorProps & { workspace: Workspace }) {
  const [saved, setSaved] = useState(() => fromWorkspace(workspace))
  const [newId] = useState(() => crypto.randomUUID())
  const [edits, setEdits] = useState<string[] | null>(null)
  const [active, setActive] = useState<DailyPlayback | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(mode === 'local' ? 'ready' : 'loading')
  const [review, setReview] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [conflict, setConflict] = useState<Playlist | null>(null)
  const [reset, setReset] = useState(0)
  const [needsRead, setNeedsRead] = useState(false)
  const save = useTask()
  const apply = useTask()
  const savedOrder = saved?.tracks ?? active?.tracks ?? []
  const ids = edits ?? savedOrder
  const dirty = Boolean(edits && !sameOrder(edits, savedOrder))
  const matches = Boolean(active && sameOrder(ids, active.tracks))
  const catalog = new Map(props.library.map((track) => [track.id, track]))
  const trackIssue = ids.some((id) => catalog.get(id)?.broadcastRestricted) ? 'recording_restricted' :
    ids.some((id) => !(Number(catalog.get(id)?.seconds) > 0)) ? 'media_not_ready' : ''
  const busy = save.busy || apply.busy || uploading
  const verified = status === 'ready' && Boolean(active) && !needsRead
  const ready = props.libraryState === 'ready' && !trackIssue
  const canApply = verified && ready && canUpdate(active, ids)
  const added = active ? ids.filter((id) => !active.tracks.includes(id)) : []
  const removed = active ? active.tracks.filter((id) => !ids.includes(id)) : []
  const showHandoff = ready && !needsRead && ids.length > 0 && !canApply && !(matches && verified) &&
    (dirty || Boolean(saved)) && status !== 'loading'
  const canReview = !busy && !dirty && !needsRead && ready && status !== 'loading' && Boolean(saved) && !(matches && verified)
  useEditorGuard(dirty || busy, props.onDirty)

  async function readStation() {
    setStatus('loading')
    try {
      const observed = await stationApi.daily()
      setActive(observed)
      setNeedsRead(false)
      setStatus('ready')
    } catch { setStatus('failed') }
  }
  useEffect(() => { if (mode !== 'local') void readStation() }, [])

  function change(change: SetStateAction<string[]>) {
    setEdits((previous) => typeof change === 'function' ? change(previous ?? savedOrder) : change)
  }
  function restore(order: string[] | null) {
    if (dirty && !confirm('هل تريد استبدال التعديلات غير المحفوظة؟')) return
    setEdits(order)
    setReset((value) => value + 1)
    if (!order) setConflict(null)
  }
  async function saveChanges() {
    const id = saved?.id ?? newId
    const title = saved?.title ?? fallbackName
    setConflict(null)
    try {
      const revision = await saveDaily(id, saved?.revision ?? 0, { title, tracks: ids })
      setSaved({ id, title, revision, tracks: ids })
    } catch (error) {
      const latest = await props.refresh().then(fromWorkspace).catch(() => undefined)
      if (latest?.id === id && latest.title === title && sameOrder(latest.tracks, ids)) setSaved(latest)
      else {
        if (latest && (latest.id !== saved?.id || latest.revision !== saved.revision)) setConflict(latest)
        throw error
      }
    }
    setEdits(null)
    return 'حُفظت نسخة البث اليومي في التطبيق للتحضير.'
  }

  function updateStation() {
    if (!active || !saved || !canApply || !canReview) return
    void apply.run(async () => {
      setReview(false)
      try {
        const updated = await updateDailyOrder(saved.id, saved.revision, active)
        setActive(updated)
        if (updated.outcome === 'already_current') return 'كان ترتيب المحطة مطابقًا بالفعل.'
        return 'طابق إعداد المحطة الترتيب المطلوب عند التحقق. قد تُشغّل المحطة المقاطع الموجودة في الطابور أولًا.'
      } catch (error) {
        setNeedsRead(true)
        throw error
      }
    })
  }

  return <>
    <section className="station-strip state-panel" aria-label="إعداد البث في المحطة">
      <div className="station-readback" aria-live="polite">
        <span className="tile-icon"><Radio size={22} aria-hidden="true" /></span>
        <div><h2>القائمة المفعّلة في المحطة</h2>
          <p>{status === 'loading' ? 'جارٍ قراءة إعداد المحطة…' : status === 'failed' ? 'تعذّرت قراءة إعداد المحطة.' :
            active?.title ?? (mode === 'local' ? 'بيئة التطوير المحلية' : 'تعذّر تأكيد قائمة يومية واحدة.')}</p>
          {active && <p className="meta-line">{count.format(active.tracks.length)} مقطع · آخر تحقق {ammanDate(active.verifiedAt)}</p>}
          {active && mode === 'hosted' && <p className="meta-line"><bdi>{active.providerName}</bdi></p>}
        </div>
      </div>
      {mode !== 'local' && <button type="button" disabled={status === 'loading' || busy} onClick={() => void readStation()}>
        <RefreshCw size={16} /> تحديث حالة المحطة
      </button>}
      {active && <details className="disclosure readback-details"><summary>عرض ترتيب المحطة</summary>
        <TrackSummary ids={active.tracks} library={props.library} />
        {verified && !matches && <button type="button" disabled={busy} onClick={() => restore([...active.tracks])}>
          استخدام ترتيب المحطة في المحرّر
        </button>}
      </details>}
    </section>
    <section className="state-panel playlist-editor daily-editor" aria-labelledby="daily-editor-title">
      <div className="editor-heading">
        <span className="tile-icon"><ListMusic size={22} aria-hidden="true" /></span>
        <div><h2 id="daily-editor-title">قائمة البث اليومي</h2>
          {saved ? <p className="muted">ترتيب البث اليومي المحفوظ في التطبيق</p> :
            <p className="muted">{verified ? 'بدأ المحرّر من ترتيب المحطة. تُنشأ نسخة التحضير عند أول حفظ.' : 'يبدأ المحرّر بعد قراءة ترتيب المحطة.'}</p>}</div>
      </div>
      <form onSubmit={(event) => {
        event.preventDefault()
        if (dirty && ids.length && !busy && !conflict && status !== 'loading') void save.run(saveChanges)
      }}>
        {verified && active && !matches && <div className="publication-note" aria-label="الفروق عن ترتيب المحطة">
          <strong>{dirty ? 'تعديلاتك الحالية' : 'نسخة تحضير غير مطبّقة'} · {count.format(ids.length)} مقطع</strong>
          <details className="disclosure"><summary>مقارنة مع القائمة المفعّلة</summary>
            <p>ترتيب المحطة</p><TrackSummary ids={active.tracks} library={props.library} />
            <p>ترتيب المحرّر</p><TrackSummary ids={ids} library={props.library} />
            {added.length > 0 && <><p>مقاطع أضيفت</p><TrackSummary ids={added} library={props.library} /></>}
            {removed.length > 0 && <><p>مقاطع أزيلت</p><TrackSummary ids={removed} library={props.library} /></>}
            {!added.length && !removed.length && <p>تغيّر ترتيب المقاطع.</p>}
          </details>
        </div>}
        <fieldset disabled={save.busy || apply.busy || (mode !== 'local' && !saved && !active && !edits)}>
          <TrackOrder {...props} ids={ids} onChange={change} resetKey={(saved?.id ?? '') + ':' + (saved?.revision ?? 0) + ':' + reset}
            onUploadBusy={setUploading} />
        </fieldset>
        {ids.length > 0 && props.libraryState === 'ready' && trackIssue &&
          <p className="publication-note">{message(Error(trackIssue))} يمكنك حفظ الترتيب في التطبيق.</p>}
        <TaskNotice task={save} waiting="جارٍ الحفظ…" />
        <TaskNotice task={apply} waiting="جارٍ تحديث الترتيب والتحقق من المحطة…" />
        {needsRead && <p className="publication-note">حدّث حالة المحطة للتحقق من الترتيب قبل أي محاولة أخرى.</p>}
        {conflict && <div className="publication-note">
          <p>راجع ترتيب النسخة الأحدث قبل اختيار ما تريد الاحتفاظ به.</p>
          <TrackSummary ids={conflict.tracks} library={props.library} />
          <div className="row-actions">
            <button type="button" disabled={busy} onClick={() => { setSaved(conflict); setEdits(null); setConflict(null) }}>استخدام النسخة الأحدث</button>
            <button type="button" disabled={busy} onClick={() => { setEdits(ids); setSaved(conflict); setConflict(null) }}>الاحتفاظ بترتيبي لمراجعته</button>
          </div>
        </div>}
        {showHandoff && <StationHandoff active={active} />}
        <EditorActions status={dirty ? 'تغييرات غير محفوظة' : verified && matches ? 'الترتيب مطابق لإعداد المحطة' :
          saved ? 'نسخة التحضير محفوظة · تطبيقها في المحطة غير مؤكّد' : 'تُحفظ التعديلات أولًا كنسخة تحضير'}>
          {dirty && <button type="button" disabled={busy || Boolean(conflict)} onClick={() => restore(null)}>تراجع عن التغييرات</button>}
          {dirty && <button type="submit" className="primary" disabled={!ids.length || busy || Boolean(conflict) || status === 'loading'}>حفظ نسخة التحضير</button>}
          {canReview && <button type="button" className="primary" onClick={() => setReview(true)}>{canApply ? 'مراجعة تحديث المحطة' : 'مراجعة نسخة التحضير'}</button>}
        </EditorActions>
      </form>
    </section>
    <Modal open={review} title={canApply ? 'تحديث البث اليومي' : 'مراجعة نسخة التحضير'} close={() => setReview(false)}>
      <div className="modal-body">
        {canApply && <p>سيُحدّث هذا الإجراء ترتيب المقاطع الموجودة في القائمة اليومية. قد تُشغّل المحطة المقاطع المنتظرة أولًا.</p>}
        {!canApply && <StationHandoff active={active} />}
        {active && <p className="meta-line">القائمة في لوحة المحطة · <bdi>{active.providerName}</bdi></p>}
        <TrackSummary ids={ids} library={props.library} />
      </div>
      <div className="modal-actions">
        <button type="button" onClick={() => setReview(false)}>العودة إلى القائمة</button>
        {canApply ? <button type="button" className="primary" onClick={updateStation}>تحديث ترتيب المحطة</button> :
          mode === 'hosted' && <a className="action" href={stationDashboard} target="_blank" rel="noopener">
            فتح لوحة المحطة <ArrowUpRight size={17} aria-hidden="true" />
          </a>}
      </div>
    </Modal>
  </>
}
