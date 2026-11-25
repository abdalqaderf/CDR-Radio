import { createRoot } from 'react-dom/client'
import { Component, type ReactNode } from 'react'
import {
  BookOpen,
  CalendarDays,
  Headphones,
  LayoutDashboard,
  Library,
  LockKeyhole,
  AudioLines,
  RadioTower,
} from 'lucide-react'
import { Player } from './Player'
import { Admin, Login } from './Admin'
import { mode, publicListener } from './radio'
import './style.css'

const sections = [
  { path: '/listen', label: 'مشغّل الفرع', icon: Headphones },
  { path: '/admin', label: 'لوحة الإدارة', icon: LayoutDashboard },
  { path: '/admin/media', label: 'مكتبة الصوت', icon: Library },
  { path: '/admin/programs', label: 'البرامج المجدولة', icon: CalendarDays },
  { path: '/demo', label: 'دليل التجربة', icon: BookOpen },
]

function StatePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="state-panel">
      <h2>{title}</h2>
      <div className="details">{children}</div>
    </section>
  )
}

function Demo() {
  return (
    <StatePanel title="تجربة الاستماع على جهازين">
      <ol>
        <li>افتح مشغّل الفرع على جهازين.</li>
        <li>اضغط على تشغيل البث في كل جهاز وقارن الصوت عند سماع علامة مميزة.</li>
        <li>أوقف الصوت في أحد الجهازين وتحقّق من استمراره على الجهاز الآخر.</li>
      </ol>
      {publicListener ? (
        <a href={publicListener}>
          <img className="listener-qr" src="/listen-qr.svg" width="180" height="180" alt="رمز فتح مشغّل الفرع على جهاز آخر" />
        </a>
      ) : <p>رابط التجربة العامة غير متاح حاليًا.</p>}
      <a className="action" href={publicListener || '/listen'}>
        فتح مشغّل الفرع
      </a>
    </StatePanel>
  )
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/listen'
  const section = sections.find((item) => item.path === path)
  const login = path === '/admin/login'
  const admin = path === '/admin' || path.startsWith('/admin/')
  const title = section?.label ?? (login ? 'دخول المسؤول' : 'الصفحة غير موجودة')
  document.title = title + ' | غماس بلدي'
  return (
    <>
      <a className="skip" href="#main">
        الانتقال إلى المحتوى
      </a>
      <header>
        <div className="topbar">
          <a className="brand" href="/listen">
            <span className="brand-icon"><AudioLines size={24} aria-hidden="true" /></span>
            <span><strong>غماس بلدي</strong><small>راديو الفروع</small></span>
          </a>
          <nav className="header-links" aria-label="روابط الراديو">
            <a href="/demo" aria-current={path === '/demo' ? 'page' : undefined}><BookOpen size={17} /> دليل التجربة</a>
            <a className="sign-in" href="/admin"><LockKeyhole size={17} /> الإدارة</a>
          </nav>
        </div>
      </header>
      <div className={admin ? 'layout admin-layout' : 'layout public-layout'}>
        {admin && <nav className="sidebar" aria-label="القائمة الرئيسية">
          {sections.filter(({ path }) => path !== '/demo').map(({ path: href, label, icon: Icon }) => (
            <a key={href} href={href} aria-current={path === href ? 'page' : undefined}>
              <Icon size={20} aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>}
        <main id="main" tabIndex={-1}>
          {path !== '/listen' && <h1>{title}</h1>}
          {mode === 'fixture' && (
            <p className="fixture-note">معاينة محلية ببيانات تجريبية · المحطة غير متصلة</p>
          )}
          {path === '/listen' ? (
            <Player />
          ) : path === '/demo' ? (
            <Demo />
          ) : login ? (
            <Login />
          ) : section ? (
            <Admin path={path} />
          ) : (
            <StatePanel title="تعذّر العثور على الصفحة">
              <a className="action" href="/listen">
                العودة إلى مشغّل الفرع
              </a>
            </StatePanel>
          )}
        </main>
      </div>
    </>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fallback">
          <RadioTower aria-hidden="true" />
          <h1>تعذّر عرض الصفحة</h1>
          <button className="action" onClick={() => window.location.reload()}>
            إعادة المحاولة
          </button>
        </main>
      )
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
