import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple CSV generation function
function generateCSV(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];

  // Add header row
  csvRows.push(headers.map(h => `"${h}"`).join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      let value = row[header];
      if (value === null || value === undefined) {
        value = '';
      }
      // Escape quotes and wrap in quotes
      const stringValue = String(value).replace(/"/g, '""');
      return `"${stringValue}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

// Remove SQL comments from query
function removeComments(query: string): string {
  // Remove single-line comments (-- ...) but preserve newlines
  let cleaned = query.replace(/--[^\n\r]*/g, '');
  // Remove block comments (/* ... */)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  return cleaned;
}

// List of filters that require string quoting (non-numeric values)
const STRING_FILTERS = ['tipo'];

// Apply filters to query by replacing placeholders
function applyFiltersToQuery(querySql: string, filtros: Record<string, unknown>): string {
  let processedQuery = querySql;

  // Find all placeholders in format {{AND condition}}
  const placeholderRegex = /\{\{([^}]+)\}\}/g;
  let match;
  const matches: { fullMatch: string; condition: string }[] = [];

  while ((match = placeholderRegex.exec(querySql)) !== null) {
    matches.push({ fullMatch: match[0], condition: match[1] });
  }

  for (const { fullMatch, condition } of matches) {
    // Extract the filter name from the condition (e.g., :id_proyecto)
    const filterNameMatch = condition.match(/:(\w+)/);
    if (filterNameMatch) {
      const filterName = filterNameMatch[1];
      const filterValue = filtros[filterName];

      if (filterValue !== undefined && filterValue !== null && filterValue !== '') {
        // Check if this filter requires string quoting
        const needsQuotes = STRING_FILTERS.includes(filterName);
        const valueStr = String(filterValue);
        
        // Check if this is a multi-value (comma-separated) for IN clause
        if (valueStr.includes(',')) {
          const inValues = valueStr.split(',').map(v => {
            const trimmed = v.trim();
            return needsQuotes ? `'${trimmed}'` : trimmed;
          }).join(',');
          let replacedCondition = condition.replace(`= :${filterName}`, `IN (${inValues})`);
          replacedCondition = replacedCondition.replace(`=:${filterName}`, `IN (${inValues})`);
          processedQuery = processedQuery.replace(fullMatch, replacedCondition);
        } else {
          // Single value - wrap in quotes if needed
          const quotedValue = needsQuotes ? `'${valueStr}'` : valueStr;
          const replacedCondition = condition.replace(`:${filterName}`, quotedValue);
          processedQuery = processedQuery.replace(fullMatch, replacedCondition);
        }
      } else {
        // Remove the placeholder entirely if no filter value
        processedQuery = processedQuery.replace(fullMatch, '');
      }
    }
  }

  // Remove SQL comments BEFORE collapsing whitespace (to avoid -- comments eating the rest of the line)
  processedQuery = removeComments(processedQuery);

  // Clean up any extra whitespace
  processedQuery = processedQuery.replace(/\s+/g, ' ').trim();

  return processedQuery;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { id_reporte, filtros = {}, data_directa, columnas_visibles, nombre_archivo } = await req.json();

    console.log('[exportar-reporte] Request received:', { id_reporte, filtros, hasDataDirecta: !!data_directa });

    let queryResult: Record<string, unknown>[] = [];
    let fileName = 'reporte';

    // Option 1: Direct data export (used by Propiedades page)
    if (data_directa && Array.isArray(data_directa)) {
      console.log('[exportar-reporte] Using direct data export');
      
      // Filter columns if specified
      if (columnas_visibles && Array.isArray(columnas_visibles)) {
        queryResult = data_directa.map((row: Record<string, unknown>) => {
          const filteredRow: Record<string, unknown> = {};
          for (const col of columnas_visibles) {
            if (col.key in row) {
              filteredRow[col.label || col.key] = row[col.key];
            }
          }
          return filteredRow;
        });
      } else {
        queryResult = data_directa;
      }

      fileName = nombre_archivo || 'exportacion';
    }
    // Option 2: Query from reportes table
    else if (id_reporte) {
      console.log('[exportar-reporte] Fetching report config for ID:', id_reporte);

      // Get report configuration
      const { data: reporte, error: reporteError } = await supabase
        .from('reportes')
        .select('*')
        .eq('id', id_reporte)
        .eq('activo', true)
        .single();

      if (reporteError || !reporte) {
        console.error('[exportar-reporte] Report not found:', reporteError);
        return new Response(
          JSON.stringify({ error: 'Reporte no encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[exportar-reporte] Report found:', reporte.nombre);

      // Apply filters to the query
      const processedQuery = applyFiltersToQuery(reporte.query_sql, filtros);
      console.log('[exportar-reporte] Processed query:', processedQuery);

      // Execute the query using the safe query function
      const { data: resultData, error: queryError } = await supabase
        .rpc('execute_safe_query', { 
          query_text: processedQuery,
          max_rows: 10000
        });

      if (queryError) {
        console.error('[exportar-reporte] Query execution error:', queryError);
        return new Response(
          JSON.stringify({ error: 'Error al ejecutar el reporte: ' + queryError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      queryResult = resultData || [];
      fileName = reporte.nombre_archivo || 'reporte';

      console.log('[exportar-reporte] Query returned', queryResult.length, 'rows');

      // Special transformation for Report ID 4 (Pagos actuales y futuros)
      // Transform column names to match frontend display
      if (id_reporte === 4) {
        queryResult = queryResult.map((row: Record<string, unknown>) => ({
          'Mes': row.es_mes_actual === true ? 'Mes actual' : row.mes,
          'Monto Por Cobrar': row.monto_por_cobrar,
          'Monto Cobrado': row.monto_cobrado,
          'Restante Por Cobrar': row.monto_faltante,
        }));
        console.log('[exportar-reporte] Transformed Report 4 columns');
      }

      // Special transformation for Report ID 6 (Solo resta pagos a contraentrega)
      // Ensures column order matches frontend display
      if (id_reporte === 6) {
        queryResult = queryResult.map((row: Record<string, unknown>) => ({
          'proyecto': row.proyecto,
          'dueno': row.dueno,
          'compradores': row.compradores,
          'numero_departamento': row.numero_departamento,
          'numero_cuenta': row.numero_cuenta,
          'fecha_compra': row.fecha_compra,
          'fecha_pago_contraentrega': row.fecha_pago_contraentrega,
          'monto_pagado_total': row.monto_pagado_total,
          'monto_contraentrega': row.monto_contraentrega,
          'monto_pagado_contraentrega': row.monto_pagado_contraentrega,
          'restante_contraentrega': row.restante_contraentrega,
        }));
        console.log('[exportar-reporte] Transformed Report 6 columns (Solo resta pagos a contraentrega)');
      }

      // Special transformation for Cartera Vencida report
      if (reporte.nombre_archivo === 'cartera_vencida') {
        queryResult = queryResult.map((row: Record<string, unknown>) => ({
          'Proyecto': row.proyecto,
          'Dueño': row.dueno,
          'Compradores': row.compradores,
          'Número de Departamento': row.numero_departamento,
          'Número de Cuenta': row.numero_cuenta,
          'Tipo': row.tipo,
          'Categoría': row.categoria,
          'Nombre de Producto': row.nombre_producto,
          'Última Fecha Pago': row.ultima_fecha_pago,
          'Monto a Pagar': row.monto_a_pagar,
          'Monto Pagado': row.monto_pagado,
          'Monto Restante': row.monto_restante,
        }));
        console.log('[exportar-reporte] Transformed Cartera Vencida columns');
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Se requiere id_reporte o data_directa' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (queryResult.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No hay datos para exportar' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate CSV
    const csvContent = generateCSV(queryResult);
    
    // Add BOM for Excel UTF-8 compatibility
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csvContent;

    const timestamp = new Date().toISOString().split('T')[0];
    const fullFileName = `${fileName}_${timestamp}.csv`;

    console.log('[exportar-reporte] Sending CSV file:', fullFileName);

    return new Response(csvWithBOM, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fullFileName}"`,
      },
    });

  } catch (error) {
    console.error('[exportar-reporte] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor: ' + (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
