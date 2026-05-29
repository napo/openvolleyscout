// src/features/scouting/model/match-report.test.ts
import { describe, expect, it } from 'vitest';
import { calculatePdfFitDimensions } from './match-report';

describe('calculatePdfFitDimensions', () => {
  it('scales image to fit within usable area maintaining aspect ratio', () => {
    // A4 portrait (210x297mm) with 10mm margins = usable area ~190x277mm
    // Image 800x600 with 96 DPI
    const result = calculatePdfFitDimensions(800, 600);

    // usableArea = (210-20) * (96/25.4) ≈ 719.5px
    // usableArea = (297-20) * (96/25.4) ≈ 1046.5px
    // scaleX = 719.5 / 800 ≈ 0.899
    // scaleY = 1046.5 / 600 ≈ 1.744
    // scale = min = 0.899
    const expectedScale = Math.min((210 - 20) * (96 / 25.4) / 800, (297 - 20) * (96 / 25.4) / 600);

    expect(result.scale).toBeCloseTo(expectedScale, 4);
    expect(result.finalWidth).toBeCloseTo(800 * expectedScale, 2);
    expect(result.finalHeight).toBeCloseTo(600 * expectedScale, 2);
    expect(result.finalWidth / result.finalHeight).toBeCloseTo(800 / 600, 4); // aspect ratio preserved
  });

  it('centers image in usable area', () => {
    // Small image: 100x100px
    // A4 usable area: ~719x1046px
    const result = calculatePdfFitDimensions(100, 100);

    const marginMm = 10;
    const marginPx = marginMm * (96 / 25.4);
    const usableWidthPx = (210 - 2 * marginMm) * (96 / 25.4);
    const usableHeightPx = (297 - 2 * marginMm) * (96 / 25.4);

    // Image should be centered
    const expectedCenterX = marginPx + (usableWidthPx - result.finalWidth) / 2;
    const expectedCenterY = marginPx + (usableHeightPx - result.finalHeight) / 2;

    expect(result.offsetX).toBeCloseTo(expectedCenterX, 2);
    expect(result.offsetY).toBeCloseTo(expectedCenterY, 2);
  });

  it('handles portrait image larger than page', () => {
    // Tall image: 500x1000px (2:1 aspect ratio)
    // Should scale down to fit height (limiting dimension)
    const result = calculatePdfFitDimensions(500, 1000);

    const usableHeightPx = (297 - 20) * (96 / 25.4);
    const expectedScale = usableHeightPx / 1000; // height is limiting

    expect(result.scale).toBeCloseTo(expectedScale, 4);
    expect(result.finalHeight).toBeCloseTo(1000 * expectedScale, 2);
    expect(result.finalWidth).toBeCloseTo(500 * expectedScale, 2);
  });

  it('handles custom margins', () => {
    // 5mm margins instead of default 10mm
    const result = calculatePdfFitDimensions(800, 600, 210, 297, 5);

    const usableWidthPx = (210 - 2 * 5) * (96 / 25.4);
    const usableHeightPx = (297 - 2 * 5) * (96 / 25.4);
    const marginPx = 5 * (96 / 25.4);

    // Offset should use the 5mm margin
    expect(result.offsetX).toBeGreaterThanOrEqual(marginPx);
    expect(result.offsetY).toBeGreaterThanOrEqual(marginPx);
  });

  it('produces dimensions that fit on A4 page', () => {
    // Report-like proportions: 800x2000px (tall and narrow)
    const result = calculatePdfFitDimensions(800, 2000);

    const marginMm = 10;
    const marginPx = marginMm * (96 / 25.4);
    const usableWidthPx = (210 - 2 * marginMm) * (96 / 25.4);
    const usableHeightPx = (297 - 2 * marginMm) * (96 / 25.4);

    // Image must fit within usable area
    expect(result.finalWidth).toBeLessThanOrEqual(usableWidthPx);
    expect(result.finalHeight).toBeLessThanOrEqual(usableHeightPx);

    // Image must be positioned within margins
    expect(result.offsetX).toBeGreaterThanOrEqual(marginPx);
    expect(result.offsetY).toBeGreaterThanOrEqual(marginPx);
    expect(result.offsetX + result.finalWidth).toBeLessThanOrEqual(210 * (96 / 25.4) - marginPx);
    expect(result.offsetY + result.finalHeight).toBeLessThanOrEqual(297 * (96 / 25.4) - marginPx);
  });
});
