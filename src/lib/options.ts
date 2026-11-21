export function mergeOptions<T>(getId: (item: T) => string, ...lists: readonly T[][]): T[] {
  const items = new Map<string, T>();
  for (const list of lists) for (const item of list) items.set(getId(item), item);
  return [...items.values()];
}
