import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { TaskNotice, useEditorGuard, useTask } from './AdminFeedback'
import { EditorActions, TrackSummary, type EditorProps } from './EditorContent'
import { Modal } from './PlaylistControls'
import {
  ammanDate, discardProgram, message, mode, previewWindow, saveDraft, saveProgramEdit, syncProgram,
  type Preview, type Program, type ProgramDocument, type Track, type Workspace,
} from './radio'
import { TrackOrder } from './TrackOrder'

const statusLabels: Record<string, string> = {
  draft: 'محفوظ · غير منشور',
  publishing: 'النشر قيد التحقق',
  upcoming: 'قادم',
  active: 'ضمن موعده الآن',
  completed: 'انتهى موعده',
  sync_failed: 'بانتظار تحقق المحطة',
  cancelled: 'ملغى',
}
const limits = 'قد يبدأ البرنامج مبكرًا أو تُشغّل المحطة مقاطع إضافية بعد الموعد. تعتمد العودة للبث اليومي على طابور المحطة.'
const programSnapshot = ({ title, tracks, window, playback, endPolicy, transition }: ProgramDocument) =>
  JSON.stringify([title.trim(), tracks, window.date, window.start, window.end, window.wholeDay, playback, endPolicy, transition])
const publicationConflict = (status: string) => ['scheduled', 'publishing', 'sync_failed'].includes(status)
const knownRejection = new Set(['admin_required', 'revision_conflict', 'overlap_conflict', 'sync_busy', 'window_too_soon',
  'edit_window_started', 'invalid_window', 'invalid_tracks', 'invalid_draft', 'unsupported_tracks', 'unsupported_policy'])

function canLeave(dirty: boolean) {
  return !dirty || window.confirm('هناك تغييرات غير محفوظة. هل تريد مغادرة المحرر؟')
}

function programState(program: Program, now: number) {
  if (program.status !== 'scheduled') return program.status
  if (!program.verifiedAt || program.pendingAction) return 'sync_failed'
  if (Date.parse(program.endsAt) <= now) return 'completed'
  return Date.parse(program.startsAt) <= now ? 'active' : 'upcoming'
}

function ProgramStatus({ program, status }: { program: Program; status: string }) {
  return <>
    <span className="pill" data-status={status}>{statusLabels[status] ?? 'الحالة غير متاحة'}</span>
    {status === 'upcoming' && program.unpublishedEdit &&
      <span className="pill" data-status="sync_failed">تعديلات محفوظة غير منشورة</span>}
  </>
}

