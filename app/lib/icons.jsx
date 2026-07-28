// Hand-drawn inline SVG icon set for the Developer Platform.
// All icons: 16x16 viewBox, stroke-based, inherit currentColor.

function I({ children, size = 16, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p) => (
  <I {...p}>
    <path d="M2.5 7.5 8 2.8l5.5 4.7" />
    <path d="M4 6.6V13h8V6.6" />
    <path d="M6.6 13V9.6h2.8V13" />
  </I>
);

export const IconBolt = (p) => (
  <I {...p}>
    <path d="M8.8 1.8 3.4 9h3.4l-.9 5.2L11.6 7H8.1l.7-5.2Z" />
  </I>
);

export const IconBook = (p) => (
  <I {...p}>
    <path d="M8 3.2c-1.3-1-3.2-1.3-5-1v10.4c1.8-.3 3.7 0 5 1 1.3-1 3.2-1.3 5-1V2.2c-1.8-.3-3.7 0-5 1Z" />
    <path d="M8 3.2v11.2" />
  </I>
);

export const IconKey = (p) => (
  <I {...p}>
    <circle cx="5.4" cy="10.6" r="2.7" />
    <path d="m7.4 8.6 5.6-5.6M11 5l2 2M9.4 6.6l1.5 1.5" />
  </I>
);

export const IconWebhook = (p) => (
  <I {...p}>
    <circle cx="8" cy="4.2" r="2.2" />
    <circle cx="3.8" cy="11.4" r="2.2" />
    <circle cx="12.2" cy="11.4" r="2.2" />
    <path d="M6.9 6 4.9 9.5M9.1 6l2 3.5M6 11.4h4" />
  </I>
);

export const IconChart = (p) => (
  <I {...p}>
    <path d="M2 13.5h12" />
    <path d="M3.5 13.5V9M7 13.5V5.5M10.5 13.5V7.5M14 13.5V3.5" />
  </I>
);

export const IconVault = (p) => (
  <I {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.6" />
    <circle cx="8" cy="8" r="2.6" />
    <path d="M8 6.4v1.6l1.1 1.1" />
    <path d="M4.5 2.5v-1M11.5 2.5v-1" opacity=".5" />
  </I>
);

export const IconPulse = (p) => (
  <I {...p}>
    <path d="M1.5 8h3l1.6-4.5 2.8 9L10.6 8h3.9" />
  </I>
);

export const IconCopy = (p) => (
  <I {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.4" />
    <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </I>
);

export const IconCheck = (p) => (
  <I {...p}>
    <path d="m2.8 8.6 3.4 3.4 7-7.6" />
  </I>
);

export const IconX = (p) => (
  <I {...p}>
    <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
  </I>
);

export const IconArrowRight = (p) => (
  <I {...p}>
    <path d="M2.5 8h11M9.5 4l4 4-4 4" />
  </I>
);

export const IconArrowUpRight = (p) => (
  <I {...p}>
    <path d="M4 12 12 4M5.5 4H12v6.5" />
  </I>
);

export const IconPlus = (p) => (
  <I {...p}>
    <path d="M8 2.5v11M2.5 8h11" />
  </I>
);

export const IconSearch = (p) => (
  <I {...p}>
    <circle cx="7" cy="7" r="4.4" />
    <path d="m10.4 10.4 3.1 3.1" />
  </I>
);

export const IconTerminal = (p) => (
  <I {...p}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.6" />
    <path d="m4.5 6.5 2.4 2-2.4 2M8.5 10.5h3" />
  </I>
);

export const IconShield = (p) => (
  <I {...p}>
    <path d="M8 1.8 2.8 3.8v4.4c0 3.4 2.2 5.4 5.2 6.4 3-1 5.2-3 5.2-6.4V3.8L8 1.8Z" />
    <path d="m5.7 8 1.7 1.7 3-3.2" />
  </I>
);

export const IconGlobe = (p) => (
  <I {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8h12M8 2c1.8 1.7 2.7 3.7 2.7 6S9.8 12.3 8 14c-1.8-1.7-2.7-3.7-2.7-6S6.2 3.7 8 2Z" />
  </I>
);

export const IconLayers = (p) => (
  <I {...p}>
    <path d="m8 1.8 6 3.2-6 3.2-6-3.2 6-3.2Z" />
    <path d="m2 8.5 6 3.2 6-3.2M2 12l6 3.2 6-3.2" opacity=".6" />
  </I>
);

export const IconClock = (p) => (
  <I {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.6V8l2.3 2.3" />
  </I>
);

export const IconSend = (p) => (
  <I {...p}>
    <path d="M14 2 7 9M14 2 9.5 14 7 9 2 6.5 14 2Z" />
  </I>
);

export const IconRefresh = (p) => (
  <I {...p}>
    <path d="M13.2 6.5A5.4 5.4 0 0 0 3.4 4.6M2.8 9.5a5.4 5.4 0 0 0 9.8 1.9" />
    <path d="M13.4 2.6v4h-4M2.6 13.4v-4h4" />
  </I>
);

export const IconTrash = (p) => (
  <I {...p}>
    <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4" />
    <path d="M6.7 6.8v4.4M9.3 6.8v4.4" opacity=".6" />
  </I>
);

export const IconExternal = (p) => (
  <I {...p}>
    <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5" />
    <path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
  </I>
);

export const IconChevronDown = (p) => (
  <I {...p}>
    <path d="m4 6 4 4 4-4" />
  </I>
);

export const IconCode = (p) => (
  <I {...p}>
    <path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5l3.5 3.5-3.5 3.5" />
  </I>
);

export const IconCpu = (p) => (
  <I {...p}>
    <rect x="4" y="4" width="8" height="8" rx="1.2" />
    <rect x="6.5" y="6.5" width="3" height="3" rx=".5" />
    <path d="M6 1.8v2M10 1.8v2M6 12.2v2M10 12.2v2M1.8 6h2M1.8 10h2M12.2 6h2M12.2 10h2" opacity=".6" />
  </I>
);

export const IconUsers = (p) => (
  <I {...p}>
    <circle cx="6" cy="5.2" r="2.4" />
    <path d="M2.2 13.2c0-2.1 1.7-3.6 3.8-3.6s3.8 1.5 3.8 3.6" />
    <path d="M10.5 3.4a2.2 2.2 0 0 1 0 4M11.5 9.9c1.4.4 2.3 1.6 2.3 3.3" opacity=".7" />
  </I>
);

export const IconScale = (p) => (
  <I {...p}>
    <path d="M8 2.2v11.6M4.5 13.8h7" />
    <path d="M8 3.8 3.4 5.4M8 3.8l4.6 1.6" />
    <path d="M3.4 5.4 1.8 9a1.9 1.9 0 0 0 3.2 0L3.4 5.4ZM12.6 5.4 11 9a1.9 1.9 0 0 0 3.2 0l-1.6-3.6Z" />
  </I>
);

// Thesauros brand mark: abstract vault / routing glyph.
export function BrandMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 1.6 17.4 5.4v7.2L10 16.4 2.6 12.6V5.4L10 1.6Z"
        stroke="#5b95ff"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M10 5.2v7.4" stroke="#4dead8" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M6.6 7.1 10 8.9l3.4-1.8M6.6 11 10 9.2l3.4 1.8"
        stroke="#5b95ff"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".85"
      />
    </svg>
  );
}
