function SunIcon() {
  return (
    <svg
      className="theme-toggle__icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      className="theme-toggle__icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function ThemeToggle({ value, onChange }) {
  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      <button
        type="button"
        className={
          value === 'light' ? 'theme-toggle__btn theme-toggle__btn--active' : 'theme-toggle__btn'
        }
        onClick={() => onChange('light')}
        aria-pressed={value === 'light'}
        aria-label="Light mode"
      >
        <SunIcon />
      </button>
      <button
        type="button"
        className={
          value === 'dark' ? 'theme-toggle__btn theme-toggle__btn--active' : 'theme-toggle__btn'
        }
        onClick={() => onChange('dark')}
        aria-pressed={value === 'dark'}
        aria-label="Dark mode"
      >
        <MoonIcon />
      </button>
    </div>
  )
}
