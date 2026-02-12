import jsPDF from "jspdf";

interface PropertyDetails {
  id: number;
  numero_propiedad: string;
  building?: {
    id: number;
    nombre: string;
  };
  model?: {
    id: number;
    nombre: string;
  };
  projectData?: {
    id: number;
    nombre: string;
    url_logo?: string;
  };
}

interface ProductDetails {
  id: number;
  nombre: string;
  precio_lista: number;
  precio_por_m2?: number | null;
  metraje?: number | null;
  categoria_nombre?: string;
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
}

interface PaymentScheme {
  id: number;
  nombre: string;
  porcentaje_enganche: number;
  numero_mensualidades: number;
  porcentaje_mensualidades: number;
  porcentaje_entrega: number;
  porcentaje_descuento_aumento: number;
  es_manual: boolean;
}

interface OfferData {
  id: number;
  fecha_generacion: string;
  propertyNumber: string;
  leadName: string;
  leadEmail: string;
  email_creador: string;
  id_esquema_pago_seleccionado?: number | null;
  clabe_stp_tmp_producto?: string | null;
  clabe_stp?: string | null;
}

interface LeadInfo {
  nombre_legal: string;
  email: string;
  telefono: string;
  rfc?: string | null;
}

interface CreatorInfo {
  nombre_legal?: string;
  nombre?: string;
  email: string;
  telefono?: string | null;
}

interface GenerateProductPDFData {
  offerData: OfferData;
  propertyDetails: PropertyDetails;
  productDetails: ProductDetails;
  paymentSchemes: PaymentScheme[];
  creatorInfo: CreatorInfo | null;
  leadInfo: LeadInfo | null;
  legalNotices: string[];
  id_estatus_aprobacion?: number | null;
  estatus_aprobacion_nombre?: string | null;
}

