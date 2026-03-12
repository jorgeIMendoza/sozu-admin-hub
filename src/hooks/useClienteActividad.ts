import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInCalendarDays, parseISO } from "date-fns";

export type ActividadUrgencia = "green" | "orange" | "red";
export type ActividadTipo = "pago" | "mantenimiento" | "escrituracion" | "entrega" | "atraso";

export interface ActividadItem {
  id: string;
  tipo: ActividadTipo;
  proyecto: string;
  unidad: string;
  concepto: string;
  monto: number | null;
  fechaPago: string | null;
  diasRestantes: number | null;
  urgencia: ActividadUrgencia;
  mensaje: string;
  mensualidadesAtraso?: number;
  cuentaId?: number;
}

function calcularUrgencia(diasRestantes: number): ActividadUrgencia {
  if (diasRestantes <= 5) return "red";
  if (diasRestantes <= 10) return "orange";
  return "green";
}

const URGENCIA_BORDER: Record<ActividadUrgencia, string> = {
  green: "border-l-[hsl(var(--inmob-green))]",
  orange: "border-l-amber-500",
  red: "border-l-destructive",
};

const URGENCIA_DOT: Record<ActividadUrgencia, string> = {
  green: "bg-[hsl(var(--inmob-green))]",
  orange: "bg-amber-500",
  red: "bg-destructive",
};

const URGENCIA_BADGE: Record<ActividadUrgencia, string> = {
  green: "bg-[hsl(var(--inmob-green))]/10 text-[hsl(var(--inmob-green))]",
  orange: "bg-amber-500/10 text-amber-500",
  red: "bg-destructive/10 text-destructive",
};

export { URGENCIA_BORDER, URGENCIA_DOT, URGENCIA_BADGE };

interface PropInfo {
  numero: string;
  proyecto: string;
  edificio: string;
  estatus: number;
}

