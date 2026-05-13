export function OfficersPage() {
  const officers = [
    { role: 'President', name: 'TBC' },
    { role: 'Chairman', name: 'TBC' },
    { role: 'Secretary', name: 'TBC' },
    { role: 'Treasurer', name: 'TBC' },
    { role: 'Fixtures Secretary', name: 'TBC' },
    { role: 'Results Secretary', name: 'TBC' },
  ]

  return (
    <div className="page">
      <section className="tile">
        <h1 className="page-title">League Officers</h1>
        <p className="page-lead">
          Contact details for league officers can be added here when confirmed.
        </p>
        <table className="officers-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Name</th>
            </tr>
          </thead>
          <tbody>
            {officers.map((o) => (
              <tr key={o.role}>
                <td>{o.role}</td>
                <td>{o.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
