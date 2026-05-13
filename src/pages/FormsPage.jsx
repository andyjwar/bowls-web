export function FormsPage() {
  const forms = [
    { title: 'Team registration form', note: 'Available at season start' },
    { title: 'Result card', note: 'Submit after each league match' },
    { title: 'Player transfer form', note: 'Mid-season transfers' },
    { title: 'Withdrawal notice', note: 'If a team withdraws from a division' },
  ]

  return (
    <div className="page">
      <section className="tile">
        <h1 className="page-title">Forms</h1>
        <p className="page-lead">
          Downloadable forms and submission instructions for league administration.
        </p>
        <ul className="forms-list">
          {forms.map((f) => (
            <li key={f.title} className="forms-list__item">
              <span className="forms-list__title">{f.title}</span>
              <span className="forms-list__note">{f.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
