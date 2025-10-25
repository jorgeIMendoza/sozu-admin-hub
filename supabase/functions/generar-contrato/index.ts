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
      throw new Error(`Error obteniendo edificio-modelo: ${emError?.message || 'No se encontró el edificio_modelo'}`);
    }

    const { data: edificioData, error: edificioError } = await supabase
      .from("edificios")
      .select("nombre")
      .eq("id", edificioModeloData.id_edificio)
      .single();

    if (edificioError || !edificioData) {
      throw new Error(`Error obteniendo edificio: ${edificioError?.message || 'No se encontró el edificio'}`);
    }

    const { data: modeloData, error: modeloError } = await supabase
      .from("modelos")
      .select("nombre")
      .eq("id", edificioModeloData.id_modelo)
      .single();

    if (modeloError || !modeloData) {
      throw new Error(`Error obteniendo modelo: ${modeloError?.message || 'No se encontró el modelo'}`);
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

    // 6. Obtener compradores con todos sus datos relacionados
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
          telefono,
          sexo,
          fecha_nacimiento,
          direccion_calle,
          direccion_colonia,
          direccion_codigo_postal,
          direccion_id_pais,
          direccion_id_estado,
          direccion_id_municipio,
          direccion_fiscal_calle,
          direccion_fiscal_colonia,
          direccion_fiscal_codigo_postal,
          id_estado_civil,
          id_estado_nacimiento,
          id_municipio_nacimiento,
          paises!personas_direccion_id_pais_fkey(nombre, nacionalidad),
          estados_mx!personas_direccion_id_estado_fkey(nombre),
          municipios_mx!personas_direccion_id_municipio_fkey(nombre),
          estados_civil!personas_id_estado_civil_fkey(nombre),
          estado_nacimiento:estados_mx!personas_id_estado_nacimiento_fkey(nombre),
          municipio_nacimiento:municipios_mx!personas_id_municipio_nacimiento_fkey(nombre)
        )
      `)
      .eq("id_cuenta_cobranza", id_cuenta_cobranza)
      .eq("activo", true);

    if (compradoresError || !compradores || compradores.length === 0) {
      throw new Error("No se encontraron compradores");
    }

    // 7. Determinar tipo de persona (PF o PM)
    console.log("Compradores tipo_persona:", compradores.map((c: any) => ({ 
      nombre: c.personas.nombre_legal, 
      tipo: c.personas.tipo_persona 
    })));
    
    // Normalizar tipo de persona: acepta "PF", "Física", "FISICA", etc.
    const tipoPersona = compradores.every((c: any) => {
      const tipo = c.personas.tipo_persona?.toString().toUpperCase();
      return tipo === "PF" || tipo === "FÍSICA" || tipo === "FISICA";
    }) ? "pf" : "pm";
    
    console.log("Tipo de persona determinado:", tipoPersona);

    // 8. Generar siglas
    function generarSiglas(nombreCompleto: string): string {
      return nombreCompleto
        .split(" ")
        .map((palabra) => palabra[0])
        .join("")
        .toUpperCase();
    }

    const siglas = compradores.map((c: any) => generarSiglas(c.personas.nombre_legal)).join("-");

    // 8.5. Formatear datos de compradores
    function formatearComprador(comprador: any, index: number) {
      const p = comprador.personas;
      
      return {
        // Identificación
        nombre: p.nombre_legal || "",
        rfc: p.rfc || "",
        curp: p.curp || "",
        email: p.email || "",
        telefono: p.telefono || "",
        
        // Datos personales
        tipo_persona: p.tipo_persona || "",
        sexo: p.sexo || "",
        fecha_nacimiento: p.fecha_nacimiento 
          ? new Date(p.fecha_nacimiento).toLocaleDateString("es-MX") 
          : "",
        estado_civil: p.estados_civil?.nombre || "",
        nacionalidad: p.paises?.nacionalidad || "",
        
        // Lugar de nacimiento
        estado_nacimiento: p.estado_nacimiento?.nombre || "",
        municipio_nacimiento: p.municipio_nacimiento?.nombre || "",
        
        // Dirección actual
        direccion_calle: p.direccion_calle?.trim() || "",
        direccion_colonia: p.direccion_colonia || "",
        direccion_codigo_postal: p.direccion_codigo_postal?.trim() || "",
        direccion_municipio: p.municipios_mx?.nombre || "",
        direccion_estado: p.estados_mx?.nombre || "",
        direccion_pais: p.paises?.nombre || "",
        
        // Dirección completa formateada
        direccion_completa: [
          p.direccion_calle?.trim(),
          p.direccion_colonia,
          p.direccion_codigo_postal?.trim() ? `CP ${p.direccion_codigo_postal.trim()}` : null,
          p.municipios_mx?.nombre,
          p.estados_mx?.nombre,
          p.paises?.nombre
        ].filter(Boolean).join(", "),
        
        // Dirección fiscal
        direccion_fiscal_calle: p.direccion_fiscal_calle?.trim() || "",
        direccion_fiscal_colonia: p.direccion_fiscal_colonia || "",
        direccion_fiscal_codigo_postal: p.direccion_fiscal_codigo_postal?.trim() || "",
        
        // Co-propiedad
        porcentaje_copropiedad: comprador.porcentaje_copropiedad?.toString() || "0",
        
        // Índice para uso en template
        numero: (index + 1).toString()
      };
    }

    const compradoresFormateados = compradores.map((c, i) => formatearComprador(c, i));

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
    // Remover headers PEM y decodificar base64
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = privateKey
      .replace(pemHeader, "")
      .replace(pemFooter, "")
      .replace(/\s/g, "");
    
    // Decodificar base64 a ArrayBuffer
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    
    const importedKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Crear JWT
    // Helper para base64url encoding (JWT requiere este formato, no base64 estándar)
    const base64UrlEncode = (str: string): string => {
      return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    };

    const base64UrlEncodeBuffer = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      const binary = String.fromCharCode(...bytes);
      return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    
    const signatureBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      importedKey,
      new TextEncoder().encode(signatureInput)
    );
    
    const signature = base64UrlEncodeBuffer(signatureBuffer);
    const jwt = `${signatureInput}.${signature}`;

    // Obtener access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    const tokenData = await tokenResponse.json();
    
    // Agregar logging para debugging
    if (!tokenData.access_token) {
      console.error("Google token response:", tokenData);
      throw new Error(`No se pudo obtener access token de Google: ${JSON.stringify(tokenData)}`);
    }

    const accessToken = tokenData.access_token;

    // 10. Buscar carpeta del proyecto
    const projectFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${proyecto.nombre}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const projectFolderData = await projectFolderResponse.json();
    console.log(`Buscando carpeta del proyecto: ${proyecto.nombre}`, projectFolderData);
    
    if (!projectFolderData.files?.length) {
      throw new Error(`No se encontró la carpeta del proyecto: ${proyecto.nombre}`);
    }

    const projectFolderId = projectFolderData.files[0].id;
    console.log(`Carpeta del proyecto encontrada: ${projectFolderId}`);

    // 11. Buscar carpeta Templates
    const templatesFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='Templates' and '${projectFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const templatesFolderData = await templatesFolderResponse.json();
    console.log("Carpeta Templates:", templatesFolderData);
    
    if (!templatesFolderData.files?.length) {
      throw new Error("No se encontró la carpeta Templates");
    }

    const templatesFolderId = templatesFolderData.files[0].id;
    console.log(`Carpeta Templates encontrada: ${templatesFolderId}`);

    // 12. Buscar template
    const templateName = `template_contrato_${tipoPersona}`;
    console.log(`Buscando template: ${templateName}`);
    
    const templateResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${templateName}' and '${templatesFolderId}' in parents and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const templateData = await templateResponse.json();
    console.log("Templates encontrados:", templateData);
    
    if (!templateData.files?.length) {
      throw new Error(`No se encontró el template: ${templateName} en la carpeta Templates del proyecto ${proyecto.nombre}`);
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

    // 14. Preparar datos para merge con array completo de compradores
    const mergeData: Record<string, string> = {
      // Datos generales de la propiedad
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
      
      // Datos agregados de compradores
      compradores_nombres: compradoresFormateados.map(c => c.nombre).join(", "),
      compradores_siglas: siglas,
      numero_compradores: compradoresFormateados.length.toString()
    };

    // Agregar datos individuales por cada comprador
    compradoresFormateados.forEach((comprador, index) => {
      const num = index + 1;
      
      // Placeholders con número (comprador_1_nombre, comprador_2_nombre, etc.)
      mergeData[`comprador_${num}_nombre`] = comprador.nombre;
      mergeData[`comprador_${num}_rfc`] = comprador.rfc;
      mergeData[`comprador_${num}_curp`] = comprador.curp;
      mergeData[`comprador_${num}_email`] = comprador.email;
      mergeData[`comprador_${num}_telefono`] = comprador.telefono;
      mergeData[`comprador_${num}_tipo_persona`] = comprador.tipo_persona;
      mergeData[`comprador_${num}_sexo`] = comprador.sexo;
      mergeData[`comprador_${num}_fecha_nacimiento`] = comprador.fecha_nacimiento;
      mergeData[`comprador_${num}_estado_civil`] = comprador.estado_civil;
      mergeData[`comprador_${num}_nacionalidad`] = comprador.nacionalidad;
      mergeData[`comprador_${num}_estado_nacimiento`] = comprador.estado_nacimiento;
      mergeData[`comprador_${num}_municipio_nacimiento`] = comprador.municipio_nacimiento;
      mergeData[`comprador_${num}_direccion_calle`] = comprador.direccion_calle;
      mergeData[`comprador_${num}_direccion_colonia`] = comprador.direccion_colonia;
      mergeData[`comprador_${num}_direccion_codigo_postal`] = comprador.direccion_codigo_postal;
      mergeData[`comprador_${num}_direccion_municipio`] = comprador.direccion_municipio;
      mergeData[`comprador_${num}_direccion_estado`] = comprador.direccion_estado;
      mergeData[`comprador_${num}_direccion_pais`] = comprador.direccion_pais;
      mergeData[`comprador_${num}_direccion_completa`] = comprador.direccion_completa;
      mergeData[`comprador_${num}_direccion_fiscal_calle`] = comprador.direccion_fiscal_calle;
      mergeData[`comprador_${num}_direccion_fiscal_colonia`] = comprador.direccion_fiscal_colonia;
      mergeData[`comprador_${num}_direccion_fiscal_codigo_postal`] = comprador.direccion_fiscal_codigo_postal;
      mergeData[`comprador_${num}_porcentaje_copropiedad`] = comprador.porcentaje_copropiedad;
      
      // También agregar placeholders sin número para el primer comprador
      if (index === 0) {
        mergeData[`comprador_nombre`] = comprador.nombre;
        mergeData[`comprador_rfc`] = comprador.rfc;
        mergeData[`comprador_curp`] = comprador.curp;
        mergeData[`comprador_email`] = comprador.email;
        mergeData[`comprador_telefono`] = comprador.telefono;
        mergeData[`comprador_tipo_persona`] = comprador.tipo_persona;
        mergeData[`comprador_sexo`] = comprador.sexo;
        mergeData[`comprador_fecha_nacimiento`] = comprador.fecha_nacimiento;
        mergeData[`comprador_estado_civil`] = comprador.estado_civil;
        mergeData[`comprador_nacionalidad`] = comprador.nacionalidad;
        mergeData[`comprador_direccion_completa`] = comprador.direccion_completa;
        mergeData[`comprador_direccion_calle`] = comprador.direccion_calle;
        mergeData[`comprador_direccion_colonia`] = comprador.direccion_colonia;
        mergeData[`comprador_direccion_codigo_postal`] = comprador.direccion_codigo_postal;
        mergeData[`comprador_direccion_municipio`] = comprador.direccion_municipio;
        mergeData[`comprador_direccion_estado`] = comprador.direccion_estado;
        mergeData[`comprador_porcentaje_copropiedad`] = comprador.porcentaje_copropiedad;
      }
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

    // 17. Buscar y eliminar contratos existentes de esta cuenta
    const nombreComprador = compradores[0].personas.nombre_legal
      .replace(/\s+/g, "-")
      .toLowerCase();
    const nuevoNombre = `contrato_${id_cuenta_cobranza}_${nombreComprador}`;
    
    console.log(`Buscando contratos existentes con nombre: ${nuevoNombre}`);
    
    const existingContractsResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${nuevoNombre}' and '${documentosFolderId}' in parents and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    const existingContracts = await existingContractsResponse.json();
    
    if (existingContracts.files?.length) {
      console.log(`Eliminando ${existingContracts.files.length} contrato(s) existente(s)`);
      
      // Eliminar todos los contratos existentes
      for (const file of existingContracts.files) {
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        console.log(`Contrato eliminado: ${file.name} (${file.id})`);
      }
    }

    // 18. Copiar template

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

    // 18.5. Resaltar placeholders problemáticos en el documento ANTES del merge
    if (missingPlaceholders.length > 0 || emptyPlaceholders.length > 0) {
      // Obtener el contenido del documento para encontrar posiciones de placeholders
      const docContentResponse = await fetch(
        `https://docs.googleapis.com/v1/documents/${newDocId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const docContent = await docContentResponse.json();

      // Función para encontrar todas las ocurrencias de un texto en el documento
      function findTextRanges(content: any, searchText: string): Array<{start: number, end: number}> {
        const ranges: Array<{start: number, end: number}> = [];
        const bodyContent = content.body?.content || [];
        
        for (const element of bodyContent) {
          if (element.paragraph) {
            for (const textElement of element.paragraph.elements || []) {
              if (textElement.textRun?.content) {
                const text = textElement.textRun.content;
                const startIndex = textElement.startIndex;
                let searchIndex = 0;
                
                while ((searchIndex = text.indexOf(searchText, searchIndex)) !== -1) {
                  ranges.push({
                    start: startIndex + searchIndex,
                    end: startIndex + searchIndex + searchText.length
                  });
                  searchIndex += searchText.length;
                }
              }
            }
          }
        }
        
        return ranges;
      }

      // Crear requests para resaltar placeholders problemáticos
      const highlightRequests = [];

      // Resaltar en amarillo los placeholders que no tienen datos
      for (const placeholder of missingPlaceholders) {
        const ranges = findTextRanges(docContent, `{{${placeholder}}}`);
        for (const range of ranges) {
          highlightRequests.push({
            updateTextStyle: {
              range: {
                startIndex: range.start,
                endIndex: range.end
              },
              textStyle: {
                backgroundColor: {
                  color: {
                    rgbColor: { red: 1, green: 1, blue: 0 } // Amarillo
                  }
                }
              },
              fields: 'backgroundColor'
            }
          });
        }
      }

      // Resaltar en naranja los placeholders con datos vacíos
      for (const placeholder of emptyPlaceholders) {
        const ranges = findTextRanges(docContent, `{{${placeholder}}}`);
        for (const range of ranges) {
          highlightRequests.push({
            updateTextStyle: {
              range: {
                startIndex: range.start,
                endIndex: range.end
              },
              textStyle: {
                backgroundColor: {
                  color: {
                    rgbColor: { red: 1, green: 0.65, blue: 0 } // Naranja
                  }
                }
              },
              fields: 'backgroundColor'
            }
          });
        }
      }

      // Aplicar resaltados si hay alguno
      if (highlightRequests.length > 0) {
        await fetch(
          `https://docs.googleapis.com/v1/documents/${newDocId}:batchUpdate`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ requests: highlightRequests }),
          }
        );
        
        console.log(`${highlightRequests.length} placeholders resaltados en el documento (amarillo=faltante, naranja=vacío)`);
      }
    }

    // 19. Hacer merge
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

    // 20. Guardar URL en BD
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
          missing_placeholders: missingPlaceholders.length > 0 ? missingPlaceholders : null,
          empty_placeholders: emptyPlaceholders.length > 0 ? emptyPlaceholders : null,
          total_compradores: compradoresFormateados.length
        },
        message: missingPlaceholders.length || emptyPlaceholders.length
          ? "Contrato generado con advertencias. Los placeholders problemáticos están resaltados en amarillo (faltantes) y naranja (vacíos)."
          : "Contrato generado exitosamente"
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
