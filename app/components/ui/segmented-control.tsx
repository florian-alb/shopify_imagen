import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

type SegmentedControlOption<T extends string> = {
  value: T
  label: string
  icon?: React.ReactNode
}

function SegmentedControl<T extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  className,
  disabled = false,
}: {
  value: T
  options: readonly SegmentedControlOption<T>[]
  onValueChange: (value: T) => void
  ariaLabel: string
  className?: string
  disabled?: boolean
}) {
  const activeIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0
  )

  return (
    <RadioGroupPrimitive.Root
      className={cn(
        "relative grid h-11 w-full rounded-lg bg-muted p-1 sm:h-9",
        className
      )}
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as T)}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1 rounded-md border border-border bg-background transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className="relative z-10 inline-flex min-w-0 select-none items-center justify-center gap-1.5 rounded-md px-2 text-[0.8rem] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:text-foreground [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0"
        >
          {option.icon}
          <span className="truncate">{option.label}</span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}

export { SegmentedControl, type SegmentedControlOption }
