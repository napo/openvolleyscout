// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';
import { useTranslation } from '@src/i18n';
import './image-tutorial.css';
import { IMAGE_TUTORIALS, tutorialImageUrl, type ImageTutorialId } from './image-tutorials';

interface ImageTutorialSlideShowProps {
  tutorial: ImageTutorialId | null;
  onClose: () => void;
}

/** A tutorial of screenshots with a caption each, in the same frame as the other tutorials. */
export function ImageTutorialSlideShow({ tutorial, onClose }: ImageTutorialSlideShowProps) {
  const { t, locale } = useTranslation();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [tutorial]);

  useEffect(() => {
    if (!tutorial) return;
    const slides = IMAGE_TUTORIALS[tutorial].slides;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') setIndex((current) => Math.min(slides.length - 1, current + 1));
      else if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tutorial, onClose]);

  if (!tutorial) return null;
  const { titleKey, slides } = IMAGE_TUTORIALS[tutorial];
  const slide = slides[Math.min(index, slides.length - 1)];
  const isFirst = index === 0;
  const isLast = index === slides.length - 1;

  return (
    <div className="scouting-tutorial" role="dialog" aria-modal="true" aria-labelledby="image-tutorial-title">
      <div className="scouting-tutorial__panel">
        <header className="scouting-tutorial__header">
          <div>
            <h2 id="image-tutorial-title" className="scouting-tutorial__title">{t(titleKey)}</h2>
            <p className="scouting-tutorial__step-label">{t('tutorialStepOf', { current: index + 1, total: slides.length })}</p>
          </div>
          <button type="button" className="scouting-tutorial__close" onClick={onClose}>
            {t('cancel')}
          </button>
        </header>

        <div className="scouting-tutorial__stage image-tutorial__stage">
          {slide.video ? (
            <video
              key={slide.image}
              className="image-tutorial__picture"
              src={tutorialImageUrl(slide.image, locale, import.meta.env.BASE_URL, 'mp4')}
              aria-label={t(slide.captionKey)}
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <img
              key={slide.image}
              className="image-tutorial__picture"
              src={tutorialImageUrl(slide.image, locale)}
              alt={t(slide.captionKey)}
              loading="eager"
            />
          )}
        </div>

        <p className="scouting-tutorial__caption">{t(slide.captionKey)}</p>

        <div className="scouting-tutorial__nav">
          <button type="button" className="btn-secondary btn-small scouting-tutorial__nav-button" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={isFirst}>
            {t('tutorialPrevious')}
          </button>
          <div className="scouting-tutorial__dots" aria-hidden="true">
            {slides.map((dot, dotIndex) => (
              <span key={dot.image} className={`scouting-tutorial__dot${dotIndex === index ? ' is-active' : ''}`} />
            ))}
          </div>
          <button
            type="button"
            className="btn-primary btn-small scouting-tutorial__nav-button"
            onClick={() => (isLast ? onClose() : setIndex((current) => current + 1))}
          >
            {t(isLast ? 'tutorialFinish' : 'tutorialNext')}
          </button>
        </div>
      </div>
    </div>
  );
}
