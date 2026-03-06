import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "No autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Configuración incompleta en el servidor" }, 500);
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Sesión inválida" }, 401);
    }

    const { email } = await req.json();
    const targetEmail = String(email || "").trim();

    if (!targetEmail) {
      return jsonResponse({ error: "Email requerido" }, 400);
    }

    const { data: canManage, error: canManageError } = await supabaseUser.rpc("is_inmob_agent_owner", {
      target_email: targetEmail,
    });

    if (canManageError) {
      console.error("Ownership check failed:", canManageError);
      return jsonResponse({ error: "No se pudo validar permisos de reactivación" }, 403);
    }

    if (!canManage) {
      return jsonResponse({ error: "No tienes permisos para reactivar este agente" }, 403);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("usuarios")
      .update({ activo: true, fecha_actualizacion: new Date().toISOString() })
      .ilike("email", targetEmail)
      .select("email, activo")
      .limit(1);

    if (updateError) {
      console.error("Reactivate update failed:", updateError);
      return jsonResponse({ error: "No fue posible reactivar al agente" }, 500);
    }

    if (!updatedRows?.length) {
      return jsonResponse({ error: "No se encontró el usuario" }, 404);
    }

    return jsonResponse({ success: true, email: updatedRows[0].email, activo: updatedRows[0].activo }, 200);
  } catch (error) {
    console.error("Unexpected reactivate error:", error);
    return jsonResponse({ error: `Error inesperado: ${error.message}` }, 500);
  }
});
