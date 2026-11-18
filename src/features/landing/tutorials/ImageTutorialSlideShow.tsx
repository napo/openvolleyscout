// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from '@src/i18n';
import { ExternalLink } from '@src/components/ExternalLink';
import './image-tutorial.css';
import { IMAGE_TUTORIALS, tutorialImageUrl, type ImageTutorialId, type TutorialPoint } from './image-tutorials';

/**
 * The gesture of the slide, drawn over the picture: a slowly pulsing finger
 * where to tap, or a finger travelling along the drag. Positions are in % of
 * the picture, so they follow it at any size.
 */
function GestureOverlay({ pointer, drag }: { pointer?: TutorialPoint; drag?: { from: TutorialPoint; to: TutorialPoint } }) {
  if (pointer) {
    return <span className="image-tutorial__tap" style={{ left: `${pointer.x}%`, top: `${pointer.y}%` }} aria-hidden="true" />;
  }
  if (drag) {
    const style = {
      '--from-x': `${drag.from.x}%`, '--from-y': `${drag.from.y}%`,
      '--to-x': `${drag.to.x}%`, '--to-y': `${drag.to.y}%`,
    } as CSSProperties;
    return (
      <>
        <svg className="image-tutorial__drag-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1={drag.from.x} y1={drag.from.y} x2={drag.to.x} y2={drag.to.y} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="image-tutorial__drag-finger" style={style} aria-hidden="true" />
      </>
    );
  }
  return null;
}

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
            <div className="image-tutorial__frame" key={slide.image}>
              <img
                className="image-tutorial__picture"
                src={tutorialImageUrl(slide.image, locale)}
                alt={t(slide.captionKey)}
                loading="eager"
              />
              <GestureOverlay
                pointer={locale === 'it' ? slide.pointer : slide.enPointer ?? slide.pointer}
                drag={locale === 'it' ? slide.drag : slide.enDrag ?? slide.drag}
              />
            </div>
          )}
        </div>

        <p className="scouting-tutorial__caption">
          {t(slide.captionKey)}
          {slide.link ? (
            <>
              {' '}
              <ExternalLink href={slide.link.href} className="about-page__link">
                {t(slide.link.labelKey)}
              </ExternalLink>
            </>
          ) : null}
        </p>

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
