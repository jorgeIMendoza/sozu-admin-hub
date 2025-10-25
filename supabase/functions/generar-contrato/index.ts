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

    // 1. Obtener datos de cuenta, propiedad y proyecto
    const { data: cuentaData, error: cuentaError } = await supabase
      .from("cuentas_cobranza")
      .select(`
        id,
        precio_final,
        ofertas!inner(
          id,
          propiedades!inner(
            id,
            numero_propiedad,
            m2_reales,
            precio_lista,
            edificios_modelos!inner(
              edificios!inner(nombre, numero_edificio),
              modelos!inner(nombre)
            ),
            entidades_relacionadas!inner(
              proyectos!inner(id, nombre)
            )
          )
        )
      `)
      .eq("id", id_cuenta_cobranza)
      .single();

    if (cuentaError || !cuentaData) {
      throw new Error(`Error obteniendo cuenta de cobranza: ${cuentaError?.message}`);
    }

    const propiedad = cuentaData.ofertas.propiedades;
    const proyecto = propiedad.entidades_relacionadas.proyectos;
    const edificio = propiedad.edificios_modelos.edificios;
    const modelo = propiedad.edificios_modelos.modelos;

    // 2. Obtener compradores
    const { data: compradores, error: compradoresError } = await supabase
      .from("compradores")
      .select(`
        id_persona,
        porcentaje_copropiedad,
        personas!inner(
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

    // 3. Determinar tipo de persona (PF o PM)
    const tipoPersona = compradores.every((c: any) => c.personas.tipo_persona === "PF") ? "pf" : "pm";

    // 4. Generar siglas
    function generarSiglas(nombreCompleto: string): string {
      return nombreCompleto
        .split(" ")
        .map((palabra) => palabra[0])
        .join("")
        .toUpperCase();
    }

    const siglas = compradores.map((c: any) => generarSiglas(c.personas.nombre_legal)).join("-");

    // 5. Autenticación con Google Drive
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

    // 6. Buscar carpeta del proyecto
    const projectFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${proyecto.nombre}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const projectFolderData = await projectFolderResponse.json();
    if (!projectFolderData.files?.length) {
      throw new Error(`No se encontró la carpeta del proyecto: ${proyecto.nombre}`);
    }

    const projectFolderId = projectFolderData.files[0].id;

    // 7. Buscar carpeta Templates
    const templatesFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='Templates' and '${projectFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const templatesFolderData = await templatesFolderResponse.json();
    if (!templatesFolderData.files?.length) {
      throw new Error("No se encontró la carpeta Templates");
    }

    const templatesFolderId = templatesFolderData.files[0].id;

    // 8. Buscar template
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

    // 9. Obtener contenido del template
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

    // 10. Preparar datos para merge
    const mergeData: Record<string, string> = {
      numero_propiedad: propiedad.numero_propiedad,
      proyecto: proyecto.nombre,
      edificio: edificio.nombre,
      modelo: modelo.nombre,
      precio_final: cuentaData.precio_final.toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN",
      }),
      m2_reales: propiedad.m2_reales?.toString() || "",
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

    // 11. Validar placeholders
    const missingPlaceholders: string[] = [];
    const emptyPlaceholders: string[] = [];

    placeholders.forEach((ph) => {
      if (!(ph in mergeData)) {
        missingPlaceholders.push(ph);
      } else if (!mergeData[ph] || mergeData[ph].trim() === "") {
        emptyPlaceholders.push(ph);
      }
    });

    // 12. Buscar/crear carpeta Documentos
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

    // 13. Copiar template
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

    // 14. Hacer merge
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

    // 15. Guardar URL en BD
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