export function Programs({ workspace, ...props }: EditorProps & { workspace: Workspace }) {
  const [selected, setSelected] = useState<{ id?: string; key: string } | null>(null)
  const [filter, setFilter] = useState('current')
  const [now, setNow] = useState(Date.now)
  const [uncertain, setUncertain] = useState<{ id: string; expected: 'scheduled' | 'cancelled'; revision: number } | null>(null)
  const [cancel, setCancel] = useState<Program | null>(null)
  const dirty = useRef(false)
  const editor = useRef<HTMLElement>(null)
  const create = useRef<HTMLButtonElement>(null)
  const task = useTask()
  const { onDirty } = props
  const markDirty = useCallback((value: boolean) => { dirty.current = value; onDirty(value) }, [onDirty])
  const visible = workspace.programs.map((program) => ({ program, state: programState(program, now) }))
    .filter(({ state }) => filter === 'current' ? !['completed', 'cancelled'].includes(state) : state === filter)
    .sort((a, b) => filter === 'current' ? a.program.startsAt.localeCompare(b.program.startsAt) :
      b.program.startsAt.localeCompare(a.program.startsAt))
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, 15000)
    window.addEventListener('focus', tick)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [])
  useEffect(() => { if (selected) editor.current?.focus() }, [selected])
  function open(id?: string) {
    if (!canLeave(dirty.current)) return
    setSelected({ id, key: crypto.randomUUID() })
  }
  function close() {
    setSelected(null)
    requestAnimationFrame(() => create.current?.focus({ preventScroll: true }))
  }
  async function readResult(operation: NonNullable<typeof uncertain>) {
    let program: Program | undefined
    try { program = (await props.refresh()).programs.find((p) => p.id === operation.id) }
    catch { return 'نتيجة العملية غير مؤكدة. تحقّق مجددًا عند عودة الاتصال.' }
    if (program?.pendingAction) {
      setUncertain(null)
      return 'بانتظار تحقق المحطة. استخدم إعادة التحقق عند اكتمال العملية الجارية.'
    }
    const expected = operation.expected
    if (program?.status === expected && program.verifiedAt && program.revision > operation.revision) {
      setUncertain(null)
      return expected === 'cancelled' ? 'تأكّد إلغاء الجدولة من المحطة.' : 'تأكّد النشر من المحطة.'
    }
    return 'لم تتأكد النتيجة بعد. يمكنك تحديث الحالة مجددًا.'
  }
  function reconcile(program: Program, action: 'retry' | 'cancel') {
    const operation = { id: program.id, revision: program.revision,
      expected: action === 'cancel' || program.pendingAction === 'cancel' ? 'cancelled' : 'scheduled' } as const
    void task.run(async () => {
      setCancel(null)
      if (selected?.id === program.id) close()
      try {
        const result = await syncProgram(action, program.id, program.revision)
        if (!result.error && result.verifiedAt && result.status === operation.expected) {
          setUncertain(null)
          try { await props.refresh() } catch { setUncertain(operation) }
          return result.status === 'cancelled' ? 'تأكّد إلغاء الجدولة من المحطة.' : 'تأكّد النشر من المحطة.'
        }
      } catch (error) {
        if (error instanceof Error && knownRejection.has(error.message)) throw error
      }
      setUncertain(operation)
      return readResult(operation)
    })
  }
  const formProgram = workspace.programs.find((p) => p.id === selected?.id)
  if (selected) return <section className="state-panel playlist-editor program-editor" ref={editor} tabIndex={-1}>
    <ProgramEditor key={selected.key} existing={formProgram}
      close={close} {...props} onDirty={markDirty} stationBusy={task.busy} />
  </section>
  return <>
    <section className="state-panel">
      <div className="panel-heading">
        <p className="muted">المواعيد بتوقيت عمّان. حالة الموعد تستند إلى الجدولة التي تحقّقت منها المحطة.</p>
        <button ref={create} type="button" className="primary" disabled={task.busy} onClick={() => open()}><CalendarDays size={17} /> إنشاء برنامج خاص</button>
      </div>
      <label className="compact-field">
        عرض البرامج<select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="current">الحالية والقادمة وغير المنشورة</option>
          <option value="completed">البرامج المنتهية</option>
          <option value="cancelled">البرامج الملغاة</option>
        </select>
      </label>
      {!visible.length && <p className="empty">{filter === 'current' ? 'لا توجد برامج في هذه القائمة. أنشئ برنامجًا لتحديد موعد ومقاطع خاصة.' :
        filter === 'completed' ? 'لا توجد برامج انتهى موعدها.' : 'لا توجد برامج ملغاة.'}</p>}
      {visible.map(({ program, state }) => <div className="saved program-row" key={program.id}>
        <div>
          <div className="program-title"><strong dir="auto">{program.title}</strong><ProgramStatus program={program} status={state} /></div>
          <p className="meta-line">{ammanDate(program.startsAt)} — {ammanDate(program.endsAt)}</p>
          {state === 'active' && <p className="meta-line">يعتمد وقت الاستماع الفعلي على طابور المحطة.</p>}
          {state === 'upcoming' && Date.parse(program.startsAt) <= now + 60000 && <p className="meta-line">اقترب الموعد. يمكنك إلغاء الجدولة.</p>}
        </div>
        <div className="row-actions">
          {(state === 'draft' || (state === 'upcoming' && Date.parse(program.startsAt) > now + 60000)) &&
            <button type="button" disabled={task.busy} onClick={() => open(program.id)}>تحرير البرنامج</button>}
          {mode === 'hosted' && program.pendingAction &&
            <button type="button" disabled={task.busy}
              onClick={() => reconcile(program, 'retry')}>إعادة التحقق من المحطة</button>}
          {mode === 'hosted' && ((program.status === 'scheduled' && Date.parse(program.endsAt) > Date.now()) ||
            program.pendingAction) && <button type="button"
              disabled={task.busy} onClick={() => setCancel(program)}>إلغاء الجدولة</button>}
        </div>
      </div>)}
      <TaskNotice task={task} waiting="جارٍ التحقق من المحطة…" />
      {uncertain && <button type="button" disabled={task.busy} onClick={() => void task.run(() => readResult(uncertain))}>تحقّق من حالة العملية</button>}
    </section>
    <Modal open={Boolean(cancel)} title="إلغاء الجدولة" close={() => setCancel(null)}>
      <div className="modal-body"><p>هل تريد إلغاء موعد «{cancel?.title}» في المحطة؟</p>
        {cancel && Date.parse(cancel.startsAt) <= now &&
          <p className="publication-note">قد تستمر مقاطع دخلت طابور المحطة قبل تأكيد الإلغاء. بعدها يعود البث اليومي.</p>}</div>
      <div className="modal-actions">
        <button type="button" onClick={() => setCancel(null)}>العودة</button>
        <button type="button" className="primary" onClick={() => { if (cancel) reconcile(cancel, 'cancel') }}>تأكيد الإلغاء</button>
      </div>
    </Modal>
  </>
}

