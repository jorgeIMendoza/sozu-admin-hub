/**
 * Formatea el ID de una cuenta de cobranza según su tipo
 * @param id - ID numérico de la cuenta de cobranza
 * @param tipo - Tipo de cuenta: 'Propiedad', 'Producto', o 'Servicio'
 * @returns String formateado (ej: "CC-000001" para propiedad, "CCP-000001" para producto)
 */
export function formatCuentaCobranzaId(
  id: number,
  tipo?: 'Propiedad' | 'Producto' | 'Servicio'
): string {
  const paddedId = String(id).padStart(6, '0');
  
  // Si es producto o servicio, usar CCP-
  if (tipo === 'Producto' || tipo === 'Servicio') {
    return `CCP-${paddedId}`;
  }
  
  // Por defecto (propiedad), usar CC-
  return `CC-${paddedId}`;
}

/**
 * Formatea el ID de una cuenta de mantenimiento
 * @param id - ID numérico de la cuenta de mantenimiento
 * @returns String formateado (ej: "CM-000001")
 */
export function formatCuentaMantenimientoId(id: number): string {
  const paddedId = String(id).padStart(6, '0');
  return `CM-${paddedId}`;
}

/**
 * Formatea el ID de una oferta
 * @param id - ID numérico de la oferta
 * @returns String formateado (ej: "OF-000123")
 */
export function formatOfertaId(id: number): string {
  const paddedId = String(id).padStart(6, '0');
  return `OF-${paddedId}`;
}
