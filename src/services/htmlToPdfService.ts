import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OfferPDFTemplate } from '@/components/admin/OfferPDFTemplate';

interface OfferData {
  propertyId: number;
  offerId: number;
  propertyNumber: string;
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  creatorEmail: string;
}

interface PropertyDetails {
  id: number;
  numero_propiedad: string;
  precio_lista: number;
  m2_reales: number | null;
  m2_escriturables: number | null;
  descripcion: string | null;
  numero_piso?: number | null;
  clabe_stp_tmp_apartado?: string | null;
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
  };
  projectData?: {
    id: number;
    nombre: string;
    url_imagen_portada?: string;
    mostrar_precio_m2_en_oferta?: boolean;
    mostrar_piso_en_oferta?: boolean;
    mostrar_seccion_efectivo_en_oferta?: boolean;
    mostrar_estacionamientos_en_oferta?: boolean;
    mostrar_bodega_en_oferta?: boolean;
    mostrar_modelo_en_oferta?: boolean;
    mostrar_edificio_en_oferta?: boolean;
    precio_m2?: number;
  };
  ownerData?: {
    id: number;
    nombre_legal: string;
    email: string;
    telefono: string | null;
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

interface ProjectAmenity {
  id: number;
  nombre: string;
  url: string | null;
}

class HTMLToPDFService {
  private doc: jsPDF | null = null;

  async generateOfferPDF(offerData: OfferData): Promise<void> {
    try {
      console.log('Starting PDF generation for offer:', offerData.offerId);

      // Fetch offer details from database
      const { data: offerDetails, error: offerError } = await supabase
        .from('ofertas')
        .select('*')
        .eq('id', offerData.offerId)
        .single();

      if (offerError || !offerDetails) {
        throw new Error('Error fetching offer details');
      }

      // Fetch all required data
      const [propertyDetails, paymentSchemes, amenities, creatorInfo, leadInfo, legalNotices, estacionamientos, bodegas] = await Promise.all([
        this.fetchPropertyDetails(offerData.propertyId),
        this.fetchPaymentSchemes(offerData.propertyId, offerData.offerId),
        this.fetchProjectAmenities(offerData.propertyId),
        this.fetchCreatorInfo(offerDetails.email_creador),
        this.fetchLeadInfo(offerDetails.id_persona_lead),
        this.fetchLegalNotices(offerData.propertyId),
        this.fetchEstacionamientos(offerData.propertyId),
        this.fetchBodegas(offerData.propertyId)
      ]);

      console.log('Data fetched successfully, generating PDF...');

      // Transform data for the template
      const templateOfferData = {
        id: offerData.offerId,
        fecha_generacion: offerDetails.fecha_generacion,
        propertyNumber: offerData.propertyNumber,
        leadName: offerData.leadName,
        leadEmail: offerData.leadEmail,
      };

      // Generate PDF using the React component
      await this.generatePDFFromHTML(templateOfferData, propertyDetails, paymentSchemes, amenities, creatorInfo, leadInfo, legalNotices, estacionamientos, bodegas);

    } catch (error) {
      console.error('Error generating PDF:', error);
      throw error;
    }
  }

  private async generatePDFFromHTML(
    offerData: {
      id: number;
      fecha_generacion: string;
      propertyNumber: string;
      leadName: string;
      leadEmail: string;
    },
    propertyDetails: PropertyDetails,
    paymentSchemes: PaymentScheme[],
    amenities: ProjectAmenity[],
    creatorInfo: any,
    leadInfo: any,
    legalNotices: string[],
    estacionamientos: any[],
    bodegas: any[]
  ): Promise<void> {
    // Create a temporary container for the React component
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '8.5in'; // Letter width
    container.style.minHeight = '11in'; // Letter height
    container.style.backgroundColor = 'white';
    container.style.fontSize = '16px'; // Increase base font size
    document.body.appendChild(container);

    try {
      // Create the React element
      const element = React.createElement(OfferPDFTemplate, {
        offerData,
        propertyDetails,
        paymentSchemes,
        amenities,
        creatorInfo,
        leadInfo: leadInfo || {
          nombre_legal: offerData.leadName,
          email: offerData.leadEmail
        },
        legalNotices,
        estacionamientos,
        bodegas
      });

      // Render the component
      const root = createRoot(container);
      root.render(element);

      // Wait for rendering to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Convert to PDF
      const canvas = await html2canvas(container, {
        scale: 2.5, // Higher scale for better quality
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: container.scrollWidth,
        height: container.scrollHeight
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'in', 'letter'); // Use inches and letter size
      
      const pdfWidth = pdf.internal.pageSize.getWidth(); // 8.5 inches
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 11 inches
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // Convert pixels to inches (assuming 96 DPI)
      const imgWidthInches = imgWidth / (96 * 2.5); // Account for scale
      const imgHeightInches = imgHeight / (96 * 2.5);
      
      let currentY = 0;
      let remainingHeight = imgHeightInches;
      
      // Split content across multiple pages if needed
      while (remainingHeight > 0) {
        const pageHeight = Math.min(remainingHeight, pdfHeight - 0.5); // Leave 0.5" margin
        const sourceY = (imgHeightInches - remainingHeight) * (96 * 2.5);
        const sourceHeight = pageHeight * (96 * 2.5);
        
        // Create canvas for this page
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgWidth;
        pageCanvas.height = sourceHeight;
        const pageCtx = pageCanvas.getContext('2d');
        
        if (pageCtx) {
          pageCtx.drawImage(canvas, 0, sourceY, imgWidth, sourceHeight, 0, 0, imgWidth, sourceHeight);
          const pageImgData = pageCanvas.toDataURL('image/png');
          
          if (currentY > 0) {
            pdf.addPage();
          }
          
          // Center the content with margins
          const xMargin = 0.25; // 0.25" margin
          const yMargin = 0.25;
          const contentWidth = Math.min(imgWidthInches, pdfWidth - (2 * xMargin));
          const contentHeight = pageHeight;
          
          pdf.addImage(pageImgData, 'PNG', xMargin, yMargin, contentWidth, contentHeight);
        }
        
        remainingHeight -= pageHeight;
        currentY += pageHeight;
      }

      // Generate filename: Oferta_{numero_departamento}_{nombre_proyecto}_{numero_oferta}.pdf
      const projectName = propertyDetails.projectData?.nombre || 'Proyecto';
      const propertyNumber = propertyDetails.numero_propiedad || 'N/A';
      const offerNumber = offerData.id.toString().padStart(6, '0') || '000000';
      
      // Clean names for filename (remove special characters)
      const cleanProjectName = projectName.replace(/[^a-zA-Z0-9]/g, '_');
      const cleanPropertyNumber = propertyNumber.replace(/[^a-zA-Z0-9]/g, '_');
      
      const filename = `Oferta_${cleanPropertyNumber}_${cleanProjectName}_${offerNumber}.pdf`;

      // Download the PDF
      pdf.save(filename);

      console.log('PDF generated successfully:', filename);

    } finally {
      // Clean up
      document.body.removeChild(container);
    }
  }

  private async fetchPropertyDetails(propertyId: number): Promise<PropertyDetails> {
    console.log('Fetching property details for ID:', propertyId);

    // Get property basic data
    const { data: propiedad, error: propiedadError } = await supabase
      .from('propiedades')
      .select(`
        id,
        numero_propiedad,
        precio_lista,
        m2_reales,
        m2_escriturables,
        descripcion,
        numero_piso,
        clabe_stp_tmp_apartado,
        id_edificio_modelo,
        id_vista,
        id_entidad_relacionada_dueno
      `)
      .eq('id', propertyId)
      .single();

    if (propiedadError) {
      console.error('Error fetching property:', propiedadError);
      throw propiedadError;
    }

    let building = null;
    let model = null;
    let projectData = null;

    // Get building and model data
    if (propiedad.id_edificio_modelo) {
      const { data: edificioModelo } = await supabase
        .from('edificios_modelos')
        .select('id_edificio, id_modelo')
        .eq('id', propiedad.id_edificio_modelo)
        .single();

      if (edificioModelo) {
        // Get building data
        const { data: edificioData } = await supabase
          .from('edificios')
          .select('id, nombre, id_proyecto')
          .eq('id', edificioModelo.id_edificio)
          .single();

        if (edificioData) {
          building = {
            id: edificioData.id,
            nombre: edificioData.nombre,
          };

          // Get project data
          if (edificioData.id_proyecto) {
            const { data: proyecto } = await supabase
              .from('proyectos')
              .select(`
                id, 
                nombre, 
                url_imagen_portada,
                mostrar_precio_m2_en_oferta,
                mostrar_piso_en_oferta,
                mostrar_seccion_efectivo_en_oferta,
                mostrar_estacionamientos_en_oferta,
                mostrar_bodega_en_oferta,
                mostrar_modelo_en_oferta,
                mostrar_edificio_en_oferta,
                precio_m2
              `)
              .eq('id', edificioData.id_proyecto)
              .single();

            if (proyecto) {
              projectData = proyecto;
            }
          }
        }

        // Get model data
        const { data: modeloData } = await supabase
          .from('modelos')
          .select('id, nombre, descripcion, numero_recamaras, numero_completo_banos, numero_medio_bano')
          .eq('id', edificioModelo.id_modelo)
          .single();

        if (modeloData) {
          model = {
            id: modeloData.id,
            nombre: modeloData.nombre,
            descripcion: modeloData.descripcion,
            numero_recamaras: modeloData.numero_recamaras,
            numero_completo_banos: modeloData.numero_completo_banos,
            numero_medio_bano: modeloData.numero_medio_bano,
          };
        }
      }
    }

    // Get vista data
    let vista = null;
    if (propiedad.id_vista) {
      const { data: vistaData } = await supabase
        .from('vistas')
        .select('id, nombre')
        .eq('id', propiedad.id_vista)
        .single();

      if (vistaData) {
        vista = vistaData;
      }
    }

    // Get owner data
    let ownerData = null;
    if (propiedad.id_entidad_relacionada_dueno) {
      const { data: entidadData } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona')
        .eq('id', propiedad.id_entidad_relacionada_dueno)
        .single();

      if (entidadData?.id_persona) {
        const { data: personaData } = await supabase
          .from('personas')
          .select('id, nombre_legal, email, telefono')
          .eq('id', entidadData.id_persona)
          .single();

        if (personaData) {
          ownerData = {
            id: personaData.id,
            nombre_legal: personaData.nombre_legal,
            email: personaData.email,
            telefono: personaData.telefono,
          };
        }
      }
    }

    return {
      id: propiedad.id,
      numero_propiedad: propiedad.numero_propiedad,
      precio_lista: propiedad.precio_lista,
      m2_reales: propiedad.m2_reales,
      m2_escriturables: propiedad.m2_escriturables,
      descripcion: propiedad.descripcion,
      numero_piso: propiedad.numero_piso,
      clabe_stp_tmp_apartado: propiedad.clabe_stp_tmp_apartado,
      building,
      model,
      vista,
      projectData,
      ownerData,
    };
  }

  private async fetchPaymentSchemes(propertyId: number, offerId: number): Promise<PaymentScheme[]> {
    console.log('Fetching payment schemes for property:', propertyId, 'and offer:', offerId);

    // First, get the specific payment scheme selected for this offer
    const { data: offerData } = await supabase
      .from('ofertas')
      .select('id_esquema_pago_seleccionado')
      .eq('id', offerId)
      .maybeSingle();

    // If there's a specific payment scheme selected (manual or pre-defined), return only that one
    if (offerData?.id_esquema_pago_seleccionado) {
      const { data: specificScheme, error: specificError } = await supabase
        .from('esquemas_pago')
        .select('*')
        .eq('id', offerData.id_esquema_pago_seleccionado)
        .eq('activo', true)
        .maybeSingle();

      if (specificError) throw specificError;
      console.log('Found specific payment scheme for offer:', specificScheme);
      return specificScheme ? [specificScheme] : [];
    }

    // Fallback: If no specific scheme selected, get the project ID from the property
    const { data: propertyData } = await supabase
      .from('propiedades')
      .select('id_edificio_modelo')
      .eq('id', propertyId)
      .single();

    if (!propertyData?.id_edificio_modelo) {
      console.log('No building model found for property');
      return [];
    }

    const { data: edificioModelo } = await supabase
      .from('edificios_modelos')
      .select('id_edificio')
      .eq('id', propertyData.id_edificio_modelo)
      .single();

    if (!edificioModelo?.id_edificio) {
      console.log('No building found for property');
      return [];
    }

    const { data: edificio } = await supabase
      .from('edificios')
      .select('id_proyecto')
      .eq('id', edificioModelo.id_edificio)
      .single();

    if (!edificio?.id_proyecto) {
      console.log('No project found for property');
      return [];
    }

    const projectId = edificio.id_proyecto;

    const { data: schemes, error } = await supabase
      .from('esquemas_pago')
      .select('*')
      .eq('id_proyecto', projectId)
      .eq('activo', true)
      .order('id');

    if (error) {
      console.error('Error fetching payment schemes:', error);
      return [];
    }

    return schemes || [];
  }

  private async fetchProjectAmenities(propertyId: number): Promise<ProjectAmenity[]> {
    console.log('Fetching project amenities for property:', propertyId);

    // First get the project ID from the property
    const { data: propertyData } = await supabase
      .from('propiedades')
      .select('id_edificio_modelo')
      .eq('id', propertyId)
      .single();

    if (!propertyData?.id_edificio_modelo) {
      console.log('No building model found for property');
      return [];
    }

    const { data: edificioModelo } = await supabase
      .from('edificios_modelos')
      .select('id_edificio')
      .eq('id', propertyData.id_edificio_modelo)
      .single();

    if (!edificioModelo?.id_edificio) {
      console.log('No building found for property');
      return [];
    }

    const { data: edificio } = await supabase
      .from('edificios')
      .select('id_proyecto')
      .eq('id', edificioModelo.id_edificio)
      .single();

    if (!edificio?.id_proyecto) {
      console.log('No project found for property');
      return [];
    }

    const projectId = edificio.id_proyecto;

    const { data: amenityRelations, error } = await supabase
      .from('amenidades_proyectos')
      .select(`
        amenidades!inner(id, nombre, url)
      `)
      .eq('id_proyecto', projectId)
      .eq('activo', true);

    if (error) {
      console.error('Error fetching project amenities:', error);
      return [];
    }

    return amenityRelations?.map(relation => ({
      id: relation.amenidades.id,
      nombre: relation.amenidades.nombre,
      url: relation.amenidades.url,
    })) || [];
  }

  private async fetchCreatorInfo(creatorEmail: string): Promise<any> {
    console.log('Fetching creator info for email:', creatorEmail);

    // Try to fetch from usuarios table first
    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('nombre, email, telefono')
      .eq('email', creatorEmail)
      .single();

    if (!usuarioError && usuario) {
      return {
        nombre_legal: usuario.nombre,
        email: usuario.email,
        telefono: usuario.telefono
      };
    }

    // If not found in usuarios, try personas table
    const { data: persona, error } = await supabase
      .from('personas')
      .select('id, nombre_legal, email, telefono')
      .eq('email', creatorEmail)
      .single();

    if (error) {
      console.error('Error fetching creator info:', error);
      return null;
    }

    return persona;
  }

  private async fetchLeadInfo(leadId: number): Promise<any> {
    console.log('Fetching lead info for ID:', leadId);

    const { data: persona, error } = await supabase
      .from('personas')
      .select('id, nombre_legal, email, telefono, rfc')
      .eq('id', leadId)
      .single();

    if (error) {
      console.error('Error fetching lead info:', error);
      return null;
    }

    return persona;
  }

  private async fetchLegalNotices(propertyId: number): Promise<string[]> {
    console.log('Fetching legal notices for property:', propertyId);
    
    try {
      // Get project ID first
      const { data: propertyData } = await supabase
        .from('propiedades')
        .select('id_edificio_modelo')
        .eq('id', propertyId)
        .single();

      if (!propertyData?.id_edificio_modelo) {
        return [];
      }

      const { data: edificioModelo } = await supabase
        .from('edificios_modelos')
        .select('id_edificio')
        .eq('id', propertyData.id_edificio_modelo)
        .single();

      if (!edificioModelo?.id_edificio) {
        return [];
      }

      const { data: edificio } = await supabase
        .from('edificios')
        .select('id_proyecto')
        .eq('id', edificioModelo.id_edificio)
        .single();

      if (!edificio?.id_proyecto) {
        return [];
      }

      const projectId = edificio.id_proyecto;

      // Fetch legal notices from avisos_legales table
      const { data: legalNotices, error } = await supabase
        .from('avisos_legales')
        .select('contenido, orden')
        .eq('id_proyecto', projectId)
        .eq('activo', true)
        .order('orden');

      if (error) {
        console.error('Error fetching legal notices:', error);
        return [];
      }

      // Return the contents as an array of strings
      return (legalNotices || []).map(notice => notice.contenido);
    } catch (error) {
      console.error('Error fetching legal notices:', error);
      return [];
    }
  }
  
  private async fetchEstacionamientos(propertyId: number): Promise<any[]> {
    console.log('Fetching estacionamientos for property:', propertyId);
    
    const { data, error } = await supabase
      .from('estacionamientos')
      .select(`
        id,
        nombre,
        m2,
        ubicacion,
        es_incluido,
        id_tipo,
        tipos_estacionamiento!inner (
          id,
          nombre
        )
      `)
      .eq('id_propiedad', propertyId)
      .eq('activo', true);

    if (error) {
      console.error('Error fetching estacionamientos:', error);
      return [];
    }

    return data || [];
  }
  
  private async fetchBodegas(propertyId: number): Promise<any[]> {
    console.log('Fetching bodegas for property:', propertyId);
    
    const { data, error } = await supabase
      .from('bodegas')
      .select(`
        id,
        nombre,
        m2,
        ubicacion,
        es_incluido
      `)
      .eq('id_propiedad', propertyId)
      .eq('activo', true);

    if (error) {
      console.error('Error fetching bodegas:', error);
      return [];
    }

    return data || [];
  }

  private formatOfferNumber(offerId: number): string {
    return `OFE-${offerId.toString().padStart(6, '0')}`;
  }
}

export const generateOfferPDF = async (offerData: OfferData) => {
  const service = new HTMLToPDFService();
  await service.generateOfferPDF(offerData);
};