export function useClienteActividad(personaId: number | null | undefined) {
  return useQuery({
    queryKey: ["cliente-actividad", personaId],
    queryFn: async (): Promise<ActividadItem[]> => {
      if (!personaId) return [];

      const items: ActividadItem[] = [];
      const today = new Date();

      // 1. Get all ofertas for this persona (as lead)
      const { data: ofertasDirectas, error: ofertasError } = await supabase
        .from("ofertas")
        .select("id, id_propiedad, id_producto")
        .eq("id_persona_lead", personaId)
        .eq("activo", true);

      // 1b. Also get ofertas where this persona is a co-owner (comprador)
      const { data: compradorCuentas } = await supabase
        .from("compradores")
        .select("id_cuenta_cobranza")
        .eq("id_persona", personaId)
        .eq("activo", true);

      let ofertasViaCopropiedad: typeof ofertasDirectas = [];
      if (compradorCuentas && compradorCuentas.length > 0) {
        const cuentaIds = [...new Set(compradorCuentas.map((c) => c.id_cuenta_cobranza))];
        const { data: cuentasData } = await supabase
          .from("cuentas_cobranza")
          .select("id_oferta")
          .in("id", cuentaIds)
          .eq("activo", true);

        if (cuentasData && cuentasData.length > 0) {
          const ofertaIdsFromCoprop = [...new Set(cuentasData.map((c) => c.id_oferta))];
          const { data: ofertasCoprop } = await supabase
            .from("ofertas")
            .select("id, id_propiedad, id_producto")
            .in("id", ofertaIdsFromCoprop)
            .eq("activo", true);
          ofertasViaCopropiedad = ofertasCoprop || [];
        }
      }

      // Merge and deduplicate ofertas
      const ofertasMap = new Map<number, any>();
      (ofertasDirectas || []).forEach((o) => ofertasMap.set(o.id, o));
      (ofertasViaCopropiedad || []).forEach((o) => ofertasMap.set(o.id, o));
      const ofertas = Array.from(ofertasMap.values());

      console.log("[useClienteActividad] personaId:", personaId, "ofertas (direct+coprop):", ofertas.length, "error:", ofertasError);

      if (ofertas.length === 0) return [];

      const ofertaIds = ofertas.map((o) => o.id);
      const propiedadIds = [...new Set(ofertas.map((o) => o.id_propiedad))];

      // Separate property ofertas from product ofertas
      const propertyOfertaIds = ofertas.filter((o: any) => !o.id_producto).map((o) => o.id);
      const productOfertaIds = new Set(ofertas.filter((o: any) => !!o.id_producto).map((o) => o.id));

      // 2. Get cuentas_cobranza for these ofertas
      const { data: cuentas, error: cuentasError } = await supabase
        .from("cuentas_cobranza")
        .select("id, id_oferta, id_propiedad, id_cuenta_cobranza_padre, precio_final")
        .in("id_oferta", ofertaIds)
        .eq("activo", true);

      console.log("[useClienteActividad] cuentas:", cuentas?.length, "error:", cuentasError);

      if (!cuentas || cuentas.length === 0) return [];

      // Main accounts: no parent AND not from product ofertas
      const mainCuentas = cuentas.filter((c) => !c.id_cuenta_cobranza_padre && !productOfertaIds.has(c.id_oferta));
      const mainCuentaIds = mainCuentas.map((c) => c.id);

      // Maintenance accounts (have parent)
      const mantoCuentas = cuentas.filter((c) => !!c.id_cuenta_cobranza_padre);
      const mantoCuentaIds = mantoCuentas.map((c) => c.id);

      // Also find maintenance accounts that are children of main cuentas
      const { data: mantoCuentasHijas } = await supabase
        .from("cuentas_cobranza")
        .select("id, id_cuenta_cobranza_padre")
        .in("id_cuenta_cobranza_padre", mainCuentaIds)
        .eq("activo", true);

      const allMantoCuentaIds = [
        ...mantoCuentaIds,
        ...(mantoCuentasHijas?.map((c) => c.id) || []),
      ];
      const uniqueMantoCuentaIds = [...new Set(allMantoCuentaIds)];

      // 3. Get property info with project name
      const allPropIds = [
        ...new Set([
          ...propiedadIds,
          ...mainCuentas.map((c) => c.id_propiedad).filter(Boolean) as number[],
        ]),
      ];

      const { data: propiedades, error: propError } = await supabase
        .from("propiedades")
        .select(`
          id,
          numero_propiedad,
          id_estatus_disponibilidad,
          id_edificio_modelo
        `)
        .in("id", allPropIds);

      // Fetch building/project info separately to avoid nested join issues
      const edificioModeloIds = [...new Set(propiedades?.map((p: any) => p.id_edificio_modelo).filter(Boolean) || [])];
      
      let buildingMap = new Map<number, { edificioNombre: string; proyectoNombre: string }>();
      
      if (edificioModeloIds.length > 0) {
        const { data: emData, error: emError } = await supabase
          .from("edificios_modelos")
          .select("id, id_edificio, edificios:edificios_modelos_id_edificio_fkey!inner(nombre, id_proyecto, proyectos:edificios_id_proyecto_fkey!inner(nombre))")
          .in("id", edificioModeloIds);
        
        console.log("[useClienteActividad] emData:", emData?.length, "error:", emError);
        
        emData?.forEach((em: any) => {
          const ed = em.edificios;
          buildingMap.set(em.id, {
            edificioNombre: ed?.nombre || "",
            proyectoNombre: ed?.proyectos?.nombre || "Proyecto",
          });
        });
      }

      // Build property lookup
      const propMap = new Map<number, PropInfo>();

      propiedades?.forEach((p: any) => {
        const building = buildingMap.get(p.id_edificio_modelo);
        propMap.set(p.id, {
          numero: p.numero_propiedad,
          proyecto: building?.proyectoNombre || "Proyecto",
          edificio: building?.edificioNombre || "",
          estatus: p.id_estatus_disponibilidad,
        });
      });

      // Helper: get prop info for a cuenta
      const getPropForCuenta = (cuentaId: number): PropInfo | null => {
        const cuenta = mainCuentas.find((c) => c.id === cuentaId);
        if (!cuenta) return null;
        const propId = cuenta.id_propiedad;
        if (!propId) {
          const oferta = ofertas.find((o) => o.id === cuenta.id_oferta);
          if (oferta) return propMap.get(oferta.id_propiedad) || null;
          return null;
        }
        return propMap.get(propId) || null;
      };

      // 4. Get ALL unpaid acuerdos_pago for main cuentas
      if (mainCuentaIds.length > 0) {
        // Use explicit FK name to avoid ambiguity with duplicate foreign keys
        const { data: acuerdosPago, error: apError } = await supabase
          .from("acuerdos_pago")
          .select("id, id_cuenta_cobranza, id_concepto, monto, fecha_pago, orden, conceptos_pago!acuerdos_pago_id_concepto_fkey(nombre)")
          .in("id_cuenta_cobranza", mainCuentaIds)
          .eq("pago_completado", false)
          .eq("activo", true)
          .not("fecha_pago", "is", null)
          .order("fecha_pago", { ascending: true });

        console.log("[useClienteActividad] acuerdosPago:", acuerdosPago?.length, "error:", apError);

        // If explicit FK fails, try without the join
        let finalAcuerdos: any[] | null = acuerdosPago as any;
        if (apError) {
          console.warn("[useClienteActividad] FK join failed, trying without join:", apError.message);
          const { data: fallback } = await supabase
            .from("acuerdos_pago")
            .select("id, id_cuenta_cobranza, id_concepto, monto, fecha_pago, orden")
            .in("id_cuenta_cobranza", mainCuentaIds)
            .eq("pago_completado", false)
            .eq("activo", true)
            .not("fecha_pago", "is", null)
            .order("fecha_pago", { ascending: true });
          finalAcuerdos = fallback;
        }

        // Filter out zero-amount acuerdos (fully paid but not marked as completed)
        const validAcuerdos = (finalAcuerdos || []).filter((ap: any) => ap.monto > 0);

        if (validAcuerdos.length > 0) {
          // Group overdue payments by cuenta (property) to show a summary
          const overdueByCuenta = new Map<number, { count: number; totalMonto: number; oldestDate: string; conceptos: string[] }>();
          const upcomingPayments: any[] = [];

          validAcuerdos.forEach((ap: any) => {
            const fechaPago = ap.fecha_pago ? parseISO(ap.fecha_pago) : null;
            if (!fechaPago) return;

            const dias = differenceInCalendarDays(fechaPago, today);
            const conceptoNombre = ap.conceptos_pago?.nombre || "Pago";

            if (dias < 0) {
              // Overdue — group by cuenta
              const existing = overdueByCuenta.get(ap.id_cuenta_cobranza);
              if (existing) {
                existing.count += 1;
                existing.totalMonto += ap.monto || 0;
                existing.conceptos.push(conceptoNombre);
                if (ap.fecha_pago < existing.oldestDate) {
                  existing.oldestDate = ap.fecha_pago;
                }
              } else {
                overdueByCuenta.set(ap.id_cuenta_cobranza, {
                  count: 1,
                  totalMonto: ap.monto || 0,
                  oldestDate: ap.fecha_pago,
                  conceptos: [conceptoNombre],
                });
              }
            } else if (dias <= 15) {
              // Upcoming within 15 days — show individually
              upcomingPayments.push(ap);
            }
          });

          // Add overdue summary items per property (skip if total monto is 0)
          overdueByCuenta.forEach((info, cuentaId) => {
            if (info.totalMonto <= 0) return; // Skip fully paid accounts
            const prop = getPropForCuenta(cuentaId);

            // Build concept label from actual concept names
            let conceptoLabel: string;
            if (info.count === 1) {
              conceptoLabel = `${info.conceptos[0]} atrasado`;
            } else {
              // Check if all are the same concept
              const uniqueConceptos = [...new Set(info.conceptos)];
              if (uniqueConceptos.length === 1) {
                conceptoLabel = `${info.count} pagos de ${uniqueConceptos[0].toLowerCase()} atrasados`;
              } else {
                conceptoLabel = `${info.count} pagos atrasados`;
              }
            }

            items.push({
              id: `atraso-${cuentaId}`,
              tipo: "atraso",
              proyecto: prop?.proyecto || "Proyecto",
              unidad: prop?.numero || "",
              concepto: conceptoLabel,
              monto: info.totalMonto,
              fechaPago: info.oldestDate,
              diasRestantes: differenceInCalendarDays(parseISO(info.oldestDate), today),
              urgencia: "red",
              mensaje: `${info.count} pago${info.count !== 1 ? "s" : ""} vencido${info.count !== 1 ? "s" : ""} — requiere atención inmediata`,
              mensualidadesAtraso: info.count,
              cuentaId,
            });
          });

          // Add upcoming individual payments
          upcomingPayments.forEach((ap: any) => {
            const fechaPago = parseISO(ap.fecha_pago);
            const dias = differenceInCalendarDays(fechaPago, today);
            const prop = getPropForCuenta(ap.id_cuenta_cobranza);
            const concepto = ap.conceptos_pago?.nombre || "Pago";
            const urgencia = dias === 0 ? "red" : calcularUrgencia(dias);

            items.push({
              id: `pago-${ap.id}`,
              tipo: "pago",
              proyecto: prop?.proyecto || "Proyecto",
              unidad: prop?.numero || "",
              concepto,
              monto: ap.monto,
              fechaPago: ap.fecha_pago,
              diasRestantes: dias,
              urgencia,
              mensaje: dias === 0
                ? "Vence hoy"
                : `Faltan ${dias} día${dias !== 1 ? "s" : ""} para tu pago`,
              cuentaId: ap.id_cuenta_cobranza,
            });
          });
        }
      }

      // 5. Get upcoming maintenance payments
      if (uniqueMantoCuentaIds.length > 0) {
        const { data: acuerdosManto, error: mantoError } = await supabase
          .from("acuerdos_pago")
          .select("id, id_cuenta_cobranza, monto, fecha_pago, conceptos_pago!acuerdos_pago_id_concepto_fkey(nombre)")
          .in("id_cuenta_cobranza", uniqueMantoCuentaIds)
          .eq("pago_completado", false)
          .eq("activo", true)
          .not("fecha_pago", "is", null)
          .order("fecha_pago", { ascending: true });

        let finalManto: any[] | null = acuerdosManto as any;
        if (mantoError) {
          const { data: fallback } = await supabase
            .from("acuerdos_pago")
            .select("id, id_cuenta_cobranza, monto, fecha_pago")
            .in("id_cuenta_cobranza", uniqueMantoCuentaIds)
            .eq("pago_completado", false)
            .eq("activo", true)
            .not("fecha_pago", "is", null)
            .order("fecha_pago", { ascending: true })
            .limit(10);
          finalManto = fallback;
        }

        // Find parent cuenta for maintenance accounts
        const mantoParentMap = new Map<number, number>();
        mantoCuentasHijas?.forEach((c) => {
          if (c.id_cuenta_cobranza_padre) {
            mantoParentMap.set(c.id, c.id_cuenta_cobranza_padre);
          }
        });
        mantoCuentas.forEach((c) => {
          if (c.id_cuenta_cobranza_padre) {
            mantoParentMap.set(c.id, c.id_cuenta_cobranza_padre);
          }
        });

        // Group maintenance payments by parent cuenta (property) into a single summary
        const mantoByCuenta = new Map<number, { count: number; totalMonto: number; oldestDate: string; newestDate: string; oldestDias: number; newestDias: number; prop: PropInfo | null }>();

        finalManto?.forEach((ap: any) => {
          if (ap.monto <= 0) return;
          const fechaPago = ap.fecha_pago ? parseISO(ap.fecha_pago) : null;
          if (!fechaPago) return;

          const dias = differenceInCalendarDays(fechaPago, today);

          const parentId = mantoParentMap.get(ap.id_cuenta_cobranza);
          // Use parentId or the cuenta itself as grouping key
          const groupKey = parentId || ap.id_cuenta_cobranza;

          let prop: PropInfo | null = null;
          if (parentId) {
            prop = getPropForCuenta(parentId);
          }

          const existing = mantoByCuenta.get(groupKey);
          if (existing) {
            existing.count += 1;
            existing.totalMonto += ap.monto || 0;
            if (ap.fecha_pago < existing.oldestDate) {
              existing.oldestDate = ap.fecha_pago;
              existing.oldestDias = dias;
            }
            if (ap.fecha_pago > existing.newestDate) {
              existing.newestDate = ap.fecha_pago;
              existing.newestDias = dias;
            }
          } else {
            mantoByCuenta.set(groupKey, {
              count: 1,
              totalMonto: ap.monto || 0,
              oldestDate: ap.fecha_pago,
              newestDate: ap.fecha_pago,
              oldestDias: dias,
              newestDias: dias,
              prop: prop || existing?.prop || null,
            });
          }
        });

        mantoByCuenta.forEach((info, groupKey) => {
          const oldestAbsDias = Math.abs(info.oldestDias);
          const newestAbsDias = Math.abs(info.newestDias);
          let mensaje: string;

          if (info.oldestDias < 0) {
            // All or some are overdue
            if (info.count === 1) {
              mensaje = `Vencido hace ${oldestAbsDias} día${oldestAbsDias !== 1 ? "s" : ""}`;
            } else {
              mensaje = `Adeudo más antiguo: hace ${oldestAbsDias} días — más reciente: hace ${newestAbsDias} días`;
            }
          } else if (info.oldestDias === 0) {
            mensaje = "Vence hoy";
          } else {
            mensaje = `Próximo pago en ${info.oldestDias} día${info.oldestDias !== 1 ? "s" : ""}`;
          }

          items.push({
            id: `manto-${groupKey}`,
            tipo: "mantenimiento",
            proyecto: info.prop?.proyecto || "Proyecto",
            unidad: info.prop?.numero || "",
            concepto: info.count === 1 ? "Mantenimiento" : `${info.count} pagos de mantenimiento`,
            monto: info.totalMonto,
            fechaPago: info.oldestDate,
            diasRestantes: info.oldestDias,
            urgencia: info.oldestDias < 0 ? "red" : info.oldestDias <= 10 ? "orange" : "green",
            mensaje,
            cuentaId: groupKey,
          });
        });
      }

      // 6. Check property status notifications (only for real properties, not products)
      // Build set of property IDs that come from product ofertas
      const productPropIds = new Set(
        ofertas.filter((o: any) => !!o.id_producto).map((o: any) => o.id_propiedad)
      );

      propiedades?.forEach((p: any) => {
        const prop = propMap.get(p.id);
        if (!prop) return;
        // Skip product-based properties
        if (productPropIds.has(p.id)) return;

        if (prop.estatus === 9) {
          items.push({
            id: `escrituracion-${p.id}`,
            tipo: "escrituracion",
            proyecto: prop.proyecto,
            unidad: prop.numero,
            concepto: "Escrituración",
            monto: null,
            fechaPago: null,
            diasRestantes: null,
            urgencia: "green",
            mensaje: "Tu unidad está lista para formalizarse ante notario",
          });
        }

        if (prop.estatus === 7) {
          items.push({
            id: `entrega-${p.id}`,
            tipo: "entrega",
            proyecto: prop.proyecto,
            unidad: prop.numero,
            concepto: "Entrega",
            monto: null,
            fechaPago: null,
            diasRestantes: null,
            urgencia: "green",
            mensaje: "Tu unidad está lista para entrega. Agenda tu cita",
          });
        }
      });

      // Sort: atrasos first (red, most overdue), then upcoming by proximity, then status items last
      items.sort((a, b) => {
        // Atrasos always first
        if (a.tipo === "atraso" && b.tipo !== "atraso") return -1;
        if (a.tipo !== "atraso" && b.tipo === "atraso") return 1;

        if (a.diasRestantes === null && b.diasRestantes === null) return 0;
        if (a.diasRestantes === null) return 1;
        if (b.diasRestantes === null) return -1;
        return a.diasRestantes - b.diasRestantes;
      });

      console.log("[useClienteActividad] final items:", items.length);
      return items;
    },
    enabled: !!personaId,
    staleTime: 5 * 60 * 1000,
  });
}
