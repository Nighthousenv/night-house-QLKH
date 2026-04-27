export const INITIAL_HOMESTAYS = [
  { id: 'h1', name: 'Night House - Quan Nhân', roomCount: 6 },
  { id: 'h2', name: 'Night House - Đình Thôn', roomCount: 8 },
  { id: 'h3', name: 'Night House - Mễ Trì', roomCount: 9 },
];

export const ROOMS_BY_HOMESTAY: Record<string, string[]> = {
  h1: ['P201', 'P301', 'P302', 'P401', 'P402', 'P501'],
  h2: ['P401', 'P402', 'P501', 'P502', 'P505', 'P601', 'P602', 'P603'],
  h3: ['P301', 'P302', 'P401', 'P402', 'P501', 'P502', 'P601', 'P602', 'P702'],
};
