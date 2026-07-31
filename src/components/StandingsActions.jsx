import { useState } from 'react'
import { displayStat, hasFourPointDeduction, isFourPointDeduction } from '../lib/standings'
import { FOUR_POINT_DEDUCTION_NOTE } from './StandingsDeductionNote'

function safeFilePart(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function tableTitle(context) {
  return [context.leagueName, context.sectionLabel, context.divisionLabel]
    .filter(Boolean)
    .join(' · ')
}

export function StandingsActions({ rows, context }) {
  const [downloading, setDownloading] = useState(false)

  async function downloadPdf() {
    setDownloading(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const title = tableTitle(context)
      const asAt = `League table as at ${new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}`

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(17)
      doc.text(title, 15, 18)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(90)
      doc.text(asAt, 15, 25)
      doc.setTextColor(0)

      const columns = [
        { label: '#', x: 15, align: 'left' },
        { label: 'Team', x: 25, align: 'left' },
        { label: 'P', x: 125, align: 'right' },
        { label: 'For', x: 145, align: 'right' },
        { label: 'Against', x: 170, align: 'right' },
        { label: 'Points', x: 195, align: 'right' },
      ]
      let y = 36
      doc.setFillColor(235, 238, 241)
      doc.rect(14, y - 5, 182, 8, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      columns.forEach((c) => doc.text(c.label, c.x, y, { align: c.align }))

      doc.setFont('helvetica', 'normal')
      rows.forEach((row, index) => {
        y += 8
        if (y > 282) {
          doc.addPage()
          y = 18
        }
        if (index % 2 === 1) {
          doc.setFillColor(248, 249, 250)
          doc.rect(14, y - 5, 182, 8, 'F')
        }
        const values = [
          String(index + 1),
          isFourPointDeduction(row) ? `${row.team}*` : row.team,
          displayStat(row.played, row.played),
          row.played ? String(row.shotsFor ?? 0) : '—',
          row.played ? String(row.shotsAgainst ?? 0) : '—',
          displayStat(row.points, row.played),
        ]
        columns.forEach((c, i) => doc.text(values[i], c.x, y, { align: c.align }))
      })

      if (hasFourPointDeduction(rows)) {
        y += 12
        if (y > 282) {
          doc.addPage()
          y = 18
        }
        doc.setFontSize(8)
        doc.setTextColor(70)
        doc.text(`* ${FOUR_POINT_DEDUCTION_NOTE}`, 15, y, { maxWidth: 180 })
        doc.setTextColor(0)
      }

      const name = safeFilePart(
        `${context.leagueName}-${context.sectionLabel ?? ''}-${context.divisionLabel}-table`,
      )
      doc.save(`${name || 'league-table'}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="match-toolbar__actions standings-actions" role="group" aria-label="League table actions">
      <button type="button" className="match-toolbar__action" onClick={() => window.print()}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M3.5 5V1.5h7V5M3.5 10.5H1.5V5h11v5.5h-2" />
          <rect x="3.5" y="8.5" width="7" height="4.5" />
        </svg>
        Print
      </button>
      <button
        type="button"
        className="match-toolbar__action"
        disabled={downloading}
        onClick={downloadPdf}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M7 1v8M3.5 5.5L7 9l3.5-3.5M1.5 11.5v1.5h11v-1.5" />
        </svg>
        {downloading ? 'Preparing…' : 'Download PDF'}
      </button>
    </div>
  )
}
