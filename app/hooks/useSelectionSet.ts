import { useCallback, useState } from "react";

export function selectionSetFrom<T>(values?: Iterable<T> | null): Set<T> {
  return new Set(values ?? []);
}

export function toggleSelectionSetValue<T>(
  current: ReadonlySet<T>,
  value: T,
  selected?: boolean,
): Set<T> {
  const next = new Set(current);
  const shouldSelect = selected ?? !next.has(value);

  if (shouldSelect) next.add(value);
  else next.delete(value);

  return next;
}

export function toggleSelectionSetValues<T>(
  current: ReadonlySet<T>,
  values: Iterable<T>,
  selected: boolean,
): Set<T> {
  const next = new Set(current);

  for (const value of values) {
    if (selected) next.add(value);
    else next.delete(value);
  }

  return next;
}

export function useSelectionSet<T>(initialValues?: Iterable<T> | null) {
  const [selected, setSelected] = useState<Set<T>>(() =>
    selectionSetFrom(initialValues),
  );

  const clear = useCallback(() => {
    setSelected(new Set());
  }, []);

  const replace = useCallback((values: Iterable<T>) => {
    setSelected(selectionSetFrom(values));
  }, []);

  const toggle = useCallback((value: T, force?: boolean) => {
    setSelected((current) => toggleSelectionSetValue(current, value, force));
  }, []);

  const toggleMany = useCallback((values: Iterable<T>, force: boolean) => {
    setSelected((current) => toggleSelectionSetValues(current, values, force));
  }, []);

  const toArray = useCallback(() => Array.from(selected), [selected]);

  return {
    selected,
    size: selected.size,
    has: selected.has.bind(selected),
    isEmpty: selected.size === 0,
    clear,
    replace,
    toggle,
    toggleMany,
    toArray,
  };
}
