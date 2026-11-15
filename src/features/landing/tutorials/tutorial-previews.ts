// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a shared tutorial link shows in chats and social networks (title,
 * picture). The web build writes one small page per tutorial,
 * <base>/tutorial/<slug>/, with these tags; it sends the browser on to
 * #/tutorial/<slug>. A tutorial added to TUTORIAL_SLUGS / IMAGE_TUTORIALS gets
 * its page with no further work.
 *
 * Loaded by vite.config.ts too: only relative and type imports here.
 */
import type { TranslationKey } from '../../../i18n/translations';
import { IMAGE_TUTORIALS, type ImageTutorialId } from './image-tutorials';
import { TUTORIAL_SLUGS, type TutorialTopic } from './tutorial-links';

export interface TutorialPreview {
  topic: TutorialTopic;
  slug: string;
  titleKey: TranslationKey;
  /** First picture of the tutorial (public/tutorials/<lang>/<image>.png); none for built-in slide shows. */
  image?: string;
}

/** Tutorials drawn by components rather than pictures. */
const COMPONENT_TUTORIAL_TITLES: Partial<Record<TutorialTopic, TranslationKey>> = {
  onboarding: 'tutorialOnboardingTitle',
  scouting: 'tutorialTitle',
};

export function listTutorialPreviews(): TutorialPreview[] {
  return (Object.keys(TUTORIAL_SLUGS) as TutorialTopic[]).map((topic) => {
    const imageTutorial = IMAGE_TUTORIALS[topic as ImageTutorialId];
    return {
      topic,
      slug: TUTORIAL_SLUGS[topic],
      titleKey: imageTutorial?.titleKey ?? COMPONENT_TUTORIAL_TITLES[topic] ?? 'aboutTutorialSectionTitle',
      image: imageTutorial?.slides.find((slide) => !slide.video)?.image,
    };
  });
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

/**
 * The page behind a shared tutorial link: social tags (Italian title, English
 * subtitle) and an immediate redirect to the tutorial inside the app.
 */
export function buildTutorialPreviewPage(
  preview: TutorialPreview,
  texts: { title: string; subtitle: string; appName: string },
  webApp: string,
): string {
  const base = webApp.replace(/\/+$/, '');
  const url = `${base}/tutorial/${preview.slug}/`;
  const target = `${base}/#/tutorial/${preview.slug}`;
  const image = preview.image ? `${base}/tutorials/it/${preview.image}.png` : `${base}/social-preview.png`;
  const title = escapeHtml(`${texts.title} · ${texts.appName}`);
  const description = escapeHtml(texts.subtitle);
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${escapeHtml(texts.appName)}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${image}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="canonical" href="${url}" />
<meta http-equiv="refresh" content="0; url=${target}" />
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body><p><a href="${target}">${title}</a></p></body>
</html>
`;
}
