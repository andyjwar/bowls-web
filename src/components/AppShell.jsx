import { useEffect, useId, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '../hooks/useTheme'
import { useSiteConfig } from '../hooks/useSiteConfig'

const NAV = [
  { to: '/', label: 'Home', match: (p) => p === '/' },
  { to: '/leagues', label: 'Leagues', match: (p) => p.startsWith('/leagues') },
  { to: '/competitions', label: 'Competitions', match: (p) => p.startsWith('/competitions') },
  { to: '/officers', label: 'League Officers', match: (p) => p.startsWith('/officers') },
  { to: '/locations', label: 'Locations', match: (p) => p.startsWith('/locations') },
  { to: '/rules', label: 'Rules', match: (p) => p.startsWith('/rules') },
  { to: '/forms', label: 'Forms', match: (p) => p.startsWith('/forms') },
]

const MORE_NAV = NAV.filter((item) =>
  ['/officers', '/locations', '/rules', '/forms'].includes(item.to),
)

const TABS = [
  { to: '/', label: 'Home', match: (p) => p === '/', icon: HomeIcon },
  { to: '/leagues', label: 'Leagues', match: (p) => p.startsWith('/leagues'), icon: LeaguesIcon },
  {
    to: '/competitions',
    label: 'Cups',
    match: (p) => p.startsWith('/competitions'),
    icon: CupsIcon,
  },
]

function isMorePath(pathname) {
  return MORE_NAV.some((item) => item.match(pathname))
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LeaguesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M5 12h14M5 17h10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CupsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 14.6 9l5.9.5-4.5 3.8 1.4 5.7L12 16.2 6.6 19l1.4-5.7L3.5 9.5 9.4 9 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" />
    </svg>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const [theme, setTheme] = useTheme()
  const { activeSeason } = useSiteConfig()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreBtnRef = useRef(null)
  const sheetTitleId = useId()
  const isHome = pathname === '/'
  const isAdmin = pathname.startsWith('/admin')
  const moreActive = isMorePath(pathname)

  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!moreOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      moreBtnRef.current?.focus()
    }
  }, [moreOpen])

  return (
    <div className="bowls-app" data-theme={theme}>
      <header className="site-header">
        <div className="site-header__inner">
          <NavLink to="/" className="site-brand site-brand--bar" aria-label="Home">
            <img
              className="site-brand__logo"
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt=""
            />
            <span className="site-brand__season">{activeSeason} season</span>
          </NavLink>

          {!isHome ? (
            <NavLink to="/" className="site-brand site-brand--desktop" aria-label="Home">
              <img
                className="site-brand__logo"
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="Ipswich & District Federation Bowls League"
              />
            </NavLink>
          ) : null}

          <nav className="site-nav" aria-label="Main">
            {NAV.map(({ to, label, match }) => {
              const active = match(pathname)
              return (
                <NavLink
                  key={label}
                  to={to}
                  className={`site-nav__link${active ? ' site-nav__link--active' : ''}`}
                >
                  {label}
                </NavLink>
              )
            })}
          </nav>

          <div className="site-header__actions">
            <ThemeToggle value={theme} onChange={setTheme} />
          </div>
        </div>
      </header>

      <main className={`site-main${isAdmin ? '' : ' site-main--with-tabs'}`}>
        <Outlet />
      </main>

      {!isAdmin ? (
        <>
          <nav className="site-tabs" aria-label="Primary">
            {TABS.map(({ to, label, match, icon: Icon }) => {
              const active = match(pathname)
              return (
                <NavLink
                  key={label}
                  to={to}
                  className={`site-tabs__tab${active ? ' site-tabs__tab--active' : ''}`}
                >
                  <span className="site-tabs__icon">
                    <Icon />
                  </span>
                  <span className="site-tabs__label">{label}</span>
                </NavLink>
              )
            })}
            <button
              ref={moreBtnRef}
              type="button"
              className={`site-tabs__tab${moreActive || moreOpen ? ' site-tabs__tab--active' : ''}`}
              aria-expanded={moreOpen}
              aria-controls="site-more-sheet"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <span className="site-tabs__icon">
                <MoreIcon />
              </span>
              <span className="site-tabs__label">More</span>
            </button>
          </nav>

          {moreOpen ? (
            <div className="site-more">
              <button
                type="button"
                className="site-more__scrim"
                aria-label="Close menu"
                onClick={() => setMoreOpen(false)}
              />
              <div
                id="site-more-sheet"
                className="site-more__sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby={sheetTitleId}
              >
                <div className="site-more__handle" aria-hidden />
                <p id={sheetTitleId} className="site-more__title">
                  More
                </p>
                <nav className="site-more__nav" aria-label="More pages">
                  {MORE_NAV.map(({ to, label, match }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={`site-more__link${match(pathname) ? ' site-more__link--active' : ''}`}
                      onClick={() => setMoreOpen(false)}
                    >
                      {label}
                    </NavLink>
                  ))}
                </nav>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
