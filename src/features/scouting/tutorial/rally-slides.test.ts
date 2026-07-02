import { describe, expect, it } from 'vitest';
import { getTutorialRallySlides } from './rally-slides';

describe('getTutorialRallySlides', () => {
  it('builds 17 slides in order', () => {
    const slides = getTutorialRallySlides();
    expect(slides).toHaveLength(17);
    expect(slides.map((slide) => slide.step)).toEqual(
      Array.from({ length: 17 }, (_, index) => index + 1),
    );
  });

  it('never places a libero in a front-row court position (2, 3 or 4), for either rotation (P6 serving, P3 receiving)', () => {
    const slides = getTutorialRallySlides();
    slides.forEach((slide) => {
      [...slide.homePlayers, ...slide.awayPlayers].forEach((player) => {
        if (player.isLibero) {
          expect([2, 3, 4]).not.toContain(player.courtPosition);
        }
      });
    });
  });

  it('shows exactly one libero per team on every slide (P6 never conflicts with the server)', () => {
    const slides = getTutorialRallySlides();
    slides.forEach((slide) => {
      expect(slide.homePlayers.filter((player) => player.isLibero)).toHaveLength(1);
      expect(slide.awayPlayers.filter((player) => player.isLibero)).toHaveLength(1);
    });
  });

  it('lays out exactly six distinct, non-overlapping court positions per team on every slide', () => {
    const slides = getTutorialRallySlides();
    slides.forEach((slide) => {
      expect(slide.homePlayers).toHaveLength(6);
      expect(slide.awayPlayers).toHaveLength(6);

      const homePositions = new Set(slide.homePlayers.map((player) => player.courtPosition));
      const awayPositions = new Set(slide.awayPlayers.map((player) => player.courtPosition));
      expect(homePositions.size).toBe(6);
      expect(awayPositions.size).toBe(6);
    });
  });

  it('marks exactly one setter per team on every slide', () => {
    const slides = getTutorialRallySlides();
    slides.forEach((slide) => {
      expect(slide.homePlayers.filter((player) => player.isSetter)).toHaveLength(1);
      expect(slide.awayPlayers.filter((player) => player.isSetter)).toHaveLength(1);
    });
  });

  it('positions the away server outside the court boundary on slides 1 and 2', () => {
    const slides = getTutorialRallySlides();
    const [slide1, slide2] = slides;

    [slide1, slide2].forEach((slide) => {
      const server = slide.awayPlayers.find((player) => player.playerId === slide.player.playerId);
      expect(server).toBeDefined();
      expect(server!.x).toBeLessThan(12);
    });
  });

  it('moves the server marker across all three serve-start keyframes on slide 1 (5 -> 1 -> 6)', () => {
    const slides = getTutorialRallySlides();
    const slide1 = slides[0];
    const serverPositions = slide1.keyframes!.map((keyframe) => (
      keyframe.awayPlayers?.find((player) => player.playerId === slide1.player.playerId)
    ));

    serverPositions.forEach((server) => {
      expect(server).toBeDefined();
      expect(server!.x).toBeLessThan(12);
    });

    const distinctYPositions = new Set(serverPositions.map((server) => Math.round(server!.y)));
    expect(distinctYPositions.size).toBeGreaterThan(1);
  });

  it('uses a faster keyframe step for the serve-direction slide', () => {
    const slides = getTutorialRallySlides();
    expect(slides[1].keyframeStepMs).toBe(30);
  });

  it('animates the reception evaluation and ball position together on slide 4', () => {
    const slides = getTutorialRallySlides();
    const slide4 = slides[3];

    expect(slide4.evaluation).toBe('#');
    expect(slide4.keyframes).toHaveLength(1);
    expect(slide4.keyframes![0].evaluation).toBe('+');
    expect(slide4.keyframes![0].ballPosition).toBeDefined();
  });

  it('shows the set auto-assignment with K1/M and no ring (slide 5)', () => {
    const slides = getTutorialRallySlides();
    const slide5 = slides[4];

    expect(slide5.skill).toBe('set');
    expect(slide5.evaluation).toBe('#');
    expect(slide5.combinationCode).toBe('K1');
    expect(slide5.ballTypeCode).toBe('M');
    expect(slide5.ringColor).toBeNull();
  });

  it('rings all home players except the receiver for the manual setter selection (slide 7)', () => {
    const slides = getTutorialRallySlides();
    const slide3 = slides[2];
    const slide7 = slides[6];

    expect(slide7.ringColor).toBe('arancione');
    // Two-touch rule: the receiver cannot also be the setter.
    expect(slide7.awaitingSelectionPlayerKeys).toHaveLength(5);
    expect(slide7.awaitingSelectionPlayerKeys.every((key) => key.startsWith('home:'))).toBe(true);
    expect(slide7.awaitingSelectionPlayerKeys).not.toContain(`home:${slide3.player.playerId}`);
  });

  it('switches the ball height code from M to Q on the away counter-attack (slide 10)', () => {
    const slides = getTutorialRallySlides();
    expect(slides[8].ballTypeCode).toBe('M');
    expect(slides[9].ballTypeCode).toBe('Q');
    expect(slides[9].teamSide).toBe('away');
  });

  it('highlights the net from the attack-vs-block slide through the block selection (slides 14-16)', () => {
    const slides = getTutorialRallySlides();
    expect(slides[13].netHighlight).toBe(true);
    expect(slides[14].netHighlight).toBe(true);
    expect(slides[15].netHighlight).toBe(true);
  });

  it('uses skill block and evaluation # when asking who blocked (slide 16)', () => {
    const slides = getTutorialRallySlides();
    const slide16 = slides[15];

    expect(slide16.skill).toBe('block');
    expect(slide16.evaluation).toBe('#');
    expect(slide16.ringColor).toBe('rosa');
    expect(slide16.teamSide).toBe('away');
  });

  it('rings only front-row away players for the block selection', () => {
    const slides = getTutorialRallySlides();
    const slide16 = slides[15];
    const frontRowKeys = slide16.awayPlayers
      .filter((player) => [2, 3, 4].includes(player.courtPosition))
      .map((player) => `away:${player.playerId}`);

    expect(new Set(slide16.awaitingSelectionPlayerKeys)).toEqual(new Set(frontRowKeys));
  });

  it('ends with the point-confirmation overlay on the last slide', () => {
    const slides = getTutorialRallySlides();
    const last = slides.at(-1)!;

    expect(last.step).toBe(17);
    expect(last.overlayMessageKey).toBe('tutorialRallyEndedConfirmPoint');
    expect(last.overlayActionLabelKey).toBe('tutorialConfirmPointButton');
  });

  it('uses real roster names, not jersey-only fallbacks', () => {
    const slides = getTutorialRallySlides();
    slides.forEach((slide) => {
      expect(slide.player.name).not.toMatch(/^#/);
      expect(slide.player.name.trim().length).toBeGreaterThan(0);
    });
  });

  it('reuses the same RallySlide array instance across calls (cached)', () => {
    expect(getTutorialRallySlides()).toBe(getTutorialRallySlides());
  });
});
