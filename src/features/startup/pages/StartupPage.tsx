import { useAppStore } from '../../../app/store/app-store';

export function StartupPage() {
  const createProject = useAppStore((state) => state.createProject);

  return (
    <main style={{ padding: 24 }}>
      <h1>OpenVolleyScout</h1>
      <p>Open-source volleyball scouting for portable devices.</p>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={createProject}>Create new match</button>
        <button disabled>Load local match</button>
        <button disabled>Import project</button>
      </div>
    </main>
  );
}
