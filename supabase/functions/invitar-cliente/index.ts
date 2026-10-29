// Función de Supabase: el entrenador invita a un cliente nuevo por correo.
// Usa la clave service_role, que solo existe aquí en el servidor (nunca en la web).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Quién llama: debe ser un usuario con sesión y rol admin
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u?.user) return json({ error: "No has iniciado sesión" }, 401);
  const { data: p } = await admin.from("profiles").select("role").eq("id", u.user.id).single();
  if (p?.role !== "admin") return json({ error: "Solo el entrenador puede añadir clientes" }, 403);

  // Datos del cliente
  let body: { email?: string; redirectTo?: string } = {};
  try { body = await req.json(); } catch (_) { /* cuerpo vacío */ }
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Correo no válido" }, 400);

  // Envía la invitación (Supabase manda el correo con el enlace para crear contraseña)
  const { error } = await admin.auth.admin.inviteUserByEmail(email, body.redirectTo ? { redirectTo: body.redirectTo } : {});
  if (error) {
    const dup = /already|registered|exists/i.test(error.message);
    return json({ error: dup ? "Ese correo ya tiene cuenta" : error.message }, dup ? 409 : 400);
  }
  return json({ ok: true });
});
