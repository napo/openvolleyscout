import { ALL_EVALUATIONS } from './dashboard-filters';
import type { SkillEvaluation } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';

interface EvaluationFilterProps {
  selectedEvaluations: SkillEvaluation[];
  onChange: (evaluations: SkillEvaluation[]) => void;
}

export function EvaluationFilter({ selectedEvaluations, onChange }: EvaluationFilterProps) {
  const { t } = useTranslation();
  const handleToggle = (evaluation: SkillEvaluation) => {
    if (selectedEvaluations.includes(evaluation)) {
      onChange(selectedEvaluations.filter(e => e !== evaluation));
    } else {
      onChange([...selectedEvaluations, evaluation]);
    }
  };

  return (
    <div className="perf-dashboard__filter-group">
      <label className="perf-dashboard__filter-label">
        {t('filterEvaluations')}
      </label>
      <div className="evaluation-filter">
        {ALL_EVALUATIONS.map((evaluation) => (
          <label key={evaluation} className="evaluation-filter__checkbox">
            <input
              type="checkbox"
              checked={selectedEvaluations.includes(evaluation)}
              onChange={() => handleToggle(evaluation)}
            />
            <span className="evaluation-filter__label">
              {evaluation}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
