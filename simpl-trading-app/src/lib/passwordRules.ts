/**
 * Single source of truth for password strength, shared by the live
 * checklist UI (components/PasswordRequirements.tsx) and the zod schemas on
 * signup.tsx/reset-password.tsx — so the UI and the actual validation can't
 * silently drift apart.
 */
export const PASSWORD_REQUIREMENTS: { label: string; test: (password: string) => boolean }[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "At least 1 number", test: (p) => /\d/.test(p) },
  { label: "At least 1 special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function isValidPassword(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((r) => r.test(password));
}
