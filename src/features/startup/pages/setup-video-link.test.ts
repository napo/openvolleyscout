// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { createDefaultMatchVideoAnalysis } from '@src/domain/video/types';
import { applySetupVideoLink } from './MatchSetupPage';

describe('video link typed while preparing the match', () => {
  it('links YouTube and keeps the sync points when the link changes', () => {
    const project = createEmptyMatchProject();
    applySetupVideoLink(project, 'https://youtu.be/dQw4w9WgXcQ');
    expect(project.videoAnalysis?.source).toMatchObject({ kind: 'youtube', videoId: 'dQw4w9WgXcQ' });
    project.videoAnalysis!.syncPoints = [{ id: 'p', videoSeconds: 1, eventClockSeconds: 1 } as never];
    applySetupVideoLink(project, 'https://www.dropbox.com/scl/fi/a/match.mp4?dl=0');
    expect(project.videoAnalysis?.source).toMatchObject({ kind: 'url' });
    expect(project.videoAnalysis?.syncPoints).toHaveLength(1);
  });

  it('leaves the match without video when the field is empty, and never replaces a local file', () => {
    const project = createEmptyMatchProject();
    project.videoAnalysis ??= createDefaultMatchVideoAnalysis();
    applySetupVideoLink(project, '  ');
    expect(project.videoAnalysis?.source).toBeUndefined();
    project.videoAnalysis = { ...project.videoAnalysis!, source: { kind: 'file', path: '/v/m.mp4' } };
    applySetupVideoLink(project, 'https://youtu.be/dQw4w9WgXcQ');
    expect(project.videoAnalysis?.source?.kind).toBe('file');
    applySetupVideoLink(project, '');
    expect(project.videoAnalysis?.source?.kind).toBe('file');
  });
});
