import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_TABLES = [
  "proyectos", "personas", "amenidades", "vistas", "multimedias_proyecto",
  "documentos", "pagos", "multimedias_modelo", "propiedades", "multimedias_propiedad",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { tabla, columna, carpeta, limit = 50, dry_run = true } = await req.json();

    if (!tabla || !columna || !carpeta) {
      return new Response(JSON.stringify({ error: "Parámetros requeridos: tabla, columna, carpeta" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_TABLES.includes(tabla)) {
      return new Response(JSON.stringify({ error: `Tabla '${tabla}' no permitida` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate columna to prevent SQL injection (only alphanumeric and underscores)
    if (!/^[a-z_][a-z0-9_]*$/i.test(columna)) {
      return new Response(JSON.stringify({ error: "Nombre de columna inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get records with legacy URLs
    const { data: records, error: queryError } = await supabase
      .rpc("execute_migration_query", {
        p_tabla: tabla,
        p_columna: columna,
        p_limit: limit,
      });

    // Fallback: use raw SQL via postgrest if RPC doesn't exist
    let rows: Array<{ id: number; url: string }> = [];

    if (queryError) {
      // Direct query approach using fetch to PostgREST
      const queryUrl = `${supabaseUrl}/rest/v1/${tabla}?select=id,${columna}&${columna}=like.*api.sozu.com/storage/uploads/*&limit=${limit}`;
      const queryRes = await fetch(queryUrl, {
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
      });

      if (!queryRes.ok) {
        const errText = await queryRes.text();
        return new Response(JSON.stringify({ error: "Error querying records", details: errText }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rawRows = await queryRes.json();
      rows = rawRows.map((r: Record<string, unknown>) => ({ id: r.id as number, url: r[columna] as string }));
    } else {
      rows = (records || []).map((r: Record<string, unknown>) => ({ id: r.id as number, url: r.url as string }));
    }

    if (dry_run) {
      return new Response(JSON.stringify({
        mode: "dry_run",
        tabla,
        columna,
        carpeta,
        total_encontrados: rows.length,
        registros: rows.slice(0, 20),
        mensaje: rows.length > 20 ? `Mostrando 20 de ${rows.length} registros` : undefined,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process migration in parallel batches
    const results = {
      total: rows.length,
      exitosos: 0,
      errores: 0,
      detalles_errores: [] as Array<{ id: number; error: string }>,
    };

    const CONCURRENCY = 3;
    const DOWNLOAD_TIMEOUT_MS = 20000;
    const BATCH_DELAY_MS = 500;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const fetchWithTimeout = async (url: string, timeoutMs: number) => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(t);
      }
    };

    const downloadWithRetry = async (url: string) => {
      try {
        const r = await fetchWithTimeout(url, DOWNLOAD_TIMEOUT_MS);
        if (r.ok) return r;
        if (r.status >= 500) {
          await sleep(1000);
          return await fetchWithTimeout(url, DOWNLOAD_TIMEOUT_MS);
        }
        return r;
      } catch (_e) {
        await sleep(1000);
        return await fetchWithTimeout(url, DOWNLOAD_TIMEOUT_MS);
      }
    };

    const processOne = async (row: { id: number; url: string }) => {
      try {
        const oldUrl = row.url;
        if (!oldUrl || !oldUrl.includes("api.sozu.com/storage/uploads/")) return;

        const urlParts = oldUrl.split("/");
        const fileName = urlParts[urlParts.length - 1];
        if (!fileName) {
          results.errores++;
          results.detalles_errores.push({ id: row.id, error: "No se pudo extraer nombre de archivo" });
          return;
        }

        const fileRes = await downloadWithRetry(oldUrl);
        if (!fileRes.ok) {
          results.errores++;
          results.detalles_errores.push({ id: row.id, error: `Download failed: ${fileRes.status}` });
          return;
        }

        const fileBlob = await fileRes.blob();
        const storagePath = `${carpeta}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("legacy-uploads")
          .upload(storagePath, fileBlob, {
            contentType: fileRes.headers.get("content-type") || "application/octet-stream",
            upsert: true,
          });

        if (uploadError) {
          results.errores++;
          results.detalles_errores.push({ id: row.id, error: `Upload failed: ${uploadError.message}` });
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("legacy-uploads")
          .getPublicUrl(storagePath);

        const newUrl = publicUrlData.publicUrl;

        const updateUrl = `${supabaseUrl}/rest/v1/${tabla}?id=eq.${row.id}`;
        const updateBody: Record<string, string> = {};
        updateBody[columna] = newUrl;

        const updateRes = await fetch(updateUrl, {
          method: "PATCH",
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify(updateBody),
        });

        if (!updateRes.ok) {
          const errText = await updateRes.text();
          results.errores++;
          results.detalles_errores.push({ id: row.id, error: `DB update failed: ${errText}` });
          return;
        }

        results.exitosos++;
      } catch (e) {
        results.errores++;
        results.detalles_errores.push({ id: row.id, error: `Exception: ${(e as Error).message}` });
      }
    };

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const batch = rows.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(processOne));
      if (i + CONCURRENCY < rows.length) await sleep(BATCH_DELAY_MS);
    }

    return new Response(JSON.stringify({
      mode: "ejecucion",
      tabla,
      columna,
      carpeta,
      ...results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
