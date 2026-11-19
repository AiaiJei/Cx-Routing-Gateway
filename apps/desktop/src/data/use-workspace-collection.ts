import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

/** Local mutations belong to one workspace snapshot, never to the next data source. */
export function useWorkspaceCollection<T>(source: T[]): [T[], Dispatch<SetStateAction<T[]>>] {
  const [override, setOverride] = useState<{ source: T[]; items: T[] } | null>(null);
  const items = override?.source === source ? override.items : source;
  const update: Dispatch<SetStateAction<T[]>> = useCallback(action => {
    setOverride(current => {
      const previous = current?.source === source ? current.items : source;
      return { source, items: typeof action === "function" ? action(previous) : action };
    });
  }, [source]);
  return [items, update];
}
