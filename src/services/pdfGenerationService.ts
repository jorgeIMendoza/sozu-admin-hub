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
  numero_piso: string | number;
  m2_interiores: number;
  precio_lista: number;
  edificio: string;
  modelo: string;
  recamaras: number;
  banos_completos: number;
  medios_banos: number;
  vista: string;
  proyecto: string;
  ubicacion_imagen?: string;
  proyecto_imagen?: string;
  clabe_stp?: string;
  propietario_nombre?: string;
}

interface PaymentScheme {
  nombre: string;
  porcentaje_enganche: number;
  porcentaje_mensualidades: number;
  porcentaje_entrega: number;
  numero_mensualidades: number;
}

interface ProjectAmenity {
  nombre: string;
  url: string;
}

export class PDFGenerationService {
  private doc: jsPDF;
  private currentY: number = 20;
  private pageWidth: number;
  private pageHeight: number;
  private margins = { left: 20, right: 20, top: 20, bottom: 20 };

  constructor() {
    this.doc = new jsPDF('p', 'mm', 'a4');
    this.pageWidth = this.doc.internal.pageSize.width;
    this.pageHeight = this.doc.internal.pageSize.height;
  }

  async generateOfferPDF(offerData: OfferData): Promise<void> {
    try {
      // Fetch all required data
      const [propertyDetails, paymentSchemes, projectAmenities, creatorInfo] = await Promise.all([
        this.fetchPropertyDetails(offerData.propertyId),
        this.fetchPaymentSchemes(offerData.propertyId, offerData.offerId),
        this.fetchProjectAmenities(offerData.propertyId),
        this.fetchCreatorInfo(offerData.creatorEmail)
      ]);

      // Generate PDF sections
      await this.generateCoverPage(offerData, propertyDetails);
      this.addNewPage();
      
      await this.generatePropertyCharacteristics(propertyDetails);
      this.addNewPage();
      
      await this.generateLocationSection(propertyDetails);
      this.addNewPage();
      
      await this.generatePaymentPlans(paymentSchemes);
      this.addNewPage();
      
      await this.generateSellerAndClientInfo(creatorInfo, offerData);
      this.addNewPage();
      
      await this.generateBankingSection(propertyDetails);
      this.addNewPage();
      
      await this.generateAmenitiesSection(projectAmenities);

      // Download PDF with the format: Oferta_{num_depa}_{nombre_proyecto}_{num_oferta}
      const fileName = `Oferta_${propertyDetails.numero_propiedad}_${propertyDetails.proyecto}_${this.formatOfferNumber(offerData.offerId)}.pdf`;
      this.doc.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw error;
    }
  }

