import { Link } from 'react-router-dom'
import { WEB_FORMS } from '../lib/webForms'

/* Only forms flagged enabled in webForms.js are shown here. */
const ONLINE_FORMS = WEB_FORMS.filter((f) => f.enabled)

/* Printable forms live in public/forms/. Cards without a file show as
   "coming soon". */
const WEEKLY_RESULTS_FORMS = [
  {
    title: 'Samford weekly results (Monday)',
    note: 'Monday Evening section result sheet.',
    file: 'forms/samford-weekly-results-monday.xls',
  },
  {
    title: 'Samford weekly results (Wednesday)',
    note: 'Wednesday Afternoon section result sheet.',
    file: 'forms/samford-weekly-results-wednesday.xls',
  },
  {
    title: 'Two Wood weekly results',
    note: 'Weekly result sheet for the Two Wood league.',
    file: 'forms/two-wood-weekly-results.xls',
  },
  {
    title: 'Triples weekly results',
    note: 'Weekly result sheet for the Triples league.',
    file: 'forms/triples-weekly-results.xls',
  },
]

const REGISTRATION_FORMS = [
  {
    title: 'League application form',
    note: 'Apply for a team to join the league.',
    file: 'forms/league-application.doc',
  },
  {
    title: 'Samford player registration',
    note: 'Register players for the Samford league.',
    file: 'forms/samford-player-registration.xls',
  },
  {
    title: 'Two Wood player registration',
    note: 'Register players for the Two Wood league.',
    file: 'forms/two-wood-player-registration.xls',
  },
  {
    title: 'Players registration (large print)',
    note: 'Large-format player registration sheet.',
    file: 'forms/players-registration-large.xls',
  },
]

const COMPETITION_FORMS = [
  {
    title: 'Samford competitions entry',
    note: 'Enter the Samford competitions.',
    file: 'forms/samford-competitions-entry.doc',
  },
  {
    title: 'Samford KO Cup results',
    note: 'Result sheet for Knockout Cup ties.',
    file: 'forms/samford-ko-cup-results.docx',
  },
  {
    title: 'Millennium Cup results',
    note: 'Result sheet for Millennium Cup ties.',
    file: 'forms/millennium-cup-results.docx',
  },
]

function DownloadCard({ title, note, file }) {
  if (!file) {
    return (
      <div className="form-card form-card--pending">
        <span className="form-card__eyebrow">Coming soon</span>
        <span className="form-card__title">{title}</span>
        <span className="form-card__note">{note}</span>
      </div>
    )
  }
  return (
    <a className="form-card" href={import.meta.env.BASE_URL + file} download>
      <span className="form-card__eyebrow">Download</span>
      <span className="form-card__title">{title}</span>
      <span className="form-card__note">{note}</span>
    </a>
  )
}

export function FormsPage() {
  return (
    <div className="page page--forms">
      <header className="page-head page-head--hub">
        <h1 className="page-head__title page-head__title--xl">Forms</h1>
        <p className="page-head__lead">
          Fill in league forms online, or download and print them.
        </p>
      </header>

      <section className="forms-section">
        <h2 className="section-label">Fill in online</h2>
        <div className="form-cards">
          {ONLINE_FORMS.map((f) => (
            <Link key={f.id} to={`/forms/${f.id}`} className="form-card form-card--action">
              <span className="form-card__eyebrow">Fill in online</span>
              <span className="form-card__title">{f.title}</span>
              <span className="form-card__note">{f.note}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="forms-section">
        <h2 className="section-label">Weekly results</h2>
        <div className="form-cards">
          {WEEKLY_RESULTS_FORMS.map((f) => (
            <DownloadCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      <section className="forms-section">
        <h2 className="section-label">Registration &amp; applications</h2>
        <div className="form-cards">
          {REGISTRATION_FORMS.map((f) => (
            <DownloadCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      <section className="forms-section">
        <h2 className="section-label">Competitions</h2>
        <div className="form-cards">
          {COMPETITION_FORMS.map((f) => (
            <DownloadCard key={f.title} {...f} />
          ))}
        </div>
      </section>
    </div>
  )
}
