import type { SVGProps } from 'react';

type VideoPanelIconProps = SVGProps<SVGSVGElement>;

function BaseIcon(props: VideoPanelIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export { FolderOpenIcon as FolderIcon } from '@src/features/landing/components/LandingActionIcons';

export function YoutubeIcon(props: VideoPanelIconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M10.5 9.5v5l4.5-2.5-4.5-2.5Z" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function WebcamIcon(props: VideoPanelIconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="10" r="5" />
      <circle cx="12" cy="10" r="1.75" fill="currentColor" stroke="none" />
      <path d="M8 20h8" />
      <path d="M12 15v5" />
    </BaseIcon>
  );
}

export function PlayIcon(props: VideoPanelIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function PauseIcon(props: VideoPanelIconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function SkipBackIcon(props: VideoPanelIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 5.5v13" />
      <path d="M18 6.5 8.5 12l9.5 5.5v-11Z" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function RtspIcon(props: VideoPanelIconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="17" r="1.5" fill="currentColor" stroke="none" />
      <path d="M8.5 13.5a5 5 0 0 1 7 0" />
      <path d="M5.5 10.5a9 9 0 0 1 13 0" />
    </BaseIcon>
  );
}

export function PopoutIcon(props: VideoPanelIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9 6H5.5A1.5 1.5 0 0 0 4 7.5v11A1.5 1.5 0 0 0 5.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
    </BaseIcon>
  );
}
