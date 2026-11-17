// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MatchProject } from '@src/domain/match/types';
import { useTranslation } from '@src/i18n';
import { getPointNoteTagLabelKey } from '@src/features/scouting/components/PointNoteModal';
import { buildPointNoteDistribution } from './point-notes-table-model';
import { PointNotesTable } from './PointNotesTable';
import './point-notes-panel.css';

interface PointNotesPanelProps {
  project: MatchProject;
}

export function PointNotesPanel({ project }: PointNotesPanelProps) {
  const { t } = useTranslation();
  const notes = project.videoAnalysis?.notes ?? [];

  const distribution = useMemo(
    () =>
      buildPointNoteDistribution(
        notes,
        (tag) => t(getPointNoteTagLabelKey(tag)),
        t('pointNoteTagOther'),
      ),
    [notes, t],
  );

  const chartHeight = Math.max(120, distribution.length * 40 + 28);

  return (
    <div className="point-notes-panel">
      {distribution.length > 0 ? (
        <section className="point-notes-panel__chart-card">
          <h3 className="point-notes-panel__chart-title">{t('pointNoteDistributionTitle')}</h3>
          <div className="point-notes-panel__chart" style={{ height: `${chartHeight}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={distribution}
                layout="vertical"
                margin={{ top: 4, right: 28, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#4f5bd5" radius={[0, 6, 6, 0]} barSize={22}>
                  <LabelList dataKey="count" position="right" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      <PointNotesTable project={project} />

      <p className="point-notes-panel__video-hint">{t('pointNoteVideoHint')}</p>
    </div>
  );
}
