// Función de Supabase: manda el aviso «Descanso terminado» a los móviles de los clientes.
// La llama pg_cron (ver supabase/avisos_descanso.sql) cuando hay alarmas vencidas en rest_alarms.
// Se despliega con verify_jwt desactivado: se protege con la contraseña interna x-cron.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Solo el cron (o quien tenga la contraseña interna) puede usarla
  const { data: cfg } = await admin.from("push_config").select("*").eq("id", 1).single();
  if (!cfg || req.headers.get("x-cron") !== cfg.cron_secret) return json({ error: "No autorizado" }, 401);

  // La primera vez se crean las claves de los avisos y se guardan (la privada no sale del servidor)
  if (!cfg.vapid) {
    const k = await webpush.generateVapidKeys({ extractable: true });
    cfg.vapid = await webpush.exportVapidKeys(k);
    cfg.vapid_public = await webpush.exportApplicationServerKey(k);
    await admin.from("push_config").update({ vapid: cfg.vapid, vapid_public: cfg.vapid_public }).eq("id", 1);
  }
  const vapidKeys = await webpush.importVapidKeys(cfg.vapid, { extractable: false });
  const server = await webpush.ApplicationServer.new({ contactInformation: "mailto:maarcosbustamantedle@gmail.com", vapidKeys });

  // Coge y borra a la vez las alarmas vencidas (así no se mandan dos veces)
  const { data: due } = await admin.from("rest_alarms").delete().lte("fire_at", new Date().toISOString()).select();
  if (!due?.length) return json({ sent: 0 });

  const { data: subs } = await admin.from("push_subs").select("*").in("user_id", due.map((a) => a.user_id));
  let sent = 0;
  await Promise.all((subs || []).map(async (s) => {
    const a = due.find((x) => x.user_id === s.user_id)!;
    try {
      await server.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(JSON.stringify({ title: a.title, body: a.body }), { urgency: webpush.Urgency.High, ttl: 60 });
      sent++;
    } catch (e) {
      // Móvil que ya no acepta avisos (desinstalada, permiso quitado): se borra
      if (e instanceof webpush.PushMessageError && (e.isGone() || e.response.status === 404))
        await admin.from("push_subs").delete().eq("endpoint", s.endpoint);
      else console.error("aviso fallido", String(e));
    }
  }));
  return json({ sent });
});