  private async fetchPropertyDetails(propertyId: number): Promise<PropertyDetails> {
    // Get basic property data
    const { data: propertyData, error: propertyError } = await supabase
      .from('propiedades')
      .select(`
        id,
        numero_propiedad,
        numero_piso,
        m2_interiores,
        m2_exteriores,
        precio_lista,
        id_edificio_modelo,
        id_vista,
        id_entidad_relacionada_dueno,
        clabe_stp_tmp_apartado
      `)
      .eq('id', propertyId)
      .maybeSingle();

    if (propertyError) throw propertyError;
    if (!propertyData) throw new Error('Property not found');

    // Get building and model information separately
    const { data: buildingModelData } = await supabase
      .from('edificios_modelos')
      .select('id_edificio, id_modelo')
      .eq('id', propertyData.id_edificio_modelo)
      .maybeSingle();

    let edificioName = 'No especificado';
    let modeloData = null;

    if (buildingModelData) {
      // Get building name
      const { data: edificioData } = await supabase
        .from('edificios')
        .select('nombre')
        .eq('id', buildingModelData.id_edificio)
        .maybeSingle();
      
      if (edificioData) {
        edificioName = edificioData.nombre;
      }

      // Get model data
      const { data: modelo } = await supabase
        .from('modelos')
        .select('id, nombre, numero_recamaras, numero_completo_banos, numero_medio_bano')
        .eq('id', buildingModelData.id_modelo)
        .maybeSingle();
      
      modeloData = modelo;
    }

    // Get vista information
    const { data: vistaData } = await supabase
      .from('vistas')
      .select('nombre')
      .eq('id', propertyData.id_vista)
      .maybeSingle();

    // Get project information and owner
    const { data: entidadData } = await supabase
      .from('entidades_relacionadas')
      .select('id_proyecto, id_persona')
      .eq('id', propertyData.id_entidad_relacionada_dueno)
      .maybeSingle();

    let projectData = null;
    let propietarioNombre = 'No disponible';
    
    if (entidadData) {
      // Get owner name
      if (entidadData.id_persona) {
        const { data: personaData } = await supabase
          .from('personas')
          .select('nombre_legal')
          .eq('id', entidadData.id_persona)
          .maybeSingle();
        
        propietarioNombre = personaData?.nombre_legal || 'No disponible';
      }
      
      // Get project data
      if (entidadData.id_proyecto) {
        const { data: proyecto } = await supabase
          .from('proyectos')
          .select('id, nombre, url_imagen_portada')
          .eq('id', entidadData.id_proyecto)
          .maybeSingle();
        
        projectData = proyecto;
      }
    }

    // Get project image - use url_imagen_portada first
    let proyectoImage = null;
    if (projectData?.url_imagen_portada) {
      proyectoImage = projectData.url_imagen_portada;
      console.log('Project image found from url_imagen_portada:', proyectoImage);
    } else if (projectData?.id) {
      // Fallback to multimedias_proyecto
      const { data: multimedia } = await supabase
        .from('multimedias_proyecto')
        .select('url')
        .eq('id_proyecto', projectData.id)
        .eq('es_imagen', true)
        .limit(1)
        .maybeSingle();
      
      proyectoImage = multimedia?.url;
      console.log('Project image found from multimedias_proyecto:', proyectoImage);
    }

    // Get ubicacion image from model multimedia
    let ubicacionImage = null;
    if (modeloData?.id) {
      const { data: ubicacion } = await supabase
        .from('multimedias_modelo')
        .select('url')
        .eq('id_modelo', modeloData.id)
        .eq('ver_como_ubicacion_en_oferta', true)
        .eq('activo', true)
        .eq('es_imagen', true) // Filter only images, exclude videos
        .maybeSingle();
      
      ubicacionImage = ubicacion?.url;
    }

    return {
      id: propertyData.id,
      numero_propiedad: propertyData.numero_propiedad,
      numero_piso: propertyData.numero_piso,
      m2_interiores: (propertyData.m2_interiores || 0) + (propertyData.m2_exteriores || 0),
      precio_lista: propertyData.precio_lista,
      edificio: edificioName,
      modelo: modeloData?.nombre || 'No especificado',
      recamaras: modeloData?.numero_recamaras || 0,
      banos_completos: modeloData?.numero_completo_banos || 0,
      medios_banos: modeloData?.numero_medio_bano || 0,
      vista: vistaData?.nombre || 'No especificada',
      proyecto: projectData?.nombre || 'No especificado',
      ubicacion_imagen: ubicacionImage,
      proyecto_imagen: proyectoImage,
      clabe_stp: propertyData.clabe_stp_tmp_apartado,
      propietario_nombre: propietarioNombre
    };
  }

  private async fetchPaymentSchemes(propertyId: number, offerId: number): Promise<PaymentScheme[]> {
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
      return specificScheme ? [specificScheme] : [];
    }

    // Fallback: If no specific scheme selected, get all active non-manual schemes for the project
    const { data: propertyData } = await supabase
      .from('propiedades')
      .select('id_entidad_relacionada_dueno')
      .eq('id', propertyId)
      .maybeSingle();

    if (!propertyData) return [];

    const { data: entidadData } = await supabase
      .from('entidades_relacionadas')
      .select('id_proyecto')
      .eq('id', propertyData.id_entidad_relacionada_dueno)
      .maybeSingle();

    if (!entidadData?.id_proyecto) return [];

    const { data, error } = await supabase
      .from('esquemas_pago')
      .select('*')
      .eq('id_proyecto', entidadData.id_proyecto)
      .eq('activo', true)
      .eq('es_manual', false)
      .order('orden', { ascending: true }); // Solo esquemas no manuales, ordenados

