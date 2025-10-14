import { supabase } from "@/integrations/supabase/client";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import html2canvas from "html2canvas";
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
        .select("id_propiedad, id_producto")
        .eq("id", cuentaData.id_oferta)
        .single();

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

      // Fetch pagos
      const { data: pagos, error: pagosError } = await supabase
        .from("pagos")
        .select(`
          *,
          metodos_pago(nombre),
          aplicaciones_pago!inner(
            monto,
            id_acuerdo_pago,
            es_multa
          )
        `)
        .eq("id_cuenta_cobranza", data.id_cuenta)
        .eq("activo", true)
        .order("fecha_pago", { ascending: true });

      if (pagosError) throw pagosError;

      // Fetch proyecto info
      let proyectoData = null;
      if (ofertaData.id_propiedad) {
        const { data: propiedadData } = await supabase
          .from("propiedades")
          .select("id_entidad_relacionada_dueno")
          .eq("id", ofertaData.id_propiedad)
          .single();

        if (propiedadData) {
          const { data: entidadData } = await supabase
            .from("entidades_relacionadas")
            .select("id_proyecto")
            .eq("id", propiedadData.id_entidad_relacionada_dueno)
            .single();

          if (entidadData) {
            const { data: proyecto } = await supabase
              .from("proyectos")
              .select("*")
              .eq("id", entidadData.id_proyecto)
              .single();

            proyectoData = proyecto;
          }
        }
      }

      // Calculate totals
      const precioFinal = cuentaData.precio_final || 0;
      const totalPagado = pagos.reduce((sum, pago) => {
        const aplicacionesNoPagadas = pago.aplicaciones_pago.filter(
          (ap: any) => !ap.es_multa
        );
        return sum + aplicacionesNoPagadas.reduce((s: number, ap: any) => s + (ap.monto || 0), 0);
      }, 0);

      const totalMultas = pagos.reduce((sum, pago) => {
        const aplicacionesMultas = pago.aplicaciones_pago.filter(
          (ap: any) => ap.es_multa
        );
        return sum + aplicacionesMultas.reduce((s: number, ap: any) => s + (ap.monto || 0), 0);
      }, 0);

      const saldoPendiente = precioFinal - totalPagado;

      // Generate HTML
      await this.renderTemplate({
        cuenta: cuentaData,
        oferta: ofertaData,
        compradores,
        acuerdos,
        pagos,
        proyecto: proyectoData,
        precioFinal,
        totalPagado,
        totalMultas,
        saldoPendiente,
      });
    } catch (error) {
      console.error("Error generating estado de cuenta:", error);
      throw error;
    }
  }

  private async renderTemplate(data: any): Promise<void> {
    // Load template
    const response = await fetch("/templates/template-edc-1.html");
    const templateHtml = await response.text();

    // Create a temporary container
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.innerHTML = templateHtml;
    document.body.appendChild(container);

    // Format money
    const formatMoney = (amount: number) =>
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
      }).format(amount);

    // Format date
    const formatDate = (date: string) =>
      new Date(date).toLocaleDateString("es-MX");

    // Populate company info
    const companyName = container.querySelector("#companyName");
    if (companyName) companyName.textContent = data.proyecto?.nombre || "N/A";

    const companyAddress = container.querySelector("#companyAddress");
    if (companyAddress)
      companyAddress.textContent = data.proyecto?.direccion || "N/A";

    // Populate account info
    const accountNumber = container.querySelector("#accountNumber");
    if (accountNumber)
      accountNumber.textContent = formatCuentaCobranzaId(
        data.cuenta.id,
        data.oferta.id_producto ? "Producto" : "Propiedad"
      );

    const clientName = container.querySelector("#clientName");
    if (clientName && data.compradores.length > 0) {
      clientName.textContent = data.compradores
        .map((c: any) => c.personas.nombre_legal)
        .join(", ");
    }

    const clientIdentifier = container.querySelector("#clientIdentifier");
    if (clientIdentifier && data.compradores.length > 0) {
      clientIdentifier.textContent =
        data.compradores[0].personas.rfc ||
        data.compradores[0].personas.curp ||
        "";
    }

    // Populate status
    const accountStatus = container.querySelector("#accountStatus");
    if (accountStatus)
      accountStatus.textContent = data.cuenta.es_aprobado
        ? "APROBADO"
        : "PENDIENTE";

    // Populate dates
    const period = container.querySelector("#period");
    if (period && data.acuerdos.length > 0) {
      const firstDate = data.acuerdos[0].fecha_pago;
      const lastDate = data.acuerdos[data.acuerdos.length - 1].fecha_pago;
      period.textContent = `${formatDate(firstDate)} — ${formatDate(lastDate)}`;
    }

    const issueDate = container.querySelector("#issueDate");
    if (issueDate) issueDate.textContent = formatDate(new Date().toISOString());

    // Populate summary
    const precioFinal = container.querySelector("#precioFinal");
    if (precioFinal) precioFinal.textContent = formatMoney(data.precioFinal);

    const totalPagado = container.querySelector("#totalPagado");
    if (totalPagado) totalPagado.textContent = formatMoney(data.totalPagado);

    const totalMultas = container.querySelector("#totalMultas");
    if (totalMultas) totalMultas.textContent = formatMoney(data.totalMultas);

    const saldoPendiente = container.querySelector("#saldoPendiente");
    if (saldoPendiente)
      saldoPendiente.textContent = formatMoney(data.saldoPendiente);

    // Populate acuerdos table
    const acuerdosTable = container.querySelector("#acuerdosTable");
    if (acuerdosTable) {
      acuerdosTable.innerHTML = data.acuerdos
        .map((acuerdo: any) => {
          // Calculate pagado for this acuerdo
          const pagadoAcuerdo = data.pagos.reduce((sum: number, pago: any) => {
            const aplicacionesAcuerdo = pago.aplicaciones_pago.filter(
              (ap: any) => ap.id_acuerdo_pago === acuerdo.id && !ap.es_multa
            );
            return (
              sum +
              aplicacionesAcuerdo.reduce(
                (s: number, ap: any) => s + (ap.monto || 0),
                0
              )
            );
          }, 0);

          const pendiente = acuerdo.monto - pagadoAcuerdo;
          const estado = acuerdo.pago_completado ? "Pagado" : "Pendiente";

          return `
          <tr>
            <td>${acuerdo.orden}</td>
            <td>${acuerdo.conceptos_pago.nombre}</td>
            <td>${acuerdo.fecha_pago ? formatDate(acuerdo.fecha_pago) : "N/A"}</td>
            <td class="right">${formatMoney(acuerdo.monto)}</td>
            <td class="right">${formatMoney(pagadoAcuerdo)}</td>
            <td class="right">${formatMoney(pendiente)}</td>
            <td>${estado}</td>
          </tr>
        `;
        })
        .join("");
    }

    // Populate pagos table
    const pagosTable = container.querySelector("#pagosTable");
    if (pagosTable) {
      pagosTable.innerHTML = data.pagos
        .map((pago: any) => {
          const montoPago = pago.aplicaciones_pago
            .filter((ap: any) => !ap.es_multa)
            .reduce((s: number, ap: any) => s + (ap.monto || 0), 0);

          return `
          <tr>
            <td>${formatDate(pago.fecha_pago)}</td>
            <td>${pago.metodos_pago.nombre}</td>
            <td>${pago.clave_rastreo || "N/A"}</td>
            <td class="right">${formatMoney(montoPago)}</td>
          </tr>
        `;
        })
        .join("");
    }

    const totalPagosFooter = container.querySelector("#totalPagosFooter");
    if (totalPagosFooter)
      totalPagosFooter.textContent = formatMoney(data.totalPagado);

    // Populate notes
    const notes = container.querySelector("#notes");
    if (notes)
      notes.textContent =
        "Este estado de cuenta muestra el detalle de acuerdos de pago y pagos realizados.";

    // Generate PDF
    await this.generatePDF(container);

    // Cleanup
    document.body.removeChild(container);
  }

  private async generatePDF(container: HTMLElement): Promise<void> {
    const card = container.querySelector(".card") as HTMLElement;
    if (!card) return;

    const canvas = await html2canvas(card, {
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(`estado-cuenta-${Date.now()}.pdf`);
  }
}
