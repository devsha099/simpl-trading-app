import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// API_BASE — where your backend is reachable FROM THE DEVICE running the app.
//
// This used to be a hardcoded LAN IP that had to be hand-edited every time
// the dev machine's network changed (new Wi-Fi, VPN connect/disconnect,
// etc.) — it went stale silently three separate times, each one looking
// like a backend outage ("Couldn't reach the backend") when the backend was
// actually fine. Instead this derives the right host per environment:
//   • Web (browser)     → localhost, always correct.
//   • Simulator/emulator → localhost (iOS) / 10.0.2.2 (Android's fixed
//     alias back to the host machine's own localhost).
//   • Physical device    → Constants.expoConfig.hostUri, the exact host
//     Expo/Metro used to reach THIS device over the QR code. If that
//     worked, port 4000 on the same host works too — no manual IP-hunting,
//     and it self-heals across network changes on every reload.
// The one hardcoded fallback below only fires if hostUri is ever missing
// (e.g. a standalone/production build with no dev server) — edit that one
// line if you actually hit it (ipconfig/ifconfig for your current LAN IP).
// ---------------------------------------------------------------------------
const BACKEND_PORT = 4000;

function resolveApiBase(): string {
  if (Platform.OS === "web") return `http://localhost:${BACKEND_PORT}`;

  if (!Device.isDevice) {
    // Simulator (iOS) or emulator (Android), not a physical device.
    const host = Platform.OS === "android" ? "10.0.2.2" : "localhost";
    return `http://${host}:${BACKEND_PORT}`;
  }

  const lanHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (lanHost && lanHost !== "localhost" && lanHost !== "127.0.0.1") {
    return `http://${lanHost}:${BACKEND_PORT}`;
  }

  // Fallback of last resort — EDIT THIS to your machine's current LAN IP if
  // you ever land here (means hostUri wasn't available for some reason).
  return `http://10.0.0.103:${BACKEND_PORT}`;
}

export const API_BASE = resolveApiBase();

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