function programDoc(program: Program): ProgramDocument {
  return { title: program.title, tracks: program.tracks, window: program.window,
    playback: program.playback, endPolicy: program.endPolicy, transition: program.transition }
}

function ProgramEditor({ existing, close, stationBusy, ...props }: EditorProps & {
  existing?: Program
  close: () => void
  stationBusy: boolean
}) {
  const [id] = useState(() => existing?.id ?? crypto.randomUUID())
  const [revision, setRevision] = useState(existing?.revision ?? 0)
  const [initial] = useState<ProgramDocument>(() => existing?.unpublishedEdit ?? (existing ? programDoc(existing) : {
    title: '', tracks: [], window: { date: '', start: '', end: '', wholeDay: false },
    playback: 'repeat', endPolicy: 'daily', transition: 'finish',
  }))
  const [title, setTitle] = useState(initial.title)
  const [ids, setIds] = useState(initial.tracks)
  const [windowSpec, setWindow] = useState(initial.window)
  const [playback, setPlayback] = useState(initial.playback)
  const [endPolicy, setEndPolicy] = useState(initial.endPolicy)
  const [transition, setTransition] = useState(initial.transition)
  const [saved, setSaved] = useState(() => programSnapshot(initial))
  const [published, setPublished] = useState(existing?.status === 'scheduled')
  const [verified, setVerified] = useState(Boolean(existing?.verifiedAt))
  const [unpublished, setUnpublished] = useState(Boolean(existing?.unpublishedEdit))
  const [uploading, setUploading] = useState(false)
  const [step, setStep] = useState<'details' | 'tracks'>('details')
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const [review, setReview] = useState<Preview | null>(null)
  const [outcome, setOutcome] = useState<'uncertain' | 'pending' | null>(null)
  const [conflict, setConflict] = useState<Program | null>(null)
  const [submittedRevision, setSubmittedRevision] = useState(revision)
  const save = useTask()
  const reviewTask = useTask()
  const publication = useTask()
  const doc: ProgramDocument = { title: title.trim(), tracks: ids, window: windowSpec, playback, endPolicy, transition }
  const dirty = programSnapshot(doc) !== saved
  const busy = stationBusy || save.busy || reviewTask.busy || publication.busy || uploading
  const catalog = new Map(props.library.map((item) => [item.id, item]))
  const selected = ids.map((id) => catalog.get(id))
  const trackIssue = selected.some((track) => track?.broadcastRestricted) ? 'recording_restricted' :
    selected.some((track) => track?.daily) ? 'protected_daily_media' :
    selected.some((track) => !track?.seconds || track.seconds <= 0) ? 'media_not_ready' :
    new Set(ids).size < 2 || new Set(ids).size !== ids.length ? 'unsupported_tracks' : ''
  const badPolicy = windowSpec.wholeDay || playback !== 'repeat' || endPolicy !== 'daily' || transition !== 'finish'
  const hasWindow = Boolean(windowSpec.date && (windowSpec.wholeDay ||
    (windowSpec.start && windowSpec.end && windowSpec.start !== windowSpec.end)))
  const valid = Boolean(doc.title && ids.length && hasWindow)
  const editable = !outcome
  const publishable = mode === 'hosted' && valid && props.libraryState === 'ready' && !trackIssue && !badPolicy
  const needsSave = !revision || dirty
  const canReview = publishable && (!published || unpublished || dirty)
  useEditorGuard(dirty || busy, props.onDirty)

  function changeWindow(change: Partial<typeof windowSpec>) {
    setWindow((previous) => ({ ...previous, ...change }))
  }
  function goToStep(next: typeof step) {
    setStep(next)
    requestAnimationFrame(() => stepHeading.current?.focus())
  }
  async function persist() {
    setConflict(null)
    let next: number
    try {
      next = published ? await saveProgramEdit(id, revision, doc) : await saveDraft('program', id, revision, { ...doc })
    } catch (error) {
      const latest = await props.refresh().then((workspace) => workspace.programs.find((p) => p.id === id)).catch(() => undefined)
      if (!latest || (published ? latest.status !== 'scheduled' : latest.status !== 'draft')) throw error
      if (programSnapshot(latest.unpublishedEdit ?? programDoc(latest)) !== programSnapshot(doc)) {
        if (latest.revision !== revision) setConflict(latest)
        throw error
      }
      next = latest.revision
    }
    setRevision(next)
    setSaved(programSnapshot(doc))
    setUnpublished(published)
    void props.refresh().catch(() => {})
    return next
  }
  function confirmed(nextRevision: number) {
    setRevision(nextRevision)
    setPublished(true)
    setVerified(true)
    setUnpublished(false)
    setOutcome(null)
    return 'تأكّد حفظ الجدولة على المحطة.'
  }
  async function checkOutcome(submitted = submittedRevision) {
    let observed: Program | undefined
    try { observed = (await props.refresh()).programs.find((p) => p.id === id) }
    catch { return 'نتيجة النشر غير مؤكدة. تحقّق مجددًا عند عودة الاتصال.' }
    if (observed?.pendingAction) {
      setOutcome('pending')
      return 'بانتظار تحقق المحطة. يمكنك إعادة التحقق من قائمة البرامج.'
    }
    // A verified receipt after the submitted revision must describe the same program.
    if (observed?.status === 'scheduled' && observed.verifiedAt && observed.revision > submitted &&
      programSnapshot(programDoc(observed)) === programSnapshot(doc))
      return confirmed(observed.revision)
    return 'لم تتأكد نتيجة النشر. تحقّق مجددًا أو أعد إرسال العملية بنفس النسخة المحفوظة.'
  }
  function publish() {
    void publication.run(async () => {
      setReview(null)
      // Save first and publish the returned revision. A failed save never reaches the station.
      const submitted = needsSave ? await persist() : revision
      setSubmittedRevision(submitted)
      let restriction: string | undefined
      try {
        const result = await syncProgram(published ? 'edit' : 'publish', id, submitted, published ? doc : undefined)
        if (result.status === 'scheduled' && result.verifiedAt && !result.error) {
          void props.refresh().catch(() => {})
          return confirmed(result.revision)
        }
        restriction = result.error
      } catch (error) {
        if (error instanceof Error && knownRejection.has(error.message)) throw error
      }
      setOutcome('uncertain')
      const observed = await checkOutcome(submitted)
      if (restriction && knownRejection.has(restriction) ||
        restriction && ['recording_restricted', 'protected_daily_media', 'media_not_ready'].includes(restriction))
        return message(Error(restriction)) + ' ' + observed
      return observed
    })
  }
  function showReview() {
    void reviewTask.run(async () => {
      const interval = await previewWindow(windowSpec, id)
      setReview(interval)
    })
  }
  const conflicts = review?.conflicts.filter((c) => publicationConflict(c.status)) ?? []
  const tooSoon = review && (Date.parse(review.startsAt) <= Date.now() + 60000 ||
    (published && existing && Date.parse(existing.startsAt) <= Date.now() + 60000))
  return <>
    <div className="panel-heading"><h2>{existing ? 'تعديل البرنامج الخاص' : 'برنامج خاص جديد'}</h2>
      <button type="button" className="quiet-action" disabled={busy} onClick={() => { if (canLeave(dirty)) close() }}>
        <ArrowRight size={17} aria-hidden="true" /> العودة إلى البرامج</button></div>
    <ol className="program-steps" aria-label="خطوات البرنامج">
      <li aria-current={step === 'details' ? 'step' : undefined}>الاسم والموعد</li>
      <li aria-current={step === 'tracks' ? 'step' : undefined}>المقاطع ومراجعة النشر</li>
    </ol>
    <form onSubmit={(e) => {
      e.preventDefault()
      if (busy || !editable) return
      if (step === 'details') { if (doc.title && hasWindow) goToStep('tracks'); return }
      if (!valid || !needsSave || conflict) return
      void save.run(async () => {
        await persist()
        return published ? 'حُفظت التعديلات هنا. الجدولة المنشورة تبقى كما هي حتى النشر.' :
          'حُفظ البرنامج دون نشر.'
      })
    }}>
      {step === 'details' ? <fieldset disabled={busy || !editable} className="program-step">
        <h3 className="visually-hidden" tabIndex={-1} ref={stepHeading}>الاسم والموعد</h3>
        <label>اسم البرنامج<input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="time-grid schedule-fields">
          <label>التاريخ بتوقيت عمّان<input type="date" required value={windowSpec.date}
            onChange={(e) => changeWindow({ date: e.target.value })} /></label>
          {!windowSpec.wholeDay && <>
            <label>وقت البداية<input type="time" required value={windowSpec.start}
              onChange={(e) => changeWindow({ start: e.target.value })} /></label>
            <label>وقت النهاية<input type="time" required value={windowSpec.end}
              onChange={(e) => changeWindow({ end: e.target.value })} /></label>
          </>}
        </div>
        {!windowSpec.wholeDay && windowSpec.start && windowSpec.end && windowSpec.end < windowSpec.start &&
          <p className="muted">وقت النهاية في اليوم التالي.</p>}
        {!windowSpec.wholeDay && windowSpec.start && windowSpec.end === windowSpec.start &&
          <p className="validation" role="alert">اختر وقت نهاية مختلفًا عن البداية.</p>}
        {windowSpec.wholeDay && <p className="publication-note">الفترة طوال اليوم محفوظة للتخطيط. اختر وقتي البداية والنهاية لتتمكن من النشر.</p>}
        <details className="disclosure program-options">
          <summary>خيارات إضافية للتخطيط</summary>
          <p className="muted">يدعم النشر التكرار بالترتيب وطلب إكمال المقطع والعودة للبث اليومي.</p>
          <label className="check"><input type="checkbox" checked={windowSpec.wholeDay}
            onChange={(e) => changeWindow({ wholeDay: e.target.checked })} /> طوال اليوم</label>
          <label>التشغيل داخل الفترة<select value={playback} onChange={(e) => setPlayback(e.target.value)}>
            <option value="repeat">تكرار القائمة بالترتيب</option><option value="once">مرة واحدة</option></select></label>
          <label>عند نهاية الفترة<select value={endPolicy} onChange={(e) => setEndPolicy(e.target.value)}>
            <option value="daily">العودة إلى البث اليومي</option><option value="stop">إيقاف البث</option></select></label>
          <label>الانتقال بين المقاطع<select value={transition} onChange={(e) => setTransition(e.target.value)}>
            <option value="finish">إكمال المقطع الحالي</option><option value="interrupt">مقاطعة فورية</option></select></label>
        </details>
      </fieldset> : <fieldset disabled={busy && !uploading || !editable} className="program-step">
        <h3 className="visually-hidden" tabIndex={-1} ref={stepHeading}>المقاطع ومراجعة النشر</h3>
        <TrackOrder {...props} ids={ids} onChange={setIds} resetKey={String(revision)} onUploadBusy={setUploading} />
      </fieldset>}
      {step === 'tracks' && !outcome && (badPolicy || trackIssue || props.libraryState !== 'ready' || mode !== 'hosted') && <p className="publication-note">
        {badPolicy ? message(Error('unsupported_policy')) : mode !== 'hosted' ? 'يمكن حفظ البرنامج هنا. النشر متاح في لوحة الإدارة المستضافة.' :
          props.libraryState !== 'ready' ? 'تحقّق من المكتبة قبل مراجعة النشر.' :
          message(Error(trackIssue))}
      </p>}
      <TaskNotice task={save} waiting="جارٍ حفظ التغييرات…" />
      <TaskNotice task={reviewTask} waiting="جارٍ التحقق من الفترة…" />
      <TaskNotice task={publication} waiting="جارٍ النشر والتحقق من المحطة…" />
      {outcome === 'uncertain' && <div className="row-actions">
        <button type="button" disabled={busy} onClick={() => void publication.run(() => checkOutcome())}>تحقّق من حالة النشر</button>
        <button type="button" disabled={busy} onClick={showReview}>مراجعة إعادة النشر</button>
      </div>}
      {outcome === 'pending' && <button type="button" disabled={busy} onClick={close}>العودة إلى البرامج والتحقق</button>}
      {conflict && <div className="publication-note">
        <p>النسخة الأحدث · {conflict.unpublishedEdit?.title ?? conflict.title}</p>
        <TrackSummary ids={conflict.unpublishedEdit?.tracks ?? conflict.tracks} library={props.library} />
        <button type="button" disabled={busy} onClick={() => {
          setRevision(conflict.revision)
          setSaved(programSnapshot(conflict.unpublishedEdit ?? programDoc(conflict)))
          setUnpublished(Boolean(conflict.unpublishedEdit))
          setConflict(null)
        }}>الاحتفاظ بتعديلاتي لمراجعتها</button>
      </div>}
      <EditorActions status={outcome ? 'النتيجة بانتظار التحقق' : dirty ? 'تغييرات غير محفوظة' : unpublished ?
        'تعديلات محفوظة غير منشورة' : published ? (verified ? 'منشور على المحطة' : 'بانتظار التحقق') :
        revision ? 'محفوظ · غير منشور' : 'برنامج جديد'}>
        {step === 'details' ? <button type="submit" className="primary" disabled={busy || !doc.title || !hasWindow}>متابعة إلى المقاطع</button> : <>
          <button type="button" disabled={busy || !editable} onClick={() => goToStep('details')}>تعديل الموعد</button>
          {needsSave && <button type="submit" className={!canReview ? 'primary' : undefined}
            disabled={!editable || !valid || busy || Boolean(conflict)}>حفظ دون نشر</button>}
          {canReview && editable && <button type="button" className="primary" disabled={busy || Boolean(conflict)}
            onClick={showReview}>مراجعة النشر</button>}
        </>}
      </EditorActions>
      {step === 'tracks' && revision > 0 && !published && editable && <details className="disclosure draft-options"><summary>إدارة البرنامج المحفوظ</summary>
        <button type="button" disabled={busy} onClick={() => {
          if (confirm('حذف البرنامج المحفوظ؟')) void save.run(async () => {
            await discardProgram(id, revision)
            await props.refresh()
            close()
          })
        }}>حذف البرنامج غير المنشور</button>
      </details>}
    </form>
    <Modal open={Boolean(review)} title="مراجعة النشر" close={() => setReview(null)}>
      <div className="modal-body">
        {review && <ScheduleSummary interval={review} doc={doc} library={props.library} />}
        {tooSoon && <p className="validation" role="alert">{message(Error('window_too_soon'))}</p>}
        <p className="muted">{limits}</p>
      </div>
      <div className="modal-actions">
        <button type="button" onClick={() => setReview(null)}>العودة للتعديل</button>
        <button type="button" className="primary" disabled={busy || !publishable || Boolean(tooSoon) || conflicts.length > 0}
          onClick={publish}>{needsSave ? 'حفظ ونشر البرنامج' : 'تأكيد النشر'}</button>
      </div>
    </Modal>
  </>
}

