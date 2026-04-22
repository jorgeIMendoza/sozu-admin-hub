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

    // Leer el parámetro fecha_operacion (formato YYYY-MM-DD)
    // Acepta: body JSON o query string ?fecha_operacion=YYYY-MM-DD
    let fechaOperacion: string | null = null;

    // 1) Intentar leer del body
    try {
      const ct = req.headers.get("content-type") || "";
      const cl = req.headers.get("content-length");
      const tieneBody = (cl !== null && cl !== "0") || ct.includes("application/json");
      if (tieneBody) {
        const raw = await req.text();
        if (raw && raw.trim().length > 0) {
          const body = JSON.parse(raw);
          if (body && typeof body.fecha_operacion === "string") {
            fechaOperacion = body.fecha_operacion.trim();
          }
        }
      }
    } catch (_) {
      // body inválido → intentar query string
    }

    // 2) Si no vino en body, intentar query string
    if (!fechaOperacion) {
      const url = new URL(req.url);
      const q = url.searchParams.get("fecha_operacion");
      if (q) fechaOperacion = q.trim();
    }

    // 3) Validar formato YYYY-MM-DD
    if (!fechaOperacion) {
      return new Response(
        JSON.stringify({ error: "Parámetro 'fecha_operacion' requerido en formato YYYY-MM-DD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaOperacion)) {
      return new Response(
        JSON.stringify({ error: "fecha_operacion debe tener el formato YYYY-MM-DD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[get-cadenas-cep] method=${req.method} fecha_operacion=${fechaOperacion}`);

    // Equivalente al SQL:
    // SELECT t.fecha_operacion, p.clave_rastreo, p.url_cep, t.fecha_actualizacion
    // FROM tabla_datos_cep t
    // JOIN pagos p ON p.clave_rastreo = t.claverastreo
    // WHERE t.fecha_operacion = $1;
    const { data, error } = await supabase
      .from("tabla_datos_cep")
      .select("fecha_operacion, fecha_actualizacion, claverastreo, pagos!inner(clave_rastreo, url_cep)")
      .eq("fecha_operacion", fechaOperacion);

    if (error) {
      console.error("Error consultando tabla_datos_cep:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Aplanar el resultado del join (una fila por cada pago coincidente)
    const rows: Array<{
      fecha_operacion: string | null;
      clave_rastreo: string | null;
      url_cep: string | null;
      fecha_actualizacion: string | null;
    }> = [];

    for (const r of (data ?? []) as any[]) {
      const pagos = Array.isArray(r.pagos) ? r.pagos : (r.pagos ? [r.pagos] : []);
      for (const p of pagos) {
        rows.push({
          fecha_operacion: r.fecha_operacion ?? null,
          clave_rastreo: p.clave_rastreo ?? null,
          url_cep: p.url_cep ?? null,
          fecha_actualizacion: r.fecha_actualizacion ?? null,
        });
      }
    }

    return new Response(
      JSON.stringify({
        fecha_operacion: fechaOperacion,
        total: rows.length,
        data: rows,
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