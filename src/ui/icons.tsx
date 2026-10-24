// Icone a tratto disegnate per questa app (non sono SF Symbols di Apple). Decorative: il pulsante che le contiene ha l'aria-label.
import type { JSX } from 'preact';

type IconProps = { class?: string; size?: number };

function Svg(props: IconProps & { children: JSX.Element | JSX.Element[] }) {
  const s = props.size ?? 24;
  return (
    <svg
      class={props.class}
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {props.children}
    </svg>
  );
}

export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 9a2 2 0 0 1 2-2h1.8l1.2-1.8c.2-.3.5-.4.8-.4h5.4c.3 0 .6.1.8.4L16.7 7h1.8a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.6" />
  </Svg>
);

export const IconPhotos = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4.5h9.5a2 2 0 0 1 2 2V16" />
    <rect x="3.5" y="7.5" width="13" height="12" rx="2" />
    <path d="M3.5 16.5l3.6-3.6 3 3 2.1-2.1 3.8 3.8" />
    <circle cx="12.6" cy="11.2" r="1" />
  </Svg>
);

export const IconPencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11.5 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h10a2.5 2.5 0 0 0 2.5-2.5v-4.5" />
    <path d="M18.3 3.8l1.9 1.9-8 8-3 1 1-3z" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
);

export const IconWarning = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.2l8.4 14.6H3.6z" />
    <path d="M12 10v4M12 16.8v.1" />
  </Svg>
);