    if (error) throw error;
    return data || [];
  }

  private async fetchProjectAmenities(propertyId: number): Promise<ProjectAmenity[]> {
    // Get project ID from property
    const { data: propertyData } = await supabase
      .from('propiedades')
      .select('id_entidad_relacionada_dueno')
      .eq('id', propertyId)
      .maybeSingle();

    if (!propertyData) return [];

    const { data: entidadData } = await supabase
      .from('entidades_relacionadas')
      .select('id_proyecto')
      .eq('id', propertyData.id_entidad_relacionada_dueno)
      .maybeSingle();

    if (!entidadData?.id_proyecto) return [];

    // Get amenities for the project
    const { data: amenitiesProjectData } = await supabase
      .from('amenidades_proyectos')
      .select('id_amenidad')
      .eq('id_proyecto', entidadData.id_proyecto)
      .eq('activo', true);

    if (!amenitiesProjectData || amenitiesProjectData.length === 0) return [];

    const amenityIds = amenitiesProjectData.map(ap => ap.id_amenidad);

    const { data: amenitiesData } = await supabase
      .from('amenidades')
      .select('nombre, url')
      .in('id', amenityIds)
      .not('url', 'is', null);

    return amenitiesData || [];
  }

  private async fetchCreatorInfo(creatorEmail: string): Promise<any> {
    const { data } = await supabase
      .from('usuarios')
      .select('nombre, telefono, email')
      .eq('email', creatorEmail)
      .maybeSingle();

    return data || { nombre: 'No disponible', telefono: 'No disponible', email: creatorEmail };
  }

  private async generateCoverPage(offerData: OfferData, propertyDetails: PropertyDetails): Promise<void> {
    // Title
    this.doc.setFontSize(24);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('OFERTA INMOBILIARIA', this.pageWidth / 2, 30, { align: 'center' });

    // Project image (if available)
    console.log('Project image URL:', propertyDetails.proyecto_imagen); // Debug log
    if (propertyDetails.proyecto_imagen) {
      try {
        await this.addImageToPDF(propertyDetails.proyecto_imagen, 20, 50, 170, 100);
        console.log('Project image added successfully');
      } catch (error) {
        console.error('Could not load project image:', error);
      }
    } else {
      console.log('No project image found');
    }

    // Offer details
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('DATOS DE LA OFERTA', 20, 170);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(12);
    this.doc.text(`Número de Oferta: ${this.formatOfferNumber(offerData.offerId)}`, 20, 185);
    this.doc.text(`Fecha de Oferta: ${new Date().toLocaleDateString('es-MX')}`, 20, 195);
    this.doc.text(`Proyecto: ${propertyDetails.proyecto}`, 20, 205);
    this.doc.text(`Propiedad: ${offerData.propertyNumber}`, 20, 215);
  }

  private async generatePropertyCharacteristics(propertyDetails: PropertyDetails): Promise<void> {
    this.currentY = 30;
    
    this.doc.setFontSize(18);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('CARACTERÍSTICAS DE LA PROPIEDAD', 20, this.currentY);
    
    this.currentY += 20;
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'normal');

    const characteristics = [
      [`Proyecto:`, propertyDetails.proyecto],
      [`Número de Propiedad:`, propertyDetails.numero_propiedad],
      [`Precio de Lista:`, `$${propertyDetails.precio_lista.toLocaleString('es-MX')}`],
      [`Edificio:`, propertyDetails.edificio],
      [`Nivel:`, propertyDetails.numero_piso.toString()],
      [`Metros Interiores:`, `${propertyDetails.m2_interiores} m²`],
      [`Modelo:`, propertyDetails.modelo],
      [`Número de Recámaras:`, propertyDetails.recamaras.toString()],
      [`Número de Baños:`, propertyDetails.banos_completos.toString()],
      [`Número de Medios Baños:`, propertyDetails.medios_banos.toString()],
      [`Vista:`, propertyDetails.vista]
    ];

    characteristics.forEach(([label, value]) => {
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(label, 20, this.currentY);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(value, 80, this.currentY);
      this.currentY += 10;
    });
  }

  private async generateLocationSection(propertyDetails: PropertyDetails): Promise<void> {
    this.currentY = 30;
    
    this.doc.setFontSize(18);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('UBICACIÓN', 20, this.currentY);
    
    if (propertyDetails.ubicacion_imagen) {
      try {
        await this.addImageToPDF(propertyDetails.ubicacion_imagen, 20, 50, 170, 150);
      } catch (error) {
        console.warn('Could not load location image:', error);
        this.doc.setFontSize(12);
        this.doc.text('Imagen de ubicación no disponible', 20, 60);
      }
    } else {
      this.doc.setFontSize(12);
      this.doc.text('Imagen de ubicación no disponible', 20, 50);
    }
  }

  private async generatePaymentPlans(paymentSchemes: PaymentScheme[]): Promise<void> {
    this.currentY = 30;
    
    this.doc.setFontSize(18);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('PLANES DE PAGO', 20, this.currentY);
    
    this.currentY += 20;

    if (paymentSchemes.length === 0) {
      this.doc.setFontSize(12);
      this.doc.text('No hay esquemas de pago disponibles', 20, this.currentY);
      return;
    }

    paymentSchemes.forEach((scheme) => {
      this.doc.setFontSize(14);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(scheme.nombre, 20, this.currentY);
      
      this.currentY += 15;
      this.doc.setFontSize(11);
      this.doc.setFont('helvetica', 'normal');
      
      this.doc.text(`Enganche: ${scheme.porcentaje_enganche}%`, 25, this.currentY);
      this.doc.text(`Mensualidades: ${scheme.porcentaje_mensualidades}%`, 25, this.currentY + 8);
      this.doc.text(`Entrega: ${scheme.porcentaje_entrega}%`, 25, this.currentY + 16);
      this.doc.text(`Número de Mensualidades: ${scheme.numero_mensualidades}`, 25, this.currentY + 24);
      
      this.currentY += 40;

      if (this.currentY > 250) {
        this.addNewPage();
        this.currentY = 30;
      }
    });
  }

  private async generateSellerAndClientInfo(creatorInfo: any, offerData: OfferData): Promise<void> {
    this.currentY = 30;
    
    // Seller information
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('DATOS DEL VENDEDOR', 20, this.currentY);
    
    this.currentY += 15;
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'normal');
    
    this.doc.text(`Nombre: ${creatorInfo.nombre}`, 20, this.currentY);
    this.doc.text(`Teléfono: ${creatorInfo.telefono || 'No disponible'}`, 20, this.currentY + 10);
    this.doc.text(`Email: ${creatorInfo.email}`, 20, this.currentY + 20);
    
    this.currentY += 50;
    
    // Client information
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('DATOS DEL CLIENTE', 20, this.currentY);
    
    this.currentY += 15;
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'normal');
    
    this.doc.text(`Nombre: ${offerData.leadName}`, 20, this.currentY);
    this.doc.text(`Teléfono: ${offerData.leadPhone}`, 20, this.currentY + 10);
    this.doc.text(`Email: ${offerData.leadEmail}`, 20, this.currentY + 20);
  }

  private async generateBankingSection(propertyDetails: PropertyDetails): Promise<void> {
    this.currentY = 30;
    
    this.doc.setFontSize(18);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('DATOS BANCARIOS', 20, this.currentY);
    
    this.currentY += 25;
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Transferencia', 20, this.currentY);
    
    this.currentY += 15;
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'normal');
    
    // Bank information
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Banco:', 20, this.currentY);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text('Sistema de Transacciones y Pagos STP', 90, this.currentY);
    
    this.currentY += 10;
    
    // Account holder
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Titular:', 20, this.currentY);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(propertyDetails.propietario_nombre || 'No disponible', 90, this.currentY);
    
    this.currentY += 10;
    
    // CLABE account
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Cuenta CLABE:', 20, this.currentY);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(propertyDetails.clabe_stp || 'No disponible', 90, this.currentY);
  }

  private async generateAmenitiesSection(amenities: ProjectAmenity[]): Promise<void> {
    this.currentY = 30;
    
    this.doc.setFontSize(18);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('AMENIDADES', 20, this.currentY);
    
    this.currentY += 20;

    if (amenities.length === 0) {
      this.doc.setFontSize(12);
      this.doc.text('No hay amenidades disponibles', 20, this.currentY);
      return;
    }

    // Display amenities in a grid format
    let x = 20;
    let y = this.currentY;
    const itemsPerRow = 3;
    const itemWidth = 50;
    const itemHeight = 40;

    for (let i = 0; i < amenities.length; i++) {
      const amenity = amenities[i];
      
      if (i > 0 && i % itemsPerRow === 0) {
        y += itemHeight + 10;
        x = 20;
      }

      // Try to load and display amenity icon
      try {
        if (amenity.url) {
          await this.addImageToPDF(amenity.url, x, y, 20, 20);
        }
      } catch (error) {
        // Fallback to text if image cannot be loaded
        this.doc.setFontSize(8);
        this.doc.text('🏢', x + 5, y + 10);
      }

      this.doc.setFontSize(8);
      this.doc.text(amenity.nombre, x, y + 35, { maxWidth: itemWidth, align: 'center' });
      
      x += itemWidth + 10;
    }
  }

  private async addImageToPDF(imageUrl: string, x: number, y: number, width: number, height: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          canvas.width = img.width;
          canvas.height = img.height;
          
          ctx?.drawImage(img, 0, 0);
          const imgData = canvas.toDataURL('image/jpeg', 0.8);
          
          this.doc.addImage(imgData, 'JPEG', x, y, width, height);
          resolve();
        } catch (error) {
          console.error('Error processing image:', error);
          reject(error);
        }
      };
      
      img.onerror = () => {
        console.error('Failed to load image:', imageUrl);
        reject(new Error('Failed to load image'));
      };
      
      img.src = imageUrl;
    });
  }

  private addNewPage(): void {
    this.doc.addPage();
    this.currentY = 20;
  }

  private formatOfferNumber(offerId: number): string {
    return offerId.toString().padStart(6, '0');
  }
}

// Export the new HTML-based PDF generation as the main function
export { generateOfferPDF } from './htmlToPdfService';