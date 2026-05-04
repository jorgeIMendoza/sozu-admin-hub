import { supabase } from "@/integrations/supabase/client";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import jsPDF from "jspdf";

interface EstadoCuentaData {
  id_cuenta: number;
}

export class EstadoCuentaService {
  async generateEstadoCuenta(data: EstadoCuentaData): Promise<void> {
    try {
      // Fetch cuenta de cobranza details
      const { data: cuentaData, error: cuentaError } = await supabase
        .from("cuentas_cobranza")
        .select("*")
        .eq("id", data.id_cuenta)
        .single();

      if (cuentaError) throw cuentaError;

      // Fetch oferta details
      const { data: ofertaData, error: ofertaError } = await supabase
        .from("ofertas")
        .select(`
          id_propiedad, 
          id_producto,
          fecha_generacion,
          id_esquema_pago_seleccionado
        `)
        .eq("id", cuentaData.id_oferta)
        .single();
      
      // Fetch esquema de pago for contract info
      let esquemaPagoData = null;
      if (ofertaData?.id_esquema_pago_seleccionado) {
        const { data: esquema } = await supabase
          .from("esquemas_pago")
          .select("nombre, numero_mensualidades, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, porcentaje_descuento_aumento")
          .eq("id", ofertaData.id_esquema_pago_seleccionado)
          .maybeSingle();
        esquemaPagoData = esquema;
      }

      if (ofertaError) throw ofertaError;

      // Fetch compradores
      const { data: compradores, error: compradoresError } = await supabase
        .from("compradores")
        .select("*, personas!compradores_id_persona_fkey(*)")
        .eq("id_cuenta_cobranza", data.id_cuenta)
        .eq("activo", true);

      if (compradoresError) throw compradoresError;

      // Fetch acuerdos de pago
      const { data: acuerdos, error: acuerdosError } = await supabase
        .from("acuerdos_pago")
        .select("*, conceptos_pago!acuerdos_pago_id_concepto_fkey(nombre)")
        .eq("id_cuenta_cobranza", data.id_cuenta)
        .eq("activo", true)
        .order("orden", { ascending: true });

      if (acuerdosError) throw acuerdosError;

      // Fetch multas - get them through acuerdos_pago since multas.id_acuerdo_pago references acuerdos_pago
      const acuerdoIds = (acuerdos || []).map((a: any) => a.id);
      let multas: any[] = [];
      if (acuerdoIds.length > 0) {
        // @ts-ignore - Type instantiation too deep
        const multasResult = await supabase
          .from("multas")
          .select("id, monto, descripcion, es_pagada, fecha_creacion, id_acuerdo_pago")
          .in("id_acuerdo_pago", acuerdoIds)
          .eq("activo", true)
          .order("fecha_creacion", { ascending: true });
        
        multas = (multasResult.data || []) as any[];
        if (multasResult.error) throw multasResult.error;
      }

      // Fetch pagos
      const { data: pagos, error: pagosError } = await supabase
        .from("pagos")
        .select(`
          *,
          metodos_pago!pagos_id_metodos_pago_fkey(nombre),
          aplicaciones_pago!fk_aplicaciones_pago_pago(
            monto,
            id_acuerdo_pago,
            es_multa
          )
        `)
        .eq("id_cuenta_cobranza", data.id_cuenta)
        .eq("activo", true)
        .order("fecha_pago", { ascending: true });

      if (pagosError) throw pagosError;

      // Fetch property details, project info, estacionamientos and bodegas
      let proyectoData = null;
      let propiedadData = null;
      let edificioData = null;
      let modeloData = null;
      let estacionamientos: any[] = [];
      let bodegas: any[] = [];
      let productoData = null;
      
      if (ofertaData.id_propiedad) {
        // Fetch property with edificio_modelo
        const { data: propiedad } = await supabase
          .from("propiedades")
          .select("id, numero_propiedad, numero_piso, id_edificio_modelo, id_entidad_relacionada_dueno")
          .eq("id", ofertaData.id_propiedad)
          .maybeSingle();

        propiedadData = propiedad;

        // Fetch edificio and modelo
        if (propiedad?.id_edificio_modelo) {
          const { data: edificioModelo } = await supabase
            .from("edificios_modelos")
            .select(`
              id,
              modelos!edificios_modelos_id_modelo_fkey(id, nombre),
              edificios!edificios_modelos_id_edificio_fkey(id, nombre, id_proyecto)
            `)
            .eq("id", propiedad.id_edificio_modelo)
            .maybeSingle();

          if (edificioModelo) {
            edificioData = edificioModelo.edificios;
            modeloData = edificioModelo.modelos;

            // Fetch project from edificio
            if (edificioModelo.edificios?.id_proyecto) {
              const { data: proyecto } = await supabase
                .from("proyectos")
                .select("*")
                .eq("id", edificioModelo.edificios.id_proyecto)
                .maybeSingle();
              proyectoData = proyecto;
            }
          }
        }

        // Fallback: fetch project from entidad_relacionada
        if (!proyectoData && propiedad?.id_entidad_relacionada_dueno) {
          const { data: entidadData } = await supabase
            .from("entidades_relacionadas")
            .select("id_proyecto")
            .eq("id", propiedad.id_entidad_relacionada_dueno)
            .maybeSingle();

          if (entidadData) {
            const { data: proyecto } = await supabase
              .from("proyectos")
              .select("*")
              .eq("id", entidadData.id_proyecto)
              .maybeSingle();
            proyectoData = proyecto;
          }
        }

        // Fetch estacionamientos y bodegas
        const [estResult, bodResult] = await Promise.all([
          supabase.from("estacionamientos").select("id, nombre, ubicacion").eq("id_propiedad", ofertaData.id_propiedad).eq("activo", true),
          supabase.from("bodegas").select("id, nombre, ubicacion").eq("id_propiedad", ofertaData.id_propiedad).eq("activo", true)
        ]);
        
        estacionamientos = estResult.data || [];
        bodegas = bodResult.data || [];
      }

      // Fetch producto if it's a product sale
      if (ofertaData.id_producto) {
        const { data: producto } = await supabase
          .from("productos_servicios")
          .select("id, nombre, id_categoria")
          .eq("id", ofertaData.id_producto)
          .maybeSingle();
        
        let categoriaData = null;
        if (producto?.id_categoria) {
          const { data: cat } = await supabase
            .from("categorias_producto")
            .select("id, nombre")
            .eq("id", producto.id_categoria)
            .maybeSingle();
          categoriaData = cat;
        }
        
        if (producto) {
          productoData = {
            id: producto.id,
            nombre: producto.nombre,
            categoria: categoriaData
          };
        }
      }

      // Calculate totals
      const precioFinal = cuentaData.precio_final || 0;
      const totalPagado = (pagos || []).reduce((sum, pago) => {
        const aplicacionesNoPagadas = (pago.aplicaciones_pago || []).filter(
          (ap: any) => !ap.es_multa
        );
        return sum + aplicacionesNoPagadas.reduce((s: number, ap: any) => s + (ap.monto || 0), 0);
      }, 0);

      const totalMultas = (pagos || []).reduce((sum, pago) => {
        const aplicacionesMultas = (pago.aplicaciones_pago || []).filter(
          (ap: any) => ap.es_multa
        );
        return sum + aplicacionesMultas.reduce((s: number, ap: any) => s + (ap.monto || 0), 0);
      }, 0);

      const saldoPendiente = precioFinal - totalPagado;

      // Generate PDF with native text
      await this.generateNativePDF({
        cuenta: cuentaData,
        oferta: ofertaData,
        esquemaPago: esquemaPagoData,
        compradores: compradores || [],
        acuerdos: acuerdos || [],
        multas: multas || [],
        pagos: pagos || [],
        proyecto: proyectoData,
        propiedad: propiedadData,
        edificio: edificioData,
        modelo: modeloData,
        producto: productoData,
        estacionamientos,
        bodegas,
        precioFinal,
        totalPagado,
        totalMultas,
        saldoPendiente,
        id_cuenta: data.id_cuenta,
      });
    } catch (error: any) {
      console.error("Error generating estado de cuenta:", error);
      console.error("Error message:", error?.message);
      console.error("Error stack:", error?.stack);
      throw error;
    }
  }

