import { supabase } from "@/integrations/supabase/client";
import { formatCuentaMantenimientoId } from "@/utils/cuentaCobranzaUtils";
import jsPDF from "jspdf";

interface EstadoCuentaMantenimientoData {
  id_cuenta: number;
}

export class EstadoCuentaMantenimientoService {
  async generateEstadoCuenta(data: EstadoCuentaMantenimientoData): Promise<void> {
    try {
      // Fetch cuenta de mantenimiento details
      const { data: cuentaData, error: cuentaError } = await supabase
        .from("cuentas_cobranza")
        .select("*")
        .eq("id", data.id_cuenta)
        .not("id_cuenta_cobranza_padre", "is", null)
        .single();

      if (cuentaError) throw cuentaError;
      if (!cuentaData) throw new Error("Cuenta de mantenimiento no encontrada");

      // Fetch parent cuenta to get property/project info
      const { data: parentCuenta, error: parentError } = await supabase
        .from("cuentas_cobranza")
        .select("id, id_oferta")
        .eq("id", cuentaData.id_cuenta_cobranza_padre)
        .single();

      if (parentError) throw parentError;

      // Fetch propietarios from parent cuenta
      const { data: compradores, error: compradoresError } = await supabase
        .from("compradores")
        .select("*, personas!compradores_id_persona_fkey(*)")
        .eq("id_cuenta_cobranza", cuentaData.id_cuenta_cobranza_padre)
        .eq("activo", true);

      if (compradoresError) throw compradoresError;

      // Fetch oferta and property info
      let proyectoData = null;
      let propiedadData = null;
      
      if (parentCuenta?.id_oferta) {
        const { data: oferta } = await supabase
          .from("ofertas")
          .select("id_propiedad")
          .eq("id", parentCuenta.id_oferta)
          .single();

        if (oferta?.id_propiedad) {
          const { data: propiedad } = await supabase
            .from("propiedades")
            .select("numero_propiedad, id_entidad_relacionada_dueno")
            .eq("id", oferta.id_propiedad)
            .single();

          propiedadData = propiedad;

          if (propiedad?.id_entidad_relacionada_dueno) {
            const { data: entidad } = await supabase
              .from("entidades_relacionadas")
              .select("id_proyecto")
              .eq("id", propiedad.id_entidad_relacionada_dueno)
              .single();

            if (entidad?.id_proyecto) {
              const { data: proyecto } = await supabase
                .from("proyectos")
                .select("*")
                .eq("id", entidad.id_proyecto)
                .single();

              proyectoData = proyecto;
            }
          }
        }
      }

      // Calculate date 12 months ago
      const fechaHace12Meses = new Date();
      fechaHace12Meses.setMonth(fechaHace12Meses.getMonth() - 12);
      const fechaLimite = fechaHace12Meses.toISOString().split("T")[0];

      // Fetch acuerdos de pago (últimos 12 meses)
      const { data: acuerdos, error: acuerdosError } = await supabase
        .from("acuerdos_pago")
        .select("*, conceptos_pago!acuerdos_pago_id_concepto_fkey(nombre)")
        .eq("id_cuenta_cobranza", data.id_cuenta)
        .eq("activo", true)
        .gte("fecha_pago", fechaLimite)
        .order("orden", { ascending: true });

      if (acuerdosError) throw acuerdosError;

      // Fetch aplicaciones for these acuerdos
      const acuerdoIds = (acuerdos || []).map(a => a.id);
      let aplicaciones: any[] = [];
      
      if (acuerdoIds.length > 0) {
        const { data: apps, error: appsError } = await supabase
          .from("aplicaciones_pago")
          .select("monto, id_acuerdo_pago, es_multa")
          .in("id_acuerdo_pago", acuerdoIds)
          .eq("activo", true);

        if (appsError) throw appsError;
        aplicaciones = apps || [];
      }

      // Calculate totals
      const precioMensualAcumulado = (acuerdos || []).reduce((sum, a) => sum + (a.monto || 0), 0);
      
      const totalPagado = aplicaciones
        .filter(ap => !ap.es_multa)
        .reduce((sum, ap) => sum + (ap.monto || 0), 0);

      const saldoPendiente = precioMensualAcumulado - totalPagado;

      // Generate PDF with native text
      await this.generateNativePDF({
        cuenta: cuentaData,
        compradores: compradores || [],
        acuerdos: acuerdos || [],
        aplicaciones,
        proyecto: proyectoData,
        propiedad: propiedadData,
        precioMensualAcumulado,
        totalPagado,
        saldoPendiente,
        id_cuenta: data.id_cuenta,
        fechaLimite,
      });
    } catch (error) {
      console.error("Error generating estado de cuenta mantenimiento:", error);
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

    const formatDate = (date: string) =>
      new Date(date).toLocaleDateString("es-MX");

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
    pdf.text(data.proyecto?.nombre || "Estado de Cuenta - Mantenimiento", margin, y + 6);

    pdf.setFontSize(9);
    pdf.setTextColor(grayColor);
    pdf.setFont("helvetica", "normal");
    pdf.text(data.proyecto?.direccion || "", margin, y + 12);

    // Account number (right side)
    const cuentaId = formatCuentaMantenimientoId(data.cuenta.id);
    pdf.setFontSize(8);
    pdf.setTextColor(lightGray);
    pdf.text("CUENTA MANTENIMIENTO", pageWidth - margin, y + 2, { align: "right" });
    
    pdf.setFontSize(14);
    pdf.setTextColor(primaryColor);
    pdf.setFont("helvetica", "bold");
    pdf.text(cuentaId, pageWidth - margin, y + 8, { align: "right" });

    // Property number
    if (data.propiedad?.numero_propiedad) {
      pdf.setFontSize(9);
      pdf.setTextColor(grayColor);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Propiedad: ${data.propiedad.numero_propiedad}`, pageWidth - margin, y + 13, { align: "right" });
    }

    // Client name
    if (data.compradores.length > 0) {
      const clientName = data.compradores
        .map((c: any) => c.personas.nombre_legal)
        .join(", ");
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.text(clientName.substring(0, 50), pageWidth - margin, y + 18, { align: "right" });

      const clientId = data.compradores[0].personas.rfc || data.compradores[0].personas.curp || "";
      pdf.setFontSize(8);
      pdf.setTextColor(lightGray);
      pdf.text(clientId, pageWidth - margin, y + 23, { align: "right" });
    }

    y += 28;
    drawLine(y, primaryColor);
    y += 8;

    // === META INFO ===
    const metaBoxWidth = contentWidth / 3 - 4;
    const fechaInicio = data.acuerdos.length > 0 ? formatDate(data.acuerdos[0].fecha_pago) : "N/A";
    const fechaFin = data.acuerdos.length > 0 ? formatDate(data.acuerdos[data.acuerdos.length - 1].fecha_pago) : "N/A";
    
    const metaItems = [
      { label: "Tipo", value: "Mantenimiento" },
      { 
        label: "Periodo (12 meses)", 
        value: data.acuerdos.length > 0 
          ? `${fechaInicio} — ${fechaFin}`
          : "Sin acuerdos"
      },
      { label: "Fecha de Emisión", value: formatDate(new Date().toISOString()) },
    ];

    metaItems.forEach((item, i) => {
      const x = margin + (i * (metaBoxWidth + 6));
      
      // Box background
      pdf.setFillColor("#f8f9fa");
      pdf.roundedRect(x, y, metaBoxWidth, 14, 2, 2, "F");
      
      // Left border
      pdf.setFillColor(primaryColor);
      pdf.rect(x, y, 1, 14, "F");

      pdf.setFontSize(7);
      pdf.setTextColor(lightGray);
      pdf.text(item.label.toUpperCase(), x + 4, y + 5);

      pdf.setFontSize(9);
      pdf.setTextColor(primaryColor);
      pdf.setFont("helvetica", "bold");
      pdf.text(item.value.substring(0, 25), x + 4, y + 11);
    });

    y += 20;

    // === SUMMARY CARDS ===
    const cardWidth = contentWidth / 3 - 3;
    const saldoEsPositivo = data.saldoPendiente > 0.01;
    const saldoEsNegativo = data.saldoPendiente < -0.01;
    
    const summaryItems = [
      { label: "Pago Mensual Acumulado", value: formatMoneyAllowNegative(data.precioMensualAcumulado), highlight: false },
      { label: "Total Pagado", value: formatMoneyAllowNegative(data.totalPagado), highlight: false },
      { 
        label: saldoEsNegativo ? "Saldo a Favor" : "Saldo Pendiente", 
        value: formatMoneyAllowNegative(Math.abs(data.saldoPendiente)), 
        highlight: true,
        isNegative: saldoEsNegativo
      },
    ];

    summaryItems.forEach((item, i) => {
      const x = margin + (i * (cardWidth + 4.5));
      
      if (item.highlight) {
        if (item.isNegative) {
          pdf.setFillColor("#166534"); // Green for "a favor"
        } else {
          pdf.setFillColor(primaryColor);
        }
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
    pdf.text("Acuerdos de Pago - Últimos 12 Meses", margin, y);
    y += 8;
    drawLine(y);
    y += 10;

    // Table header
    const acuerdosCols = [
      { title: "Concepto", width: 60, align: "left" as const },
      { title: "Fecha", width: 28, align: "left" as const },
      { title: "Monto", width: 28, align: "right" as const },
      { title: "Pagado", width: 28, align: "right" as const },
      { title: "Pendiente", width: 28, align: "right" as const },
      { title: "Estado", width: 18, align: "center" as const },
    ];

    let colX = margin;
    pdf.setFillColor("#f8f9fa");
    pdf.rect(margin, y - 2, contentWidth, 8, "F");
    
    pdf.setFontSize(7);
    pdf.setTextColor("#555555");
    pdf.setFont("helvetica", "bold");
    
    acuerdosCols.forEach((col) => {
      if (col.align === "right") {
        pdf.text(col.title.toUpperCase(), colX + col.width - 1, y + 3, { align: "right" });
      } else if (col.align === "center") {
        pdf.text(col.title.toUpperCase(), colX + col.width / 2, y + 3, { align: "center" });
      } else {
        pdf.text(col.title.toUpperCase(), colX + 1, y + 3);
      }
      colX += col.width;
    });

    y += 14;
    drawLine(y - 4);

    // Table rows
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);

    let rowNum = 0;
    for (const acuerdo of data.acuerdos) {
      checkNewPage(8);
      rowNum++;

      // Calculate paid amount for this acuerdo
      const pagadoAcuerdo = data.aplicaciones
        .filter((ap: any) => ap.id_acuerdo_pago === acuerdo.id && !ap.es_multa)
        .reduce((sum: number, ap: any) => sum + (ap.monto || 0), 0);

      let pendiente = acuerdo.monto - pagadoAcuerdo;
      if (Math.abs(pendiente) < 0.01 || pendiente < 0) pendiente = 0;

      const isPaid = acuerdo.pago_completado;

      // Alternating row background
      if (rowNum % 2 === 0) {
        pdf.setFillColor("#fafafa");
        pdf.rect(margin, y - 3, contentWidth, 6, "F");
      }

      colX = margin;
      pdf.setTextColor("#333333");

      // Concepto - format with month if it's maintenance
      let conceptoText = acuerdo.conceptos_pago?.nombre || "N/A";
      if (acuerdo.fecha_pago && conceptoText.toLowerCase().includes("mantenimiento")) {
        const fecha = new Date(acuerdo.fecha_pago);
        const mes = fecha.toLocaleDateString("es-MX", { month: "long" });
        conceptoText = `${conceptoText} - ${mes.charAt(0).toUpperCase() + mes.slice(1)}`;
      }
      pdf.text(conceptoText.substring(0, 35), colX + 1, y);
      colX += acuerdosCols[0].width;

      // Fecha
      pdf.text(acuerdo.fecha_pago ? formatDate(acuerdo.fecha_pago) : "N/A", colX + 1, y);
      colX += acuerdosCols[1].width;

      // Monto
      pdf.text(formatMoneyAllowNegative(acuerdo.monto), colX + acuerdosCols[2].width - 1, y, { align: "right" });
      colX += acuerdosCols[2].width;

      // Pagado
      pdf.text(formatMoneyAllowNegative(pagadoAcuerdo), colX + acuerdosCols[3].width - 1, y, { align: "right" });
      colX += acuerdosCols[3].width;

      // Pendiente
      pdf.text(formatMoney(pendiente), colX + acuerdosCols[4].width - 1, y, { align: "right" });
      colX += acuerdosCols[4].width;

      // Estado badge
      const statusText = isPaid ? "Pagado" : "Pendiente";
      const badgeWidth = 16;
      const badgeX = colX + (acuerdosCols[5].width - badgeWidth) / 2;
      
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

    if (data.acuerdos.length === 0) {
      pdf.setTextColor(grayColor);
      pdf.text("No hay acuerdos de pago en los últimos 12 meses", margin + contentWidth / 2, y, { align: "center" });
      y += 8;
    }

    y += 8;

    // === FOOTER ===
    checkNewPage(15);
    drawLine(y);
    y += 5;
    
    pdf.setFontSize(8);
    pdf.setTextColor(lightGray);
    pdf.setFont("helvetica", "normal");
    pdf.text("Notas: Este estado de cuenta muestra el detalle de acuerdos de pago de mantenimiento de los últimos 12 meses. Generado automáticamente.", margin, y);

    // CLABE STP if available
    if (data.cuenta.clabe_stp) {
      y += 5;
      pdf.text(`CLABE STP para pagos: ${data.cuenta.clabe_stp}`, margin, y);
    }

    // Format date for filename
    const formatDateForFilename = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}_${month}_${day}`;
    };

    const cuentaFormatted = formatCuentaMantenimientoId(data.id_cuenta);
    const fechaFormatted = formatDateForFilename(new Date());

    const fileName = `estado_cuenta_mantenimiento_${cuentaFormatted}_${fechaFormatted}.pdf`;
    pdf.save(fileName);
  }
}
