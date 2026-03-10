import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ResumenFinancieroData {
  totalInvested: number;
  totalPaid: number;
  totalPending: number;
  appreciationPercent: number;
  isAppreciation: boolean; // true = appreciation, false = depreciation
  properties: PropertyFinancialSummary[];
}

export interface PropertyFinancialSummary {
  cuentaId: number;
  ofertaId: number;
  propiedadId: number;
  proyecto: string;
  edificio: string;
  unidad: string;
  precioFinal: number;
  totalPaid: number;
  pending: number;
  m2Total: number;
  precioM2Compra: number;
  precioM2Actual: number;
  appreciationPercent: number;
}

export function useClienteResumenFinanciero(personaId: number | null | undefined) {
  return useQuery({
    queryKey: ["cliente-resumen-financiero", personaId],
    queryFn: async (): Promise<ResumenFinancieroData> => {
      if (!personaId) return { totalInvested: 0, totalPaid: 0, totalPending: 0, appreciationPercent: 0, isAppreciation: true, properties: [] };

      // 1. Get all ofertas (direct + co-ownership)
      const { data: ofertasDirectas } = await supabase
        .from("ofertas")
        .select("id, id_propiedad, id_producto")
        .eq("id_persona_lead", personaId)
        .eq("activo", true);

      const { data: compradorCuentas } = await supabase
        .from("compradores")
        .select("id_cuenta_cobranza")
        .eq("id_persona", personaId)
        .eq("activo", true);

      let ofertasViaCoprop: typeof ofertasDirectas = [];
      if (compradorCuentas && compradorCuentas.length > 0) {
        const cuentaIds = [...new Set(compradorCuentas.map((c) => c.id_cuenta_cobranza))];
        const { data: cuentasData } = await supabase
          .from("cuentas_cobranza")
          .select("id_oferta")
          .in("id", cuentaIds)
          .eq("activo", true);

        if (cuentasData && cuentasData.length > 0) {
          const ofertaIds = [...new Set(cuentasData.map((c) => c.id_oferta))];
          const { data } = await supabase
            .from("ofertas")
            .select("id, id_propiedad, id_producto")
            .in("id", ofertaIds)
            .eq("activo", true);
          ofertasViaCoprop = data || [];
        }
      }

      const ofertasMap = new Map<number, any>();
      (ofertasDirectas || []).forEach((o) => ofertasMap.set(o.id, o));
      (ofertasViaCoprop || []).forEach((o) => ofertasMap.set(o.id, o));
      // Only non-product ofertas (real properties)
      const ofertas = Array.from(ofertasMap.values()).filter((o: any) => !o.id_producto);

      if (ofertas.length === 0) return { totalInvested: 0, totalPaid: 0, totalPending: 0, appreciationPercent: 0, isAppreciation: true, properties: [] };

      const ofertaIds = ofertas.map((o) => o.id);

      // 2. Get main cuentas_cobranza (no parent = main property accounts)
      const { data: cuentas } = await supabase
        .from("cuentas_cobranza")
        .select("id, id_oferta, id_propiedad, precio_final, id_cuenta_cobranza_padre")
        .in("id_oferta", ofertaIds)
        .eq("activo", true);

      const mainCuentas = (cuentas || []).filter((c) => !c.id_cuenta_cobranza_padre);
      if (mainCuentas.length === 0) return { totalInvested: 0, totalPaid: 0, totalPending: 0, appreciationPercent: 0, isAppreciation: true, properties: [] };

      const mainCuentaIds = mainCuentas.map((c) => c.id);

      // 3. Get total paid per cuenta
      const { data: pagos } = await supabase
        .from("pagos")
        .select("id_cuenta_cobranza, monto")
        .in("id_cuenta_cobranza", mainCuentaIds)
        .eq("activo", true);

      const paidByCuenta = new Map<number, number>();
      (pagos || []).forEach((p) => {
        paidByCuenta.set(p.id_cuenta_cobranza, (paidByCuenta.get(p.id_cuenta_cobranza) || 0) + p.monto);
      });

      // 4. Get property details (m2) and project info (precio_m2_actual)
      const propiedadIds = [...new Set(mainCuentas.map((c) => c.id_propiedad || ofertas.find((o) => o.id === c.id_oferta)?.id_propiedad).filter(Boolean))] as number[];

      const { data: propiedades } = await supabase
        .from("propiedades")
        .select("id, m2_interiores, m2_exteriores, precio_lista, id_edificio_modelo, numero_propiedad")
        .in("id", propiedadIds);

      // Get edificios_modelos → edificios → proyectos for precio_m2_actual
      const emIds = [...new Set((propiedades || []).map((p) => p.id_edificio_modelo).filter(Boolean))];
      let buildingMap = new Map<number, { edificio: string; proyecto: string; proyectoId: number }>();
      let projectPriceMap = new Map<number, number>(); // proyectoId → precio_m2_actual

      if (emIds.length > 0) {
        const { data: emData } = await supabase
          .from("edificios_modelos")
          .select("id, id_edificio, edificios:edificios_modelos_id_edificio_fkey!inner(nombre, id_proyecto, proyectos:edificios_id_proyecto_fkey!inner(id, nombre, precio_m2_actual))")
          .in("id", emIds);

        emData?.forEach((em: any) => {
          const ed = em.edificios;
          const proj = ed?.proyectos;
          buildingMap.set(em.id, {
            edificio: ed?.nombre || "",
            proyecto: proj?.nombre || "Proyecto",
            proyectoId: proj?.id || 0,
          });
          if (proj?.id && proj?.precio_m2_actual) {
            projectPriceMap.set(proj.id, proj.precio_m2_actual);
          }
        });
      }

      // 5. Build per-property summaries
      const properties: PropertyFinancialSummary[] = [];
      let totalInvested = 0;
      let totalPaid = 0;
      let totalCurrentValue = 0;
      let totalOriginalValue = 0;

      mainCuentas.forEach((cuenta) => {
        const propId = cuenta.id_propiedad || ofertas.find((o) => o.id === cuenta.id_oferta)?.id_propiedad;
        const prop = propiedades?.find((p) => p.id === propId);
        const building = prop ? buildingMap.get(prop.id_edificio_modelo) : null;

        const precioFinal = cuenta.precio_final || 0;
        const paid = paidByCuenta.get(cuenta.id) || 0;
        const m2Total = prop ? (prop.m2_interiores || 0) + (prop.m2_exteriores || 0) : 0;
        const precioM2Compra = m2Total > 0 ? precioFinal / m2Total : 0;
        const precioM2Actual = building ? (projectPriceMap.get(building.proyectoId) || 0) : 0;
        const currentValue = precioM2Actual > 0 && m2Total > 0 ? precioM2Actual * m2Total : precioFinal;
        const appPercent = precioFinal > 0 ? ((currentValue - precioFinal) / precioFinal) * 100 : 0;

        totalInvested += precioFinal;
        totalPaid += paid;
        totalCurrentValue += currentValue;
        totalOriginalValue += precioFinal;

        properties.push({
          cuentaId: cuenta.id,
          ofertaId: cuenta.id_oferta || 0,
          propiedadId: propId || 0,
          proyecto: building?.proyecto || "Proyecto",
          edificio: building?.edificio || "",
          unidad: prop?.numero_propiedad || "",
          precioFinal,
          totalPaid: paid,
          pending: Math.max(0, precioFinal - paid),
          m2Total,
          precioM2Compra,
          precioM2Actual,
          appreciationPercent: appPercent,
        });
      });

      const totalAppPercent = totalOriginalValue > 0 ? ((totalCurrentValue - totalOriginalValue) / totalOriginalValue) * 100 : 0;

      return {
        totalInvested,
        totalPaid,
        totalPending: Math.max(0, totalInvested - totalPaid),
        appreciationPercent: Math.abs(totalAppPercent),
        isAppreciation: totalAppPercent >= 0,
        properties,
      };
    },
    enabled: !!personaId,
  });
}
