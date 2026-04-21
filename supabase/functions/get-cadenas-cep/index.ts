import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Leer el parámetro numero_dias_atras del body (default 1 = ayer)
    let numeroDiasAtras = 1;
    try {
      if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
        const body = await req.json().catch(() => ({}));
        if (body && typeof body.numero_dias_atras !== "undefined") {
          const n = Number(body.numero_dias_atras);
          if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
            return new Response(
              JSON.stringify({ error: "numero_dias_atras debe ser un entero >= 0" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          numeroDiasAtras = n;
        }
      } else {
        // Soportar también ?numero_dias_atras=N por GET
        const url = new URL(req.url);
        const q = url.searchParams.get("numero_dias_atras");
        if (q !== null) {
          const n = Number(q);
          if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
            return new Response(
              JSON.stringify({ error: "numero_dias_atras debe ser un entero >= 0" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          numeroDiasAtras = n;
        }
      }
    } catch (_) {
      // body inválido → usar default
    }

    // Calcular fecha objetivo en formato YYYY-MM-DD
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - numeroDiasAtras);
    const fechaObjetivo = fecha.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("tabla_datos_cep")
      .select("cadena")
      .eq("fecha_operacion", fechaObjetivo);

    if (error) {
      console.error("Error consultando tabla_datos_cep:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        numero_dias_atras: numeroDiasAtras,
        fecha_operacion: fechaObjetivo,
        total: data?.length ?? 0,
        data,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error inesperado:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});