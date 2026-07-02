import { useCallback, useState } from "react";

export type BusyStateKey = string | number | symbol;
export type BusyStateValue<TKey extends BusyStateKey = BusyStateKey> =
  | TKey
  | true
  | null;

export function busyStateValue<TKey extends BusyStateKey>(
  key?: TKey,
): BusyStateValue<TKey> {
  return key ?? true;
}

export function busyStateKey<TKey extends BusyStateKey>(
  value: BusyStateValue<TKey>,
): TKey | null {
  return value === true ? null : value;
}

export function busyStateIsActive<TKey extends BusyStateKey>(
  value: BusyStateValue<TKey>,
  key?: TKey,
) {
  if (key === undefined) return value !== null;
  return value === key;
}

export function useBusyState<TKey extends BusyStateKey = string>() {
  const [value, setValue] = useState<BusyStateValue<TKey>>(null);

  const start = useCallback((key?: TKey) => {
    setValue(busyStateValue(key));
  }, []);

  const stop = useCallback(() => {
    setValue(null);
  }, []);

  const setBusy = useCallback(
    (busy: boolean, key?: TKey) => {
      if (busy) start(key);
      else stop();
    },
    [start, stop],
  );

  const isBusy = useCallback(
    (key?: TKey) => busyStateIsActive(value, key),
    [value],
  );

  const runBusy = useCallback(
    async <TResult>(task: () => Promise<TResult>, key?: TKey) => {
      start(key);
      try {
        return await task();
      } finally {
        stop();
      }
    },
    [start, stop],
  );

  return {
    busy: value !== null,
    busyKey: busyStateKey(value),
    setBusy,
    start,
    stop,
    isBusy,
    runBusy,
  };
}
