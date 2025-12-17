import { supabase } from "@/integrations/supabase/client";

/**
 * Intenta obtener una CLABE existente de ofertas de productos anteriores
 * que no tengan cuenta de cobranza, o genera una nueva si no hay disponibles.
 * 
 * @param propertyId - ID de la propiedad
 * @param productId - ID del producto
 * @param idErDueno - ID de la entidad relacionada dueña del producto
 * @returns La CLABE a usar (existente reutilizada o nueva generada)
 */
export async function getOrCreateProductClabe(
  propertyId: number,
  productId: number,
  idErDueno: number
): Promise<string> {
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

  // 3. Si hay ofertas con CLABE disponible, usar la más reciente
  if (offersWithoutAccount.length > 0) {
    // La primera es la más reciente (ordenamos DESC por id)
    const clabeToReuse = offersWithoutAccount[0].clabe_stp_tmp_producto;
    console.log('♻️ Reutilizando CLABE existente:', clabeToReuse);

    // 4. Limpiar las CLABEs de las demás ofertas (todas excepto la que usamos)
    const offerIdsToClean = offersWithoutAccount.slice(1).map(o => o.id);
    
    if (offerIdsToClean.length > 0) {
      console.log('🧹 Limpiando CLABEs de ofertas:', offerIdsToClean);
      
      const { error: updateError } = await supabase
        .from('ofertas')
        .update({ clabe_stp_tmp_producto: null })
        .in('id', offerIdsToClean);
      
      if (updateError) {
        console.error('⚠️ Error limpiando CLABEs anteriores:', updateError);
        // No lanzamos error, continuamos con la CLABE reutilizada
      }
    }

    return clabeToReuse;
  }

  // 5. Si no hay CLABEs disponibles, generar una nueva
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
  return generatedClabe;
}