  private async generateNativePDF(data: any): Promise<void> {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    let y = margin;

    // Helper functions
    const formatMoney = (amount: number) => {
      const normalizedAmount = Math.abs(amount) < 0.01 ? 0 : amount;
      const safeAmount = normalizedAmount < 0 ? 0 : normalizedAmount;
      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
      }).format(safeAmount);
    };

    const formatMoneyAllowNegative = (amount: number) => {
      const normalizedAmount = Math.abs(amount) < 0.01 ? 0 : amount;
      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
      }).format(normalizedAmount);
    };

    const formatDate = (date: string) => {
      // Add T12:00:00 to avoid timezone issues when parsing date-only strings
      const dateStr = date.includes('T') ? date : `${date}T12:00:00`;
      return new Date(dateStr).toLocaleDateString("es-MX");
    };

    const checkNewPage = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - margin) {
        pdf.addPage();
        y = margin;
        return true;
      }
      return false;
    };

    const drawLine = (y1: number, color: string = "#e5e7eb") => {
      pdf.setDrawColor(color);
      pdf.setLineWidth(0.3);
      pdf.line(margin, y1, pageWidth - margin, y1);
    };

    // Colors
    const primaryColor = "#1a1a2e";
    const grayColor = "#666666";
    const lightGray = "#888888";

    // === HEADER ===
    pdf.setFontSize(18);
    pdf.setTextColor(primaryColor);
    pdf.setFont("helvetica", "bold");
    pdf.text(data.proyecto?.nombre || "Estado de Cuenta", margin, y + 6);

    pdf.setFontSize(9);
    pdf.setTextColor(grayColor);
    pdf.setFont("helvetica", "normal");
    pdf.text(data.proyecto?.direccion || "", margin, y + 12);

    // Account number (right side)
    const cuentaId = formatCuentaCobranzaId(
      data.cuenta.id,
      data.oferta.id_producto ? "Producto" : "Propiedad"
    );
    pdf.setFontSize(8);
    pdf.setTextColor(lightGray);
    pdf.text("CUENTA", pageWidth - margin, y + 2, { align: "right" });
    
    pdf.setFontSize(14);
    pdf.setTextColor(primaryColor);
    pdf.setFont("helvetica", "bold");
    pdf.text(cuentaId, pageWidth - margin, y + 8, { align: "right" });

    // Client name
    let rightHeaderY = 14;
    if (data.compradores.length > 0) {
      const clientName = data.compradores
        .map((c: any) => c.personas.nombre_legal)
        .join(", ");
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.text(clientName, pageWidth - margin, y + rightHeaderY, { align: "right" });
      rightHeaderY += 5;

      const clientId = data.compradores[0].personas.rfc || data.compradores[0].personas.curp || "";
      pdf.setFontSize(8);
      pdf.setTextColor(lightGray);
      pdf.text(clientId, pageWidth - margin, y + rightHeaderY, { align: "right" });
      rightHeaderY += 5;
    }

    // STP Account (CLABE)
    if (data.cuenta.clabe_stp) {
      pdf.setFontSize(7);
      pdf.setTextColor(lightGray);
      pdf.text("CLABE STP:", pageWidth - margin - 35, y + rightHeaderY, { align: "right" });
      pdf.setTextColor(primaryColor);
      pdf.setFont("helvetica", "bold");
      pdf.text(data.cuenta.clabe_stp, pageWidth - margin, y + rightHeaderY, { align: "right" });
    }

    y += 28;
    drawLine(y, primaryColor);
    y += 8;

    // === DETALLES DE LA PROPIEDAD/PRODUCTO ===
    const isProduct = !!data.oferta?.id_producto;
    const leftColWidth = contentWidth / 2 - 5;
    const rightColWidth = contentWidth / 2 - 5;
    const startY = y;

    // Left column - Property/Product details
    pdf.setFontSize(10);
    pdf.setTextColor(primaryColor);
    pdf.setFont("helvetica", "bold");
    pdf.text("Detalles del " + (isProduct ? "Producto" : "Inmueble"), margin, y);
    y += 6;

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");

    const detailsLeft = [];
    
    if (data.proyecto?.nombre) {
      detailsLeft.push({ label: "Proyecto:", value: data.proyecto.nombre });
    }
    if (data.edificio?.nombre) {
      detailsLeft.push({ label: "Torre:", value: data.edificio.nombre });
    }
    if (data.propiedad?.numero_piso) {
      detailsLeft.push({ label: "Nivel:", value: data.propiedad.numero_piso });
    }
    if (data.modelo?.nombre) {
      detailsLeft.push({ label: "Modelo:", value: data.modelo.nombre });
    }
    if (data.propiedad?.numero_propiedad) {
      detailsLeft.push({ label: "N° de propiedad:", value: data.propiedad.numero_propiedad });
    }
    if (isProduct) {
      // For products, show category and product name instead of project/tower/property
      if (data.producto?.categoria?.nombre) {
        detailsLeft.push({ label: "Categoría:", value: data.producto.categoria.nombre });
      }
      if (data.producto?.nombre) {
        detailsLeft.push({ label: "Producto:", value: data.producto.nombre });
      }
    }
    detailsLeft.push({ label: "Precio final:", value: formatMoney(data.precioFinal) });
    
    // Show estacionamientos/bodegas with count, names and locations
    if (!isProduct) {
      const getCountWord = (count: number) => {
        const words = ["", "uno", "dos", "tres", "cuatro", "cinco"];
        return count <= 5 ? words[count] : String(count);
      };
      
      let estValue = "No";
      if (data.estacionamientos && data.estacionamientos.length > 0) {
        const count = data.estacionamientos.length;
        const names = data.estacionamientos.map((e: any) => e.nombre).join(", ");
        const locations = data.estacionamientos.map((e: any) => e.ubicacion || "N/A").join(", ");
        estValue = `${getCountWord(count)}: ${names}, ubicación: ${locations}`;
      }
      
      let bodValue = "No";
      if (data.bodegas && data.bodegas.length > 0) {
        const count = data.bodegas.length;
        const names = data.bodegas.map((b: any) => b.nombre).join(", ");
        const locations = data.bodegas.map((b: any) => b.ubicacion || "N/A").join(", ");
        bodValue = `${getCountWord(count)}: ${names}, ubicación: ${locations}`;
      }
      
      detailsLeft.push({ label: "Estacionamiento:", value: estValue });
      detailsLeft.push({ label: "Bodega:", value: bodValue });
    }

    detailsLeft.forEach((item) => {
      pdf.setTextColor(grayColor);
      pdf.text(item.label, margin, y);
      pdf.setTextColor(primaryColor);
      pdf.setFont("helvetica", "bold");
      const valueText = String(item.value || "N/A").substring(0, 40);
      pdf.text(valueText, margin + 45, y);
      pdf.setFont("helvetica", "normal");
      y += 5;
    });

    // Right column - Contract info
    let rightY = startY;
    const rightX = margin + leftColWidth + 10;

    pdf.setFontSize(10);
    pdf.setTextColor(primaryColor);
    pdf.setFont("helvetica", "bold");
    pdf.text("Información del contrato", rightX, rightY);
    rightY += 6;

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");

    const detailsRight = [];
    
    const fechaCompraMostrada = (data.cuenta as any)?.fecha_compra || data.oferta?.fecha_generacion;
    if (fechaCompraMostrada) {
      detailsRight.push({ label: "Fecha de compra:", value: formatDate(fechaCompraMostrada) });
    }
    if (data.esquemaPago?.numero_mensualidades) {
      detailsRight.push({ label: "Número de parcialidades:", value: String(data.esquemaPago.numero_mensualidades) });
    }
    
    // Calculate amounts from percentages (from esquema_pago)
    const precioBase = data.precioFinal;
    const porcentajeEnganche = data.esquemaPago?.porcentaje_enganche || 0;
    const porcentajeMensualidades = data.esquemaPago?.porcentaje_mensualidades || 0;
    const porcentajeEntrega = data.esquemaPago?.porcentaje_entrega || 0;
    const numMensualidades = data.esquemaPago?.numero_mensualidades || 1;
    
    const montoMensualidades = precioBase * (porcentajeMensualidades / 100);
    const pagoMensual = numMensualidades > 0 ? montoMensualidades / numMensualidades : 0;

    if (pagoMensual > 0) {
      detailsRight.push({ label: "Pago mensual:", value: formatMoney(pagoMensual) });
    }
    
    // Find apartado amount from acuerdos
    const apartadoAcuerdo = data.acuerdos.find((a: any) => 
      a.conceptos_pago?.nombre?.toLowerCase().includes("apartado")
    );
    detailsRight.push({ 
      label: "Apartado:", 
      value: apartadoAcuerdo ? formatMoney(apartadoAcuerdo.monto) : "N/A" 
    });
    
    if (porcentajeEnganche > 0) {
      const montoEnganche = precioBase * (porcentajeEnganche / 100);
      detailsRight.push({ label: "Enganche:", value: `${porcentajeEnganche}%  ${formatMoney(montoEnganche)}` });
    }
    
    if (porcentajeMensualidades > 0) {
      detailsRight.push({ label: "Monto de parcialidades:", value: `${porcentajeMensualidades}%  ${formatMoney(montoMensualidades)}` });
    }
    
    if (porcentajeEntrega > 0) {
      const montoEntrega = precioBase * (porcentajeEntrega / 100);
      detailsRight.push({ label: "Contraentrega:", value: `${porcentajeEntrega}%  ${formatMoney(montoEntrega)}` });
    }

    detailsRight.forEach((item) => {
      pdf.setTextColor(grayColor);
      pdf.text(item.label, rightX, rightY);
      pdf.setTextColor(primaryColor);
      pdf.setFont("helvetica", "bold");
      const valueText = String(item.value || "N/A").substring(0, 35);
      pdf.text(valueText, rightX + 45, rightY);
      pdf.setFont("helvetica", "normal");
      rightY += 5;
    });

    // Move y to the max of both columns
    y = Math.max(y, rightY) + 8;
    drawLine(y, "#e5e7eb");
    y += 8;

    // === SUMMARY CARDS ===
    const cardWidth = contentWidth / 4 - 3;
    const summaryItems = [
      { label: "Precio Final", value: formatMoneyAllowNegative(data.precioFinal), highlight: false },
      { label: "Total Pagado", value: formatMoneyAllowNegative(data.totalPagado), highlight: false },
      { label: "Multas", value: formatMoneyAllowNegative(data.totalMultas), highlight: false },
      { label: "Saldo Pendiente", value: formatMoneyAllowNegative(data.saldoPendiente), highlight: true },
    ];

    summaryItems.forEach((item, i) => {
      const x = margin + (i * (cardWidth + 4));
      
      if (item.highlight) {
        pdf.setFillColor(primaryColor);
        pdf.roundedRect(x, y, cardWidth, 22, 2, 2, "F");
        pdf.setTextColor("#ffffff");
      } else {
        pdf.setDrawColor("#e5e7eb");
        pdf.setFillColor("#ffffff");
        pdf.roundedRect(x, y, cardWidth, 22, 2, 2, "FD");
        pdf.setTextColor(grayColor);
      }

      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");
      pdf.text(item.label.toUpperCase(), x + cardWidth / 2, y + 7, { align: "center" });

      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      if (!item.highlight) pdf.setTextColor(primaryColor);
      pdf.text(item.value, x + cardWidth / 2, y + 16, { align: "center" });
    });

    y += 32;

    // === ACUERDOS DE PAGO TABLE ===
    pdf.setFontSize(12);
    pdf.setTextColor(primaryColor);
    pdf.setFont("helvetica", "bold");
    pdf.text("Acuerdos de Pago", margin, y);
    y += 6;
    drawLine(y);
    y += 8;

    // Table header
    const acuerdosCols = [
      { title: "#", width: 8, align: "center" as const },
      { title: "Concepto", width: 35, align: "left" as const },
      { title: "Fecha Programada", width: 30, align: "left" as const },
      { title: "Monto", width: 28, align: "right" as const },
      { title: "Pagado", width: 28, align: "right" as const },
      { title: "Pendiente", width: 28, align: "right" as const },
      { title: "Estado", width: 20, align: "center" as const },
    ];

    let colX = margin;
    pdf.setFillColor("#f8f9fa");
    pdf.rect(margin, y - 1, contentWidth, 7, "F");
    
    pdf.setFontSize(7);
    pdf.setTextColor("#555555");
    pdf.setFont("helvetica", "bold");
    
    acuerdosCols.forEach((col) => {
      if (col.align === "right") {
        pdf.text(col.title.toUpperCase(), colX + col.width - 1, y + 4, { align: "right" });
      } else if (col.align === "center") {
        pdf.text(col.title.toUpperCase(), colX + col.width / 2, y + 4, { align: "center" });
      } else {
        pdf.text(col.title.toUpperCase(), colX + 1, y + 4);
      }
      colX += col.width;
    });

    y += 8;
    drawLine(y);
    y += 6;

    // Table rows
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);

    for (const acuerdo of data.acuerdos) {
      checkNewPage(8);

      const pagadoAcuerdo = data.pagos.reduce((sum: number, pago: any) => {
        const aplicacionesAcuerdo = pago.aplicaciones_pago.filter(
          (ap: any) => ap.id_acuerdo_pago === acuerdo.id && !ap.es_multa
        );
        return sum + aplicacionesAcuerdo.reduce((s: number, ap: any) => s + (ap.monto || 0), 0);
      }, 0);

      let pendiente = acuerdo.monto - pagadoAcuerdo;
      if (Math.abs(pendiente) < 0.01 || pendiente < 0) pendiente = 0;

      const isPaid = acuerdo.pago_completado;

      // Alternating row background
      if (acuerdo.orden % 2 === 0) {
        pdf.setFillColor("#fafafa");
        pdf.rect(margin, y - 3, contentWidth, 6, "F");
      }

      colX = margin;
      pdf.setTextColor("#333333");

      // Order
      pdf.text(String(acuerdo.orden), colX + acuerdosCols[0].width / 2, y, { align: "center" });
      colX += acuerdosCols[0].width;

      // Concepto
      pdf.text((acuerdo.conceptos_pago?.nombre || "N/A").substring(0, 20), colX + 1, y);
      colX += acuerdosCols[1].width;

      // Fecha
      pdf.text(acuerdo.fecha_pago ? formatDate(acuerdo.fecha_pago) : "N/A", colX + 1, y);
      colX += acuerdosCols[2].width;

      // Monto
      pdf.text(formatMoneyAllowNegative(acuerdo.monto), colX + acuerdosCols[3].width - 1, y, { align: "right" });
      colX += acuerdosCols[3].width;

      // Pagado
      pdf.text(formatMoneyAllowNegative(pagadoAcuerdo), colX + acuerdosCols[4].width - 1, y, { align: "right" });
      colX += acuerdosCols[4].width;

      // Pendiente
      pdf.text(formatMoney(pendiente), colX + acuerdosCols[5].width - 1, y, { align: "right" });
      colX += acuerdosCols[5].width;

      // Estado badge
      const statusText = isPaid ? "Pagado" : "Pendiente";
      const badgeWidth = 16;
      const badgeX = colX + (acuerdosCols[6].width - badgeWidth) / 2;
      
      if (isPaid) {
        pdf.setFillColor("#dcfce7");
        pdf.setTextColor("#166534");
      } else {
        pdf.setFillColor("#fef3c7");
        pdf.setTextColor("#92400e");
      }
      pdf.roundedRect(badgeX, y - 3, badgeWidth, 5, 1, 1, "F");
      pdf.setFontSize(6);
      pdf.text(statusText, badgeX + badgeWidth / 2, y, { align: "center" });
      pdf.setFontSize(8);

      y += 6;
    }

    y += 10;

    // === MULTAS TABLE (if any) ===
    console.log("DEBUG PDF: Starting multas section, count:", data.multas?.length);
    if (data.multas && data.multas.length > 0) {
      console.log("DEBUG PDF: Multas data:", JSON.stringify(data.multas));
      checkNewPage(30);
      
      pdf.setFontSize(12);
      pdf.setTextColor(primaryColor);
      pdf.setFont("helvetica", "bold");
      pdf.text("Multas", margin, y);
      y += 6;
      drawLine(y);
      y += 8;

      // Table header - total width must fit contentWidth
      const multasCols = [
        { title: "#", width: 8, align: "center" as const },
        { title: "Descripción", width: 60, align: "left" as const },
        { title: "Monto", width: 26, align: "right" as const },
        { title: "Pagado", width: 26, align: "right" as const },
        { title: "Pendiente", width: 26, align: "right" as const },
        { title: "Estado", width: 22, align: "center" as const },
      ];

      colX = margin;
      pdf.setFillColor("#fef3c7");
      pdf.rect(margin, y - 1, contentWidth, 7, "F");
      
      pdf.setFontSize(7);
      pdf.setTextColor("#92400e");
      pdf.setFont("helvetica", "bold");
      
      multasCols.forEach((col) => {
        if (col.align === "right") {
          pdf.text(col.title.toUpperCase(), colX + col.width - 1, y + 4, { align: "right" });
        } else if (col.align === "center") {
          pdf.text(col.title.toUpperCase(), colX + col.width / 2, y + 4, { align: "center" });
        } else {
          pdf.text(col.title.toUpperCase(), colX + 1, y + 4);
        }
        colX += col.width;
      });

      y += 8;
      drawLine(y);
      y += 6;

      // Table rows
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);

      let multaIndex = 0;
      for (const multa of data.multas) {
        // Calculate pagado for this multa - if es_pagada is true, full amount was paid
        let pagadoMulta = 0;
        if (multa.es_pagada) {
          pagadoMulta = multa.monto;
        } else {
          pagadoMulta = data.pagos.reduce((sum: number, pago: any) => {
            const aplicacionesMulta = (pago.aplicaciones_pago || []).filter(
              (ap: any) => ap.es_multa && ap.id_acuerdo_pago === multa.id
            );
            return sum + aplicacionesMulta.reduce((s: number, ap: any) => s + (ap.monto || 0), 0);
          }, 0);
        }

        const isPaid = multa.es_pagada || pagadoMulta >= multa.monto;
        const pendienteMulta = Math.max(0, multa.monto - pagadoMulta);
        
        // Split description into multiple lines if needed
        const descripcionText = multa.descripcion || "Multa";
        const maxCharsPerLine = 40;
        const descLines: string[] = [];
        let remaining = descripcionText;
        while (remaining.length > 0) {
          if (remaining.length <= maxCharsPerLine) {
            descLines.push(remaining);
            break;
          }
          // Find last space before maxCharsPerLine
          let splitPos = remaining.lastIndexOf(' ', maxCharsPerLine);
          if (splitPos === -1) splitPos = maxCharsPerLine;
          descLines.push(remaining.substring(0, splitPos));
          remaining = remaining.substring(splitPos).trim();
        }
        
        const rowHeight = Math.max(6, descLines.length * 4 + 2);
        checkNewPage(rowHeight + 2);
        
        // Calculate vertical center for single-line elements
        const verticalCenter = y + (descLines.length > 1 ? (descLines.length - 1) * 2 : 0);

        // Alternating row background
        if (multaIndex % 2 === 0) {
          pdf.setFillColor("#fffbeb");
          pdf.rect(margin, y - 3, contentWidth, rowHeight, "F");
        }

        colX = margin;
        pdf.setTextColor("#333333");

        // #
        pdf.text(String(multaIndex + 1), colX + multasCols[0].width / 2, verticalCenter, { align: "center" });
        colX += multasCols[0].width;

        // Descripción - multiple lines
        let descY = y;
        for (const line of descLines) {
          pdf.text(line, colX + 1, descY);
          descY += 4;
        }
        colX += multasCols[1].width;

        // Monto - centered vertically
        pdf.text(formatMoneyAllowNegative(multa.monto), colX + multasCols[2].width - 1, verticalCenter, { align: "right" });
        colX += multasCols[2].width;

        // Pagado - centered vertically
        pdf.text(formatMoneyAllowNegative(pagadoMulta), colX + multasCols[3].width - 1, verticalCenter, { align: "right" });
        colX += multasCols[3].width;

        // Pendiente - centered vertically
        pdf.text(formatMoneyAllowNegative(pendienteMulta), colX + multasCols[4].width - 1, verticalCenter, { align: "right" });
        colX += multasCols[4].width;

        // Estado badge - centered vertically
        const statusText = isPaid ? "Pagada" : "Pendiente";
        const badgeWidth = 18;
        const badgeX = colX + (multasCols[5].width - badgeWidth) / 2;
        
        if (isPaid) {
          pdf.setFillColor("#dcfce7");
          pdf.setTextColor("#166534");
        } else {
          pdf.setFillColor("#fee2e2");
          pdf.setTextColor("#991b1b");
        }
        pdf.rect(badgeX, verticalCenter - 3, badgeWidth, 5, "F");
        pdf.setFontSize(6);
        pdf.text(statusText, badgeX + badgeWidth / 2, verticalCenter, { align: "center" });
        pdf.setFontSize(8);

        y += rowHeight;
        multaIndex++;
      }

      y += 5;
    }

    y += 10;

    // === PAGOS REALIZADOS TABLE ===
    checkNewPage(30);
    
    pdf.setFontSize(12);
    pdf.setTextColor(primaryColor);
    pdf.setFont("helvetica", "bold");
    pdf.text("Pagos Realizados", margin, y);
    y += 6;
    drawLine(y);
    y += 8;

    // Table header
    const pagosCols = [
      { title: "Fecha", width: 25, align: "left" as const },
      { title: "Método", width: 25, align: "left" as const },
      { title: "Referencia", width: 90, align: "left" as const },
      { title: "Monto", width: 37, align: "right" as const },
    ];

    colX = margin;
    pdf.setFillColor("#f8f9fa");
    pdf.rect(margin, y - 1, contentWidth, 7, "F");
    
    pdf.setFontSize(7);
    pdf.setTextColor("#555555");
    pdf.setFont("helvetica", "bold");
    
    pagosCols.forEach((col) => {
      if (col.align === "right") {
        pdf.text(col.title.toUpperCase(), colX + col.width - 1, y + 4, { align: "right" });
      } else {
        pdf.text(col.title.toUpperCase(), colX + 1, y + 4);
      }
      colX += col.width;
    });

    y += 8;
    drawLine(y);
    y += 6;

    // Table rows
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);

    let rowIndex = 0;
    for (const pago of data.pagos) {
      checkNewPage(8);

      // Alternating row background
      if (rowIndex % 2 === 0) {
        pdf.setFillColor("#fafafa");
        pdf.rect(margin, y - 3, contentWidth, 6, "F");
      }

      colX = margin;
      pdf.setTextColor("#333333");

      // Fecha
      pdf.text(formatDate(pago.fecha_pago), colX + 1, y);
      colX += pagosCols[0].width;

      // Método
      pdf.text((pago.metodos_pago?.nombre || "N/A").substring(0, 15), colX + 1, y);
      colX += pagosCols[1].width;

      // Referencia
      pdf.setFontSize(7);
      pdf.text((pago.clave_rastreo || "N/A").substring(0, 50), colX + 1, y);
      pdf.setFontSize(8);
      colX += pagosCols[2].width;

      // Monto
      pdf.text(formatMoneyAllowNegative(pago.monto || 0), colX + pagosCols[3].width - 1, y, { align: "right" });

      y += 6;
      rowIndex++;
    }

    // Total footer
    y += 2;
    pdf.setFillColor("#f8f9fa");
    pdf.rect(margin, y - 3, contentWidth, 8, "F");
    drawLine(y - 3, "#e5e7eb");
    
    const totalPagosReal = data.pagos.reduce((sum: number, pago: any) => sum + (pago.monto || 0), 0);
    
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(primaryColor);
    pdf.text("Total Pagos", margin + 2, y + 2);
    pdf.text(formatMoneyAllowNegative(totalPagosReal), pageWidth - margin - 1, y + 2, { align: "right" });

    y += 12;

    // === FOOTER ===
    checkNewPage(15);
    drawLine(y);
    y += 5;
    
    pdf.setFontSize(8);
    pdf.setTextColor(lightGray);
    pdf.setFont("helvetica", "normal");
    pdf.text("Notas: Este estado de cuenta muestra el detalle de acuerdos de pago y pagos realizados. Generado automáticamente.", margin, y);

    // Format date for filename
    const formatDateForFilename = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}_${month}_${day}`;
    };

    const tipoCuenta = data.oferta?.id_producto ? 'Producto' : 'Propiedad';
    const cuentaFormatted = formatCuentaCobranzaId(data.id_cuenta, tipoCuenta);
    const fechaFormatted = formatDateForFilename(new Date());

    const fileName = `estado_cuenta_${cuentaFormatted}_${fechaFormatted}.pdf`;
    pdf.save(fileName);
  }
}
