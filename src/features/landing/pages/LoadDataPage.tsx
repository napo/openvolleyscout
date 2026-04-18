import { Link } from 'react-router-dom';
import { useTranslation } from '@src/i18n';

export function LoadDataPage() {
  const { t } = useTranslation();

  return (
    <div style={{ padding: 24 }}>
      <h1>{t('loadData')}</h1>
      <p>Load data functionality coming soon.</p>
      <Link to="/">Back to Home</Link>
    </div>
  );
}
