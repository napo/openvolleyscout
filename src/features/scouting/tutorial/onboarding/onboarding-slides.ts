import type { TranslationKey } from '@src/i18n';

export type OnboardingSlideKind =
  | 'intro'
  | 'match_info'
  | 'home_roster'
  | 'away_roster'
  | 'away_team_only'
  | 'scoring_config'
  | 'readiness'
  | 'lineup_home'
  | 'lineup_away'
  | 'serving_team'
  | 'confirm'
  | 'input_levels'
  | 'outro';

export interface OnboardingSlide {
  step: number;
  kind: OnboardingSlideKind;
  captionKey: TranslationKey;
}

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  { step: 1, kind: 'intro', captionKey: 'tutorialOnboardingSlideIntro' },
  { step: 2, kind: 'match_info', captionKey: 'tutorialOnboardingSlideMatchInfo' },
  { step: 3, kind: 'home_roster', captionKey: 'tutorialOnboardingSlideHomeRoster' },
  { step: 4, kind: 'away_roster', captionKey: 'tutorialOnboardingSlideAwayRoster' },
  { step: 5, kind: 'away_team_only', captionKey: 'tutorialOnboardingSlideAwayTeamOnly' },
  { step: 6, kind: 'scoring_config', captionKey: 'tutorialOnboardingSlideScoringConfig' },
  { step: 7, kind: 'readiness', captionKey: 'tutorialOnboardingSlideReadiness' },
  { step: 8, kind: 'lineup_home', captionKey: 'tutorialOnboardingSlideLineupHome' },
  { step: 9, kind: 'lineup_away', captionKey: 'tutorialOnboardingSlideLineupAway' },
  { step: 10, kind: 'serving_team', captionKey: 'tutorialOnboardingSlideServingTeam' },
  { step: 11, kind: 'confirm', captionKey: 'tutorialOnboardingSlideConfirm' },
  { step: 12, kind: 'input_levels', captionKey: 'tutorialOnboardingSlideInputLevels' },
  { step: 13, kind: 'outro', captionKey: 'tutorialOnboardingSlideOutro' },
];
