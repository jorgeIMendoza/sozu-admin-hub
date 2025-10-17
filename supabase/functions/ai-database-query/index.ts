import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // System prompt for the AI
    const systemPrompt = `Eres un asistente de análisis financiero experto en consultas de base de datos de propiedades inmobiliarias.

SISTEMA HÍBRIDO: Tienes dos formas de consultar datos:

═══════════════════════════════════════════════════════════════════
A) FUNCIONES PREDEFINIDAS (USAR PRIMERO si aplican):
═══════════════════════════════════════════════════════════════════
1. get_pagos_mes_actual: Pagos recibidos en el mes actual
2. get_deuda_total: Total adeudado en todas las cuentas activas  
3. get_pagos_por_mes: Estadísticas de pagos por mes (último año)
4. get_cuentas_pendientes: Top 5 cuentas con mayor deuda
5. get_pagos_por_metodo: Pagos agrupados por método de pago

═══════════════════════════════════════════════════════════════════
B) SQL DINÁMICO (USAR cuando las funciones predefinidas NO aplican):
═══════════════════════════════════════════════════════════════════
6. generate_sql_query: Genera y ejecuta consultas SQL personalizadas

CUÁNDO USAR SQL DINÁMICO:
- Consultas sobre propiedades, proyectos, edificios, modelos
- Análisis por categorías no cubiertas (tipo propiedad, estatus, ubicación)
- Joins complejos entre múltiples tablas
- Agregaciones específicas (AVG, COUNT, SUM por grupos)
- Filtros personalizados

SCHEMA DE LA BASE DE DATOS (CON EJEMPLOS):

1️⃣ PROPIEDADES (tabla: propiedades)
Columnas: id, numero_propiedad, numero_piso, m2_reales, m2_interiores, m2_exteriores, precio_lista, id_estatus_disponibilidad, id_tipo_propiedad, id_vista, id_edificio_modelo, id_entidad_relacionada_dueno, activo
⚠️ IMPORTANTE: id_estatus_disponibilidad SOLO existe en propiedades
Ejemplo: SELECT numero_propiedad FROM propiedades WHERE id_estatus_disponibilidad = 5 AND activo = true

2️⃣ PROYECTOS Y EDIFICIOS
- proyectos: id, nombre, direccion, ciudad, id_estatus_proyecto, precio_m2_actual, activo
- edificios: id, nombre, numero_pisos, id_proyecto, activo
- modelos: id, nombre, descripcion, numero_recamaras, numero_completo_banos, numero_medio_bano, id_proyecto, activo
- edificios_modelos: id, id_edificio, id_modelo, activo

3️⃣ CATÁLOGOS
- estatus_disponibilidad: 1=Disponible, 2=Ofertado, 3=Pre-apartado, 4=Apartado, 5=Vendido, 7=Escrituración, 9=Pagada completamente
- tipos_propiedad, vistas, tipos_transaccion

4️⃣ VENTAS Y COBRANZA (TABLAS CRÍTICAS)
📌 ofertas: id, id_propiedad, id_producto, id_persona_lead, id_esquema_pago_seleccionado, email_creador, fecha_generacion, activo

📌 cuentas_cobranza: id, id_oferta, precio_final, fecha_compra, clabe_stp, id_notario, es_aprobado, activo
   ⚠️ IMPORTANTE: NO tiene id_estatus_disponibilidad (eso es de propiedades)
   Para saber si está pagada: Comparar precio_final con SUM(aplicaciones_pago.monto)

📌 acuerdos_pago: id, id_cuenta_cobranza, id_concepto, monto, fecha_pago, orden, pago_completado, activo
   Para saber si todos los acuerdos están pagados: WHERE pago_completado = true

📌 pagos: id, id_cuenta_cobranza, id_metodos_pago, monto, fecha_pago, clave_rastreo, activo

📌 aplicaciones_pago: id, id_pago, id_acuerdo_pago, monto, es_multa, activo
   ⚠️ Para calcular total pagado: SUM(monto) WHERE es_multa = false

5️⃣ PERSONAS
- personas: id, nombre_legal, email, telefono, tipo_persona, rfc, curp, id_conyuge, id_estado_civil, activo
- compradores: id_persona, id_cuenta_cobranza, porcentaje_copropiedad, activo
- entidades_relacionadas: id, id_proyecto, id_persona, id_tipo_entidad, id_estatus_persona, activo

6️⃣ PRODUCTOS
- productos_servicios: id, nombre, descripcion, precio_referencia, id_categoria, activo
- estacionamientos: id, nombre, ubicacion, m2, id_tipo, id_propiedad, id_producto, es_incluido, activo
- bodegas: id, nombre, ubicacion, m2, id_propiedad, id_producto, es_incluido, activo

EJEMPLOS DE QUERIES CORRECTOS:

✅ Cuentas completamente pagadas:
SELECT cc.id, cc.precio_final, 
       COALESCE(SUM(ap.monto), 0) as total_pagado
FROM cuentas_cobranza cc
LEFT JOIN acuerdos_pago acp ON cc.id = acp.id_cuenta_cobranza AND acp.activo = true
LEFT JOIN aplicaciones_pago ap ON acp.id = ap.id_acuerdo_pago AND ap.activo = true AND ap.es_multa = false
WHERE cc.activo = true
GROUP BY cc.id, cc.precio_final
HAVING cc.precio_final <= COALESCE(SUM(ap.monto), 0)

✅ Propiedades vendidas por proyecto:
SELECT pr.nombre, COUNT(p.id) as total
FROM proyectos pr
JOIN edificios e ON pr.id = e.id_proyecto
JOIN edificios_modelos em ON e.id = em.id_edificio
JOIN propiedades p ON em.id = p.id_edificio_modelo
WHERE p.id_estatus_disponibilidad = 5 AND p.activo = true
GROUP BY pr.nombre

⚠️ ERRORES COMUNES A EVITAR:
❌ NO uses id_estatus_disponibilidad en cuentas_cobranza (no existe)
❌ NO uses pago_completado en cuentas_cobranza (está en acuerdos_pago)
❌ Para saber si está pagado, compara precio_final con SUM(aplicaciones_pago.monto)

INSTRUCCIONES:
1. Analiza la pregunta del usuario
2. DECIDE: ¿Puedo usar una función predefinida?
   - SÍ → Usa la función predefinida (más rápido)
   - NO → Usa generate_sql_query
3. Para SQL dinámico: genera SELECT seguro, con JOINs apropiados y filtros WHERE activo = true
4. Interpreta los resultados y genera una respuesta clara en LENGUAJE NATURAL

FORMATO DE RESPUESTA:
Responde SOLO con un objeto JSON válido (sin markdown, sin backticks):
{
  "explanation": "Explicación clara y concisa en español, SIN incluir números técnicos ni JSON. Usa lenguaje natural y amigable.",
  "chartType": "bar",
  "chartData": [{ "name": "Etiqueta descriptiva", "value": 123.45 }] o null,
  "summary": {
    "totalPagado": número o null,
    "totalPendiente": número o null
  }
}

IMPORTANTE PARA chartData:
- Cuando tengas datos agrupados por MES (formato "2025-02"), debes:
  1. Convertir CADA mes a una entrada separada en chartData
  2. Formatear el mes como "Enero 2025", "Febrero 2025", etc.
  3. Usar el campo "total" de cada mes como "value"
  4. Si hay 3 meses de datos, chartData debe tener 3 elementos
  
Ejemplo de get_pagos_por_mes con datos de 3 meses:
Si recibes: [{"mes":"2024-12","total":50000},{"mes":"2025-01","total":75000},{"mes":"2025-02","total":60000}]
Debes generar chartData: [
  {"name":"Diciembre 2024","value":50000},
  {"name":"Enero 2025","value":75000},
  {"name":"Febrero 2025","value":60000}
]

REGLAS IMPORTANTES:
- La explicación debe ser clara y NO técnica
- NO incluyas JSON dentro de la explicación
- NO menciones "summary", "chartData" ni términos técnicos
- USA lenguaje simple como: "Este mes recibiste X pesos" en lugar de "totalPagado: X"
- Si hay gráfico, describe brevemente qué muestra
- Responde SOLO el JSON, sin texto adicional

EJEMPLO DE BUENA EXPLICACIÓN:
"Durante el mes actual, has recibido pagos por un total de $11,782,475.24 pesos. Actualmente tienes una deuda pendiente de cobro de $9,447,578.90 pesos en todas tus cuentas activas. Esto significa que has cobrado aproximadamente el 55% del total esperado."

EJEMPLO DE MALA EXPLICACIÓN (NO HACER):
"json { 'explanation': 'Durante el mes...', 'totalPagado': 11782475.24 }"

Sé claro, preciso y útil. Si necesitas más de una función, llámalas todas.`;

    // SQL Validator - ensures only safe SELECT queries
    const validateSQL = (sql: string): { valid: boolean; error?: string } => {
      // Remove all leading/trailing whitespace and normalize line breaks
      const cleanSQL = sql.trim().replace(/\s+/g, ' ');
      const upperSQL = cleanSQL.toUpperCase();
      
      // Must start with SELECT (case insensitive, after cleaning)
      if (!upperSQL.startsWith('SELECT')) {
        console.log('SQL validation failed - does not start with SELECT:', cleanSQL.substring(0, 50));
        return { valid: false, error: 'Solo se permiten consultas SELECT' };
      }
      
      // Dangerous keywords (excluding SELECT which is at the start)
      const dangerousKeywords = [
        'DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 
        'CREATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE'
      ];
      
      for (const keyword of dangerousKeywords) {
        // Use word boundaries to avoid false positives (e.g., "REPLACE" in a string)
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(upperSQL)) {
          return { valid: false, error: `Palabra clave no permitida: ${keyword}` };
        }
      }
      
      // Allow trailing semicolon but not multiple statements
      const withoutTrailingSemicolon = cleanSQL.replace(/;\s*$/, '');
      if (withoutTrailingSemicolon.includes(';')) {
        return { valid: false, error: 'No se permiten múltiples consultas' };
      }
      
      return { valid: true };
    };

    // Helper function to execute queries
    const executeQuery = async (functionName: string, args?: any): Promise<any> => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const lastYear = new Date(now);
      lastYear.setFullYear(currentYear - 1);

      switch (functionName) {
        case "get_pagos_mes_actual": {
          const { data, error } = await supabase
            .from('pagos')
            .select('monto, fecha_pago, id_cuenta_cobranza')
            .gte('fecha_pago', `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`)
            .lte('fecha_pago', `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`)
            .eq('activo', true);
          
          if (error) throw error;
          
          const total = data?.reduce((sum, p) => sum + Number(p.monto || 0), 0) || 0;
          return { pagos: data, total };
        }

        case "get_deuda_total": {
          // Get all active accounts
          const { data: cuentas, error: cuentasError } = await supabase
            .from('cuentas_cobranza')
            .select('id, precio_final')
            .eq('activo', true);
          
          if (cuentasError) throw cuentasError;

          // Get all payments applied
          const { data: aplicaciones, error: aplicacionesError } = await supabase
            .from('aplicaciones_pago')
            .select('monto, id_acuerdo_pago, acuerdos_pago!fk_apppago_acuerdo!inner(id_cuenta_cobranza)')
            .eq('activo', true)
            .eq('es_multa', false);
          
          if (aplicacionesError) throw aplicacionesError;

          // Calculate debt per account
          const deudaPorCuenta = cuentas?.map(cuenta => {
            const totalPagado = aplicaciones
              ?.filter((a: any) => a.acuerdos_pago?.id_cuenta_cobranza === cuenta.id)
              ?.reduce((sum, a) => sum + Number(a.monto || 0), 0) || 0;
            
            return {
              id: cuenta.id,
              precio_final: Number(cuenta.precio_final || 0),
              pagado: totalPagado,
              pendiente: Number(cuenta.precio_final || 0) - totalPagado
            };
          }) || [];

          const totalDeuda = deudaPorCuenta.reduce((sum, c) => sum + c.pendiente, 0);
          
          return { cuentas: deudaPorCuenta, totalDeuda };
        }

        case "get_pagos_por_mes": {
          const { data, error } = await supabase
            .from('pagos')
            .select('monto, fecha_pago')
            .gte('fecha_pago', lastYear.toISOString().split('T')[0])
            .eq('activo', true)
            .order('fecha_pago', { ascending: true });
          
          if (error) throw error;

          // Group by month
          const porMes = data?.reduce((acc: any, pago) => {
            const fecha = new Date(pago.fecha_pago);
            const mesAnio = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
            
            if (!acc[mesAnio]) {
              acc[mesAnio] = { mes: mesAnio, total: 0, count: 0 };
            }
            
            acc[mesAnio].total += Number(pago.monto || 0);
            acc[mesAnio].count += 1;
            
            return acc;
          }, {});

          return Object.values(porMes || {});
        }

        case "get_cuentas_pendientes": {
          // Similar to get_deuda_total but returns top 5
          const { data: cuentas, error: cuentasError } = await supabase
            .from('cuentas_cobranza')
            .select(`
              id, 
              precio_final,
              ofertas!fk_ccob_oferta!inner(
                id,
                propiedades!fk_ofertas_propiedad(numero_propiedad)
              )
            `)
            .eq('activo', true)
            .limit(50);
          
          if (cuentasError) throw cuentasError;

          const { data: aplicaciones, error: aplicacionesError } = await supabase
            .from('aplicaciones_pago')
            .select('monto, id_acuerdo_pago, acuerdos_pago!fk_apppago_acuerdo!inner(id_cuenta_cobranza)')
            .eq('activo', true)
            .eq('es_multa', false);
          
          if (aplicacionesError) throw aplicacionesError;

          const cuentasConDeuda = cuentas?.map((cuenta: any) => {
            const totalPagado = aplicaciones
              ?.filter((a: any) => a.acuerdos_pago?.id_cuenta_cobranza === cuenta.id)
              ?.reduce((sum, a) => sum + Number(a.monto || 0), 0) || 0;
            
            return {
              id: cuenta.id,
              propiedad: cuenta.ofertas?.propiedades?.numero_propiedad || 'N/A',
              precio_final: Number(cuenta.precio_final || 0),
              pagado: totalPagado,
              pendiente: Number(cuenta.precio_final || 0) - totalPagado
            };
          })
          .filter(c => c.pendiente > 0)
          .sort((a, b) => b.pendiente - a.pendiente)
          .slice(0, 5) || [];

          return cuentasConDeuda;
        }

        case "get_pagos_por_metodo": {
          const { data: pagos, error } = await supabase
            .from('pagos')
            .select(`
              monto,
              metodos_pago!inner(nombre)
            `)
            .eq('activo', true)
            .gte('fecha_pago', `${currentYear}-01-01`);
          
          if (error) throw error;

          const porMetodo = pagos?.reduce((acc: any, pago: any) => {
            const metodo = pago.metodos_pago?.nombre || 'Desconocido';
            if (!acc[metodo]) {
              acc[metodo] = { metodo, total: 0 };
            }
            acc[metodo].total += Number(pago.monto || 0);
            return acc;
          }, {});

          return Object.values(porMetodo || {});
        }

        case "generate_sql_query": {
          if (!args?.sql_query) {
            throw new Error('Se requiere sql_query en los argumentos');
          }
          
          const sqlQuery = args.sql_query;
          console.log("Executing dynamic SQL:", sqlQuery);
          
          // Validate SQL
          const validation = validateSQL(sqlQuery);
          if (!validation.valid) {
            throw new Error(`SQL inválido: ${validation.error}`);
          }
          
          // Execute with timeout and limit
          const { data, error } = await supabase.rpc('execute_safe_query', {
            query_text: sqlQuery,
            max_rows: 1000
          });
          
          if (error) {
            console.error("SQL execution error:", error);
            throw new Error(`Error ejecutando SQL: ${error.message}`);
          }
          
          return { 
            data: data || [], 
            sql: sqlQuery,
            rowCount: data?.length || 0 
          };
        }

        default:
          throw new Error(`Función desconocida: ${functionName}`);
      }
    };

    // Define tools for AI
    const tools = [
      {
        type: "function",
        function: {
          name: "get_pagos_mes_actual",
          description: "Obtiene todos los pagos recibidos en el mes actual con su total"
        }
      },
      {
        type: "function",
        function: {
          name: "get_deuda_total",
          description: "Calcula el total adeudado sumando todas las cuentas activas menos los pagos aplicados"
        }
      },
      {
        type: "function",
        function: {
          name: "get_pagos_por_mes",
          description: "Obtiene estadísticas de pagos agrupadas por mes durante el último año"
        }
      },
      {
        type: "function",
        function: {
          name: "get_cuentas_pendientes",
          description: "Obtiene las top 5 cuentas con mayor deuda pendiente"
        }
      },
      {
        type: "function",
        function: {
          name: "get_pagos_por_metodo",
          description: "Agrupa los pagos del año actual por método de pago"
        }
      },
      {
        type: "function",
        function: {
          name: "generate_sql_query",
          description: "Genera y ejecuta una consulta SQL personalizada segura (solo SELECT). Úsala cuando las funciones predefinidas no cubran la pregunta. Ejemplos: consultas sobre propiedades, proyectos, edificios, análisis por categorías específicas, joins complejos.",
          parameters: {
            type: "object",
            properties: {
              sql_query: {
                type: "string",
                description: "Consulta SQL SELECT segura. Debe incluir JOINs apropiados, filtros WHERE con activo = true, y LIMIT para evitar demasiados resultados. Ejemplo: SELECT p.numero_propiedad, pr.nombre FROM propiedades p JOIN entidades_relacionadas er ON p.id_entidad_relacionada_dueno = er.id JOIN proyectos pr ON er.id_proyecto = pr.id WHERE p.activo = true LIMIT 100"
              }
            },
            required: ["sql_query"]
          }
        }
      }
    ];

    // First AI call
    console.log("Calling AI with question:", question);
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ],
        tools,
        tool_choice: "auto"
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de uso excedido, intenta más tarde." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos agotados. Agrega fondos en Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Error al consultar la IA");
    }

    const aiResponse = await response.json();
    console.log("AI Response:", JSON.stringify(aiResponse, null, 2));

    const message = aiResponse.choices?.[0]?.message;
    
    // If AI wants to call tools
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolResults = [];
      
      // Execute all tool calls
      for (const toolCall of message.tool_calls) {
        console.log("Executing tool:", toolCall.function.name);
        const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : undefined;
        const result = await executeQuery(toolCall.function.name, args);
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(result)
        });
      }

      // Second AI call with results
      const finalResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
            message,
            ...toolResults
          ]
        }),
      });

      const finalAiResponse = await finalResponse.json();
      const finalMessage = finalAiResponse.choices?.[0]?.message?.content;

      console.log("Final AI response:", finalMessage);

      try {
        const parsedResponse = JSON.parse(finalMessage);
        
        // Add raw data from tool results
        const allRawData = toolResults
          .map(tr => JSON.parse(tr.content))
          .reduce((acc, data) => {
            if (Array.isArray(data)) return [...acc, ...data];
            if (data.pagos) return [...acc, ...data.pagos];
            if (data.cuentas) return [...acc, ...data.cuentas];
            return acc;
          }, []);

        // Auto-generate chart if summary exists but no chartData
        let autoChartData = parsedResponse.chartData;
        let autoChartType = parsedResponse.chartType;
        
        if (!autoChartData && parsedResponse.summary) {
          const summary = parsedResponse.summary;
          if (summary.totalPagado !== undefined || summary.totalPendiente !== undefined) {
            autoChartData = [];
            if (summary.totalPagado !== undefined && summary.totalPagado > 0) {
              autoChartData.push({ name: "Pagado", value: summary.totalPagado });
            }
            if (summary.totalPendiente !== undefined && summary.totalPendiente > 0) {
              autoChartData.push({ name: "Pendiente", value: summary.totalPendiente });
            }
            autoChartType = autoChartData.length > 0 ? "bar" : null;
          }
        }

        return new Response(JSON.stringify({
          ...parsedResponse,
          chartData: autoChartData,
          chartType: autoChartType,
          rawData: allRawData,
          sqlQuery: "Consulta ejecutada mediante funciones predefinidas (seguras)"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (parseError) {
        console.error("Error parsing AI response:", parseError);
        // If response is not JSON, format it
        return new Response(JSON.stringify({
          explanation: finalMessage || "No se pudo procesar la respuesta",
          sqlQuery: null,
          rawData: [],
          chartType: null,
          chartData: null,
          summary: {}
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // If no tool call, return AI's text response
    const content = message?.content || "No se pudo generar una respuesta";
    
    return new Response(JSON.stringify({
      explanation: content,
      sqlQuery: null,
      rawData: [],
      chartType: null,
      chartData: null,
      summary: {}
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Error in ai-database-query:", e);
    return new Response(JSON.stringify({ 
      error: e instanceof Error ? e.message : "Error desconocido" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
