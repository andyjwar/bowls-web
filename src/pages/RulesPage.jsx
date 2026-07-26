import { useState } from 'react'
import { RULES_SECTIONS } from '../data/rulesContent'

function RulesSectionCards({ sections, activeId, onSelect }) {
  return (
    <nav className="rules-cards" aria-label="Rules sections">
      {sections.map((section, index) => {
        const active = section.id === activeId
        return (
          <button
            key={section.id}
            type="button"
            className={`rules-card${active ? ' rules-card--active' : ''}`}
            aria-current={active ? 'true' : undefined}
            onClick={() => onSelect(section.id)}
          >
            <span className="rules-card__num">{String(index + 1).padStart(2, '0')}</span>
            <span className="rules-card__label">{section.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function RulesBlock({ block }) {
  if (block.type === 'subheading') {
    return <h3 className="rules-content__subheading">{block.text}</h3>
  }

  if (block.type === 'note') {
    return <p className="rules-content__note">{block.text}</p>
  }

  if (block.type === 'paragraph') {
    return <p className="rules-content__para">{block.text}</p>
  }

  if (block.type === 'numbered') {
    return (
      <ol className="rules-content__list" start={block.start}>
        {block.items.map((item) => (
          <li key={item.n} value={item.n} className="rules-content__item">
            {item.text}
          </li>
        ))}
      </ol>
    )
  }

  return null
}

function RulesSectionContent({ section }) {
  return (
    <article className="rules-content">
      <h2 className="rules-content__title">{section.title}</h2>
      {section.blocks.map((block, index) => (
        <RulesBlock key={`${section.id}-${index}`} block={block} />
      ))}
    </article>
  )
}

export function RulesPage() {
  const [activeId, setActiveId] = useState(RULES_SECTIONS[0].id)
  const activeSection =
    RULES_SECTIONS.find((s) => s.id === activeId) ?? RULES_SECTIONS[0]

  return (
    <div className="page page--rules">
      <header className="page-head page-head--hub">
        <h1 className="page-head__title page-head__title--xl">Rules</h1>
      </header>

      <RulesSectionCards
        sections={RULES_SECTIONS}
        activeId={activeId}
        onSelect={setActiveId}
      />

      <div className="rules-panel">
        <RulesSectionContent section={activeSection} />
      </div>
    </div>
  )
}
