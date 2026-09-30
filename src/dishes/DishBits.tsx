import type { ReactNode } from 'react'
import { DrinkIcon, HeartIcon, KuzhambuIcon, NonVegIcon, PoriyalIcon, RiceIcon, TiffinIcon } from '../components/icons.tsx'
import { TYPE_LABELS } from './labels.ts'
import { ICON_GROUP, type IconGroup } from './rules.ts'
import type { Dish, DishType } from './types.ts'

// Colour carries meaning (CLAUDE.md): tiffin and rice turmeric, kuzhambu coral,
// sides teal, non-veg red. Always shown with the type's name for screen readers.
const GROUP_STYLE: Record<IconGroup, { Icon: typeof TiffinIcon; className: string }> = {
  tiffin: { Icon: TiffinIcon, className: 'bg-turmeric-fill text-turmeric' },
  rice: { Icon: RiceIcon, className: 'bg-turmeric-fill text-turmeric' },
  kuzhambu: { Icon: KuzhambuIcon, className: 'bg-coral-fill text-coral' },
  poriyal: { Icon: PoriyalIcon, className: 'bg-teal-fill text-teal' },
  nonveg: { Icon: NonVegIcon, className: 'bg-red-fill text-red' },
  drink: { Icon: DrinkIcon, className: 'bg-leaf-fill text-leaf' },
}

/** The dish type's icon on its colour. */
export function DishIcon({ type, size = 'md' }: { type: DishType; size?: 'md' | 'lg' }) {
  const { Icon, className } = GROUP_STYLE[ICON_GROUP[type]]
  const box = size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'
  return (
    <span role="img" aria-label={TYPE_LABELS[type]} className={`flex ${box} shrink-0 items-center justify-center rounded-xl ${className}`}>
      <Icon width={size === 'lg' ? 26 : 22} height={size === 'lg' ? 26 : 22} />
    </span>
  )
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}

/** Veg or non-veg, with the familiar square-and-dot mark and the word. */
export function VegLabel({ isVeg }: { isVeg: boolean }) {
  return (
    <Chip className={isVeg ? 'bg-leaf-fill text-leaf-strong' : 'bg-red-fill text-red'}>
      <span aria-hidden="true" className="flex h-3 w-3 items-center justify-center rounded-[3px] border border-current">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {isVeg ? 'Veg' : 'Non-veg'}
    </Chip>
  )
}

/** Favourites, hidden, and the protein and fibre tags. */
export function DishBadges({ dish }: { dish: Pick<Dish, 'is_veg' | 'is_favourite' | 'is_kids_favourite' | 'dont_suggest' | 'tags'> }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <VegLabel isVeg={dish.is_veg} />
      {dish.is_favourite && (
        <Chip className="bg-turmeric-fill text-turmeric-strong">
          <HeartIcon width={12} height={12} aria-hidden="true" />
          Favourite
        </Chip>
      )}
      {dish.is_kids_favourite && <Chip className="bg-turmeric-fill text-turmeric-strong">Kids' favourite</Chip>}
      {dish.tags.includes('protein') && <Chip className="bg-blue-fill text-blue">Protein</Chip>}
      {dish.tags.includes('fibre') && <Chip className="bg-leaf-fill text-leaf-strong">Fibre</Chip>}
      {dish.dont_suggest && <Chip className="border border-line text-ink-muted">Not suggested</Chip>}
    </span>
  )
}
