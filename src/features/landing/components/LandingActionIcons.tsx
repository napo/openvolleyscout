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

export function ClipboardCheckIcon(props: LandingIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9 4.75h6" />
      <path d="M10 3h4a1 1 0 0 1 1 1v1H9V4a1 1 0 0 1 1-1Z" />
      <path d="M8 5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1" />
      <path d="m9 13 2 2 4-4" />
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
