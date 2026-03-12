import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductoAdicional {
  id: number;
  nombre: string;
  precio: number;
  totalPaid: number;
  isFullyPaid: boolean;
}

export interface MantenimientoHistorial {
  id: number;
  fechaPago: string;
  monto: number;
  pagado: boolean;
}

export interface DocumentoPropiedad {
  id: number;
  tipoDocumento: string;
  idTipoDocumento: number;
  url: string;
}

export interface ParcialidadDetalle {
  id: number;
  fechaPago: string;
  monto: number;
  montoPagado: number;
  saldoPendiente: number;
  pagado: boolean;
  orden: number;
  concepto: string;
}

export interface PagoReciente {
  id: number;
  fechaPago: string;
  monto: number;
}

export interface PropiedadDetalle {
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
  imageUrl: string;
  direccion: string;
  fechaEntrega: string | null;
  valorEstimado: number;
  estatusPropiedad: number;
  estatusNombre: string;
  proximoMantenimiento: string | null;
  mantenimientosAtrasados: number;
  cuotaMensualMantenimiento: number;
  mantenimientoHistorial: MantenimientoHistorial[];
  mantenimientoTotalPagado: number;
  productosAdicionales: ProductoAdicional[];
  documentos: DocumentoPropiedad[];
  fechaCompra: string | null;
  mantenimientoCuentaId: number | null;
  mantenimientoClabeStp: string | null;
  beneficiarioNombre: string | null;
  propiedadClabeStp: string | null;
  propiedadBeneficiarioNombre: string | null;
  parcialidades: ParcialidadDetalle[];
  ultimosPagos: PagoReciente[];
}

