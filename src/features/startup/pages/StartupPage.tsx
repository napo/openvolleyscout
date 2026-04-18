import { MatchSetupForm } from '../components/MatchSetupForm';

export function StartupPage() {
  return (
    <main style={{ padding: 'var(--space-xl)', background: 'var(--color-background)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: 'var(--font-size-4xl)', fontWeight: 'var(--font-weight-bold)', marginBottom: 'var(--space-md)', color: 'var(--color-text-primary)' }}>OpenVolleyScout</h1>
        <p style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-secondary)' }}>Open-source volleyball scouting for portable devices.</p>
      </div>

      <MatchSetupForm />
    </main>
  );
}
