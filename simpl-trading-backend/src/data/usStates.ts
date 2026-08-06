/**
 * USPS state/territory codes Alpaca's `contact.state` field accepts for US
 * addresses. Mirrored in simpl-trading-app/src/lib/usStates.ts — kept as two
 * copies since the app and backend are separate npm projects with no shared
 * package.
 */
export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR", "VI", "GU", "AS", "MP",
] as const;
