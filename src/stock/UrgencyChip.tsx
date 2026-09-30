import type { Level } from './urgency.ts'

const CHIP: Record<Level, string> = {
  red: 'bg-red-fill text-red',
  amber: 'bg-turmeric-fill text-turmeric-strong',
  green: 'bg-leaf-fill text-leaf-strong',
}

/** Urgency colour, always with its label (never colour alone). */
export function UrgencyChip({ level, label }: { level: Level; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[level]}`}>{label}</span>
}
