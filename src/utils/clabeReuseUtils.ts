import { supabase } from "@/integrations/supabase/client";

export interface ClabeResult {
  clabe: string;
  sourceOfferIds: number[];  // IDs de ofertas cuya CLABE se reutilizó (vacío si se generó nueva)
  isNew: boolean;            // true si se generó nueva CLABE
}

/**
 * Obtiene una CLABE reutilizable de ofertas anteriores sin cuenta de cobranza,
 * o genera una nueva. NO limpia CLABEs de ofertas existentes — el llamador
 * debe hacerlo después de guardar exitosamente la nueva oferta.
 */
export async function getOrCreateProductClabe(
  propertyId: number,
  productId: number,
  idErDueno: number
): Promise<ClabeResult> {
  console.log('🔍 Buscando CLABEs reutilizables para propiedad:', propertyId, 'producto:', productId);

  // 1. Buscar ofertas existentes del mismo producto/propiedad con CLABE
  const { data: existingOffers, error: offersError } = await supabase
    .from('ofertas')
    .select('id, clabe_stp_tmp_producto')
    .eq('id_propiedad', propertyId)
    .eq('id_producto', productId)
    .eq('activo', true)
    .not('clabe_stp_tmp_producto', 'is', null)
    .order('id', { ascending: false });

  if (offersError) {
    console.error('❌ Error buscando ofertas existentes:', offersError);
    throw offersError;
  }

  console.log('📋 Ofertas encontradas con CLABE:', existingOffers?.length || 0);

  // 2. Filtrar las que NO tienen cuenta de cobranza
  const offersWithoutAccount: { id: number; clabe_stp_tmp_producto: string }[] = [];
  
  if (existingOffers && existingOffers.length > 0) {
    for (const offer of existingOffers) {
      const { count, error: countError } = await supabase
        .from('cuentas_cobranza')
        .select('id', { count: 'exact', head: true })
        .eq('id_oferta', offer.id)
        .eq('activo', true);
      
      if (countError) {
        console.error('❌ Error verificando cuenta de cobranza:', countError);
        continue;
      }
      
      if (count === 0) {
        offersWithoutAccount.push({
          id: offer.id,
          clabe_stp_tmp_producto: offer.clabe_stp_tmp_producto!
        });
      }
    }
  }

  console.log('📋 Ofertas sin cuenta de cobranza:', offersWithoutAccount.length);

  // 3. Si hay ofertas con CLABE disponible, retornar la más reciente
  if (offersWithoutAccount.length > 0) {
    const clabeToReuse = offersWithoutAccount[0].clabe_stp_tmp_producto;
    const sourceOfferIds = offersWithoutAccount.map(o => o.id);
    console.log('♻️ CLABE reutilizable encontrada:', clabeToReuse, 'de ofertas:', sourceOfferIds);

    return {
      clabe: clabeToReuse,
      sourceOfferIds,
      isNew: false,
    };
  }

  // 4. Si no hay CLABEs disponibles, generar una nueva
  console.log('🆕 No hay CLABEs reutilizables, generando nueva...');
  
  const { data: generatedClabe, error: clabeError } = await supabase
    .rpc('crear_referencia_bancaria', {
      id_er_dueno: idErDueno
    });

  if (clabeError) {
    console.error('❌ Error generando CLABE:', clabeError);
    throw clabeError;
  }

  if (!generatedClabe || typeof generatedClabe !== 'string' || generatedClabe.length !== 18) {
    const errorMsg = `CLABE inválida generada: "${generatedClabe}" (tipo: ${typeof generatedClabe}, longitud: ${generatedClabe?.length || 0})`;
    console.error('⚠️', errorMsg);
    throw new Error(errorMsg);
  }

  console.log('✅ Nueva CLABE generada:', generatedClabe);
  return {
    clabe: generatedClabe,
    sourceOfferIds: [],
    isNew: true,
  };
}

/**
 * Limpia las CLABEs de ofertas fuente después de que la nueva oferta
 * haya sido guardada exitosamente.
 */
export async function clearSourceOfferClabes(sourceOfferIds: number[]): Promise<void> {
  if (sourceOfferIds.length === 0) return;
  
  console.log('🧹 Limpiando CLABEs de ofertas fuente:', sourceOfferIds);
  const { error } = await supabase
    .from('ofertas')
    .update({ clabe_stp_tmp_producto: null })
    .in('id', sourceOfferIds);
  
  if (error) {
    console.error('❌ Error limpiando CLABEs de ofertas fuente:', error);
    // No lanzamos error aquí porque la oferta nueva ya se guardó correctamente
  } else {
    console.log('✅ CLABEs de ofertas fuente limpiadas');
  }
}
