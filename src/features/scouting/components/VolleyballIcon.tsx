import { useId } from 'react';
import type { SVGProps } from 'react';

export function VolleyballIcon(props: SVGProps<SVGSVGElement>) {
  const gradientId = useId();

  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="32" cy="32" r="29" fill={`url(#${gradientId})`} stroke="#0F172A" strokeOpacity="0.18" strokeWidth="2.5" />
      <path
        d="M20 9.5C28.5 14.5 34.5 22.5 37.5 32.5C40 41 39.5 50 35.5 58"
        stroke="#EFF6FF"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M8.5 24.5C17.5 22 27.5 22.5 37 27"
        stroke="#60A5FA"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M26.5 6.5C31 13.5 33.5 21.5 33.5 30.5"
        stroke="#1D4ED8"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M54.5 17C45.5 18 37 22.5 30.5 29"
        stroke="#DBEAFE"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M14 47.5C21.5 41 31.5 37.5 42.5 38"
        stroke="#2563EB"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M47 10.5C49.5 17 50 24.5 48.5 32"
        stroke="#93C5FD"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <defs>
        <radialGradient id={gradientId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(22 18) rotate(50) scale(45)">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#E0F2FE" />
          <stop offset="1" stopColor="#93C5FD" />
        </radialGradient>
      </defs>
    </svg>
  );
}
