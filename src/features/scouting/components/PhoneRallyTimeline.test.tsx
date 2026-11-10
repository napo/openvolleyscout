// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Team } from '@src/domain/roster/types';
import type { BallTouch } from '@src/domain/touch/types';
import { I18nProvider } from '@src/i18n/I18nProvider';
import { PhoneRallyTimeline } from './PhoneRallyTimeline';

const render = (node: React.ReactElement) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

const team = (id: string, players: Array<[string, number]>) => ({
  id, name: id, players: players.map(([pid, jerseyNumber]) => ({ id: pid, jerseyNumber })),
}) as unknown as Team;
const touch = (id: string, teamSide: 'home' | 'away', skill: BallTouch['skill'], playerId?: string, evaluation?: BallTouch['evaluation']) => ({
  id, teamSide, skill, playerId, evaluation, setNumber: 1, rallyNumber: 1, sequenceNumber: 0,
}) as BallTouch;

describe('PhoneRallyTimeline', () => {
  const home = team('h', [['h7', 7]]);
  const away = team('a', []);

  it('lists touches with jersey, skill and grade, latest marked', () => {
    const html = render(
      <PhoneRallyTimeline homeTeam={home} awayTeam={away} touches={[touch('1', 'away', 'serve'), touch('2', 'home', 'receive', 'h7', '+')]} />,
    );
    expect(html).toContain('#7');
    expect(html).toContain('—');
    expect(html.match(/is-latest/g)).toHaveLength(1);
    expect(html).toMatch(/phone-rally-timeline__item--home is-latest/);
  });

  it('keeps only the most recent touches', () => {
    const touches = Array.from({ length: 12 }, (_, i) => touch(String(i), 'home', 'attack', 'h7', '#'));
    const html = render(<PhoneRallyTimeline homeTeam={home} awayTeam={away} touches={touches} limit={8} />);
    expect(html.match(/<li/g)).toHaveLength(8);
  });
});
