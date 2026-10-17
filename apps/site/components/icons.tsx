import type { SVGProps } from "react";

/** Authored icon set: 20px grid, 1.5px stroke, round joins. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconMic = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7.25" y="2.75" width="5.5" height="9" rx="2.75" />
    <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5M7.5 17.5h5" />
  </Icon>
);

export const IconMail = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="1.5" />
    <path d="m3.5 5.25 6.5 5.25 6.5-5.25" />
  </Icon>
);

export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 4.6v10.8a.6.6 0 0 0 .9.5l8.4-5.4a.6.6 0 0 0 0-1L7.4 4.1a.6.6 0 0 0-.9.5Z" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.5v11M13 4.5v11" strokeWidth={2.2} />
  </Icon>
);

/** A folded flag: the needs-review mark. */
export const IconFlag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 17.5V3" />
    <path d="M5 3.5h9.2a.5.5 0 0 1 .4.8L12.5 7.5l2.1 3.2a.5.5 0 0 1-.4.8H5" fill="currentColor" fillOpacity={0.2} />
  </Icon>
);

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8.75" cy="8.75" r="5.25" />
    <path d="m12.75 12.75 4 4" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 5 10 10M15 5 5 15" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
);

export const IconArrowDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.5v13M5 11.5l5 5 5-5" />
  </Icon>
);

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 10h13M11.5 5l5 5-5 5" />
  </Icon>
);

export const IconArrowUpRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 14 14 6M7.5 6H14v6.5" />
  </Icon>
);

export const IconLayers = (p: IconProps) => (
  <Icon {...p}>
    <path d="m10 3 7 3.5-7 3.5-7-3.5L10 3Z" />
    <path d="m3 10 7 3.5 7-3.5M3 13.5 10 17l7-3.5" />
  </Icon>
);

export const IconAgent = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="6" width="12" height="9.5" rx="2" />
    <path d="M10 3v3M7.5 10.5h.01M12.5 10.5h.01M2 10v2.5M18 10v2.5" />
  </Icon>
);

export const IconGraph = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5" cy="5.5" r="2" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="8" cy="15" r="2" />
    <path d="M6.9 6.2 13.1 6.6M6 7.3l1.4 5.8M13.6 8.6l-4.3 4.9" />
  </Icon>
);

export const IconDoc = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 2.75h6l3.5 3.5v10.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V3.25a.5.5 0 0 1 .5-.5Z" />
    <path d="M11.5 2.75v3.5H15M7.5 10.5h5M7.5 13.5h5" />
  </Icon>
);

export const IconPencil = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12.5 4.5 3 3L7 16H4v-3l8.5-8.5Z" />
  </Icon>
);

export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
    <path d="M13 7V4.5a1 1 0 0 0-1-1H4.5a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1H7" />
  </Icon>
);

export const IconRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.2h-3.2" />
  </Icon>
);

export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </Icon>
);

export const IconSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 10h9M9 5.5 13.5 10 9 14.5" />
    <path d="M16.5 4v12" />
  </Icon>
);

export const IconBolt = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 2.75 4.75 11h4.5L8.5 17.25 15.25 9h-4.5L11 2.75Z" />
  </Icon>
);

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
  </Icon>
);
