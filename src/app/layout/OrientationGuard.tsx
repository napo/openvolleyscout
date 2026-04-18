import { useEffect, useState } from 'react';

function isPortraitScreen(): boolean {
  return window.matchMedia('(orientation: portrait)').matches;
}

export function OrientationGuard({ children }: { children: React.ReactNode }) {
  const [isPortrait, setIsPortrait] = useState(() => isPortraitScreen());

  useEffect(() => {
    const mediaQuery = window.matchMedia('(orientation: portrait)');

    const handleChange = () => setIsPortrait(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  if (isPortrait) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24, textAlign: 'center' }}>
        <div>
          <h1>Rotate your device</h1>
          <p>OpenVolleyScout is optimized for landscape use.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
