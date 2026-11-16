import type { TranslationKey } from '@src/i18n';

/** "Getting started": the one-page new match, question by question, then the first rally. */
export type OnboardingSlideKind =
  | 'intro'
  | 'quick_team'
  | 'quick_who'
  | 'quick_lineup'
  | 'quick_serve'
  | 'quick_level'
  | 'quick_start'
  | 'outro';

export interface OnboardingSlide {
  step: number;
  kind: OnboardingSlideKind;
  captionKey: TranslationKey;
}

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  { step: 1, kind: 'intro', captionKey: 'tutorialOnboardingQuickIntro' },
  { step: 2, kind: 'quick_team', captionKey: 'tutorialOnboardingQuickTeam' },
  { step: 3, kind: 'quick_who', captionKey: 'tutorialOnboardingQuickWho' },
  { step: 4, kind: 'quick_lineup', captionKey: 'tutorialOnboardingQuickLineup' },
  { step: 5, kind: 'quick_serve', captionKey: 'tutorialOnboardingQuickServe' },
  { step: 6, kind: 'quick_level', captionKey: 'tutorialOnboardingQuickLevel' },
  { step: 7, kind: 'quick_start', captionKey: 'tutorialOnboardingQuickStart' },
  { step: 8, kind: 'outro', captionKey: 'tutorialOnboardingQuickOutro' },
];
