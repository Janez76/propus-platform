import { useMemo } from "react";
import equal from "fast-deep-equal";

export function useDirty<T>(current: T, initial: T): boolean {
  return useMemo(() => !equal(current, initial), [current, initial]);
}
