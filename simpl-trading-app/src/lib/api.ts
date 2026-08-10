import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// EDIT THIS LINE.
//
// API_BASE — where your backend is reachable FROM THE DEVICE running the app:
//   • iOS simulator (Mac):        http://localhost:4000
//   • Android emulator:           http://10.0.2.2:4000
//   • Physical phone (Expo Go):   http://<your-computer-LAN-IP>:4000
//        e.g. http://192.168.1.42:4000  (same Wi-Fi; find it with ipconfig/ifconfig)
// ---------------------------------------------------------------------------
export const API_BASE = "http://192.168.1.216:4000";

/**
 * fetch() against our backend with the logged-in user's Supabase session
 * token attached. Every /api/me/* route derives the Alpaca account id from
 * that token server-side — the client never sends an account id (CLAUDE.md
 * §3's security boundary). This replaced the old hardcoded ACCOUNT_ID.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}
