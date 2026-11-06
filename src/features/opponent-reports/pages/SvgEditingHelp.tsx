import { useTranslation } from '@src/i18n';
import { ExternalLink } from '@src/components/ExternalLink';
import { ActionIcon } from '@src/components/ActionIcon';

/** Links open editors only; exported report files are never uploaded automatically. */
export function SvgEditingHelp() {
  const { t } = useTranslation();
  return <aside className="tactical-svg-help">
    <h3><ActionIcon name="svg" />{t('tacticalSvgEditTitle')}</h3>
    <p>{t('tacticalSvgEditHelp')}</p>
    <div className="tactical-svg-editors">
      <ExternalLink href="https://www.canva.com/features/svg-editor/"><ActionIcon name="external" />{t('tacticalSvgCanva')}</ExternalLink>
      <ExternalLink href="https://svgedit.netlify.app/index.html"><ActionIcon name="external" />{t('tacticalSvgOnline')}</ExternalLink>
      <ExternalLink href="https://inkscape.org/"><ActionIcon name="edit" />{t('tacticalSvgInkscape')}</ExternalLink>
    </div>
    <small>{t('tacticalSvgEditorLimits')}</small>
  </aside>;
}
