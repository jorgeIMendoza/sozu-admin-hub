import jsPDF from "jspdf";
import { isValidRFC } from "@/utils/fiscalDataValidation";

// Icon imports - we'll convert them to base64 on load
import recamarasIcon from "@/assets/icons/recamaras.png";
import banosIcon from "@/assets/icons/banos.png";
import mediosBanosIcon from "@/assets/icons/medios-banos.png";
import estacionamientoIcon from "@/assets/icons/estacionamiento.png";
import bodegaIcon from "@/assets/icons/bodega.png";
import balconIcon from "@/assets/icons/balcon.png";

interface PropertyDetails {
  id: number;
  numero_propiedad: string;
  precio_lista: number;
  m2_interiores: number | null;
  m2_exteriores: number | null;
  descripcion: string | null;
  numero_piso?: string | null;
  clabe_stp_tmp_apartado?: string | null;
  tieneBalcon?: boolean;
  building?: {
    id: number;
    nombre: string;
  };
  model?: {
    id: number;
    nombre: string;
    descripcion: string | null;
    numero_recamaras: number | null;
    numero_completo_banos: number | null;
    numero_medio_bano: number | null;
  };
  vista?: {
    id: number;
    nombre: string;
    url?: string;
  };
  projectData?: {
    id: number;
    nombre: string;
    url_imagen_portada?: string;
    url_logo?: string;
    mostrar_precio_m2_en_oferta?: boolean;
    mostrar_piso_en_oferta?: boolean;
    mostrar_seccion_efectivo_en_oferta?: boolean;
    precio_m2_actual?: number;
  };
  ownerData?: {
    id: number;
    nombre_legal: string;
    email: string;
    telefono: string | null;
  };
  ownerStpBankAccount?: {
    numero_cuenta: string;
    cuenta_clabe: string;
    cuenta_swift: string;
    banco_nombre: string;
  };
  modelImages?: Array<{
    url: string;
    ver_como_ubicacion_en_oferta: boolean;
  }>;
}

interface PaymentScheme {
  id: number;
  nombre: string;
  porcentaje_enganche: number;
  numero_mensualidades: number;
  numero_pagos_enganche: number;
  porcentaje_mensualidades: number;
  porcentaje_entrega: number;
  porcentaje_descuento_aumento: number;
  es_manual: boolean;
  tramos_mensualidad?: Array<{
    orden: number;
    numero_mensualidades: number;
    monto: number;
  }> | null;
}

interface OfferData {
  id: number;
  fecha_generacion: string;
  propertyNumber: string;
  leadName: string;
  leadEmail: string;
  email_creador: string;
  id_esquema_pago_seleccionado?: number | null;
}

interface LeadInfo {
  nombre_legal: string;
  email: string;
  telefono: string;
  rfc?: string | null;
  hasValidRFC?: boolean;
}

interface CreatorInfo {
  nombre_legal?: string;
  nombre?: string;
  email: string;
  telefono?: string | null;
}

interface GeneratePDFData {
  offerData: OfferData;
  propertyDetails: PropertyDetails;
  paymentSchemes: PaymentScheme[];
  creatorInfo: CreatorInfo | null;
  leadInfo: LeadInfo | null;
  estacionamientos: any[];
  bodegas: any[];
}

export class OfertaPdfNativeService {
  private iconCache: Map<string, string> = new Map();

