// src/features/scouting/model/match-report.test.ts
import { describe, expect, it } from 'vitest';
import { calculatePdfFitDimensions, PDF_EXPORT_MARGINS_MM } from './match-report';

describe('calculatePdfFitDimensions', () => {
  it('scales the image uniformly (aspect ratio preserved, no distortion)', () => {
    const result = calculatePdfFitDimensions(800, 600);
    expect(result.finalWidth / result.finalHeight).toBeCloseTo(800 / 600, 4);
  });

  it('touches the usable width when width is the limiting dimension', () => {
    const result = calculatePdfFitDimensions(800, 600);

    const mmToPx = 96 / 25.4;
    const usableWidthPx = (210 - PDF_EXPORT_MARGINS_MM.leftMm - PDF_EXPORT_MARGINS_MM.rightMm) * mmToPx;
    const usableHeightPx = (297 - PDF_EXPORT_MARGINS_MM.topMm - PDF_EXPORT_MARGINS_MM.bottomMm) * mmToPx;
    const expectedScale = Math.min(usableWidthPx / 800, usableHeightPx / 600);

    expect(result.scale).toBeCloseTo(expectedScale, 4);
    expect(result.finalWidth).toBeCloseTo(800 * expectedScale, 2);
    expect(result.finalHeight).toBeCloseTo(600 * expectedScale, 2);
  });

  it('touches the usable height when height is the limiting dimension', () => {
    // Tall, narrow image: height is the constraint, not width.
    const result = calculatePdfFitDimensions(500, 2000);

    const mmToPx = 96 / 25.4;
    const usableHeightPx = (297 - PDF_EXPORT_MARGINS_MM.topMm - PDF_EXPORT_MARGINS_MM.bottomMm) * mmToPx;
    const expectedScale = usableHeightPx / 2000;

    expect(result.scale).toBeCloseTo(expectedScale, 4);
    expect(result.finalHeight).toBeCloseTo(usableHeightPx, 2);
  });

  it('anchors at the left/top margin, not centered', () => {
    const result = calculatePdfFitDimensions(800, 600);

    const mmToPx = 96 / 25.4;
    expect(result.offsetX).toBeCloseTo(PDF_EXPORT_MARGINS_MM.leftMm * mmToPx, 2);
    expect(result.offsetY).toBeCloseTo(PDF_EXPORT_MARGINS_MM.topMm * mmToPx, 2);
  });

  it('uses asymmetric margins: 2cm left/right/bottom, 1.8cm top', () => {
    expect(PDF_EXPORT_MARGINS_MM).toEqual({ topMm: 18, rightMm: 20, bottomMm: 20, leftMm: 20 });
  });

  it('honors custom margins passed explicitly', () => {
    const customMargins = { topMm: 5, rightMm: 5, bottomMm: 5, leftMm: 5 };
    const result = calculatePdfFitDimensions(800, 600, 210, 297, customMargins);

    const mmToPx = 96 / 25.4;
    expect(result.offsetX).toBeCloseTo(5 * mmToPx, 2);
    expect(result.offsetY).toBeCloseTo(5 * mmToPx, 2);

    // Never exceeds the usable box for these margins.
    expect(result.finalWidth).toBeLessThanOrEqual((210 - 5 - 5) * mmToPx + 0.01);
    expect(result.finalHeight).toBeLessThanOrEqual((297 - 5 - 5) * mmToPx + 0.01);
  });
});
