export const FLAG_TYPES = ["BOOLEAN", "EXPERIMENT"] as const;
export type FlagType = (typeof FLAG_TYPES)[number];

export const EVENT_TYPES = ["EXPOSURE", "CONVERSION"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
