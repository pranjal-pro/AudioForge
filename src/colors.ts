// Per-track accent colors, shared by the track cards and the mix timeline.
export const TRACK_COLORS = ['#a855f7', '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6'];

export const trackColor = (index: number) => TRACK_COLORS[index % TRACK_COLORS.length];
