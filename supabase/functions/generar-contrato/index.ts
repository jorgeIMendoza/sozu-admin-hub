import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { id_cuenta_cobranza } = await req.json();

    console.log("Generando contrato para cuenta:", id_cuenta_cobranza);

    // 1. Obtener cuenta de cobranza
    const { data: cuentaData, error: cuentaError } = await supabase
      .from("cuentas_cobranza")
      .select("id, precio_final, id_oferta")
      .eq("id", id_cuenta_cobranza)
      .single();

    if (cuentaError || !cuentaData) {
      throw new Error(`Error obteniendo cuenta de cobranza: ${cuentaError?.message}`);
    }

    // 2. Obtener oferta
    const { data: ofertaData, error: ofertaError } = await supabase
      .from("ofertas")
      .select("id, id_propiedad")
      .eq("id", cuentaData.id_oferta)
      .single();

    if (ofertaError || !ofertaData) {
      throw new Error(`Error obteniendo oferta: ${ofertaError?.message}`);
    }

    // 3. Obtener propiedad
    const { data: propiedadData, error: propiedadError } = await supabase
      .from("propiedades")
      .select("id, numero_propiedad, m2_interiores, m2_exteriores, m2_loft, precio_lista, id_edificio_modelo, id_entidad_relacionada_dueno")
      .eq("id", ofertaData.id_propiedad)
      .single();

    if (propiedadError || !propiedadData) {
      throw new Error(`Error obteniendo propiedad: ${propiedadError?.message}`);
    }

    // Calcular m2 totales
    const m2Totales = (propiedadData.m2_interiores || 0) + (propiedadData.m2_exteriores || 0) + (propiedadData.m2_loft || 0);

    // 4. Obtener edificio y modelo
    const { data: edificioModeloData, error: emError } = await supabase
      .from("edificios_modelos")
      .select("id_edificio, id_modelo")
      .eq("id", propiedadData.id_edificio_modelo)
      .single();

    if (emError || !edificioModeloData) {
      throw new Error(`Error obteniendo edificio-modelo: ${emError?.message}`);
    }

    const { data: edificioData, error: edificioError } = await supabase
      .from("edificios")
      .select("nombre, numero_edificio")
      .eq("id", edificioModeloData.id_edificio)
      .single();

    const { data: modeloData, error: modeloError } = await supabase
      .from("modelos")
      .select("nombre")
      .eq("id", edificioModeloData.id_modelo)
      .single();

    if (edificioError || modeloError || !edificioData || !modeloData) {
      throw new Error("Error obteniendo datos de edificio/modelo");
    }

    // 5. Obtener proyecto
    const { data: entidadData, error: entidadError } = await supabase
      .from("entidades_relacionadas")
      .select("id_proyecto")
      .eq("id", propiedadData.id_entidad_relacionada_dueno)
      .single();

    if (entidadError || !entidadData) {
      throw new Error(`Error obteniendo entidad relacionada: ${entidadError?.message}`);
    }

    const { data: proyectoData, error: proyectoError } = await supabase
      .from("proyectos")
      .select("id, nombre")
      .eq("id", entidadData.id_proyecto)
      .single();

    if (proyectoError || !proyectoData) {
      throw new Error(`Error obteniendo proyecto: ${proyectoError?.message}`);
    }

    const propiedad = propiedadData;
    const proyecto = proyectoData;
    const edificio = edificioData;
    const modelo = modeloData;

    // 6. Obtener compradores
    const { data: compradores, error: compradoresError } = await supabase
      .from("compradores")
      .select(`
        id_persona,
        porcentaje_copropiedad,
        personas!compradores_id_persona_fkey!inner(
          nombre_legal,
          rfc,
          curp,
          tipo_persona,
          email,
          telefono
        )
      `)
      .eq("id_cuenta_cobranza", id_cuenta_cobranza)
      .eq("activo", true);

    if (compradoresError || !compradores || compradores.length === 0) {
      throw new Error("No se encontraron compradores");
    }

    // 7. Determinar tipo de persona (PF o PM)
    const tipoPersona = compradores.every((c: any) => c.personas.tipo_persona === "PF") ? "pf" : "pm";

    // 8. Generar siglas
    function generarSiglas(nombreCompleto: string): string {
      return nombreCompleto
        .split(" ")
        .map((palabra) => palabra[0])
        .join("")
        .toUpperCase();
    }

    const siglas = compradores.map((c: any) => generarSiglas(c.personas.nombre_legal)).join("-");

    // 9. Autenticación con Google Drive
    const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")?.replace(/\\n/g, "\n");
    const parentFolderId = Deno.env.get("GOOGLE_DRIVE_PARENT_FOLDER_ID");

    if (!serviceAccountEmail || !privateKey || !parentFolderId) {
      throw new Error("Faltan credenciales de Google Drive en los secrets");
    }

    // Crear JWT para autenticación
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    const header = { alg: "RS256", typ: "JWT" };

    // Importar clave privada
    const importedKey = await crypto.subtle.importKey(
      "pkcs8",
      new TextEncoder().encode(privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Crear JWT
    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    
    const signatureBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      importedKey,
      new TextEncoder().encode(signatureInput)
    );
    
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
    const jwt = `${signatureInput}.${signature}`;

    // Obtener access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error("No se pudo obtener access token de Google");
    }

    const accessToken = tokenData.access_token;

    // 10. Buscar carpeta del proyecto
    const projectFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${proyecto.nombre}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const projectFolderData = await projectFolderResponse.json();
    if (!projectFolderData.files?.length) {
      throw new Error(`No se encontró la carpeta del proyecto: ${proyecto.nombre}`);
    }

    const projectFolderId = projectFolderData.files[0].id;

    // 11. Buscar carpeta Templates
    const templatesFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='Templates' and '${projectFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const templatesFolderData = await templatesFolderResponse.json();
    if (!templatesFolderData.files?.length) {
      throw new Error("No se encontró la carpeta Templates");
    }

    const templatesFolderId = templatesFolderData.files[0].id;

    // 12. Buscar template
    const templateName = `template_contrato_${tipoPersona}`;
    const templateResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${templateName}' and '${templatesFolderId}' in parents and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const templateData = await templateResponse.json();
    if (!templateData.files?.length) {
      throw new Error(`No se encontró el template: ${templateName}`);
    }

    const templateId = templateData.files[0].id;

    // 13. Obtener contenido del template
    const templateContentResponse = await fetch(
      `https://docs.googleapis.com/v1/documents/${templateId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const templateContent = await templateContentResponse.json();
    
    // Extraer placeholders
    const placeholders = new Set<string>();
    const content = templateContent.body?.content || [];
    
    content.forEach((element: any) => {
      if (element.paragraph) {
        element.paragraph.elements?.forEach((el: any) => {
          const text = el.textRun?.content || "";
          const matches = text.matchAll(/\{\{([^}]+)\}\}/g);
          for (const match of matches) {
            placeholders.add(match[1].trim());
          }
        });
      }
    });

    // 14. Preparar datos para merge
    const mergeData: Record<string, string> = {
      numero_propiedad: propiedad.numero_propiedad,
      proyecto: proyecto.nombre,
      edificio: edificio.nombre,
      modelo: modelo.nombre,
      precio_final: cuentaData.precio_final.toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN",
      }),
      m2_totales: m2Totales.toString(),
      m2_interiores: (propiedad.m2_interiores || 0).toString(),
      m2_exteriores: (propiedad.m2_exteriores || 0).toString(),
      m2_loft: (propiedad.m2_loft || 0).toString(),
      cuenta_cobranza: `CC-${id_cuenta_cobranza.toString().padStart(6, "0")}`,
      fecha_actual: new Date().toLocaleDateString("es-MX"),
      compradores_nombres: compradores.map((c: any) => c.personas.nombre_legal).join(", "),
      compradores_siglas: siglas,
    };

    // Agregar datos individuales por comprador
    compradores.forEach((c: any, i: number) => {
      mergeData[`comprador_${i + 1}_nombre`] = c.personas.nombre_legal;
      mergeData[`comprador_${i + 1}_rfc`] = c.personas.rfc || "";
      mergeData[`comprador_${i + 1}_curp`] = c.personas.curp || "";
      mergeData[`comprador_${i + 1}_email`] = c.personas.email || "";
      mergeData[`comprador_${i + 1}_telefono`] = c.personas.telefono || "";
      mergeData[`comprador_${i + 1}_porcentaje`] = c.porcentaje_copropiedad.toString();
    });

    // 15. Validar placeholders
    const missingPlaceholders: string[] = [];
    const emptyPlaceholders: string[] = [];

    placeholders.forEach((ph) => {
      if (!(ph in mergeData)) {
        missingPlaceholders.push(ph);
      } else if (!mergeData[ph] || mergeData[ph].trim() === "") {
        emptyPlaceholders.push(ph);
      }
    });

    // 16. Buscar/crear carpeta Documentos
    const documentosFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='Documentos' and '${projectFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const documentosFolderData = await documentosFolderResponse.json();
    let documentosFolderId: string;

    if (documentosFolderData.files?.length) {
      documentosFolderId = documentosFolderData.files[0].id;
    } else {
      const createFolderResponse = await fetch(
        "https://www.googleapis.com/drive/v3/files",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Documentos",
            mimeType: "application/vnd.google-apps.folder",
            parents: [projectFolderId],
          }),
        }
      );

      const newFolder = await createFolderResponse.json();
      documentosFolderId = newFolder.id;
    }

    // 17. Copiar template
    const nombreComprador = compradores[0].personas.nombre_legal
      .replace(/\s+/g, "-")
      .toLowerCase();
    const nuevoNombre = `contrato_${id_cuenta_cobranza}_${nombreComprador}`;

    const copyResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${templateId}/copy`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: nuevoNombre,
          parents: [documentosFolderId],
        }),
      }
    );

    const copiedDoc = await copyResponse.json();
    const newDocId = copiedDoc.id;

    // 18. Hacer merge
    const requests = [];
    for (const [key, value] of Object.entries(mergeData)) {
      requests.push({
        replaceAllText: {
          containsText: {
            text: `{{${key}}}`,
            matchCase: false,
          },
          replaceText: value,
        },
      });
    }

    await fetch(
      `https://docs.googleapis.com/v1/documents/${newDocId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }
    );

    // 19. Guardar URL en BD
    const docUrl = `https://docs.google.com/document/d/${newDocId}/edit`;

    const { error: updateError } = await supabase
      .from("cuentas_cobranza")
      .update({ contrato_draft: docUrl })
      .eq("id", id_cuenta_cobranza);

    if (updateError) {
      console.error("Error actualizando contrato_draft:", updateError);
    }

    console.log("Contrato generado exitosamente:", docUrl);

    return new Response(
      JSON.stringify({
        success: true,
        document_url: docUrl,
        document_id: newDocId,
        warnings: {
          missing_placeholders: missingPlaceholders,
          empty_placeholders: emptyPlaceholders,
        },
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error generando contrato:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
