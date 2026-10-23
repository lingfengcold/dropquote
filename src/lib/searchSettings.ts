export const SEARCH_SECONDS = [5, 15, 30, 60, 120] as const;
export const SEARCH_NODES = [100000, 1000000, 5000000] as const;
export const nextSearchSeconds = (current: number) => SEARCH_SECONDS.find(value => value > current) ?? 120;
export const nextSearchNodes = (current: number) => SEARCH_NODES.find(value => value > current) ?? 5000000;
