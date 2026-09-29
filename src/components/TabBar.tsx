import { NavLink } from 'react-router'
import { DishesIcon, PlanIcon, ShopIcon, StockIcon } from './icons.tsx'

const TABS = [
  { to: '/plan', label: 'Plan', Icon: PlanIcon },
  { to: '/stock', label: 'Stock', Icon: StockIcon },
  { to: '/shop', label: 'Shop', Icon: ShopIcon },
  { to: '/dishes', label: 'Dishes', Icon: DishesIcon },
]

export function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  isActive ? 'text-leaf' : 'text-ink-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full ${
                      isActive ? 'bg-leaf-fill' : ''
                    }`}
                  >
                    <Icon width={22} height={22} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
