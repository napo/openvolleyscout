import type { SVGProps } from 'react';

type LandingIconProps = SVGProps<SVGSVGElement>;

function BaseIcon(props: LandingIconProps) {
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

export function CirclePlusIcon(props: LandingIconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </BaseIcon>
  );
}

export function FolderOpenIcon(props: LandingIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H9l2 2h7.5A2.5 2.5 0 0 1 21 10.5v.5H3v-2.5Z" />
      <path d="M3 11h18l-1.8 6.3A2.5 2.5 0 0 1 16.8 19H5.2a2.5 2.5 0 0 1-2.4-1.7L3 11Z" />
    </BaseIcon>
  );
}

export function UsersIcon(props: LandingIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M16.5 19a4.5 4.5 0 0 0-9 0" />
      <circle cx="12" cy="9" r="3" />
      <path d="M19 19a3.5 3.5 0 0 0-3-3.46" />
      <path d="M8 15.54A3.5 3.5 0 0 0 5 19" />
      <path d="M16.5 7.5a2.5 2.5 0 1 1 0 5" />
      <path d="M7.5 7.5a2.5 2.5 0 1 0 0 5" />
    </BaseIcon>
  );
}

export function ChartIcon(props: LandingIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 20V11" />
      <path d="M10 20V5" />
      <path d="M16 20v-7" />
      <path d="M3 20h18" />
    </BaseIcon>
  );
}

export function VideoIcon(props: LandingIconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </BaseIcon>
  );
}

export function ReportIcon(props: LandingIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M10 13h6" />
      <path d="M10 17h6" />
    </BaseIcon>
  );
}

export function CourtIcon(props: LandingIconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 12h18" />
      <path d="M3 8.5h18" />
    </BaseIcon>
  );
}

export function PlayIcon(props: LandingIconProps) {
  return (
    <BaseIcon {...props} fill="currentColor" stroke="none">
      <path d="M8 5v14l11-7z" />
    </BaseIcon>
  );
}
