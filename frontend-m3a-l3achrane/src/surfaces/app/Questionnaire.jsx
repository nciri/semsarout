import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip } from '../../ds/index.js'
import { IMPORTANCE_LEVELS, lifestyleQuestionnaireSteps } from '../../data/lifestyleQuestionnaireSteps.js'

const MODE = 'optional' // 'optional' | 'mandatory'

function ProgressDots({ total, current }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            height: 5, borderRadius: 3, flex: 1,
            background: i <= current ? 'var(--navy-700)' : 'var(--gray-200)',
          }}
        />
      ))}
    </div>
  )
}

function OptionChip({ label, selected, onClick }) {
  return (
    <Chip
      selected={selected}
      onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: 9,
        font: selected ? 'var(--fw-bold) 13.5px var(--font-body)' : 'var(--fw-semibold) 13.5px var(--font-body)',
      }}
    >
      {label}
    </Chip>
  )
}

function ImportanceChip({ label, selected, onClick }) {
  return (
    <Chip
      selected={selected}
      onClick={onClick}
      style={{
        padding: '5px 11px', borderRadius: 999, font: 'var(--fw-bold) 12.5px var(--font-body)',
        background: selected ? 'var(--gold-100)' : '#fff',
        color: selected ? 'var(--gold-700)' : 'var(--text-muted)',
        border: selected ? '1px solid var(--gold-500)' : '1px solid var(--border-subtle)',
      }}
    >
      {label}
    </Chip>
  )
}

function QuestionCard({ stepId, question, answer, importance, onPick, onPickImportance }) {
  const { t } = useTranslation(['app', 'common'])
  const base = `app:questionnaire.steps.${stepId}.questions.${question.cle}`
  return (
    <Card padding={0} style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ font: 'var(--fw-bold) 15px var(--font-body)', color: 'var(--text-heading)' }}>{t(`${base}.label`)}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {question.options.map((option) => (
          <OptionChip
            key={option}
            label={t(`${base}.options.${option}`)}
            selected={answer === option}
            onClick={() => onPick(question.cle, option)}
          />
        ))}
      </div>
      <div style={{ height: 1, background: 'var(--border-subtle)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ font: 'var(--fw-bold) 12.5px var(--font-body)', color: 'var(--text-muted)' }}>
          {t('app:questionnaire.importanceLabel')}
        </span>
        {IMPORTANCE_LEVELS.map((level) => (
          <ImportanceChip
            key={level}
            label={t(`app:questionnaire.importance.${level}`)}
            selected={(importance || 'preference') === level}
            onClick={() => onPickImportance(question.cle, level)}
          />
        ))}
      </div>
    </Card>
  )
}

export default function Questionnaire() {
  const { t } = useTranslation(['app', 'common'])
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [importance, setImportance] = useState({})

  const mandatory = MODE === 'mandatory'
  const total = lifestyleQuestionnaireSteps.length
  const current = lifestyleQuestionnaireSteps[step]
  const isLast = step === total - 1
  const canBack = step > 0
  const answeredCount = current.questions.filter((q) => answers[q.cle]).length

  const pick = (cle, value) => setAnswers((prev) => ({ ...prev, [cle]: value }))
  const pickImportance = (cle, value) => setImportance((prev) => ({ ...prev, [cle]: value }))
  const goBack = () => setStep((s) => Math.max(0, s - 1))
  const goNext = () => setStep((s) => Math.min(total - 1, s + 1))
  const finish = () => {
    navigate('/recherche')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '44px 24px 64px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ font: 'var(--fw-bold) 13px var(--font-body)', color: 'var(--text-muted)' }}>
              {t('app:questionnaire.stepIndicator', { step: step + 1, total })}
            </div>
            {!mandatory && (
              <a href="#" style={{ font: 'var(--fw-semibold) var(--fs-sm) var(--font-body)' }}>
                {t('app:questionnaire.skipForNow')}
              </a>
            )}
            {mandatory && (
              <div style={{ font: 'var(--fw-bold) 13px var(--font-body)', color: 'var(--gold-700)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                {t('app:questionnaire.requiredNotice')}
              </div>
            )}
          </div>
          <h1 style={{ margin: 0, font: 'var(--fw-extrabold) 26px var(--font-display)', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            {t(`app:questionnaire.steps.${current.id}.title`)}
          </h1>
          <p style={{ margin: 0, font: 'var(--fw-regular) 14.5px/1.55 var(--font-body)', color: 'var(--text-body)' }}>
            {t(`app:questionnaire.steps.${current.id}.intro`)}
          </p>
          <ProgressDots total={total} current={step} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {current.questions.map((question) => (
            <QuestionCard
              key={question.cle}
              stepId={current.id}
              question={question}
              answer={answers[question.cle]}
              importance={importance[question.cle]}
              onPick={pick}
              onPickImportance={pickImportance}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {canBack ? (
            <Button variant="secondary" onClick={goBack}>{t('app:questionnaire.back')}</Button>
          ) : (
            <div style={{ width: 112 }} />
          )}
          <div style={{ font: 'var(--fw-regular) 13px var(--font-body)', color: 'var(--text-muted)' }}>
            {t('app:questionnaire.answeredCount', { answered: answeredCount, total: current.questions.length })}
          </div>
          {isLast ? (
            <Button variant="accent" onClick={finish}>
              {mandatory ? t('app:questionnaire.continueApplication') : t('app:questionnaire.finishAndSeeRecommendations')}
            </Button>
          ) : (
            <Button variant="primary" onClick={goNext}>{t('app:questionnaire.next')}</Button>
          )}
        </div>
      </div>
    </div>
  )
}
