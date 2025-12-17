import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Función para convertir número (0-999) a palabras
function convierteLetra(numero: number, subfijo: string): string {
  const c = Math.floor(numero / 100);
  const d = Math.floor((numero % 100) / 10);
  const u = numero % 10;

  let palabra_c = "";
  let palabra_d = "";
  let palabra_u = "";

  if (numero === 100) {
    return "CIEN ";
  }

  // Centenas
  switch (c) {
    case 1: palabra_c = "CIENTO "; break;
    case 2: palabra_c = "DOSCIENTOS "; break;
    case 3: palabra_c = "TRESCIENTOS "; break;
    case 4: palabra_c = "CUATROCIENTOS "; break;
    case 5: palabra_c = "QUINIENTOS "; break;
    case 6: palabra_c = "SEISCIENTOS "; break;
    case 7: palabra_c = "SETECIENTOS "; break;
    case 8: palabra_c = "OCHOCIENTOS "; break;
    case 9: palabra_c = "NOVECIENTOS "; break;
  }

  // Decenas
  if (d === 1 && u === 0) palabra_d = "DIEZ ";
  else if (d === 1 && u === 1) palabra_d = "ONCE ";
  else if (d === 1 && u === 2) palabra_d = "DOCE ";
  else if (d === 1 && u === 3) palabra_d = "TRECE ";
  else if (d === 1 && u === 4) palabra_d = "CATORCE ";
  else if (d === 1 && u === 5) palabra_d = "QUINCE ";
  else if (d === 1 && u >= 6) palabra_d = "DIECI";
  else if (d === 2 && u === 0) palabra_d = "VEINTE ";
  else if (d === 2 && u >= 1) palabra_d = "VEINTI";
  else if (d === 3 && u === 0) palabra_d = "TREINTA ";
  else if (d === 3 && u > 0) palabra_d = "TREINTA Y ";
  else if (d === 4 && u === 0) palabra_d = "CUARENTA ";
  else if (d === 4 && u > 0) palabra_d = "CUARENTA Y ";
  else if (d === 5 && u === 0) palabra_d = "CINCUENTA ";
  else if (d === 5 && u > 0) palabra_d = "CINCUENTA Y ";
  else if (d === 6 && u === 0) palabra_d = "SESENTA ";
  else if (d === 6 && u > 0) palabra_d = "SESENTA Y ";
  else if (d === 7 && u === 0) palabra_d = "SETENTA ";
  else if (d === 7 && u > 0) palabra_d = "SETENTA Y ";
  else if (d === 8 && u === 0) palabra_d = "OCHENTA ";
  else if (d === 8 && u > 0) palabra_d = "OCHENTA Y ";
  else if (d === 9 && u === 0) palabra_d = "NOVENTA ";
  else if (d === 9 && u > 0) palabra_d = "NOVENTA Y ";

  // Unidades
  if (d !== 1) { // Si no son los casos especiales del 11-19
    if (u === 1 && d === 0 && subfijo === "S") palabra_u = "UN ";
    else if (u === 1 && d === 0 && subfijo === "N") palabra_u = "UNO";
    else if (u === 1 && d > 1 && subfijo === "S") palabra_u = "UN ";
    else if (u === 1 && d > 1 && subfijo === "N") palabra_u = "UNO";
    else if (u === 2) palabra_u = "DOS ";
    else if (u === 3) palabra_u = "TRES ";
    else if (u === 4) palabra_u = "CUATRO ";
    else if (u === 5) palabra_u = "CINCO ";
    else if (u === 6) palabra_u = "SEIS ";
    else if (u === 7) palabra_u = "SIETE ";
    else if (u === 8) palabra_u = "OCHO ";
    else if (u === 9) palabra_u = "NUEVE ";
  }

  return palabra_c + palabra_d + palabra_u;
}

