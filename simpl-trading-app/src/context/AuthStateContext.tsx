import { createContext, useContext, type ReactNode } from "react";
import { useAuthState, type AuthState } from "../hooks/useAuthState";

type AuthStateContextValue = AuthState & { refresh: () => Promise<void> };

const AuthStateContext = createContext<AuthStateContextValue | null>(null);

/**
 * Wraps the app in the ONE useAuthState() instance the root layout routes
 * on. Screens that change what that state should be (onboarding.tsx
 * completing KYC, pending.tsx seeing ACTIVE) call refresh() from this same
 * context before navigating — calling useAuthState() again directly from
 * those screens would create an independent copy whose refresh() wouldn't
 * touch the instance the root layout actually reads, so the guard would
 * still fight the navigation with its stale value. See useAuthState.ts.
 */
export function AuthStateProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthStateContext.Provider value={value}>{children}</AuthStateContext.Provider>;
}

export function useAuthStateContext(): AuthStateContextValue {
  const ctx = useContext(AuthStateContext);
  if (!ctx) throw new Error("useAuthStateContext must be used within AuthStateProvider");
  return ctx;
}
