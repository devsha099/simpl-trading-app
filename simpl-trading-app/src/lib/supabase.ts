import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Deliberately does NOT throw when unconfigured: this module is imported by
// the root layout, and expo-router server-renders web on every request (see
// app.json's "web.output": "static") — throwing here would crash that SSR
// pass and take down the entire app, not just auth. Fall back to a
// syntactically-valid placeholder so the client constructs fine; any actual
// call against it fails at the network layer with a normal, catchable error,
// the same way the rest of the app already handles "backend unreachable."
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — " +
      "copy .env.example to .env, fill in your Supabase project's values " +
      "(dashboard -> Settings -> API), and restart the dev server. " +
      "Auth calls will fail until then.",
  );
}

// ANON key only — safe for the client, protected by RLS. The service-role
// key that bypasses RLS lives only in the backend's .env, never here.
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