function ScheduleSummary({ interval, doc, library }: { interval: Preview; doc: ProgramDocument; library: Track[] }) {
  const conflicts = interval.conflicts.filter((c) => publicationConflict(c.status))
  const drafts = interval.conflicts.filter((c) => c.status === 'draft')
  return <>
    <h3>{doc.title || 'الفترة المحددة'}</h3>
    <dl className="schedule-summary">
      <dt>التوقيت</dt><dd>عمّان · <bdi>Asia/Amman</bdi></dd>
      <dt>البداية</dt><dd>{ammanDate(interval.startsAt)}</dd>
      <dt>النهاية</dt><dd>{ammanDate(interval.endsAt)}</dd>
      <dt>داخل الفترة</dt><dd>{doc.playback === 'repeat' ? 'تكرار المقاطع بالترتيب' : 'تشغيل المقاطع مرة واحدة'}</dd>
      <dt>المطلوب بعد الفترة</dt><dd>{doc.transition === 'finish' ? 'إكمال المقطع الجاري ثم ' : ''}
        {doc.endPolicy === 'daily' ? 'العودة إلى البث اليومي' : 'إيقاف البث'}</dd>
    </dl>
    <h3>ترتيب التشغيل</h3>
    {doc.tracks.length ? <TrackSummary ids={doc.tracks} library={library} /> : <p className="muted">لم تُضف مقاطع بعد.</p>}
    {conflicts.length ? <p className="validation" role="alert">تتداخل الفترة مع {conflicts.map((c) => c.title).join('، ')}.</p> :
      <p className="muted">لا يوجد تعارض مع برنامج منشور أو بانتظار التحقق.</p>}
    {drafts.length > 0 && <p className="muted">برامج غير منشورة في الفترة نفسها · {drafts.map((c) => c.title).join('، ')}</p>}
  </>
}
