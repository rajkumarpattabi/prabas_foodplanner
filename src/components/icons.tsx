// Simple line icons, drawn on a 24px grid. They inherit colour from `currentColor`.
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const PlanIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path d="M9 14.5l2 2 4-4" />
  </Svg>
)

export const StockIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10M8 4v2.5c-1.8.8-3 2.6-3 4.6V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.9c0-2-1.2-3.8-3-4.6V4" />
    <path d="M5 13h14" />
  </Svg>
)

export const ShopIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9h16l-1.6 9.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8L4 9z" />
    <path d="M8.5 9 11 4M15.5 9 13 4M9.5 13v3M14.5 13v3" />
  </Svg>
)

export const DishesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h18a9 9 0 0 1-18 0z" />
    <path d="M9 8c0-1.5 1-1.5 1-3M13 8c0-1.5 1-1.5 1-3" />
  </Svg>
)

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
)

export const BackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
)

// ---- Dish types: one simple icon each (tiffin, rice, kuzhambu, poriyal, non-veg, drink) ----

/** Two idlis on a plate. */
export const TiffinIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="15.5" rx="9" ry="3.5" />
    <path d="M5.5 13.5c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5M11.5 13.5c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5" />
  </Svg>
)

/** A mound of rice in a bowl. */
export const RiceIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h18a9 7 0 0 1-18 0z" />
    <path d="M6 12c0-3 2.7-5 6-5s6 2 6 5" />
    <path d="M10 9.5h.01M13.5 9h.01M12 11h.01" />
  </Svg>
)

/** A pot with a ladle. */
export const KuzhambuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
    <path d="M2.5 11.5H4M20 11.5h1.5" />
    <path d="M14 10l4-7" />
  </Svg>
)

/** A leaf, for poriyal, kootu and chutney. */
export const PoriyalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14z" />
    <path d="M5 19L14 10" />
  </Svg>
)

/** A drumstick (chicken leg). */
export const NonVegIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 4.5a5 5 0 0 1 5 5c0 3.5-3.5 6-7 6l-3 3" />
    <path d="M14.5 4.5a5 5 0 0 0-5 5c0 1 .2 1.8.6 2.6l-3 3" />
    <circle cx="6" cy="18" r="1.8" />
    <circle cx="4.5" cy="16" r="1.3" />
  </Svg>
)

/** A tumbler. */
export const DrinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 4h12l-1.5 15a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8z" />
    <path d="M6.6 10h10.8" />
  </Svg>
)

/** A heart, for favourites. */
export const HeartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </Svg>
)
