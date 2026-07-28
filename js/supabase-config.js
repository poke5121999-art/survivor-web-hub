/*
 * Public Supabase config for the hub. Fill these in AFTER provisioning the project
 * (see web-hub/db/README.md).
 *
 * WHY it is safe to commit these values:
 *   - `url` and `anonKey` are PUBLIC by design. The anon key can only do what the
 *     Row Level Security policies allow, so it is meant to live in client code.
 *   - The service_role (secret) key is the dangerous one — it bypasses RLS and must
 *     NEVER appear here or anywhere in this repo.
 *
 * Empty url/anonKey => the hub runs in GUEST-ONLY mode (the required degrade path):
 * the sign-in forms are disabled with a notice, and "play as guest" still works. This
 * is also exactly what a fresh clone sees before the owner has provisioned anything.
 * SEE: docs/patches/phase-5.3-patch-2-hub-signin-gate.md
 */
window.SUPABASE_CONFIG = {
  // e.g. "https://abcdxyz.supabase.co"
  url: "https://jvdguaecnllejdmgytia.supabase.co",
  // the public anon / publishable key
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZGd1YWVjbmxsZWpkbWd5dGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDM3MTAsImV4cCI6MjEwMDgxOTcxMH0.oo1rodkh8_c7tBa-jptqHfemxmY9h8Q_r8DYrUYL9AI",
  // Emails allowed into admin.html once the service is configured. Empty => any
  // signed-in member may open admin. Set to ["you@example.com"] to lock it to yourself.
  adminEmails: ["poke5121999@gmail.com"]
};
