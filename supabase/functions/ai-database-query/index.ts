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
    const { question, preferredChartType } = await req.json();
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

FUNCIONES DISPONIBLES:
1. get_pagos_mes_actual: Obtiene todos los pagos del mes actual
2. get_deuda_total: Calcula el total adeudado de todas las cuentas activas
3. get_pagos_por_mes: Obtiene estadísticas de pagos agrupadas por mes (último año)
4. get_cuentas_pendientes: Obtiene las cuentas con mayor deuda pendiente
5. get_pagos_por_metodo: Agrupa pagos por método de pago

INSTRUCCIONES:
1. Analiza la pregunta del usuario
2. Determina qué función(es) necesitas llamar
3. Llama a las funciones apropiadas
4. Interpreta los resultados y genera una respuesta clara en LENGUAJE NATURAL

FORMATO DE RESPUESTA:
Responde SOLO con un objeto JSON válido (sin markdown, sin backticks):
{
  "explanation": "Explicación clara y concisa en español, SIN incluir números técnicos ni JSON. Usa lenguaje natural y amigable.",
  "chartType": "${preferredChartType || '"pie" (para comparaciones de 2-4 items) | "bar" (para series de datos) | "line" (para tendencias temporales) | "area" (para áreas de tendencia)'}" ${preferredChartType ? '(USAR ESTE TIPO OBLIGATORIAMENTE si hay datos para graficar)' : '| null'},
  "chartData": [{ "name": "Etiqueta descriptiva", "value": 123.45 }] o null,
  "summary": {
    "totalPagado": número o null,
    "totalPendiente": número o null
  }
}

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

    // Helper function to execute queries
    const executeQuery = async (functionName: string): Promise<any> => {
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
              ofertas!inner(
                id,
                propiedades(numero_propiedad)
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
        const result = await executeQuery(toolCall.function.name);
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
            // Use preferred chart type if specified, otherwise default to bar
            autoChartType = autoChartData.length > 0 ? (preferredChartType || "bar") : null;
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
