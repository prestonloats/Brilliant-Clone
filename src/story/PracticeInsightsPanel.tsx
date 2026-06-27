// Phase 3 "show the effect" panel for Story Mode.
//
// A read-only summary of the learning-science practice store: per-skill MASTERY meters (the clear
// mastery signal — gold when mastered), headline mastered/due counts, and the RETENTION metric
// (first-try accuracy on spaced reviews vs. first sight — "did it stick?"). Purely presentational;
// it renders nothing until the learner has actually practiced.

import { skills } from '../domain'
import type { MasteryLevel, PracticeSummary, RetentionReport } from '../engine'

const SKILL_TITLE: Record<string, string> = Object.fromEntries(skills.map((skill) => [skill.id, skill.title]))

const LEVEL_LABEL: Record<MasteryLevel, string> = {
  learning: 'Learning',
  practiced: 'Practiced',
  mastered: 'Mastered',
}

const pct = (value: number): number => Math.round(value * 100)

type PracticeInsightsPanelProps = {
  summary: PracticeSummary
  retention: RetentionReport
}

export function PracticeInsightsPanel({ summary, retention }: PracticeInsightsPanelProps) {
  // Nothing practiced yet (e.g. the very first checkpoint) — keep the screen uncluttered.
  if (summary.totalRetrievals === 0) return null

  return (
    <section className="card practice-insights" aria-label="Practice progress">
      <header className="practice-insights-head">
        <h2 className="practice-insights-title">Practice progress</h2>
        <div className="practice-badges">
          <span className="practice-badge is-mastered">🏆 {summary.masteredCount} mastered</span>
          {summary.dueCount > 0 && (
            <span className="practice-badge is-due">{summary.dueCount} due for review</span>
          )}
        </div>
      </header>

      <ul className="practice-meter-list">
        {summary.bySkill.map((entry) => {
          const title = SKILL_TITLE[entry.skillId] ?? entry.skillId
          return (
            <li key={entry.skillId} className="practice-meter-row" data-level={entry.level}>
              <div className="practice-meter-label">
                <span className="practice-meter-skill">{title}</span>
                <span className="practice-meter-level">
                  {entry.mastered ? '🏆 ' : ''}
                  {LEVEL_LABEL[entry.level]}
                </span>
              </div>
              <div
                className="practice-meter-track"
                role="progressbar"
                aria-valuenow={pct(entry.proficiency)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${title} mastery`}
              >
                <div className="practice-meter-fill" style={{ width: `${pct(entry.proficiency)}%` }} />
              </div>
            </li>
          )
        })}
      </ul>

      {retention.sampleSize > 0 && (
        <p className="practice-retention">
          <strong>Retention:</strong> {pct(retention.overallLaterAccuracy)}% first-try on spaced reviews
          {' '}(was {pct(retention.overallInitialAccuracy)}% on first sight
          {retention.retentionLift > 0 ? `, ▲ +${pct(retention.retentionLift)} pts` : ''}).
        </p>
      )}
    </section>
  )
}
