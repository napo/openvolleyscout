import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';

describe('RallyCodeList.tsx', () => {
  it('exports RallyCodeList component', async () => {
    const content = await readFile('./src/features/scouting/expert/RallyCodeList.tsx', 'utf-8');
    assert.match(content, /export function RallyCodeList/);
  });

  it('imports buildDataVolleyTouchCode', async () => {
    const content = await readFile('./src/features/scouting/expert/RallyCodeList.tsx', 'utf-8');
    assert.match(content, /import.*buildDataVolleyTouchCode.*from.*datavolley-code/);
  });

  it('accepts onCodeClick prop for editing', async () => {
    const content = await readFile('./src/features/scouting/expert/RallyCodeList.tsx', 'utf-8');
    assert.match(content, /onCodeClick\?:.*RallyCodeEntry.*=>.*void/);
  });

  it('has CSS class for scrollable list', async () => {
    const content = await readFile('./src/features/scouting/expert/rally-code-list.css', 'utf-8');
    assert.match(content, /\.rally-code-list__items/);
    assert.match(content, /overflow-y: auto/);
  });

  it('renders with aria-label for accessibility', async () => {
    const content = await readFile('./src/features/scouting/expert/RallyCodeList.tsx', 'utf-8');
    assert.match(content, /aria-label.*rallyCodes/);
  });

  it('displays latest item with highlighting', async () => {
    const content = await readFile('./src/features/scouting/expert/RallyCodeList.tsx', 'utf-8');
    assert.match(content, /highlightLatest/);
    assert.match(content, /entry\.isLatest && highlightLatest/);
  });

  it('is imported in ScoutingPage', async () => {
    const content = await readFile('./src/features/scouting/pages/ScoutingPage.tsx', 'utf-8');
    assert.match(content, /import.*RallyCodeList.*from.*expert/);
  });

  it('is exported from expert barrel', async () => {
    const content = await readFile('./src/features/scouting/expert/index.ts', 'utf-8');
    assert.match(content, /export.*RallyCodeList.*from.*RallyCodeList/);
  });
});
