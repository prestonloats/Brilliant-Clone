// Phase 3 "show the effect" — the "Learning analytics" SUBSECTION of the Story Mode card on Profile.
//
// A glanceable, mostly-visual read-out of the practice store:
//   - summary stat tiles (mastered / getting there / learning / to review);
//   - per-skill mastery-progress bars, color-coded by level (a full bar means mastered);
//   - a compact first-try -> after-review recall comparison ("did it stick?").
// Purely presentational. Shows a friendly empty state until the learner has practiced.

import { skills } from '../domain'
import type { PracticeSummary, RetentionReport } from '../engine'

const SKILL_TITLE: Record<string, string> = Object.fromEntries(skills.map((skill) => [skill.id, skill.title]))

const pct = (value: number): number => Math.round(value * 100)

type PracticeInsightsPanelProps = {
  summary: PracticeSummary
  retention: RetentionReport
}

export function PracticeInsightsPanel({ summary, retention }: PracticeInsightsPanelProps) {
  const hasPractice = summary.totalRetrievals > 0
  const showRetention = retention.sampleSize > 0

  return (
    <div className="story-mode-section practice-panel">
      <div className="practice-panel-head">
        <h3 id="practice-panel-heading">Learning analytics</h3>
        <p className="practice-panel-sub">Spaced, interleaved practice that adapts to what you recall.</p>
      </div>

      {!hasPractice ? (
        <p className="story-empty">No practice yet — solve questions in Story Mode to build your mastery map.</p>
      ) : (
        <>
          <div className="story-stat-grid">
            <div className="story-stat">
              <span className="story-stat-value">{summary.masteredCount}</span>
              <span className="story-stat-label">🏆 Mastered</span>
            </div>
            <div className="story-stat">
              <span className="story-stat-value">{summary.practicedCount}</span>
              <span className="story-stat-label">Getting there</span>
            </div>
            <div className="story-stat">
              <span className="story-stat-value">{summary.learningCount}</span>
              <span className="story-stat-label">Learning</span>
            </div>
            <div className="story-stat">
              <span className="story-stat-value">{summary.dueCount}</span>
              <span className="story-stat-label">⏰ To review</span>
            </div>
          </div>

          <ul className="practice-meter-list">
            {summary.bySkill.map((entry) => {
              const title = SKILL_TITLE[entry.skillId] ?? entry.skillId
              return (
                <li key={entry.skillId} className="practice-meter-row" data-level={entry.level}>
                  <span className="practice-meter-dot" aria-hidden="true" />
                  <span className="practice-meter-skill" title={title}>
                    {title}
                    {entry.due && (
                      <span className="practice-meter-due" title="Due for review" aria-label="due for review">
                        {' '}⏰
                      </span>
                    )}
                  </span>
                  <span
                    className="practice-meter-track"
                    role="progressbar"
                    aria-label={`${title}: ${entry.level}, ${pct(entry.masteryProgress)} percent to mastery`}
                    aria-valuenow={pct(entry.masteryProgress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span className="practice-meter-fill" style={{ width: `${pct(entry.masteryProgress)}%` }} />
                  </span>
                  <span className="practice-meter-value">{entry.mastered ? '🏆' : `${pct(entry.masteryProgress)}%`}</span>
                </li>
              )
            })}
          </ul>
          <p className="practice-hint">
            Bars track progress to mastery — recall a skill right on the first try a few times in a row to
            fill it.
          </p>

          {showRetention && (
            <div className="practice-retention" aria-label="Recall after spaced review">
              <span className="practice-retention-title">Recall</span>
              <div className="practice-retention-compare">
                <span className="practice-retention-stat">
                  <b>{pct(retention.overallInitialAccuracy)}%</b>
                  <small>first try</small>
                </span>
                <span className="practice-retention-arrow" aria-hidden="true">→</span>
                <span className="practice-retention-stat">
                  <b>{pct(retention.overallLaterAccuracy)}%</b>
                  <small>after review</small>
                </span>
                {retention.retentionLift > 0 && (
                  <span className="practice-retention-delta">▲ +{pct(retention.retentionLift)}%</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
