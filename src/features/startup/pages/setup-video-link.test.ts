// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { createDefaultMatchVideoAnalysis } from '@src/domain/video/types';
import { applySetupVideo } from './MatchSetupPage';

describe('video link typed while preparing the match', () => {
  it('links YouTube and keeps the sync points when the link changes', () => {
    const project = createEmptyMatchProject();
    applySetupVideo(project, 'https://youtu.be/dQw4w9WgXcQ', null);
    expect(project.videoAnalysis?.source).toMatchObject({ kind: 'youtube', videoId: 'dQw4w9WgXcQ' });
    project.videoAnalysis!.syncPoints = [{ id: 'p', videoSeconds: 1, eventClockSeconds: 1 } as never];
    applySetupVideo(project, 'https://www.dropbox.com/scl/fi/a/match.mp4?dl=0', null);
    expect(project.videoAnalysis?.source).toMatchObject({ kind: 'url' });
    expect(project.videoAnalysis?.syncPoints).toHaveLength(1);
  });

  it('chooses a local file, and removes the video when both fields are emptied', () => {
    const project = createEmptyMatchProject();
    project.videoAnalysis ??= createDefaultMatchVideoAnalysis();
    applySetupVideo(project, '  ', null);
    expect(project.videoAnalysis?.source).toBeUndefined();
    project.videoAnalysis = { ...project.videoAnalysis!, source: { kind: 'file', path: '/v/m.mp4' } };
    // Same file chosen again: nothing changes.
    applySetupVideo(project, '', { path: '/v/m.mp4', fileName: 'm.mp4' });
    expect(project.videoAnalysis?.source).toEqual({ kind: 'file', path: '/v/m.mp4' });
    applySetupVideo(project, '', { path: '/v/m.mp4', fileName: 'm.mp4' });
    expect(project.videoAnalysis?.source?.kind).toBe('file');
    applySetupVideo(project, '', { path: '/v/other.mp4', fileName: 'other.mp4' });
    expect(project.videoAnalysis?.source).toEqual({ kind: 'file', path: '/v/other.mp4', fileName: 'other.mp4' });
    applySetupVideo(project, '', null);
    expect(project.videoAnalysis?.source).toBeUndefined();
  });
});