// Función principal para convertir número a palabras (pesos mexicanos)
function convertirAPalabras(numero: number, currency = "PESOS", currency_cent = "/100 M.N."): string {
  if (numero === 0) return "CERO " + currency;

  const negativo = numero < 0;
  if (negativo) numero = Math.abs(numero);

  const entero = Math.floor(numero);
  const decimales = Math.round((numero - entero) * 100);

  const millares = Math.floor((entero % 1000000000) / 1000000);
  const miles = Math.floor((entero % 1000000) / 1000);
  const centenares = Math.floor(entero % 1000);

  let palabras_millares = "";
  let palabras_miles = "";
  let palabras_centenares = "";

  if (millares === 1) {
    palabras_millares = convierteLetra(millares, "S") + "MILLÓN ";
  } else if (millares > 1) {
    palabras_millares = convierteLetra(millares, "S") + "MILLONES ";
  }

  if (miles === 1) {
    palabras_miles = "MIL ";
  } else if (miles > 1) {
    palabras_miles = convierteLetra(miles, "S") + "MIL ";
  }

  palabras_centenares = convierteLetra(centenares, "S");

  let resultado = palabras_millares + palabras_miles + palabras_centenares;

  if (negativo) {
    resultado = "MENOS " + resultado;
  }

  if (decimales === 0 && currency_cent === "") {
    return resultado.trim() + " " + currency;
  } else {
    return resultado.trim() + " " + currency + " " + decimales.toString().padStart(2, "0") + currency_cent;
  }
}

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
    
    console.log("Oferta encontrada:", ofertaData);

    if (!ofertaData.id_propiedad) {
      throw new Error("Esta cuenta de cobranza no está asociada a una propiedad (puede ser un producto)");
    }

    const { data: propiedadData, error: propiedadError } = await supabase
      .from("propiedades")
      .select("id, numero_propiedad, numero_piso, m2_interiores, m2_exteriores, m2_loft, precio_lista, id_edificio_modelo, id_entidad_relacionada_dueno, descripcion")
      .eq("id", ofertaData.id_propiedad)
      .single();

    console.log("Query propiedad resultado:", { propiedadData, propiedadError });

    if (!propiedadData) throw new Error(`Propiedad no encontrada para id: ${ofertaData.id_propiedad}`);

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
          id_municipio_nacimiento,
          ocupacion
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
    // Contar estacionamientos de la propiedad
    const { data: estacionamientosData } = await supabase
      .from("estacionamientos")
      .select("id")
      .eq("id_propiedad", ofertaData.id_propiedad)
      .eq("activo", true);
    const numEstacionamientos = estacionamientosData?.length || 0;

    // Función para formatear fecha en español: "16 de junio de 1979"
    function formatearFechaEspanol(fecha: string | null): string {
      if (!fecha) return "";
      const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", 
                     "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
      const date = new Date(fecha);
      const dia = date.getDate();
      const mes = meses[date.getMonth()];
      const anio = date.getFullYear();
      return `${dia} de ${mes} de ${anio}`;
    }

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
        fecha_nacimiento: formatearFechaEspanol(p.fecha_nacimiento),
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
        ocupacion: p.ocupacion || ""
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
      numero_propiedad: propiedadData.numero_propiedad || "",
      numero_departamento: propiedadData.numero_propiedad || "", // Alias
      piso: propiedadData.numero_piso?.toString() || "",
      nivel: propiedadData.numero_piso?.toString() || "", // Alias
      numero_piso: propiedadData.numero_piso?.toString() || "",
      proyecto: proyectoData.nombre || "",
      edificio: edificioData?.nombre || "",
      modelo: modeloData?.nombre || "",
      precio_final: cuentaData.precio_final?.toLocaleString("es-MX", { style: "currency", currency: "MXN" }) || "",
      precio_lista: propiedadData.precio_lista?.toLocaleString("es-MX", { style: "currency", currency: "MXN" }) || "",
      m2_totales: m2Totales.toString(),
      metraje: m2Totales.toString(), // Alias
      m2_reales: m2Totales.toString(), // Calculado de interiores + exteriores + loft
      m2_interiores: (propiedadData.m2_interiores || 0).toString(),
      m2_exteriores: (propiedadData.m2_exteriores || 0).toString(),
      m2_loft: (propiedadData.m2_loft || 0).toString(),
      descripcion_propiedad: propiedadData.descripcion || "",
      cuenta_cobranza: `CC-${id_cuenta_cobranza.toString().padStart(6, "0")}`,
      fecha_actual: formatearFechaEspanol(new Date().toISOString()),
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
      fecha_compra: formatearFechaEspanol(cuentaData.fecha_compra),
      fecha_escritura: formatearFechaEspanol(cuentaData.fecha_escritura),
      
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
      ocupacion: primerComprador?.ocupacion || "",
      tipo_identificacion: "", // TODO: agregar id_tipo_identificacion a personas si se necesita
      numero: "", // TODO: agregar numero_identificacion a personas si se necesita
      numero_identificacion: "",
      
      // Campos de pagos
      estacionamientos: numEstacionamientos.toString(),
      precio_final_letra: convertirAPalabras(cuentaData.precio_final || 0),
      // Placeholders de enganche
      pagos_enganche: "",
      num_pagos_enganche: "",
      num_pagos_enganche_letra: "",
      monto_enganche: "",
      monto_enganche_letra: "",
      fecha_enganche: "",
      // Placeholders de parcialidades/mensualidades
      num_pagos_parcialidades: "",
      num_pagos_parcialidades_letra: "",
      pagos_parcialidades: "",
      monto_parcialidad: "",
      monto_parcialidad_letra: "",
      // Placeholders de pagos especiales
      orden_pagos_especiales: "",
      num_pagos_especiales: "",
      num_pagos_especiales_letra: "",
      pagos_especiales: "",
      // Placeholders de pagos finales/entrega
      orden_pagos_finales: "",
      num_pagos_finales: "",
      num_pagos_finales_letra: "",
      pagos_finales: "",
      monto_entrega: "",
      monto_entrega_letra: "",
      fecha_entrega: "",
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
    
    // Variables en el sistema pero NO usadas en el template (disponibles para usar)
    const variablesNoUsadas = variablesSistema.filter(v => !placeholdersEnTemplate.has(v));

    return new Response(
      JSON.stringify({
        success: true,
        validacion: {
          tiene_problemas: placeholdersFaltantes.length > 0 || placeholdersVacios.length > 0,
          total_placeholders_template: placeholdersEnTemplate.size,
          total_disponibles: placeholdersDisponibles.filter(p => p.estado === "ok").length,
          total_vacios: placeholdersVacios.length,
          total_faltantes: placeholdersFaltantes.length,
          total_no_usadas: variablesNoUsadas.length,
          placeholders_disponibles: placeholdersDisponibles,
          placeholders_faltantes: placeholdersFaltantes,
          placeholders_vacios: placeholdersVacios,
          variables_no_usadas: variablesNoUsadas,
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
