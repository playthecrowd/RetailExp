import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

export function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function MuteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="m16 9 5 6" />
      <path d="m21 9-5 6" />
    </Icon>
  );
}

export function SoundIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M16 8.5a4.5 4.5 0 0 1 0 7" />
      <path d="M18.5 6a8 8 0 0 1 0 12" />
    </Icon>
  );
}

export function CaptionsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M7 10.5c-1.5 0-2.2.9-2.2 2s.7 2 2.2 2c.7 0 1.2-.2 1.6-.6" />
      <path d="M14 10.5c-1.5 0-2.2.9-2.2 2s.7 2 2.2 2c.7 0 1.2-.2 1.6-.6" />
    </Icon>
  );
}

export function FullscreenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 9V5a1 1 0 0 1 1-1h4" />
      <path d="M20 9V5a1 1 0 0 0-1-1h-4" />
      <path d="M4 15v4a1 1 0 0 0 1 1h4" />
      <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
    </Icon>
  );
}

export function ReplayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 1 3 6.7" />
      <path d="M3 21v-6h6" />
    </Icon>
  );
}

export function HelpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.2 1-1.2 2" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export function RecenterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </Icon>
  );
}

export function ExitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </Icon>
  );
}

export function CameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.5" />
    </Icon>
  );
}

export function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </Icon>
  );
}

export function NoAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M4 4l16 16" />
    </Icon>
  );
}

export function EyeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c5 0 8.5 4 9.9 7-0.5 1-1.3 2.2-2.4 3.3M6.5 6.6C4.3 8 2.7 10 1.9 12c1.4 3 4.9 7 10.1 7 1.5 0 2.9-.3 4.1-.9" />
      <path d="M9.5 9.5a3.5 3.5 0 0 0 4.9 4.9" />
    </Icon>
  );
}

export function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z" />
    </Icon>
  );
}

export function DecanterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 3h6v3.5l3 5.5v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6l3-5.5V3Z" />
      <path d="M9 3h6" />
      <circle cx="17" cy="19" r="1.6" />
    </Icon>
  );
}

export function ToastIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 3 5 11a3 3 0 0 0 6 0L9 3H7Z" />
      <path d="M8 14v6M6 20h4" />
      <path d="m14 5 5 5" />
      <path d="m19 5-5 5" />
    </Icon>
  );
}

export function BrushIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M14 4c2 0 5 3 5 5l-8 8-4-4 7-9Z" />
      <path d="M9 15 5 19a1.5 1.5 0 0 1-2-2l4-4" />
    </Icon>
  );
}

export function FireworkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </Icon>
  );
}

export function LockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Icon>
  );
}

/**
 * A sphere read as a globe with a horizon and a meridian — the shape a 360
 * view actually is, rather than the "360" numerals other products use, which
 * are illegible at 16 px and untranslatable.
 */
export function Sphere360Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </Icon>
  );
}
