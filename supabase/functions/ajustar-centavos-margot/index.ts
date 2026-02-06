import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Case C overrides: cuenta_id → target precio_final from Excel
const CASE_C_OVERRIDES: Record<number, number> = {
  374: 2292821.44,
  280: 2584949.00,
  506: 1450240.00,
  490: 3917410.25,
  510: 1489840.00,
  278: 2636056.74,
  330: 2085274.51,
  414: 3709268.13,
  320: 3925286.75,
  486: 2608561.52,
  311: 2509075.86,
  261: 3516293.33,
  428: 2240030.64,
  215: 2300708.67,
  202: 3665491.33,
  491: 2675518.67,
  367: 3451437.99,
  519: 2776559.65,
  370: 2375120.93,
  383: 3477323.71,
  509: 2273756.99,
  255: 2806357.82,
  193: 3762169.98,
  439: 2548636.60,
  176: 2564053.21,
  369: 3841009.12,
  406: 2342521.48,
  173: 2735348.41,
  331: 3511223.64,
  395: 1506770.00,
  498: 2702783.20,
  493: 2634537.67,
  420: 1466720.00,
  181: 3465994.71,
  340: 2521326.08,
  225: 2329119.73,
  446: 2695658.26,
  230: 3341664.96,
  248: 3555277.02,
  487: 2562776.45,
  329: 2498840.24,
  229: 2748306.88,
  358: 2581584.45,
  372: 2780564.66,
  323: 3046260.57,
  400: 3080823.42,
  398: 2640106.53,
  206: 3103841.73,
  403: 2851203.34,
  1: 2699048.79,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface CuentaResult {
  cuenta_id: number;
  depto: string;
  caso: 'B' | 'C';
  target: number;
  precio_final_antes: number;
  precio_final_despues: number;
  suma_acuerdos_antes: number;
  suma_acuerdos_despues: number;
  diff_aplicado: number;
  ultimo_acuerdo_id: number | null;
  ultimo_pago_id: number | null;
  aplicaciones_creadas: number;
  status: 'ok' | 'error' | 'skipped';
  error?: string;
}

async function recalcularAplicaciones(
  supabase: ReturnType<typeof createClient>,
  cuentaId: number
): Promise<number> {
  // 1. Get all active acuerdos
  const { data: acuerdos, error: acuerdosError } = await supabase
    .from('acuerdos_pago')
    .select('id, orden, monto, pago_completado, id_concepto')
    .eq('id_cuenta_cobranza', cuentaId)
    .eq('activo', true)
    .order('orden', { ascending: true });

  if (acuerdosError) throw acuerdosError;

  // 2. Get all active pagos
  const { data: pagos, error: pagosError } = await supabase
    .from('pagos')
    .select('id, monto, fecha_pago')
    .eq('id_cuenta_cobranza', cuentaId)
    .eq('activo', true)
    .order('fecha_pago', { ascending: true });

  if (pagosError) throw pagosError;

  // 3. Get current non-multa aplicaciones
  const acuerdoIds = acuerdos?.map((a: { id: number }) => a.id) || [];
  if (acuerdoIds.length === 0) return 0;

  const { data: currentAplicaciones, error: aplicacionesError } = await supabase
    .from('aplicaciones_pago')
    .select('id')
    .in('id_acuerdo_pago', acuerdoIds)
    .eq('activo', true)
    .eq('es_multa', false);

  if (aplicacionesError) throw aplicacionesError;

  // 4. Delete existing non-multa aplicaciones
  if (currentAplicaciones && currentAplicaciones.length > 0) {
    const { error: deleteError } = await supabase
      .from('aplicaciones_pago')
      .delete()
      .in('id', currentAplicaciones.map((a: { id: number }) => a.id));

    if (deleteError) throw deleteError;
  }

  // 5. Redistribute payments to acuerdos in order
  const paymentRemaining = new Map<number, number>();
  pagos?.forEach((p: { id: number; monto: number }) => paymentRemaining.set(p.id, Number(p.monto)));

  const acuerdosPendientes = acuerdos?.map((a: { id: number; monto: number }) => ({
    id: a.id,
    montoNecesario: Number(a.monto),
    montoPagado: 0,
  })) || [];

  const newAplicaciones: Array<{
    id_pago: number;
    id_acuerdo_pago: number;
    monto: number;
    activo: boolean;
    es_multa: boolean;
  }> = [];

  for (const acuerdo of acuerdosPendientes) {
    if (acuerdo.montoNecesario <= 0) continue;

    for (const pago of (pagos || [])) {
      const remaining = paymentRemaining.get(pago.id) || 0;
      if (remaining <= 0) continue;

      const necesario = acuerdo.montoNecesario - acuerdo.montoPagado;
      if (necesario <= 0) break;

      const aAplicar = Math.min(remaining, necesario);

      if (aAplicar >= 0.01) {
        const montoRedondeado = round2(aAplicar);

        if (montoRedondeado > 0) {
          newAplicaciones.push({
            id_pago: pago.id,
            id_acuerdo_pago: acuerdo.id,
            monto: montoRedondeado,
            activo: true,
            es_multa: false,
          });

          paymentRemaining.set(pago.id, remaining - montoRedondeado);
          acuerdo.montoPagado += montoRedondeado;
        }
      }
    }
  }

  // 6. Insert new aplicaciones in batches
  if (newAplicaciones.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < newAplicaciones.length; i += batchSize) {
      const batch = newAplicaciones.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('aplicaciones_pago')
        .insert(batch);

      if (insertError) throw insertError;
    }
  }

  // 7. Update pago_completado for each acuerdo
  for (const acuerdo of acuerdosPendientes) {
    const isComplete = Math.abs(acuerdo.montoPagado - acuerdo.montoNecesario) < 0.01;

    const { error: updateError } = await supabase
      .from('acuerdos_pago')
      .update({ pago_completado: isComplete })
      .eq('id', acuerdo.id);

    if (updateError) {
      console.error(`Error updating pago_completado for acuerdo ${acuerdo.id}:`, updateError);
    }
  }

  return newAplicaciones.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('=== INICIO: Ajuste de centavos Margot (propiedades) ===');

    // Optional params: dry_run, batch_start, batch_size
    let dryRun = false;
    let batchStart = 0;
    let batchSize = 50; // Process 50 accounts per call to avoid timeout
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
      if (typeof body?.batch_start === 'number') batchStart = body.batch_start;
      if (typeof body?.batch_size === 'number') batchSize = Math.min(body.batch_size, 100);
    } catch {
      // No body is fine
    }

    if (dryRun) {
      console.log('*** MODO DRY RUN - No se harán cambios ***');
    }

    // 1. Find Margot project ID
    const { data: proyecto, error: proyectoError } = await supabase
      .from('proyectos')
      .select('id')
      .eq('nombre', 'Margot')
      .eq('activo', true)
      .single();

    if (proyectoError || !proyecto) {
      throw new Error('No se encontró el proyecto Margot: ' + (proyectoError?.message || 'not found'));
    }

    const proyectoId = proyecto.id;
    console.log(`Proyecto Margot ID: ${proyectoId}`);

    // 2. Get edificios for Margot
    const { data: edificios, error: edificiosError } = await supabase
      .from('edificios')
      .select('id')
      .eq('id_proyecto', proyectoId)
      .eq('activo', true);

    if (edificiosError) throw new Error('Error fetching edificios: ' + edificiosError.message);
    const edificioIds = edificios?.map((e: any) => e.id) || [];
    console.log(`Found ${edificioIds.length} edificios for Margot`);

    if (edificioIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, summary: { total_cuentas_encontradas: 0, procesadas: 0, errores: 0, omitidas: 0 }, results: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Get edificios_modelos for those edificios
    const { data: edModelos, error: edModelosError } = await supabase
      .from('edificios_modelos')
      .select('id')
      .in('id_edificio', edificioIds);

    if (edModelosError) throw new Error('Error fetching edificios_modelos: ' + edModelosError.message);
    const edModeloIds = edModelos?.map((em: any) => em.id) || [];
    console.log(`Found ${edModeloIds.length} edificios_modelos`);

    // 4. Get propiedades for those edificios_modelos
    const { data: propiedades, error: propiedadesError } = await supabase
      .from('propiedades')
      .select('id, numero_propiedad')
      .in('id_edificio_modelo', edModeloIds)
      .eq('activo', true);

    if (propiedadesError) throw new Error('Error fetching propiedades: ' + propiedadesError.message);
    console.log(`Found ${propiedades?.length || 0} propiedades`);

    // Build map propiedad_id -> numero_propiedad
    const propiedadNumeroMap = new Map<number, string>();
    propiedades?.forEach((p: any) => propiedadNumeroMap.set(p.id, String(p.numero_propiedad)));

    // 5. Get ofertas for those propiedades (without id_producto = property-only)
    const propiedadIds = propiedades?.map((p: any) => p.id) || [];
    const { data: ofertas, error: ofertasError } = await supabase
      .from('ofertas')
      .select('id, id_propiedad')
      .eq('activo', true)
      .in('id_propiedad', propiedadIds)
      .is('id_producto', null);

    if (ofertasError) throw new Error('Error fetching ofertas: ' + ofertasError.message);
    console.log(`Found ${ofertas?.length || 0} property offers for Margot`);

    // Build map oferta_id -> numero_propiedad
    const ofertaPropiedadMap = new Map<number, string>();
    for (const o of (ofertas || [])) {
      ofertaPropiedadMap.set(o.id, propiedadNumeroMap.get(o.id_propiedad) || '?');
    }

    const ofertaIds = ofertas?.map((o: any) => o.id) || [];
    if (ofertaIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, summary: { total_cuentas_encontradas: 0, procesadas: 0, errores: 0, omitidas: 0 }, results: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Get cuentas_cobranza for those ofertas
    const { data: cuentas, error: cuentasError } = await supabase
      .from('cuentas_cobranza')
      .select('id, precio_final, id_oferta')
      .eq('activo', true)
      .in('id_oferta', ofertaIds)
      .gt('precio_final', 100000);

    if (cuentasError) throw new Error('Error fetching cuentas: ' + cuentasError.message);
    console.log(`Found ${cuentas?.length || 0} main property accounts for Margot`);

    // Sort cuentas by id for consistent batching
    const allCuentas = (cuentas || []).sort((a: any, b: any) => a.id - b.id);
    const totalCuentas = allCuentas.length;

    // Apply batch window
    const batchedCuentas = allCuentas.slice(batchStart, batchStart + batchSize);
    console.log(`Processing batch: start=${batchStart}, size=${batchSize}, actual=${batchedCuentas.length} of ${totalCuentas}`);

    const results: CuentaResult[] = [];
    let totalProcessed = 0;
    let totalErrors = 0;
    let totalSkipped = 0;

    for (const cuenta of batchedCuentas) {
      const cuentaId = cuenta.id;
      const precioFinalActual = Number(cuenta.precio_final);
      const depto = ofertaPropiedadMap.get(cuenta.id_oferta) || '?';

      // Determine target and case
      const isCaseC = CASE_C_OVERRIDES.hasOwnProperty(cuentaId);
      const target = isCaseC ? CASE_C_OVERRIDES[cuentaId] : precioFinalActual;

      // Get sum of active acuerdos
      const { data: sumaData, error: sumaError } = await supabase
        .from('acuerdos_pago')
        .select('monto')
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true);

      if (sumaError) {
        results.push({
          cuenta_id: cuentaId,
          depto: String(depto || '?'),
          caso: isCaseC ? 'C' : 'B',
          target,
          precio_final_antes: precioFinalActual,
          precio_final_despues: precioFinalActual,
          suma_acuerdos_antes: 0,
          suma_acuerdos_despues: 0,
          diff_aplicado: 0,
          ultimo_acuerdo_id: null,
          ultimo_pago_id: null,
          aplicaciones_creadas: 0,
          status: 'error',
          error: 'Error fetching acuerdos sum: ' + sumaError.message,
        });
        totalErrors++;
        continue;
      }

      const sumaAcuerdos = round2(
        sumaData?.reduce((sum: number, a: { monto: number }) => sum + Number(a.monto), 0) || 0
      );
      const diff = round2(target - sumaAcuerdos);

      // Skip if no discrepancy or discrepancy >= $1
      if (Math.abs(diff) <= 0.001) {
        // Check if we still need to update precio_final (Case C with matching acuerdos)
        if (isCaseC && Math.abs(target - precioFinalActual) > 0.001) {
          if (!dryRun) {
            await supabase
              .from('cuentas_cobranza')
              .update({ precio_final: target })
              .eq('id', cuentaId);
          }
          results.push({
            cuenta_id: cuentaId,
            depto: String(depto || '?'),
            caso: 'C',
            target,
            precio_final_antes: precioFinalActual,
            precio_final_despues: target,
            suma_acuerdos_antes: sumaAcuerdos,
            suma_acuerdos_despues: sumaAcuerdos,
            diff_aplicado: 0,
            ultimo_acuerdo_id: null,
            ultimo_pago_id: null,
            aplicaciones_creadas: 0,
            status: 'ok',
          });
          totalProcessed++;
          continue;
        }
        totalSkipped++;
        continue;
      }

      if (Math.abs(diff) >= 1) {
        // Skip discrepancies >= $1
        totalSkipped++;
        continue;
      }

      // Process this account
      const result: CuentaResult = {
        cuenta_id: cuentaId,
        depto: String(depto || '?'),
        caso: isCaseC ? 'C' : 'B',
        target,
        precio_final_antes: precioFinalActual,
        precio_final_despues: precioFinalActual,
        suma_acuerdos_antes: sumaAcuerdos,
        suma_acuerdos_despues: sumaAcuerdos,
        diff_aplicado: diff,
        ultimo_acuerdo_id: null,
        ultimo_pago_id: null,
        aplicaciones_creadas: 0,
        status: 'ok',
      };

      try {
        // Step 1: Update precio_final if Case C
        if (isCaseC && Math.abs(target - precioFinalActual) > 0.001) {
          if (!dryRun) {
            const { error: updatePFError } = await supabase
              .from('cuentas_cobranza')
              .update({ precio_final: target })
              .eq('id', cuentaId);

            if (updatePFError) throw new Error('Error updating precio_final: ' + updatePFError.message);
          }
          result.precio_final_despues = target;
        }

        // Step 2: Adjust last acuerdo
        const { data: lastAcuerdo, error: lastAcuerdoError } = await supabase
          .from('acuerdos_pago')
          .select('id, monto')
          .eq('id_cuenta_cobranza', cuentaId)
          .eq('activo', true)
          .order('orden', { ascending: false })
          .limit(1)
          .single();

        if (lastAcuerdoError || !lastAcuerdo) {
          throw new Error('No last acuerdo found: ' + (lastAcuerdoError?.message || 'empty'));
        }

        result.ultimo_acuerdo_id = lastAcuerdo.id;
        const newAcuerdoMonto = round2(Number(lastAcuerdo.monto) + diff);

        if (!dryRun) {
          const { error: updateAcuerdoError } = await supabase
            .from('acuerdos_pago')
            .update({ monto: newAcuerdoMonto })
            .eq('id', lastAcuerdo.id);

          if (updateAcuerdoError) throw new Error('Error updating last acuerdo: ' + updateAcuerdoError.message);
        }

        // Step 3: Adjust last pago
        const { data: lastPago, error: lastPagoError } = await supabase
          .from('pagos')
          .select('id, monto')
          .eq('id_cuenta_cobranza', cuentaId)
          .eq('activo', true)
          .order('fecha_pago', { ascending: false })
          .order('id', { ascending: false })
          .limit(1)
          .single();

        if (lastPagoError || !lastPago) {
          throw new Error('No last pago found: ' + (lastPagoError?.message || 'empty'));
        }

        result.ultimo_pago_id = lastPago.id;
        const newPagoMonto = round2(Number(lastPago.monto) + diff);

        if (!dryRun) {
          const { error: updatePagoError } = await supabase
            .from('pagos')
            .update({ monto: newPagoMonto })
            .eq('id', lastPago.id);

          if (updatePagoError) throw new Error('Error updating last pago: ' + updatePagoError.message);
        }

        result.suma_acuerdos_despues = round2(sumaAcuerdos + diff);

        // Step 4: Recalculate aplicaciones
        if (!dryRun) {
          const aplicacionesCreadas = await recalcularAplicaciones(supabase, cuentaId);
          result.aplicaciones_creadas = aplicacionesCreadas;
        }

        totalProcessed++;
        console.log(`✓ Cuenta ${cuentaId} (Depto ${depto}): Caso ${result.caso}, diff=${diff}`);
      } catch (err) {
        result.status = 'error';
        result.error = err.message;
        totalErrors++;
        console.error(`✗ Cuenta ${cuentaId} (Depto ${depto}): ${err.message}`);
      }

      results.push(result);
    }

    console.log(`=== FIN: Procesadas=${totalProcessed}, Errores=${totalErrors}, Omitidas=${totalSkipped} ===`);

    const hasMore = (batchStart + batchSize) < totalCuentas;
    const nextBatchStart = batchStart + batchSize;

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        batch: {
          start: batchStart,
          size: batchSize,
          total_cuentas: totalCuentas,
          has_more: hasMore,
          next_batch_start: hasMore ? nextBatchStart : null,
        },
        summary: {
          procesadas: totalProcessed,
          errores: totalErrors,
          omitidas: totalSkipped,
        },
        results,
      }, null, 2),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error fatal en ajustar-centavos-margot:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
