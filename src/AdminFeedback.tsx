import { useEffect, useRef, useState } from 'react'
import { message } from './radio'

export function useTask() {
  const working = useRef(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  async function run(fn: () => Promise<string | void>) {
    if (working.current) return
    working.current = true
    setBusy(true)
    setNotice('')
    setError('')
    try {
      setNotice((await fn()) || '')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'unavailable')
      setNotice(message(failure))
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  return { run, busy, notice, error }
}

export function TaskNotice({ task, waiting = 'جارٍ تنفيذ العملية…' }: {
  task: ReturnType<typeof useTask>
  waiting?: string
}) {
  return <p className="task-notice" data-failed={Boolean(task.error)} data-busy={task.busy} role={task.error ? 'alert' : 'status'}>
    {task.busy ? waiting : task.notice}
  </p>
}

export function useEditorGuard(dirty: boolean, setDirty: (value: boolean) => void) {
  useEffect(() => {
    setDirty(dirty)
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = '' }
    if (dirty) window.addEventListener('beforeunload', beforeUnload)
    return () => {
      setDirty(false)
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [dirty, setDirty])
}