export function useClientePropiedadDetalle(cuentaId: number | null | undefined) {
  return useQuery({
    queryKey: ["cliente-propiedad-detalle", cuentaId],
    queryFn: async (): Promise<PropiedadDetalle | null> => {
      if (!cuentaId) return null;

      // 1. Get cuenta cobranza
      const { data: cuenta } = await supabase
        .from("cuentas_cobranza")
        .select("id, id_oferta, id_propiedad, precio_final, fecha_creacion, clabe_stp")
        .eq("id", cuentaId)
        .eq("activo", true)
        .maybeSingle();

      if (!cuenta) return null;

      // 2. Get oferta info
      const { data: oferta } = await supabase
        .from("ofertas")
        .select("id, id_propiedad, fecha_creacion")
        .eq("id", cuenta.id_oferta)
        .maybeSingle();

      const propiedadId = cuenta.id_propiedad || oferta?.id_propiedad;
      if (!propiedadId) return null;

      // 3. Parallel fetches
      const [
        { data: propiedad },
        { data: pagos },
        { data: childCuentas },
        { data: productOfertas },
        { data: acuerdosProp },
        { data: recentPagos },
      ] = await Promise.all([
        supabase
          .from("propiedades")
          .select("id, m2_interiores, m2_exteriores, precio_lista, id_edificio_modelo, numero_propiedad, id_estatus_disponibilidad, numero_piso, id_entidad_relacionada_dueno")
          .eq("id", propiedadId)
          .maybeSingle(),
        supabase
          .from("pagos")
          .select("monto")
          .eq("id_cuenta_cobranza", cuentaId)
          .eq("activo", true),
        supabase
          .from("cuentas_cobranza")
          .select("id, id_oferta, clabe_stp")
          .eq("id_cuenta_cobranza_padre", cuentaId)
          .eq("activo", true),
        // Product ofertas linked to same persona
        supabase
          .from("ofertas")
          .select("id, id_producto, id_propiedad")
          .eq("id_propiedad", propiedadId)
          .eq("activo", true)
          .not("id_producto", "is", null),
        // Acuerdos de pago (parcialidades) for property cuenta
        supabase
          .from("acuerdos_pago")
          .select("id, fecha_pago, monto, pago_completado, orden, conceptos_pago!acuerdos_pago_id_concepto_fkey(nombre)")
          .eq("id_cuenta_cobranza", cuentaId)
          .eq("activo", true)
          .order("orden", { ascending: true }),
        // Last 5 payments for property
        supabase
          .from("pagos")
          .select("id, fecha_pago, monto")
          .eq("id_cuenta_cobranza", cuentaId)
          .eq("activo", true)
          .order("fecha_pago", { ascending: false })
          .limit(5),
      ]);

      if (!propiedad) return null;

      const totalPaid = (pagos || []).reduce((s, p) => s + p.monto, 0);
      const precioFinal = cuenta.precio_final || 0;

      // 4. Get status name
      const { data: estatusData } = await supabase
        .from("estatus_disponibilidad")
        .select("nombre")
        .eq("id", propiedad.id_estatus_disponibilidad)
        .maybeSingle();

      // 5. Building/project info
      const { data: emData } = await supabase
        .from("edificios_modelos")
        .select("id, id_edificio, id_modelo, edificios:edificios_modelos_id_edificio_fkey!inner(nombre, id_proyecto, proyectos:edificios_id_proyecto_fkey!inner(id, nombre, precio_m2_actual, direccion, fecha_entrega, url_imagen_portada))")
        .eq("id", propiedad.id_edificio_modelo)
        .maybeSingle();

      const ed = (emData as any)?.edificios;
      const proj = ed?.proyectos;
      const proyectoId = proj?.id || 0;
      const precioM2Actual = proj?.precio_m2_actual || 0;

      // Model image
      let imageUrl = proj?.url_imagen_portada || "";
      if (emData?.id_modelo) {
        const { data: modelImg } = await (supabase as any)
          .from("multimedias_modelo")
          .select("url")
          .eq("id_modelo", emData.id_modelo)
          .eq("ver_como_imagen_de_propiedad", true)
          .eq("activo", true)
          .limit(1)
          .maybeSingle();
        if (modelImg?.url) imageUrl = modelImg.url;
      }

      const m2Total = (propiedad.m2_interiores || 0) + (propiedad.m2_exteriores || 0);
      const precioM2Compra = m2Total > 0 ? precioFinal / m2Total : 0;
      const currentValue = precioM2Actual > 0 && m2Total > 0 ? precioM2Actual * m2Total : precioFinal;
      const appPercent = precioFinal > 0 ? ((currentValue - precioFinal) / precioFinal) * 100 : 0;

      // 6. Maintenance child cuentas
      const childIds = (childCuentas || []).map(c => c.id);
      let cuotaMensual = 0;
      let mantenimientoHistorial: MantenimientoHistorial[] = [];
      let proximoMantenimiento: string | null = null;
      let mantenimientosAtrasados = 0;
      let mantenimientoTotalPagado = 0;
      const mantenimientoCuenta = (childCuentas || []).find(c => c.clabe_stp) || (childCuentas || [])[0] || null;
      const mantenimientoCuentaId = mantenimientoCuenta?.id || null;
      const mantenimientoClabeStp = mantenimientoCuenta?.clabe_stp || null;

      if (childIds.length > 0) {
        const [{ data: mantoAcuerdos }, { data: mantoPagos }] = await Promise.all([
          supabase
            .from("acuerdos_pago")
            .select("id, id_cuenta_cobranza, fecha_pago, monto, pago_completado")
            .in("id_cuenta_cobranza", childIds)
            .eq("activo", true)
            .order("fecha_pago", { ascending: true }),
          supabase
            .from("pagos")
            .select("monto")
            .in("id_cuenta_cobranza", childIds)
            .eq("activo", true),
        ]);

        mantenimientoTotalPagado = (mantoPagos || []).reduce((s, p) => s + p.monto, 0);
        const today = new Date().toISOString().slice(0, 10);

        (mantoAcuerdos || []).forEach(a => {
          if (a.monto && a.monto > cuotaMensual) cuotaMensual = a.monto;
          
          mantenimientoHistorial.push({
            id: a.id,
            fechaPago: a.fecha_pago || "",
            monto: a.monto,
            pagado: a.pago_completado,
          });

          if (!a.pago_completado && a.fecha_pago) {
            if (!proximoMantenimiento) proximoMantenimiento = a.fecha_pago;
            if (a.fecha_pago < today) mantenimientosAtrasados++;
          }
        });
      }

      // 6b. Beneficiario from the entity that owns the parent STP account
      let beneficiarioNombre: string | null = null;
      if (mantenimientoClabeStp) {
        const cuentaMadrePrefix = mantenimientoClabeStp.substring(0, 14);
        const { data: erData } = await supabase
          .from("entidades_relacionadas")
          .select("personas:entidades_relacionadas_id_persona_fkey(nombre_legal)")
          .eq("cuenta_madre_stp", cuentaMadrePrefix)
          .eq("activo", true)
          .limit(1)
          .maybeSingle();
        beneficiarioNombre = (erData as any)?.personas?.nombre_legal || null;
      }

      // 6c. Property beneficiario from the entity that owns the parent STP account
      let propiedadBeneficiarioNombre: string | null = null;
      const propiedadClabeStp = cuenta.clabe_stp || null;
      if (propiedadClabeStp) {
        const propCuentaMadrePrefix = propiedadClabeStp.substring(0, 14);
        const { data: propErData } = await supabase
          .from("entidades_relacionadas")
          .select("personas:entidades_relacionadas_id_persona_fkey(nombre_legal)")
          .eq("cuenta_madre_stp", propCuentaMadrePrefix)
          .eq("activo", true)
          .limit(1)
          .maybeSingle();
        propiedadBeneficiarioNombre = (propErData as any)?.personas?.nombre_legal || null;
      }

      // 7. Product details
      const productosAdicionales: ProductoAdicional[] = [];
      if (productOfertas && productOfertas.length > 0) {
        const productOfertaIds = productOfertas.map(o => o.id);
        const productIds = [...new Set(productOfertas.map(o => o.id_producto).filter(Boolean))] as number[];

        const [{ data: productCuentas }, { data: productos }] = await Promise.all([
          supabase
            .from("cuentas_cobranza")
            .select("id, id_oferta, precio_final")
            .in("id_oferta", productOfertaIds)
            .eq("activo", true),
          supabase
            .from("productos_servicios")
            .select("id, nombre, precio_lista")
            .in("id", productIds),
        ]);

        if (productCuentas && productCuentas.length > 0) {
          const prodCuentaIds = productCuentas.map(c => c.id);
          const { data: prodPagos } = await supabase
            .from("pagos")
            .select("id_cuenta_cobranza, monto")
            .in("id_cuenta_cobranza", prodCuentaIds)
            .eq("activo", true);

          const paidByProdCuenta = new Map<number, number>();
          (prodPagos || []).forEach(p => {
            paidByProdCuenta.set(p.id_cuenta_cobranza, (paidByProdCuenta.get(p.id_cuenta_cobranza) || 0) + p.monto);
          });

          productCuentas.forEach(pc => {
            const ofertaProd = productOfertas.find(o => o.id === pc.id_oferta);
            const prod = productos?.find(p => p.id === ofertaProd?.id_producto);
            if (prod) {
              const paid = paidByProdCuenta.get(pc.id) || 0;
              productosAdicionales.push({
                id: prod.id,
                nombre: prod.nombre,
                precio: pc.precio_final || prod.precio_lista || 0,
                totalPaid: paid,
                isFullyPaid: paid >= (pc.precio_final || 0),
              });
            }
          });
        }
      }

      // 8. Documents
      const { data: docs } = await supabase
        .from("documentos")
        .select("id, url, id_tipo_documento, tipos_documento:documentos_id_tipo_documento_fkey!inner(nombre)")
        .or(`id_propiedad.eq.${propiedadId},id_cuenta_cobranza.eq.${cuentaId}`)
        .eq("activo", true)
        .eq("es_draft", false);

      const documentos: DocumentoPropiedad[] = (docs || []).map((d: any) => ({
        id: d.id,
        tipoDocumento: d.tipos_documento?.nombre || "Documento",
        idTipoDocumento: d.id_tipo_documento,
        url: d.url,
      }));

      // 9. Parcialidades - fetch aplicaciones_pago to know partial payments
      const acuerdoPropIds = (acuerdosProp || []).map((a: any) => a.id);
      let aplicacionesByAcuerdo = new Map<number, number>();
      if (acuerdoPropIds.length > 0) {
        const { data: aplicaciones } = await supabase
          .from("aplicaciones_pago")
          .select("id_acuerdo_pago, monto")
          .in("id_acuerdo_pago", acuerdoPropIds)
          .eq("activo", true)
          .eq("es_multa", false);
        (aplicaciones || []).forEach(ap => {
          aplicacionesByAcuerdo.set(ap.id_acuerdo_pago, (aplicacionesByAcuerdo.get(ap.id_acuerdo_pago) || 0) + ap.monto);
        });
      }

      const parcialidades: ParcialidadDetalle[] = (acuerdosProp || []).map((a: any) => {
        const montoPagado = aplicacionesByAcuerdo.get(a.id) || 0;
        return {
          id: a.id,
          fechaPago: a.fecha_pago || "",
          monto: a.monto,
          montoPagado,
          saldoPendiente: Math.max(0, a.monto - montoPagado),
          pagado: a.pago_completado,
          orden: a.orden,
          concepto: a.conceptos_pago?.nombre || `Parcialidad #${a.orden}`,
        };
      });

      const ultimosPagos: PagoReciente[] = (recentPagos || []).map((p: any) => ({
        id: p.id,
        fechaPago: p.fecha_pago,
        monto: p.monto,
      }));

      return {
        cuentaId: cuenta.id,
        ofertaId: cuenta.id_oferta || 0,
        propiedadId,
        proyecto: proj?.nombre || "Proyecto",
        edificio: ed?.nombre || "",
        unidad: propiedad.numero_propiedad || "",
        precioFinal,
        totalPaid,
        pending: Math.max(0, precioFinal - totalPaid),
        m2Total,
        precioM2Compra,
        precioM2Actual,
        appreciationPercent: appPercent,
        imageUrl,
        direccion: proj?.direccion || "",
        fechaEntrega: proj?.fecha_entrega || null,
        valorEstimado: currentValue,
        estatusPropiedad: propiedad.id_estatus_disponibilidad,
        estatusNombre: estatusData?.nombre || "",
        proximoMantenimiento,
        mantenimientosAtrasados,
        cuotaMensualMantenimiento: cuotaMensual,
        mantenimientoHistorial,
        mantenimientoTotalPagado,
        productosAdicionales,
        documentos,
        fechaCompra: oferta?.fecha_creacion || cuenta.fecha_creacion || null,
        mantenimientoCuentaId,
        mantenimientoClabeStp,
        beneficiarioNombre,
        propiedadClabeStp,
        propiedadBeneficiarioNombre,
        parcialidades,
        ultimosPagos,
      };
    },
    enabled: !!cuentaId,
  });
}
