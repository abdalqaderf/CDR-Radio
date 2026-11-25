import { useState } from 'react'
import { mode, type Track } from './radio'

export function TrackOrder({
  library,
  ids,
  onChange,
}: {
  library: Track[]
  ids: string[]
  onChange: (ids: string[]) => void
}) {
  const [selected, setSelected] = useState('')
  const manual = mode === 'local' || mode === 'hosted'
  const valid = manual ? /^[A-Za-z0-9_:.~-]{1,160}$/.test(selected) : !!selected
  const name = (id: string) => library.find((t) => t.id === id)?.title ?? id
  function move(index: number, delta: number) {
    const list = [...ids]
    const [id] = list.splice(index, 1)
    if (id) list.splice(index + delta, 0, id)
    onChange(list)
  }
  return (
    <fieldset>
      <legend>ترتيب المقاطع</legend>
      <label>
        {manual ? 'معرّف المقطع في المحطة' : 'اختيار مقطع'}
        {manual ? (
          <>
            <input dir="ltr" maxLength={160} value={selected} list="station-track-ids"
              onChange={(e) => setSelected(e.target.value.trim())} />
            <datalist id="station-track-ids">
              {library.map((t) => <option key={t.id} value={t.id} label={t.title} />)}
            </datalist>
          </>
        ) : <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">اختر من المكتبة</option>
          {library.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>}
      </label>
      {manual && <p className="muted">يُحفظ المعرّف في المسودة حتى يمكن التحقق منه في مكتبة المحطة.</p>}
      <button
        type="button"
        disabled={!valid || ids.length >= 250}
        onClick={() => onChange([...ids, selected])}
      >
        إضافة المقطع
      </button>
      <ol className="order-list">
        {ids.map((id, i) => (
          <li key={i}>
            <span>
              {i + 1}. {name(id)}
            </span>
            <div className="row-actions">
              <button
                type="button"
                aria-label={'تقديم ' + name(id)}
                disabled={!i}
                onClick={() => move(i, -1)}
              >
                تقديم
              </button>
              <button
                type="button"
                aria-label={'تأخير ' + name(id)}
                disabled={i === ids.length - 1}
                onClick={() => move(i, 1)}
              >
                تأخير
              </button>
              <button
                type="button"
                aria-label={'إزالة ' + name(id)}
                onClick={() => onChange(ids.filter((_, n) => n !== i))}
              >
                إزالة
              </button>
            </div>
          </li>
        ))}
      </ol>
    </fieldset>
  )
}