  async generateOfferPDF(data: GeneratePDFData): Promise<void> {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // Colors
    const primaryColor = "#1a1a1a";
    const grayColor = "#666666";
    const lightGray = "#888888";
    const dividerColor = "#D3D3D3";
    const selectedBg = "#E8F4E8";
    const selectedBorder = "#22C55E";

    // Helper functions
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
      }).format(amount);
    };

    const formatOfferNumber = (offerId: number) => {
      return `O-${offerId.toString().padStart(6, "0")}`;
    };

    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString("es-MX", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    };

    const calculateVigencia = (dateString: string) => {
      const date = new Date(dateString);
      date.setDate(date.getDate() + 5);
      return date.toLocaleDateString("es-MX", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    };

    const drawLine = (yPos: number, color: string = dividerColor) => {
      pdf.setDrawColor(color);
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
    };

    const numberToSpanishText = (num: number): string => {
      const textMap: { [key: number]: string } = {
        0: "Cero",
        1: "Una",
        2: "Dos",
        3: "Tres",
        4: "Cuatro",
        5: "Cinco",
        6: "Seis",
        7: "Siete",
        8: "Ocho",
        9: "Nueve",
        10: "Diez",
      };
      return textMap[num] || num.toString();
    };

    const checkNewPage = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - margin) {
        pdf.addPage();
        y = margin;
        return true;
      }
      return false;
    };

    // Calculate payment amounts for a scheme
    const calculatePaymentAmounts = (scheme: PaymentScheme) => {
      const basePrice = data.propertyDetails.precio_lista;
      const adjustment = basePrice * (scheme.porcentaje_descuento_aumento / 100);
      const finalPrice = basePrice + adjustment;

      return {
        enganche: finalPrice * (scheme.porcentaje_enganche / 100),
        mensualidad:
          (finalPrice * (scheme.porcentaje_mensualidades / 100)) /
          scheme.numero_mensualidades,
        entrega: finalPrice * (scheme.porcentaje_entrega / 100),
        finalPrice,
        adjustment,
      };
    };

    // Load icons as base64
    await this.preloadIcons();

    // Load project logo if available
    let logoBase64: string | null = null;
    if (data.propertyDetails.projectData?.url_logo) {
      try {
        logoBase64 = await this.loadImageAsBase64(
          data.propertyDetails.projectData.url_logo
        );
      } catch (e) {
        console.warn("Could not load project logo:", e);
      }
    }

    // Load model image if available
    let modelImageBase64: string | null = null;
    if (
      data.propertyDetails.modelImages &&
      data.propertyDetails.modelImages.length > 0
    ) {
      const modelImageUrl =
        data.propertyDetails.modelImages.find(
          (img) => img.ver_como_ubicacion_en_oferta
        )?.url || data.propertyDetails.modelImages[0]?.url;
      if (modelImageUrl) {
        try {
          modelImageBase64 = await this.loadImageAsBase64(modelImageUrl);
        } catch (e) {
          console.warn("Could not load model image:", e);
        }
      }
    }

    // === HEADER ===
    const headerStartY = y;

    // Project logo (left side)
    if (logoBase64) {
      try {
        const logoMaxHeight = 15;
        const logoMaxWidth = 40;
        pdf.addImage(logoBase64, "PNG", margin, y, logoMaxWidth, logoMaxHeight);
      } catch (e) {
        // Fallback to text
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(primaryColor);
        pdf.text(
          data.propertyDetails.projectData?.nombre || "Proyecto",
          margin,
          y + 10
        );
      }
    } else {
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(primaryColor);
      pdf.text(
        data.propertyDetails.projectData?.nombre || "Proyecto",
        margin,
        y + 10
      );
    }

    // Offer info (right side)
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(primaryColor);

    const rightX = pageWidth - margin;
    let rightY = headerStartY + 4;

    pdf.setFont("helvetica", "bold");
    pdf.text("ID Oferta:", rightX - 50, rightY);
    pdf.setFont("helvetica", "normal");
    pdf.text(formatOfferNumber(data.offerData.id), rightX, rightY, {
      align: "right",
    });
    rightY += 5;

    pdf.setFont("helvetica", "bold");
    pdf.text("Expedición:", rightX - 50, rightY);
    pdf.setFont("helvetica", "normal");
    pdf.text(formatDate(data.offerData.fecha_generacion), rightX, rightY, {
      align: "right",
    });
    rightY += 5;

    pdf.setFont("helvetica", "bold");
    pdf.text("Vigencia:", rightX - 50, rightY);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      calculateVigencia(data.offerData.fecha_generacion),
      rightX,
      rightY,
      { align: "right" }
    );

    y = Math.max(headerStartY + 20, rightY + 5);
    drawLine(y);
    y += 6;

    // === PROPERTY DETAILS ===
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(primaryColor);
    pdf.text("Datos de la Propiedad:", margin, y);
    y += 7;

    // Property info column
    const propColWidth = contentWidth * 0.35;
    const iconColWidth = contentWidth * 0.2;
    const imageColWidth = contentWidth * 0.45;

    const propStartY = y;
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(primaryColor);

    const propertyItems = [
      {
        label: "Proyecto:",
        value: data.propertyDetails.projectData?.nombre || "N/A",
      },
    ];

    if (data.propertyDetails.building) {
      propertyItems.push({
        label: "Edificio:",
        value: data.propertyDetails.building.nombre,
      });
    }
    if (data.propertyDetails.model) {
      propertyItems.push({
        label: "Modelo:",
        value: data.propertyDetails.model.nombre,
      });
    }
    propertyItems.push({
      label: "Número de propiedad:",
      value: data.propertyDetails.numero_propiedad,
    });

    if (
      data.propertyDetails.projectData?.mostrar_piso_en_oferta &&
      data.propertyDetails.numero_piso
    ) {
      propertyItems.push({
        label: "Nivel:",
        value: data.propertyDetails.numero_piso,
      });
    }
    if (data.propertyDetails.vista) {
      propertyItems.push({
        label: "Vista:",
        value: data.propertyDetails.vista.nombre,
      });
    }

    const totalArea =
      (data.propertyDetails.m2_interiores || 0) +
      (data.propertyDetails.m2_exteriores || 0);
    propertyItems.push({ label: "Área:", value: `${totalArea.toFixed(2)} m²` });
    propertyItems.push({
      label: "Precio de lista:",
      value: formatCurrency(data.propertyDetails.precio_lista),
    });

    if (
      data.propertyDetails.projectData?.mostrar_precio_m2_en_oferta &&
      totalArea > 0
    ) {
      propertyItems.push({
        label: "Precio por m²:",
        value: formatCurrency(data.propertyDetails.precio_lista / totalArea),
      });
    }

    propertyItems.forEach((item) => {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(grayColor);
      pdf.text(item.label, margin, y);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(primaryColor);
      pdf.text(item.value, margin + 35, y);
      y += 5;
    });

    // Icons column
    const iconX = margin + propColWidth + 5;
    let iconY = propStartY;
    const iconSize = 5;
    const iconSpacing = 12;

    const iconItems: Array<{ icon: string; value: string }> = [];

    if (
      data.propertyDetails.model?.numero_recamaras &&
      data.propertyDetails.model.numero_recamaras > 0
    ) {
      iconItems.push({
        icon: "recamaras",
        value: numberToSpanishText(data.propertyDetails.model.numero_recamaras),
      });
    }
    if (
      data.propertyDetails.model?.numero_completo_banos &&
      data.propertyDetails.model.numero_completo_banos > 0
    ) {
      iconItems.push({
        icon: "banos",
        value: numberToSpanishText(
          data.propertyDetails.model.numero_completo_banos
        ),
      });
    }
    if ((data.propertyDetails.model?.numero_medio_bano ?? 0) > 0) {
      iconItems.push({
        icon: "mediosBanos",
        value: numberToSpanishText(
          data.propertyDetails.model!.numero_medio_bano!
        ),
      });
    }
    if (data.estacionamientos.length > 0) {
      const estResumen = data.estacionamientos.reduce((acc: any, est: any) => {
        const tipo =
          est.tipos_estacionamiento?.nombre ||
          est.tipo_estacionamiento ||
          "Sin especificar";
        acc[tipo] = (acc[tipo] || 0) + 1;
        return acc;
      }, {});
      const estTexto =
        Object.entries(estResumen)
          .map(([tipo, cantidad]) => `${cantidad} ${tipo}`)
          .join(", ") || "N/A";
      iconItems.push({ icon: "estacionamiento", value: estTexto });
    }
    if (data.bodegas.length > 0) {
      iconItems.push({
        icon: "bodega",
        value: `${data.bodegas.length} ${
          data.bodegas.length === 1 ? "Bodega" : "Bodegas"
        }`,
      });
    }
    if (data.propertyDetails.tieneBalcon) {
      iconItems.push({ icon: "balcon", value: "Balcón" });
    }

    // Render icons in 2 columns
    const iconsPerCol = Math.ceil(iconItems.length / 2);
    iconItems.forEach((item, idx) => {
      const col = idx < iconsPerCol ? 0 : 1;
      const row = idx < iconsPerCol ? idx : idx - iconsPerCol;
      const x = iconX + col * (iconColWidth / 2);
      const yPos = propStartY + row * iconSpacing;

      const iconBase64 = this.iconCache.get(item.icon);
      if (iconBase64) {
        try {
          pdf.addImage(iconBase64, "PNG", x, yPos - 3, iconSize, iconSize);
        } catch (e) {
          console.warn("Error adding icon:", e);
        }
      }
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(primaryColor);
      pdf.text(item.value, x + iconSize + 2, yPos + 1);
    });

    // Model image column
    if (modelImageBase64) {
      const imageX = margin + propColWidth + iconColWidth + 5;
      const imageWidth = imageColWidth - 10;
      const imageHeight = 35;
      try {
        pdf.addImage(
          modelImageBase64,
          "JPEG",
          imageX,
          propStartY,
          imageWidth,
          imageHeight
        );
      } catch (e) {
        console.warn("Error adding model image:", e);
      }
    }

    y = Math.max(y, propStartY + 40);
    drawLine(y);
    y += 6;

    // === PAYMENT SCHEMES ===
    const selectedScheme = data.paymentSchemes[0];
    const filteredSchemes = selectedScheme?.es_manual
      ? data.paymentSchemes.filter((s) => s.es_manual)
      : data.paymentSchemes.filter((s) => !s.es_manual);

    if (filteredSchemes.length > 0) {
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(primaryColor);
      pdf.text("Esquemas de pago:", margin, y);
      y += 7;

      // Render payment schemes in a grid (2 columns)
      const schemeWidth = (contentWidth - 4) / 2;
      const schemeHeight = 45;
      const schemePadding = 3;

      filteredSchemes.forEach((scheme, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const schemeX = margin + col * (schemeWidth + 4);
        const schemeY = y + row * (schemeHeight + 4);

        const isSelected =
          data.offerData.id_esquema_pago_seleccionado === scheme.id;
        const amounts = calculatePaymentAmounts(scheme);
        const hasSavings = amounts.adjustment < 0;

        // Background
        if (isSelected) {
          pdf.setFillColor(selectedBg);
          pdf.setDrawColor(selectedBorder);
          pdf.setLineWidth(0.5);
          pdf.roundedRect(
            schemeX,
            schemeY,
            schemeWidth,
            schemeHeight,
            2,
            2,
            "FD"
          );
        } else {
          pdf.setFillColor("#FFFFFF");
          pdf.setDrawColor("#D0D0D0");
          pdf.setLineWidth(0.3);
          pdf.roundedRect(
            schemeX,
            schemeY,
            schemeWidth,
            schemeHeight,
            2,
            2,
            "FD"
          );
        }

        let lineY = schemeY + schemePadding + 3;

        // Scheme name (only for non-manual)
        if (!scheme.es_manual) {
          pdf.setFontSize(10);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(primaryColor);
          pdf.text(scheme.nombre, schemeX + schemePadding, lineY);
          lineY += 5;
        }

        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");

        // Final price
        pdf.setTextColor(grayColor);
        pdf.text("Precio final:", schemeX + schemePadding, lineY);
        pdf.setTextColor(primaryColor);
        pdf.setFont("helvetica", "bold");
        pdf.text(
          formatCurrency(amounts.finalPrice),
          schemeX + schemeWidth - schemePadding,
          lineY,
          { align: "right" }
        );
        lineY += 4;

        // Savings (if applicable)
        if (hasSavings) {
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(grayColor);
          pdf.text(
            `Ahorro (${Math.abs(scheme.porcentaje_descuento_aumento)}%):`,
            schemeX + schemePadding,
            lineY
          );
          pdf.setTextColor(primaryColor);
          pdf.setFont("helvetica", "bold");
          pdf.text(
            formatCurrency(Math.abs(amounts.adjustment)),
            schemeX + schemeWidth - schemePadding,
            lineY,
            { align: "right" }
          );
          lineY += 4;
        }

        // Down payment
        if (scheme.porcentaje_enganche > 0) {
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(grayColor);
          const engancheLabel =
            scheme.numero_pagos_enganche > 1
              ? `Enganche (en ${scheme.numero_pagos_enganche} pagos):`
              : "Enganche:";
          pdf.text(engancheLabel, schemeX + schemePadding, lineY);
          pdf.setTextColor(primaryColor);
          pdf.setFont("helvetica", "bold");
          pdf.text(
            `${scheme.porcentaje_enganche}% ${formatCurrency(amounts.enganche)}`,
            schemeX + schemeWidth - schemePadding,
            lineY,
            { align: "right" }
          );
          lineY += 4;
        }

        // Monthly payments
        if (
          scheme.porcentaje_mensualidades > 0 &&
          scheme.numero_mensualidades > 0
        ) {
          // "Durante la obra" total
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(grayColor);
          pdf.text("Durante la obra:", schemeX + schemePadding, lineY);
          pdf.setTextColor(primaryColor);
          pdf.setFont("helvetica", "bold");
          pdf.text(
            `${scheme.porcentaje_mensualidades}% ${formatCurrency(
              amounts.finalPrice * (scheme.porcentaje_mensualidades / 100)
            )}`,
            schemeX + schemeWidth - schemePadding,
            lineY,
            { align: "right" }
          );
          lineY += 4;

          // Tiered payments (tramos)
          if (scheme.tramos_mensualidad && scheme.tramos_mensualidad.length > 0) {
            scheme.tramos_mensualidad.forEach((tramo, idx) => {
              const mensualidadesAcumuladas = scheme.tramos_mensualidad!
                .slice(0, idx)
                .reduce((acc, t) => acc + t.numero_mensualidades, 0);

              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(grayColor);
              pdf.text(
                `${tramo.numero_mensualidades} mensualidades:`,
                schemeX + schemePadding,
                lineY
              );
              pdf.setTextColor(primaryColor);
              pdf.setFont("helvetica", "bold");
              let mensualidadText = formatCurrency(tramo.monto);
              if (idx > 0) {
                mensualidadText += ` (mes ${mensualidadesAcumuladas + 1}+)`;
              }
              pdf.text(
                mensualidadText,
                schemeX + schemeWidth - schemePadding,
                lineY,
                { align: "right" }
              );
              lineY += 4;
            });
          } else {
            // Uniform payments
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(grayColor);
            pdf.text(
              `${scheme.numero_mensualidades} mensualidades:`,
              schemeX + schemePadding,
              lineY
            );
            pdf.setTextColor(primaryColor);
            pdf.setFont("helvetica", "bold");
            pdf.text(
              formatCurrency(amounts.mensualidad),
              schemeX + schemeWidth - schemePadding,
              lineY,
              { align: "right" }
            );
            lineY += 4;
          }
        }

        // Delivery payment
        if (scheme.porcentaje_entrega > 0) {
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(grayColor);
          pdf.text("A la entrega:", schemeX + schemePadding, lineY);
          pdf.setTextColor(primaryColor);
          pdf.setFont("helvetica", "bold");
          pdf.text(
            `${scheme.porcentaje_entrega}% ${formatCurrency(amounts.entrega)}`,
            schemeX + schemeWidth - schemePadding,
            lineY,
            { align: "right" }
          );
        }
      });

      // Move Y past all payment scheme cards
      const totalRows = Math.ceil(filteredSchemes.length / 2);
      y += totalRows * (schemeHeight + 4) + 4;
      drawLine(y);
      y += 6;
    }

    // === BANKING DATA ===
    const hasValidRFC = isValidRFC(data.leadInfo?.rfc);
    const showBanking =
      hasValidRFC &&
      !!data.offerData.id_esquema_pago_seleccionado &&
      (data.propertyDetails.clabe_stp_tmp_apartado ||
        (data.propertyDetails.projectData?.mostrar_seccion_efectivo_en_oferta &&
          data.propertyDetails.ownerStpBankAccount));

    if (showBanking) {
      checkNewPage(35);

      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(primaryColor);
      pdf.text("Datos Bancarios", margin, y);
      y += 7;

      const bankCardWidth =
        data.propertyDetails.clabe_stp_tmp_apartado &&
        data.propertyDetails.projectData?.mostrar_seccion_efectivo_en_oferta &&
        data.propertyDetails.ownerStpBankAccount
          ? (contentWidth - 4) / 2
          : contentWidth;
      const bankCardHeight = 25;

      // Transfer payment card
      if (data.propertyDetails.clabe_stp_tmp_apartado) {
        pdf.setFillColor(dividerColor);
        pdf.roundedRect(margin, y, bankCardWidth, bankCardHeight, 2, 2, "F");

        pdf.setFontSize(9);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(primaryColor);
        pdf.text("Pago por transferencia", margin + 3, y + 5);

        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        let bankY = y + 10;

        pdf.text("Banco: Sistema de Transferencias y Pagos (STP)", margin + 3, bankY);
        bankY += 4;
        pdf.text(
          `Titular: ${data.propertyDetails.ownerData?.nombre_legal || "N/A"}`,
          margin + 3,
          bankY
        );
        bankY += 4;
        pdf.text(
          `Cuenta CLABE: ${data.propertyDetails.clabe_stp_tmp_apartado}`,
          margin + 3,
          bankY
        );
      }

      // Cash payment card
      if (
        data.propertyDetails.projectData?.mostrar_seccion_efectivo_en_oferta &&
        data.propertyDetails.ownerStpBankAccount
      ) {
        const cashX = data.propertyDetails.clabe_stp_tmp_apartado
          ? margin + bankCardWidth + 4
          : margin;

        pdf.setFillColor(dividerColor);
        pdf.roundedRect(cashX, y, bankCardWidth, bankCardHeight, 2, 2, "F");

        pdf.setFontSize(9);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(primaryColor);
        pdf.text("Pago en efectivo", cashX + 3, y + 5);

        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        let bankY = y + 10;

        pdf.text(
          `Banco: ${data.propertyDetails.ownerStpBankAccount.banco_nombre}`,
          cashX + 3,
          bankY
        );
        bankY += 4;
        pdf.text(
          `Titular: ${data.propertyDetails.ownerData?.nombre_legal || "N/A"}`,
          cashX + 3,
          bankY
        );
        bankY += 4;
        pdf.text(
          `Cuenta CLABE: ${data.propertyDetails.ownerStpBankAccount.cuenta_clabe}`,
          cashX + 3,
          bankY
        );
      }

      y += bankCardHeight + 4;
      drawLine(y);
      y += 6;
    }

    // === CONTACT INFO ===
    checkNewPage(30);

    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(primaryColor);
    pdf.text("Datos de Contacto", margin, y);
    y += 7;

    const contactColWidth = (contentWidth - 4) / 2;

    // Agent column
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(primaryColor);
    pdf.text("Agente", margin, y);
    y += 5;

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");

    const agentName =
      data.creatorInfo?.nombre_legal ||
      data.creatorInfo?.nombre ||
      data.offerData.email_creador;
    pdf.setFont("helvetica", "bold");
    pdf.text("Nombre:", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(agentName, margin + 18, y);
    y += 4;

    pdf.setFont("helvetica", "bold");
    pdf.text("Email:", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(data.creatorInfo?.email || data.offerData.email_creador, margin + 18, y);
    y += 4;

    pdf.setFont("helvetica", "bold");
    pdf.text("Teléfono:", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(data.creatorInfo?.telefono || "N/A", margin + 18, y);

    // Buyer column (same row as agent, right side)
    const buyerX = margin + contactColWidth + 4;
    let buyerY = y - 13; // Go back to header level

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.text("Comprador", buyerX, buyerY);
    buyerY += 5;

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("Nombre:", buyerX, buyerY);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      data.leadInfo?.nombre_legal || data.offerData.leadName,
      buyerX + 18,
      buyerY
    );
    buyerY += 4;

    pdf.setFont("helvetica", "bold");
    pdf.text("Email:", buyerX, buyerY);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      data.leadInfo?.email || data.offerData.leadEmail,
      buyerX + 18,
      buyerY
    );
    buyerY += 4;

    if (data.leadInfo?.telefono) {
      pdf.setFont("helvetica", "bold");
      pdf.text("Teléfono:", buyerX, buyerY);
      pdf.setFont("helvetica", "normal");
      pdf.text(data.leadInfo.telefono, buyerX + 18, buyerY);
      buyerY += 4;
    }

    if (data.leadInfo?.rfc) {
      pdf.setFont("helvetica", "bold");
      pdf.text("RFC:", buyerX, buyerY);
      pdf.setFont("helvetica", "normal");
      pdf.text(data.leadInfo.rfc, buyerX + 18, buyerY);
    }

    // Generate filename
    const projectName = data.propertyDetails.projectData?.nombre || "Proyecto";
    const propertyNumber = data.propertyDetails.numero_propiedad || "N/A";
    const offerNumber = data.offerData.id.toString().padStart(6, "0");

    const cleanProjectName = projectName.replace(/[^a-zA-Z0-9]/g, "_");
    const cleanPropertyNumber = propertyNumber.replace(/[^a-zA-Z0-9]/g, "_");

    const filename = `O_${offerNumber}_${cleanPropertyNumber}_${cleanProjectName}.pdf`;

    // Save PDF
    pdf.save(filename);
    console.log("Native PDF generated successfully:", filename);
  }

  private async preloadIcons(): Promise<void> {
    const icons = [
      { name: "recamaras", src: recamarasIcon },
      { name: "banos", src: banosIcon },
      { name: "mediosBanos", src: mediosBanosIcon },
      { name: "estacionamiento", src: estacionamientoIcon },
      { name: "bodega", src: bodegaIcon },
      { name: "balcon", src: balconIcon },
    ];

    await Promise.all(
      icons.map(async (icon) => {
        try {
          const base64 = await this.loadImageAsBase64(icon.src);
          this.iconCache.set(icon.name, base64);
        } catch (e) {
          console.warn(`Failed to load icon ${icon.name}:`, e);
        }
      })
    );
  }

  private async loadImageAsBase64(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          resolve(dataUrl);
        } else {
          reject(new Error("Could not get canvas context"));
        }
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.src = url;
    });
  }
}

export const ofertaPdfNativeService = new OfertaPdfNativeService();
