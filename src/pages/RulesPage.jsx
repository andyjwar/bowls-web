import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  RULES_SECTIONS,
  parseRulesHash,
  rulesItemDomId,
} from '../data/rulesContent'

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

function RulesBlock({ block, sectionId, itemIds, targetId }) {
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
        {block.items.map((item, index) => {
          const id = itemIds.get(item) ?? `${sectionId}-${item.n}-${index}`
          const targeted = Boolean(targetId) && targetId === id
          return (
            <li
              key={id}
              id={id}
              value={item.n}
              className={`rules-content__item${targeted ? ' rules-content__item--target' : ''}`}
            >
              {item.text}
            </li>
          )
        })}
      </ol>
    )
  }

  return null
}

function itemIdsForSection(section) {
  const ids = new Map()
  const seen = new Map()
  for (const block of section.blocks) {
    if (block.type !== 'numbered') continue
    for (const item of block.items) {
      const count = (seen.get(item.n) ?? 0) + 1
      seen.set(item.n, count)
      ids.set(item, count === 1 ? rulesItemDomId(section.id, item.n) : `${section.id}-${item.n}-${count}`)
    }
  }
  return ids
}

function RulesSectionContent({ section, targetRuleN }) {
  const itemIds = itemIdsForSection(section)
  const targetId = targetRuleN != null ? rulesItemDomId(section.id, targetRuleN) : null
  return (
    <article className="rules-content">
      <h2 className="rules-content__title">{section.title}</h2>
      {section.blocks.map((block, index) => (
        <RulesBlock
          key={`${section.id}-${index}`}
          block={block}
          sectionId={section.id}
          itemIds={itemIds}
          targetId={targetId}
        />
      ))}
    </article>
  )
}

export function RulesPage() {
  const { hash } = useLocation()
  const parsed = parseRulesHash(hash)
  const [activeId, setActiveId] = useState(
    () => parsed?.sectionId ?? RULES_SECTIONS[0].id,
  )

  useEffect(() => {
    if (parsed?.sectionId) setActiveId(parsed.sectionId)
  }, [parsed?.sectionId])

  useEffect(() => {
    if (!parsed?.ruleN || parsed.sectionId !== activeId) return
    const id = rulesItemDomId(parsed.sectionId, parsed.ruleN)
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeId, parsed?.sectionId, parsed?.ruleN])

  const activeSection =
    RULES_SECTIONS.find((s) => s.id === activeId) ?? RULES_SECTIONS[0]
  const targetRuleN =
    parsed?.sectionId === activeSection.id ? parsed.ruleN : null

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
        <RulesSectionContent section={activeSection} targetRuleN={targetRuleN} />
      </div>
    </div>
  )
}
