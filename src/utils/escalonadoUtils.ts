/**
 * Calculates the entrega (delivery) amount for a fixed-amount escalonado scheme.
 * entrega = precioFinal - enganche - totalMensualidades
 */
export function calcEntregaEscalonado(
  precioBase: number,
  porcentajeEnganche: number,
  tramos: any[],
  porcentajeDescuento?: number
): number {
  const precioFinal = precioBase * (1 + (porcentajeDescuento || 0) / 100);
  const enganche = precioFinal * (porcentajeEnganche / 100);
  const totalMensualidades = tramos.reduce((sum: number, t: any) => {
    const monto = (t.monto_mensualidad || 0) / 100; // centavos a pesos
    const numMens = t.numero_mensualidades || 0;
    return sum + (monto * numMens);
  }, 0);
  return Math.max(0, precioFinal - enganche - totalMensualidades);
}

/**
 * Formats a number as MXN currency string (e.g. "$1,234.56")
 */
export function formatMXN(amount: number): string {
  return `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Generates the label for an escalonado scheme in selectors/dropdowns.
 * For fixed-amount: "Eng: X% | Mensualidades: $A / $B | Ent: $C"
 * For percentage-based: "Eng: X% | Escalonado (N tramos) | Ent: Y%"
 * Requires precioBase to calculate entrega as dollar amount for fixed-amount schemes.
 */
export function formatEscalonadoLabel(
  scheme: { porcentaje_enganche?: number; porcentaje_entrega?: number; porcentaje_descuento_aumento?: number },
  tramos: any[],
  precioBase?: number
): string {
  const hasFixedAmount = tramos.some((t: any) => t.monto_mensualidad && t.monto_mensualidad > 0);
  const engPart = `Eng: ${scheme.porcentaje_enganche || 0}%`;

  if (hasFixedAmount) {
    const montoStr = tramos
      .map((t: any) => `$${((t.monto_mensualidad || 0) / 100).toLocaleString('es-MX')}`)
      .join(' / ');

    let entPart: string;
    if (precioBase && precioBase > 0) {
      const entrega = calcEntregaEscalonado(
        precioBase,
        scheme.porcentaje_enganche || 0,
        tramos,
        scheme.porcentaje_descuento_aumento || 0
      );
      entPart = `Ent: ${formatMXN(entrega)}`;
    } else {
      entPart = `Ent: ${scheme.porcentaje_entrega || 0}%`;
    }

    return `${engPart} | Mensualidades: ${montoStr} | ${entPart}`;
  }

  return `${engPart} | Escalonado (${tramos.length} tramos) | Ent: ${scheme.porcentaje_entrega || 0}%`;
}
