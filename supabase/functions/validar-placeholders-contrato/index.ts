import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Función recursiva para extraer placeholders de todo el documento
function extractPlaceholdersFromElement(element: any, placeholders: Set<string>) {
  // Si es párrafo, buscar en sus elementos
  if (element.paragraph) {
    element.paragraph.elements?.forEach((el: any) => {
      const text = el.textRun?.content || "";
      const matches = text.matchAll(/\{\{([^}]+)\}\}/g);
      for (const match of matches) {
        placeholders.add(match[1].trim());
      }
    });
  }
  
  // Si es tabla, recorrer filas y celdas
  if (element.table) {
    element.table.tableRows?.forEach((row: any) => {
      row.tableCells?.forEach((cell: any) => {
        cell.content?.forEach((cellContent: any) => {
          extractPlaceholdersFromElement(cellContent, placeholders);
        });
      });
    });
  }
  
  // Si es lista
  if (element.list) {
    element.list.listItems?.forEach((item: any) => {
      item.content?.forEach((itemContent: any) => {
        extractPlaceholdersFromElement(itemContent, placeholders);
      });
    });
  }
}

// Extraer placeholders de headers y footers
function extractPlaceholdersFromHeadersFooters(doc: any, placeholders: Set<string>) {
  // Headers
  const headers = doc.headers || {};
  Object.values(headers).forEach((header: any) => {
    header.content?.forEach((el: any) => extractPlaceholdersFromElement(el, placeholders));
  });
  
  // Footers
  const footers = doc.footers || {};
  Object.values(footers).forEach((footer: any) => {
    footer.content?.forEach((el: any) => extractPlaceholdersFromElement(el, placeholders));
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { id_cuenta_cobranza } = await req.json();

    console.log("Validando placeholders para cuenta:", id_cuenta_cobranza);

    // Obtener datos (mismo flujo que generar-contrato pero sin crear documento)
    const { data: cuentaData } = await supabase
      .from("cuentas_cobranza")
      .select("id, precio_final, id_oferta, clabe_stp, numero_escritura, clave_catastral, numero_unidad_privativa, fecha_compra, fecha_escritura, libro, hoja")
      .eq("id", id_cuenta_cobranza)
      .single();

    if (!cuentaData) throw new Error("Cuenta de cobranza no encontrada");

    const { data: ofertaData } = await supabase
      .from("ofertas")
      .select("id, id_propiedad")
      .eq("id", cuentaData.id_oferta)
      .single();

    if (!ofertaData) throw new Error("Oferta no encontrada");

    const { data: propiedadData } = await supabase
      .from("propiedades")
      .select("id, numero_propiedad, m2_interiores, m2_exteriores, m2_loft, id_edificio_modelo, id_entidad_relacionada_dueno")
      .eq("id", ofertaData.id_propiedad)
      .single();

    if (!propiedadData) throw new Error("Propiedad no encontrada");

    const m2Totales = (propiedadData.m2_interiores || 0) + (propiedadData.m2_exteriores || 0) + (propiedadData.m2_loft || 0);

    const { data: edificioModeloData } = await supabase
      .from("edificios_modelos")
      .select("id_edificio, id_modelo")
      .eq("id", propiedadData.id_edificio_modelo)
      .single();

    const { data: edificioData } = await supabase
      .from("edificios")
      .select("nombre")
      .eq("id", edificioModeloData.id_edificio)
      .single();

    const { data: modeloData } = await supabase
      .from("modelos")
      .select("nombre")
      .eq("id", edificioModeloData.id_modelo)
      .single();

    const { data: entidadData } = await supabase
      .from("entidades_relacionadas")
      .select("id_proyecto")
      .eq("id", propiedadData.id_entidad_relacionada_dueno)
      .single();

    const { data: proyectoData } = await supabase
      .from("proyectos")
      .select("id, nombre")
      .eq("id", entidadData.id_proyecto)
      .single();

    // Obtener compradores con datos básicos
    console.log("Validando placeholders para cuenta:", id_cuenta_cobranza);
    
    const { data: compradores, error: compradoresError } = await supabase
      .from("compradores")
      .select(`
        id_persona,
        porcentaje_copropiedad,
        personas!compradores_id_persona_fkey (
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
          id_estado_civil,
          id_estado_nacimiento,
          id_municipio_nacimiento
        )
      `)
      .eq("id_cuenta_cobranza", id_cuenta_cobranza)
      .eq("activo", true);

    console.log("Resultado compradores:", { total: compradores?.length, error: compradoresError });

    if (compradoresError) {
      console.error("Error obteniendo compradores:", compradoresError);
      throw new Error(`Error obteniendo compradores: ${compradoresError.message}`);
    }

    if (!compradores || compradores.length === 0) {
      throw new Error("No se encontraron compradores activos para esta cuenta de cobranza. Verifique que existan compradores asociados y que estén activos.");
    }

    // Obtener datos relacionados adicionales en consultas separadas
    const compradoresConRelaciones = await Promise.all(
      compradores.map(async (comprador) => {
        const p = comprador.personas;
        
        // Obtener país
        let pais = null;
        if (p.direccion_id_pais) {
          const { data: paisData } = await supabase
            .from("paises")
            .select("nombre, nacionalidad")
            .eq("id", p.direccion_id_pais)
            .single();
          pais = paisData;
        }

        // Obtener estado
        let estado = null;
        if (p.direccion_id_estado) {
          const { data: estadoData } = await supabase
            .from("estados_mx")
            .select("nombre")
            .eq("id", p.direccion_id_estado)
            .single();
          estado = estadoData;
        }

        // Obtener municipio
        let municipio = null;
        if (p.direccion_id_municipio) {
          const { data: municipioData } = await supabase
            .from("municipios_mx")
            .select("nombre")
            .eq("id", p.direccion_id_municipio)
            .single();
          municipio = municipioData;
        }

        // Obtener estado civil
        let estadoCivil = null;
        if (p.id_estado_civil) {
          const { data: estadoCivilData } = await supabase
            .from("estados_civil")
            .select("nombre")
            .eq("id", p.id_estado_civil)
            .single();
          estadoCivil = estadoCivilData;
        }

        // Obtener estado de nacimiento
        let estadoNacimiento = null;
        if (p.id_estado_nacimiento) {
          const { data: estadoNacData } = await supabase
            .from("estados_mx")
            .select("nombre")
            .eq("id", p.id_estado_nacimiento)
            .single();
          estadoNacimiento = estadoNacData;
        }

        // Obtener municipio de nacimiento
        let municipioNacimiento = null;
        if (p.id_municipio_nacimiento) {
          const { data: munNacData } = await supabase
            .from("municipios_mx")
            .select("nombre")
            .eq("id", p.id_municipio_nacimiento)
            .single();
          municipioNacimiento = munNacData;
        }

        return {
          ...comprador,
          personas: {
            ...p,
            paises: pais,
            estados_mx: estado,
            municipios_mx: municipio,
            estados_civil: estadoCivil,
            estado_nacimiento: estadoNacimiento,
            municipio_nacimiento: municipioNacimiento
          }
        };
      })
    );

    const compradoresFinales = compradoresConRelaciones;

    // Formatear compradores
    function formatearComprador(comprador: any, index: number) {
      const p = comprador.personas;
      return {
        nombre: p.nombre_legal || "",
        rfc: p.rfc || "",
        curp: p.curp || "",
        email: p.email || "",
        telefono: p.telefono || "",
        tipo_persona: p.tipo_persona || "",
        sexo: p.sexo || "",
        fecha_nacimiento: p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString("es-MX") : "",
        estado_civil: p.estados_civil?.nombre || "",
        nacionalidad: p.paises?.nacionalidad || "",
        estado_nacimiento: p.estado_nacimiento?.nombre || "",
        municipio_nacimiento: p.municipio_nacimiento?.nombre || "",
        direccion_calle: p.direccion_calle?.trim() || "",
        direccion_colonia: p.direccion_colonia || "",
        direccion_codigo_postal: p.direccion_codigo_postal?.trim() || "",
        direccion_municipio: p.municipios_mx?.nombre || "",
        direccion_estado: p.estados_mx?.nombre || "",
        direccion_pais: p.paises?.nombre || "",
        direccion_completa: [
          p.direccion_calle?.trim(),
          p.direccion_colonia,
          p.direccion_codigo_postal?.trim() ? `CP ${p.direccion_codigo_postal.trim()}` : null,
          p.municipios_mx?.nombre,
          p.estados_mx?.nombre,
          p.paises?.nombre
        ].filter(Boolean).join(", "),
        porcentaje_copropiedad: comprador.porcentaje_copropiedad?.toString() || "0",
        numero: (index + 1).toString()
      };
    }

    const compradoresFormateados = compradoresFinales.map((c, i) => formatearComprador(c, i));

    function generarSiglas(nombreCompleto: string): string {
      return nombreCompleto.split(" ").map((palabra) => palabra[0]).join("").toUpperCase();
    }

    const siglas = compradoresFinales.map((c: any) => generarSiglas(c.personas.nombre_legal)).join("-");

    // Determinar tipo de persona
    const tipoPersona = compradoresFinales.every((c: any) => {
      const tipo = c.personas.tipo_persona?.toString().toUpperCase();
      return tipo === "PF" || tipo === "FÍSICA" || tipo === "FISICA";
    }) ? "pf" : "pm";

    // Preparar mergeData (mismo que en generar-contrato)
    // El primer comprador se usa para los campos sin número
    const primerComprador = compradoresFormateados[0];
    
    const mergeData: Record<string, string> = {
      // Datos de la propiedad
      numero_propiedad: propiedadData.numero_propiedad,
      numero_departamento: propiedadData.numero_propiedad, // Alias
      proyecto: proyectoData.nombre,
      edificio: edificioData.nombre,
      modelo: modeloData.nombre,
      precio_final: cuentaData.precio_final.toLocaleString("es-MX", { style: "currency", currency: "MXN" }),
      m2_totales: m2Totales.toString(),
      metraje: m2Totales.toString(), // Alias
      m2_interiores: (propiedadData.m2_interiores || 0).toString(),
      m2_exteriores: (propiedadData.m2_exteriores || 0).toString(),
      m2_loft: (propiedadData.m2_loft || 0).toString(),
      cuenta_cobranza: `CC-${id_cuenta_cobranza.toString().padStart(6, "0")}`,
      fecha_actual: new Date().toLocaleDateString("es-MX"),
      compradores_nombres: compradoresFormateados.map(c => c.nombre).join(", "),
      compradores_siglas: siglas,
      siglas: siglas, // Alias
      numero_compradores: compradoresFormateados.length.toString(),
      
      // Campos adicionales de cuenta_cobranza
      clabe_stp: cuentaData.clabe_stp || "",
      numero_escritura: cuentaData.numero_escritura || "",
      clave_catastral: cuentaData.clave_catastral || "",
      numero_unidad_privativa: cuentaData.numero_unidad_privativa || "",
      libro: cuentaData.libro || "",
      hoja: cuentaData.hoja || "",
      fecha_compra: cuentaData.fecha_compra ? new Date(cuentaData.fecha_compra).toLocaleDateString("es-MX") : "",
      fecha_escritura: cuentaData.fecha_escritura ? new Date(cuentaData.fecha_escritura).toLocaleDateString("es-MX") : "",
      
      // Alias para el primer comprador (sin prefijo) - los más comunes en templates
      nombre_completo: primerComprador?.nombre || "",
      rfc: primerComprador?.rfc || "",
      curp: primerComprador?.curp || "",
      email: primerComprador?.email || "",
      telefono: primerComprador?.telefono || "",
      tipo: primerComprador?.tipo_persona || "",
      sexo: primerComprador?.sexo || "",
      fecha_nacimiento: primerComprador?.fecha_nacimiento || "",
      estado_civil: primerComprador?.estado_civil || "",
      nacionalidad: primerComprador?.nacionalidad || "",
      estado_nacimiento: primerComprador?.estado_nacimiento || "",
      ciudad_nacimiento: primerComprador?.municipio_nacimiento || "",
      municipio_nacimiento: primerComprador?.municipio_nacimiento || "",
      calle: primerComprador?.direccion_calle || "",
      num_ext: "", // TODO: separar número exterior de la dirección
      colonia: primerComprador?.direccion_colonia || "",
      codigo_postal: primerComprador?.direccion_codigo_postal || "",
      municipio: primerComprador?.direccion_municipio || "",
      ciudad: primerComprador?.direccion_municipio || "", // Alias
      estado: primerComprador?.direccion_estado || "",
      pais: primerComprador?.direccion_pais || "",
      direccion_completa: primerComprador?.direccion_completa || "",
      ocupacion: "", // TODO: agregar a personas si se necesita
      tipo_identificacion: "", // TODO: agregar a personas si se necesita
      numero: "", // Número de identificación - TODO
      
      // Campos de pagos (estos necesitan calcularse de acuerdos_pago)
      estacionamientos: "", // TODO: contar estacionamientos
      piso: "", // TODO: obtener piso de la propiedad
      precio_final_letra: "", // TODO: convertir a letras
      num_pagos_parcialidades: "",
      num_pagos_parcialidades_letra: "",
      pagos_parcialidades: "",
      orden_pagos_especiales: "",
      num_pagos_especiales: "",
      num_pagos_especiales_letra: "",
      pagos_especiales: "",
      orden_pagos_finales: "",
      num_pagos_finales: "",
      num_pagos_finales_letra: "",
      pagos_finales: "",
    };

    // Agregar datos de cada comprador con prefijo
    compradoresFormateados.forEach((comprador, index) => {
      const num = index + 1;
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
      mergeData[`comprador_${num}_porcentaje_copropiedad`] = comprador.porcentaje_copropiedad;

      // También con prefijo "comprador_" para el primer comprador
      if (index === 0) {
        mergeData[`comprador_nombre`] = comprador.nombre;
        mergeData[`comprador_rfc`] = comprador.rfc;
        mergeData[`comprador_curp`] = comprador.curp;
        mergeData[`comprador_email`] = comprador.email;
        mergeData[`comprador_telefono`] = comprador.telefono;
        mergeData[`comprador_direccion_completa`] = comprador.direccion_completa;
        mergeData[`comprador_estado_civil`] = comprador.estado_civil;
        mergeData[`comprador_nacionalidad`] = comprador.nacionalidad;
      }
    });

    // Autenticación con Google para obtener placeholders del template
    const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")?.replace(/\\n/g, "\n");
    const parentFolderId = Deno.env.get("GOOGLE_DRIVE_PARENT_FOLDER_ID");

    if (!serviceAccountEmail || !privateKey || !parentFolderId) {
      throw new Error("Faltan credenciales de Google Drive");
    }

    // JWT y access token (simplificado)
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    const header = { alg: "RS256", typ: "JWT" };
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = privateKey.replace(pemHeader, "").replace(pemFooter, "").replace(/\s/g, "");
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    
    const importedKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const base64UrlEncode = (str: string): string => {
      return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };

    const base64UrlEncodeBuffer = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      const binary = String.fromCharCode(...bytes);
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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

    // Buscar carpeta del proyecto y template
    const projectFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${proyectoData.nombre}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const projectFolderData = await projectFolderResponse.json();
    if (!projectFolderData.files?.length) {
      throw new Error(`Carpeta del proyecto no encontrada: ${proyectoData.nombre}`);
    }

    const projectFolderId = projectFolderData.files[0].id;

    const templatesFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='Templates' and '${projectFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const templatesFolderData = await templatesFolderResponse.json();
    if (!templatesFolderData.files?.length) {
      throw new Error("Carpeta Templates no encontrada");
    }

    const templatesFolderId = templatesFolderData.files[0].id;
    const templateName = `template_contrato_${tipoPersona}`;

    const templateResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${templateName}' and '${templatesFolderId}' in parents and trashed=false&fields=files(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const templateData = await templateResponse.json();
    if (!templateData.files?.length) {
      throw new Error(`Template no encontrado: ${templateName}`);
    }

    const templateId = templateData.files[0].id;

    // Obtener contenido del template para extraer placeholders
    const templateContentResponse = await fetch(
      `https://docs.googleapis.com/v1/documents/${templateId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const templateContent = await templateContentResponse.json();
    
    // Usar extracción recursiva para todo el documento
    const placeholdersEnTemplate = new Set<string>();
    const content = templateContent.body?.content || [];
    
    // Extraer de body
    content.forEach((element: any) => {
      extractPlaceholdersFromElement(element, placeholdersEnTemplate);
    });
    
    // Extraer de headers y footers
    extractPlaceholdersFromHeadersFooters(templateContent, placeholdersEnTemplate);
    
    console.log("Total placeholders encontrados en template:", placeholdersEnTemplate.size);
    console.log("Placeholders:", Array.from(placeholdersEnTemplate));

    // Clasificar placeholders
    const placeholdersDisponibles: Array<{placeholder: string, valor: string, estado: string}> = [];
    const placeholdersFaltantes: string[] = [];
    const placeholdersVacios: string[] = [];

    placeholdersEnTemplate.forEach((ph) => {
      if (!(ph in mergeData)) {
        placeholdersFaltantes.push(ph);
      } else if (!mergeData[ph] || mergeData[ph].trim() === "") {
        placeholdersVacios.push(ph);
        placeholdersDisponibles.push({
          placeholder: ph,
          valor: "(vacío)",
          estado: "vacío"
        });
      } else {
        placeholdersDisponibles.push({
          placeholder: ph,
          valor: mergeData[ph],
          estado: "ok"
        });
      }
    });

    const variablesSistema = Object.keys(mergeData);
    const variablesUsadasEnTemplate = Array.from(placeholdersEnTemplate);

    return new Response(
      JSON.stringify({
        success: true,
        validacion: {
          tiene_problemas: placeholdersFaltantes.length > 0 || placeholdersVacios.length > 0,
          total_placeholders_template: placeholdersEnTemplate.size,
          total_disponibles: placeholdersDisponibles.filter(p => p.estado === "ok").length,
          total_vacios: placeholdersVacios.length,
          total_faltantes: placeholdersFaltantes.length,
          placeholders_disponibles: placeholdersDisponibles,
          placeholders_faltantes: placeholdersFaltantes,
          placeholders_vacios: placeholdersVacios,
          variables_sistema: variablesSistema,
          variables_usadas_en_template: variablesUsadasEnTemplate,
          todosPlaceholdersTemplate: variablesUsadasEnTemplate
        },
        compradores: compradoresFormateados,
        tipo_persona: tipoPersona,
        template_name: templateName
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error validando placeholders:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
