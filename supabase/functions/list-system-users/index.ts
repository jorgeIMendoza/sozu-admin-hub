import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROLE_SUPER_ADMIN = 1;
const ROLE_ADMINISTRADOR_PROYECTO = 2;
const ROLE_AGENTE_INMOBILIARIO = 3;
const ROLE_INMOBILIARIA = 4;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
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
      return jsonResponse({ error: "Falta configuración de Supabase" }, 500);
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Sesión inválida" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: requester, error: requesterError } = await supabaseAdmin
      .from("usuarios")
      .select("rol_id, activo, roles!inner(nombre)")
      .eq("auth_user_id", userData.user.id)
      .eq("activo", true)
      .single();

    if (requesterError || !requester) {
      return jsonResponse({ error: "Usuario no encontrado" }, 403);
    }

    if (![ROLE_SUPER_ADMIN, ROLE_ADMINISTRADOR_PROYECTO].includes(requester.rol_id ?? 0)) {
      return jsonResponse({ error: "No tienes permisos para consultar usuarios del sistema" }, 403);
    }

    const pageSize = 1000;
    const allUsers: unknown[] = [];

    for (let from = 0; ; from += pageSize) {
      let query = supabaseAdmin
        .from("usuarios")
        .select(`
          email,
          nombre,
          rol_id,
          activo,
          auth_user_id,
          id_persona,
          debe_cambiar_password,
          email_confirmado,
          roles!inner (nombre, es_rol_interno),
          personas (nombre_legal, email)
        `)
        .eq("roles.es_rol_interno", true)
        .order("nombre", { ascending: true })
        .order("email", { ascending: true })
        .range(from, from + pageSize - 1);

      if (requester.rol_id === ROLE_ADMINISTRADOR_PROYECTO) {
        query = query.in("rol_id", [ROLE_AGENTE_INMOBILIARIO, ROLE_INMOBILIARIA]);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching system users:", error);
        return jsonResponse({ error: "No se pudieron consultar los usuarios" }, 500);
      }

      allUsers.push(...(data ?? []));

      if (!data || data.length < pageSize) {
        break;
      }
    }

    return jsonResponse({ data: allUsers });
  } catch (error) {
    console.error("Unexpected error in list-system-users:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Error inesperado" }, 500);
  }
});