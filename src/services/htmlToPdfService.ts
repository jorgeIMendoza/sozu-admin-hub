import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

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

      // Fetch all required data
      const [propertyDetails, paymentSchemes, amenities, creatorInfo] = await Promise.all([
        this.fetchPropertyDetails(offerData.propertyId),
        this.fetchPaymentSchemes(offerData.propertyId),
        this.fetchProjectAmenities(offerData.propertyId),
        this.fetchCreatorInfo(offerData.creatorEmail)
      ]);

      console.log('Data fetched successfully, generating PDF...');

      // Transform data for the template
      const templateOfferData = {
        id: offerData.offerId,
        fecha_generacion: new Date().toISOString(),
        propertyNumber: offerData.propertyNumber,
        leadName: offerData.leadName,
        leadEmail: offerData.leadEmail,
      };

      // Generate PDF using the React component
      await this.generatePDFFromHTML(templateOfferData, propertyDetails, paymentSchemes, amenities, creatorInfo);

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
    creatorInfo: any
  ): Promise<void> {
    // Create a temporary container for the React component
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '210mm'; // A4 width
    container.style.backgroundColor = 'white';
    document.body.appendChild(container);

    try {
      // Dynamically import React and render the component
      const React = await import('react');
      const ReactDOM = await import('react-dom/client');
      const { OfferPDFTemplate } = await import('@/components/admin/OfferPDFTemplate');

      // Create the React element
      const element = React.createElement(OfferPDFTemplate, {
        offerData,
        propertyDetails,
        paymentSchemes,
        amenities,
        creatorInfo
      });

      // Render the component
      const root = ReactDOM.createRoot(container);
      root.render(element);

      // Wait for rendering to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Convert to PDF
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: container.scrollWidth,
        height: container.scrollHeight
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // Calculate the ratio to fit the content in the PDF
      const ratio = Math.min(pdfWidth / (imgWidth * 0.264583), pdfHeight / (imgHeight * 0.264583));
      const finalWidth = imgWidth * 0.264583 * ratio;
      const finalHeight = imgHeight * 0.264583 * ratio;

      pdf.addImage(imgData, 'PNG', 0, 0, finalWidth, finalHeight);

      // Generate filename
      const filename = `Oferta_${this.formatOfferNumber(offerData.id)}_${propertyDetails.projectData?.nombre || 'Propiedad'}.pdf`;

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
              .select('id, nombre, url_imagen_portada')
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
      building,
      model,
      vista,
      projectData,
      ownerData,
    };
  }

  private async fetchPaymentSchemes(propertyId: number): Promise<PaymentScheme[]> {
    console.log('Fetching payment schemes for property:', propertyId);

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

  private formatOfferNumber(offerId: number): string {
    return `OFE-${offerId.toString().padStart(6, '0')}`;
  }
}

export const generateOfferPDF = async (offerData: OfferData) => {
  const service = new HTMLToPDFService();
  await service.generateOfferPDF(offerData);
};