export class OfertaProductoPdfNativeService {
  async generateOfferPDF(data: GenerateProductPDFData): Promise<{ blob: Blob; filename: string }> {
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
    const dividerColor = "#D3D3D3";
    const selectedBg = "#E8F4E8";
    const selectedBorder = "#22C55E";
    const cardBg = "#F5F5F5";
    const cardBorder = "#D0D0D0";

    // Helper functions
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
      }).format(amount);
    };

    const formatOfferNumber = (offerId: number) => {
      return `OP-${offerId.toString().padStart(6, "0")}`;
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

    const checkNewPage = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - margin) {
        pdf.addPage();
        y = margin;
        return true;
      }
      return false;
    };

    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : { r: 0, g: 0, b: 0 };
    };

    // Calculate payment amounts
    const calculatePaymentAmounts = (scheme: PaymentScheme, basePrice: number) => {
      const adjustment = basePrice * (scheme.porcentaje_descuento_aumento / 100);
      const finalPrice = basePrice + adjustment;

      return {
        enganche: finalPrice * (scheme.porcentaje_enganche / 100),
        mensualidad:
          scheme.numero_mensualidades > 0
            ? (finalPrice * (scheme.porcentaje_mensualidades / 100)) / scheme.numero_mensualidades
            : 0,
        entrega: finalPrice * (scheme.porcentaje_entrega / 100),
        finalPrice,
        adjustment,
      };
    };

    // Load logo image
    const loadLogoImage = async (url: string): Promise<string | null> => {
      try {
        const response = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!response.ok) return null;
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    };

    // === HEADER ===
    const logoUrl = data.propertyDetails.projectData?.url_logo;
    let logoBase64: string | null = null;
    if (logoUrl) {
      logoBase64 = await loadLogoImage(logoUrl);
    }

    // Draw header with logo and offer info
    const headerHeight = 25;
    if (logoBase64) {
      try {
        pdf.addImage(logoBase64, "PNG", margin, y, 35, 15);
      } catch (e) {
        console.warn("Could not add logo to PDF:", e);
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(primaryColor);
        pdf.text(data.propertyDetails.projectData?.nombre || "Proyecto", margin, y + 10);
      }
    } else {
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(primaryColor);
      pdf.text(data.propertyDetails.projectData?.nombre || "Proyecto", margin, y + 10);
    }

    // Offer info on the right
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(primaryColor);
    const rightX = pageWidth - margin;
    pdf.text(`ID Oferta: ${formatOfferNumber(data.offerData.id)}`, rightX, y + 5, { align: "right" });
    pdf.text(`Expedición: ${formatDate(data.offerData.fecha_generacion)}`, rightX, y + 10, { align: "right" });
    pdf.text(`Vigencia: ${calculateVigencia(data.offerData.fecha_generacion)}`, rightX, y + 15, { align: "right" });

    y += headerHeight;

    // Divider after header
    drawLine(y);
    y += 6;

    // === PROPERTY AND PRODUCT DATA ===
    const colWidth = (contentWidth - 6) / 2;

    // Property Data Card
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(primaryColor);
    pdf.text("Datos de la Propiedad:", margin, y);

    // Product Data Card Title
    pdf.text("Datos del Producto:", margin + colWidth + 6, y);
    y += 6;

    // Calculate card heights
    const lineHeight = 5.5;
    const propLines = 2 + (data.propertyDetails.model ? 1 : 0) + (data.propertyDetails.building ? 1 : 0);
    const prodLines = 3 + (data.productDetails.precio_por_m2 ? 1 : 0);
    const cardHeight = Math.max(propLines, prodLines) * lineHeight + 10;

    // Property Card Background
    const bgRgb = hexToRgb(cardBg);
    pdf.setFillColor(bgRgb.r, bgRgb.g, bgRgb.b);
    const borderRgb = hexToRgb(cardBorder);
    pdf.setDrawColor(borderRgb.r, borderRgb.g, borderRgb.b);
    pdf.roundedRect(margin, y, colWidth, cardHeight, 2, 2, "FD");

    // Product Card Background
    pdf.roundedRect(margin + colWidth + 6, y, colWidth, cardHeight, 2, 2, "FD");

    // Property Card Content
    let propY = y + 6;
    const propX = margin + 4;
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(primaryColor);

    pdf.text(`Proyecto: `, propX, propY);
    pdf.setFont("helvetica", "bold");
    pdf.text(data.propertyDetails.projectData?.nombre || "N/A", propX + 18, propY);
    propY += lineHeight;

    if (data.propertyDetails.model) {
      pdf.setFont("helvetica", "normal");
      pdf.text(`Modelo: `, propX, propY);
      pdf.setFont("helvetica", "bold");
      pdf.text(data.propertyDetails.model.nombre, propX + 15, propY);
      propY += lineHeight;
    }

    if (data.propertyDetails.building) {
      pdf.setFont("helvetica", "normal");
      pdf.text(`Edificio: `, propX, propY);
      pdf.setFont("helvetica", "bold");
      pdf.text(data.propertyDetails.building.nombre, propX + 16, propY);
      propY += lineHeight;
    }

    pdf.setFont("helvetica", "normal");
    pdf.text(`No° de propiedad: `, propX, propY);
    pdf.setFont("helvetica", "bold");
    pdf.text(data.propertyDetails.numero_propiedad, propX + 32, propY);

    // Product Card Content
    let prodY = y + 6;
    const prodX = margin + colWidth + 10;

    pdf.setFont("helvetica", "normal");
    pdf.text(`Categoría: `, prodX, prodY);
    pdf.setFont("helvetica", "bold");
    pdf.text(data.productDetails.categoria_nombre || "N/A", prodX + 19, prodY);
    prodY += lineHeight;

    pdf.setFont("helvetica", "normal");
    pdf.text(`Producto: `, prodX, prodY);
    pdf.setFont("helvetica", "bold");
    const prodNameLines = pdf.splitTextToSize(data.productDetails.nombre, colWidth - 30);
    pdf.text(prodNameLines[0], prodX + 18, prodY);
    if (prodNameLines.length > 1) {
      prodY += lineHeight;
      pdf.text(prodNameLines[1], prodX, prodY);
    }
    prodY += lineHeight;

    if (data.productDetails.precio_por_m2 && data.productDetails.metraje) {
      pdf.setFont("helvetica", "normal");
      pdf.text(`Precio/m²: `, prodX, prodY);
      pdf.setFont("helvetica", "bold");
      pdf.text(formatCurrency(data.productDetails.precio_por_m2), prodX + 20, prodY);
      prodY += lineHeight;

      pdf.setFont("helvetica", "normal");
      pdf.text(`Metraje: `, prodX, prodY);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${data.productDetails.metraje} m²`, prodX + 16, prodY);
      prodY += lineHeight;
    }

    pdf.setFont("helvetica", "normal");
    pdf.text(`Precio de lista: `, prodX, prodY);
    pdf.setFont("helvetica", "bold");
    pdf.text(formatCurrency(data.productDetails.precio_lista), prodX + 28, prodY);

    y += cardHeight + 6;

    // === PAYMENT SCHEMES ===
    const selectedScheme = data.paymentSchemes.find(
      (s) => s.id === data.offerData.id_esquema_pago_seleccionado
    );
    const displaySchemes = selectedScheme?.es_manual
      ? [selectedScheme]
      : data.paymentSchemes.filter((s) => !s.es_manual);

    if (displaySchemes.length > 0) {
      drawLine(y);
      y += 6;

      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(primaryColor);
      pdf.text("Esquemas de pago disponibles:", margin, y);
      y += 6;

      const schemeWidth = displaySchemes.length === 1 ? contentWidth : (contentWidth - 4) / 2;
      const schemeHeight = 45;

      displaySchemes.forEach((scheme, index) => {
        const amounts = calculatePaymentAmounts(scheme, data.productDetails.precio_lista);
        const isSelected = data.offerData.id_esquema_pago_seleccionado === scheme.id;
        const hasSavings = amounts.adjustment < 0;

        // Check if we need a new row
        if (index % 2 === 0) {
          checkNewPage(schemeHeight + 10);
        }

        const xOffset = displaySchemes.length === 1 ? 0 : (index % 2) * (schemeWidth + 4);
        const schemeX = margin + xOffset;

        // Background
        const schemeBgRgb = hexToRgb(isSelected ? selectedBg : cardBg);
        pdf.setFillColor(schemeBgRgb.r, schemeBgRgb.g, schemeBgRgb.b);
        const schemeBorderRgb = hexToRgb(isSelected ? selectedBorder : cardBorder);
        pdf.setDrawColor(schemeBorderRgb.r, schemeBorderRgb.g, schemeBorderRgb.b);
        pdf.setLineWidth(isSelected ? 0.5 : 0.3);
        pdf.roundedRect(schemeX, y, schemeWidth, schemeHeight, 2, 2, "FD");

        // Scheme content
        let schemeY = y + 6;
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(primaryColor);
        pdf.text(scheme.nombre, schemeX + 4, schemeY);
        
        // Draw approval status badge next to scheme name
        if (isSelected && data.offerData.id_esquema_pago_seleccionado && data.id_estatus_aprobacion && data.estatus_aprobacion_nombre) {
          const statusColors: Record<number, { bg: [number, number, number]; text: [number, number, number] }> = {
            1: { bg: [255, 243, 205], text: [133, 100, 4] },
            2: { bg: [212, 237, 218], text: [21, 87, 36] },
            3: { bg: [248, 215, 218], text: [114, 28, 36] },
            4: { bg: [204, 229, 255], text: [0, 64, 133] },
          };
          const colors = statusColors[data.id_estatus_aprobacion] || statusColors[1];
          const nameWidth = pdf.getTextWidth(scheme.nombre);
          const badgeX = schemeX + 4 + nameWidth + 2;
          const badgeText = data.estatus_aprobacion_nombre;
          pdf.setFontSize(6);
          pdf.setFont("helvetica", "normal");
          const badgeTextWidth = pdf.getTextWidth(badgeText);
          const badgePadding = 1.5;
          const badgeW = badgeTextWidth + badgePadding * 2;
          const badgeH = 4;
          const badgeYPos = schemeY - 3;
          pdf.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
          pdf.roundedRect(badgeX, badgeYPos, badgeW, badgeH, 1, 1, "F");
          pdf.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
          pdf.text(badgeText, badgeX + badgePadding, badgeYPos + 2.8);
          pdf.setFontSize(10);
        }
        
        schemeY += 6;

        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");

        // Price final
        pdf.text("Precio final:", schemeX + 4, schemeY);
        pdf.setFont("helvetica", "bold");
        pdf.text(formatCurrency(amounts.finalPrice), schemeX + schemeWidth - 4, schemeY, { align: "right" });
        schemeY += 5;

        // Savings
        if (hasSavings) {
          pdf.setFont("helvetica", "normal");
          pdf.text("Ahorro:", schemeX + 4, schemeY);
          pdf.setFont("helvetica", "bold");
          pdf.text(
            `${Math.abs(scheme.porcentaje_descuento_aumento)}% ${formatCurrency(Math.abs(amounts.adjustment))}`,
            schemeX + schemeWidth - 4,
            schemeY,
            { align: "right" }
          );
          schemeY += 5;
        }

        // Enganche
        if (scheme.porcentaje_enganche > 0) {
          pdf.setFont("helvetica", "normal");
          pdf.text(`Enganche (${scheme.porcentaje_enganche}%):`, schemeX + 4, schemeY);
          pdf.setFont("helvetica", "bold");
          pdf.text(formatCurrency(amounts.enganche), schemeX + schemeWidth - 4, schemeY, { align: "right" });
          schemeY += 5;
        }

        // Mensualidades
        if (scheme.porcentaje_mensualidades > 0 && scheme.numero_mensualidades > 0) {
          pdf.setFont("helvetica", "normal");
          pdf.text(`${scheme.numero_mensualidades} mensualidades:`, schemeX + 4, schemeY);
          pdf.setFont("helvetica", "bold");
          pdf.text(formatCurrency(amounts.mensualidad), schemeX + schemeWidth - 4, schemeY, { align: "right" });
          schemeY += 5;
        }

        // Entrega
        if (scheme.porcentaje_entrega > 0) {
          pdf.setFont("helvetica", "normal");
          pdf.text(`A la entrega (${scheme.porcentaje_entrega}%):`, schemeX + 4, schemeY);
          pdf.setFont("helvetica", "bold");
          pdf.text(formatCurrency(amounts.entrega), schemeX + schemeWidth - 4, schemeY, { align: "right" });
        }

        // Move to next row after every 2 schemes
        if (index % 2 === 1 || displaySchemes.length === 1) {
          y += schemeHeight + 4;
        }
      });

      // Handle odd number of schemes
      if (displaySchemes.length > 1 && displaySchemes.length % 2 !== 0) {
        y += schemeHeight + 4;
      }
    }

    y += 2;

    // === BANKING DATA ===
    const hasClabe = data.offerData.clabe_stp_tmp_producto || data.offerData.clabe_stp;
    const hasCashAccount = data.productDetails.ownerStpBankAccount;

    if (hasClabe || hasCashAccount) {
      drawLine(y);
      y += 6;

      checkNewPage(40);

      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(primaryColor);
      pdf.text("Datos Bancarios", margin, y);
      y += 6;

      const bankCardWidth = hasClabe && hasCashAccount ? (contentWidth - 4) / 2 : contentWidth;
      const bankCardHeight = 30;

      const bankBgRgb = hexToRgb("#D3D3D3");
      pdf.setFillColor(bankBgRgb.r, bankBgRgb.g, bankBgRgb.b);

      // Transfer card
      if (hasClabe) {
        pdf.roundedRect(margin, y, bankCardWidth, bankCardHeight, 2, 2, "F");

        let bankY = y + 6;
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "bold");
        pdf.text("Pago por transferencia", margin + 4, bankY);
        bankY += 5;

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text("Banco: Sistema de Transferencias y Pagos (STP)", margin + 4, bankY);
        bankY += 4;
        pdf.text(`Titular: ${data.productDetails.ownerData?.nombre_legal || "N/A"}`, margin + 4, bankY);
        bankY += 4;
        pdf.text(`Cuenta CLABE: ${data.offerData.clabe_stp_tmp_producto || data.offerData.clabe_stp}`, margin + 4, bankY);
      }

      // Cash card
      if (hasCashAccount) {
        const cashX = hasClabe ? margin + bankCardWidth + 4 : margin;
        pdf.roundedRect(cashX, y, bankCardWidth, bankCardHeight, 2, 2, "F");

        let cashY = y + 6;
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "bold");
        pdf.text("Pago en efectivo", cashX + 4, cashY);
        cashY += 5;

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text(`Banco: ${data.productDetails.ownerStpBankAccount!.banco_nombre}`, cashX + 4, cashY);
        cashY += 4;
        pdf.text(`Titular: ${data.productDetails.ownerData?.nombre_legal || "N/A"}`, cashX + 4, cashY);
        cashY += 4;
        pdf.text(`No. Cuenta: ${data.productDetails.ownerStpBankAccount!.numero_cuenta}`, cashX + 4, cashY);
        cashY += 4;
        pdf.text(`CLABE: ${data.productDetails.ownerStpBankAccount!.cuenta_clabe}`, cashX + 4, cashY);
      }

      y += bankCardHeight + 6;
    }

    // === CONTACT DATA ===
    drawLine(y);
    y += 6;

    checkNewPage(35);

    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(primaryColor);
    pdf.text("Datos de Contacto:", margin, y);
    y += 6;

    const contactColWidth = (contentWidth - 6) / 2;

    // Agent
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.text("Agente:", margin, y);
    pdf.text("Comprador:", margin + contactColWidth + 6, y);
    y += 5;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);

    // Agent details
    let agentY = y;
    const agentName = data.creatorInfo?.nombre_legal || data.creatorInfo?.nombre || data.offerData.email_creador;
    pdf.text(`Nombre: ${agentName}`, margin, agentY);
    agentY += 4;
    pdf.text(`Email: ${data.offerData.email_creador}`, margin, agentY);
    agentY += 4;
    pdf.text(`Teléfono: ${data.creatorInfo?.telefono || "N/A"}`, margin, agentY);

    // Buyer details
    let buyerY = y;
    const buyerX = margin + contactColWidth + 6;
    pdf.text(`Nombre: ${data.offerData.leadName}`, buyerX, buyerY);
    buyerY += 4;
    pdf.text(`Email: ${data.offerData.leadEmail}`, buyerX, buyerY);
    buyerY += 4;
    if (data.leadInfo?.telefono) {
      pdf.text(`Teléfono: ${data.leadInfo.telefono}`, buyerX, buyerY);
      buyerY += 4;
    }
    if (data.leadInfo?.rfc) {
      pdf.text(`RFC: ${data.leadInfo.rfc}`, buyerX, buyerY);
    }

    // Generate filename
    const projectName = data.propertyDetails.projectData?.nombre || "Proyecto";
    const propertyNumber = data.propertyDetails.numero_propiedad || "N-A";
    const productName = data.productDetails.nombre || "Producto";
    const offerNumber = data.offerData.id.toString().padStart(6, "0");

    const cleanProjectName = projectName.replace(/[^a-zA-Z0-9]/g, "_");
    const cleanPropertyNumber = propertyNumber.replace(/[^a-zA-Z0-9]/g, "_");
    const cleanProductName = productName.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);

    const filename = `OP_${offerNumber}_${cleanPropertyNumber}_${cleanProductName}_${cleanProjectName}.pdf`;

    // Return blob and filename instead of saving directly
    const blob = pdf.output('blob');
    console.log("Native Product PDF generated successfully:", filename);
    return { blob, filename };
  }
}

export const ofertaProductoPdfNativeService = new OfertaProductoPdfNativeService();
