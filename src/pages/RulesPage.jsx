import { useState } from 'react'
import { RULES_SECTIONS } from '../data/rulesContent'

function RulesPillNav({ sections, activeId, onSelect }) {
  return (
    <nav className="pill-nav rules-pills" aria-label="Rules sections">
      <div className="pill-nav__scroll">
        {sections.map((section) => {
          const active = section.id === activeId
          return (
            <button
              key={section.id}
              type="button"
              className={`pill-nav__btn${active ? ' pill-nav__btn--active' : ''}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(section.id)}
            >
              {section.label}
            </button>
          )
        })}
      </div>
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
    <div className="page">
      <section className="tile">
        <p className="rules-page__kicker">Ipswich &amp; District Federation Bowls League</p>
        <h1 className="page-title">Rules &amp; Constitution</h1>
        <p className="page-lead">
          Standing orders, playing rules and league constitution (updated January 2025).
        </p>
        <RulesPillNav
          sections={RULES_SECTIONS}
          activeId={activeId}
          onSelect={setActiveId}
        />
      </section>

      <section className="tile rules-panel">
        <RulesSectionContent section={activeSection} />
      </section>
    </div>
  )
}
