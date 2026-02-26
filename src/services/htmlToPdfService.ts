import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OfferPDFTemplate } from '@/components/admin/OfferPDFTemplate';
import { OfferPDFTemplateSozu } from '@/components/admin/OfferPDFTemplateSozu';
import { OfferPDFTemplateProducto } from '@/components/admin/OfferPDFTemplateProducto';
import { isValidRFC } from '@/utils/fiscalDataValidation';

interface OfferData {
  propertyId: number;
  offerId: number;
  propertyNumber: string;
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  creatorEmail: string;
  isProductOffer?: boolean;
  productId?: number;
  offerOptions?: {
    mostrar_piso_en_oferta?: boolean;
    mostrar_precio_m2_en_oferta?: boolean;
    mostrar_seccion_efectivo_en_oferta?: boolean;
  };
}

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
  ownerStpBankAccount?: {
    numero_cuenta: string;
    cuenta_clabe: string;
    cuenta_swift: string;
    banco_nombre: string;
  };
  ownerData?: {
    id: number;
    nombre_legal: string;
    email: string;
    telefono: string | null;
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
  is_selected?: boolean;
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

      // Get offer options from parameter or database
      let offerOptions = offerData.offerOptions;
      if (!offerOptions) {
        offerOptions = {
          mostrar_piso_en_oferta: offerDetails.mostrar_piso_en_oferta ?? true,
          mostrar_precio_m2_en_oferta: offerDetails.mostrar_precio_m2_en_oferta ?? true,
          mostrar_seccion_efectivo_en_oferta: offerDetails.mostrar_seccion_efectivo_en_oferta ?? true,
        };
      }

      // Check if this is a product offer
      if (offerData.isProductOffer && offerData.productId) {
        await this.generateProductOfferPDF(offerData, offerDetails);
        return;
      }

      // Fetch all required data for property offers
      const [propertyDetails, paymentSchemes, amenities, creatorInfo, leadInfo, legalNotices, estacionamientos, bodegas] = await Promise.all([
        this.fetchPropertyDetails(offerData.propertyId, offerData.offerId),
        this.fetchPaymentSchemes(offerData.propertyId, offerData.offerId),
        this.fetchProjectAmenities(offerData.propertyId),
        this.fetchCreatorInfo(offerDetails.email_creador),
        this.fetchLeadInfo(offerDetails.id_persona_lead),
        this.fetchLegalNotices(offerData.propertyId),
        this.fetchEstacionamientos(offerData.propertyId),
        this.fetchBodegas(offerData.propertyId)
      ]);

      // Fetch approval status name
      let estatus_aprobacion_nombre: string | null = null;
      if (offerDetails.id_estatus_aprobacion) {
        const { data: estatusData } = await supabase
          .from('estatus_aprobacion')
          .select('nombre')
          .eq('id', offerDetails.id_estatus_aprobacion)
          .single();
        estatus_aprobacion_nombre = estatusData?.nombre || null;
      }

      console.log('Data fetched successfully, generating PDF...');
      console.log('Project logo URL being used:', propertyDetails.projectData?.url_logo);
      console.log('Project name:', propertyDetails.projectData?.nombre);

      // Transform data for the template
      const templateOfferData = {
        id: offerData.offerId,
        fecha_generacion: offerDetails.fecha_generacion,
        propertyNumber: offerData.propertyNumber,
        leadName: offerData.leadName,
        leadEmail: offerData.leadEmail,
        email_creador: offerData.creatorEmail,
        id_esquema_pago_seleccionado: offerDetails.id_esquema_pago_seleccionado,
        id_estatus_aprobacion: offerDetails.id_estatus_aprobacion,
        estatus_aprobacion_nombre,
      };

    console.log('Property details before PDF generation:', {
      hasProjectData: !!propertyDetails.projectData,
      projectName: propertyDetails.projectData?.nombre,
      logoUrl: propertyDetails.projectData?.url_logo ? 'Logo converted to base64' : 'No logo',
      hasOwnerStpAccount: !!propertyDetails.ownerStpBankAccount,
      ownerStpAccount: propertyDetails.ownerStpBankAccount,
      hasOwnerData: !!propertyDetails.ownerData,
      ownerData: propertyDetails.ownerData
    });

      // Generate PDF using the React component
      await this.generatePDFFromHTML(templateOfferData, propertyDetails, paymentSchemes, amenities, creatorInfo, leadInfo, legalNotices, estacionamientos, bodegas, offerOptions);

    } catch (error) {
      console.error('Error generating PDF:', error);
      throw error;
    }
  }

  private async generateProductOfferPDF(offerData: OfferData, offerDetails: any): Promise<void> {
    try {
      console.log('Generating product offer PDF');

      // Fetch property details (simplified for products)
      const propertyDetails = await this.fetchPropertyDetails(offerData.propertyId);
      
      // Fetch product details - pass propertyId to calculate metraje-based pricing
      const productDetails = await this.fetchProductDetails(offerData.productId!, offerData.propertyId);
      
      // Fetch cuenta de cobranza to get clabe_stp
      let clabeStp = offerDetails.clabe_stp_tmp_producto;
      if (!clabeStp) {
        const { data: cuentaCobranza } = await supabase
          .from('cuentas_cobranza')
          .select('clabe_stp')
          .eq('id_oferta', offerData.offerId)
          .single();
        
        if (cuentaCobranza?.clabe_stp) {
          clabeStp = cuentaCobranza.clabe_stp;
        }
      }
      
      // Fetch all payment schemes for the product
      const { data: paymentSchemes } = await supabase
        .from('esquemas_pago')
        .select('*')
        .eq('id_producto', offerData.productId)
        .eq('activo', true)
        .order('nombre', { ascending: true });

      // Fetch creator and lead info
      const [creatorInfo, leadInfo, legalNotices] = await Promise.all([
        this.fetchCreatorInfo(offerDetails.email_creador),
        this.fetchLeadInfo(offerDetails.id_persona_lead),
        this.fetchLegalNotices(offerData.propertyId)
      ]);

      // Fetch approval status name for product offers
      let estatus_aprobacion_nombre_prod: string | null = null;
      if (offerDetails.id_estatus_aprobacion) {
        const { data: estatusData } = await supabase
          .from('estatus_aprobacion')
          .select('nombre')
          .eq('id', offerDetails.id_estatus_aprobacion)
          .single();
        estatus_aprobacion_nombre_prod = estatusData?.nombre || null;
      }

      const templateOfferData = {
        id: offerData.offerId,
        fecha_generacion: offerDetails.fecha_generacion,
        propertyNumber: offerData.propertyNumber,
        leadName: offerData.leadName,
        leadEmail: offerData.leadEmail,
        email_creador: offerData.creatorEmail,
        id_esquema_pago_seleccionado: offerDetails.id_esquema_pago_seleccionado,
        clabe_stp_tmp_producto: offerDetails.clabe_stp_tmp_producto,
        clabe_stp: clabeStp,
        id_estatus_aprobacion: offerDetails.id_estatus_aprobacion,
        estatus_aprobacion_nombre: estatus_aprobacion_nombre_prod,
      };

      await this.generateProductPDFFromHTML(
        templateOfferData,
        propertyDetails,
        productDetails,
        paymentSchemes || [],
        creatorInfo,
        leadInfo,
        legalNotices
      );

    } catch (error) {
      console.error('Error generating product PDF:', error);
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
      email_creador: string;
      id_estatus_aprobacion?: number | null;
      estatus_aprobacion_nombre?: string | null;
    },
    propertyDetails: PropertyDetails,
    paymentSchemes: PaymentScheme[],
    amenities: ProjectAmenity[],
    creatorInfo: any,
    leadInfo: any,
    legalNotices: string[],
    estacionamientos: any[],
    bodegas: any[],
    offerOptions?: {
      mostrar_piso_en_oferta?: boolean;
      mostrar_precio_m2_en_oferta?: boolean;
      mostrar_seccion_efectivo_en_oferta?: boolean;
    }
  ): Promise<void> {
    // Always use the new single-page template for all projects
    await this.generateSozuPDF(offerData, propertyDetails, paymentSchemes, amenities, creatorInfo, leadInfo, legalNotices, estacionamientos, bodegas, offerOptions);
  }

  private async generateSozuPDF(
    offerData: {
      id: number;
      fecha_generacion: string;
      propertyNumber: string;
      leadName: string;
      leadEmail: string;
      email_creador: string;
      id_estatus_aprobacion?: number | null;
      estatus_aprobacion_nombre?: string | null;
    },
    propertyDetails: PropertyDetails,
    paymentSchemes: PaymentScheme[],
    amenities: ProjectAmenity[],
    creatorInfo: any,
    leadInfo: any,
    legalNotices: string[],
    estacionamientos: any[],
    bodegas: any[],
    offerOptions?: {
      mostrar_piso_en_oferta?: boolean;
      mostrar_precio_m2_en_oferta?: boolean;
      mostrar_seccion_efectivo_en_oferta?: boolean;
    }
  ): Promise<void> {
    // Override project data with offer-specific options
    const finalPropertyDetails = {
      ...propertyDetails,
      projectData: {
        ...propertyDetails.projectData,
        // Offer options take precedence over project options
        mostrar_piso_en_oferta: offerOptions?.mostrar_piso_en_oferta ?? propertyDetails.projectData?.mostrar_piso_en_oferta,
        mostrar_precio_m2_en_oferta: offerOptions?.mostrar_precio_m2_en_oferta ?? propertyDetails.projectData?.mostrar_precio_m2_en_oferta,
        mostrar_seccion_efectivo_en_oferta: offerOptions?.mostrar_seccion_efectivo_en_oferta ?? propertyDetails.projectData?.mostrar_seccion_efectivo_en_oferta,
      }
    };

    // Use native PDF generation for faster, text-selectable PDFs
    const { ofertaPdfNativeService } = await import('./ofertaPdfNativeService');
    const { ofertaPdfStorageService } = await import('./ofertaPdfStorageService');
    
    // Generate PDF (now returns blob)
    const { blob, filename } = await ofertaPdfNativeService.generateOfferPDF({
      offerData,
      propertyDetails: finalPropertyDetails,
      paymentSchemes,
      creatorInfo,
      leadInfo,
      estacionamientos,
      bodegas,
      id_estatus_aprobacion: offerData.id_estatus_aprobacion,
      estatus_aprobacion_nombre: offerData.estatus_aprobacion_nombre,
    });
    
    // Upload to storage and save URL in DB
    await ofertaPdfStorageService.uploadAndSave(offerData.id, blob, filename, false);
    
    // Download locally
    ofertaPdfStorageService.downloadBlob(blob, filename);
    
    console.log('Native Sozu PDF generated and stored successfully');
  }

  private async generateCoverPage(
    pdf: jsPDF,
    offerData: any,
    propertyDetails: PropertyDetails,
    amenities: ProjectAmenity[],
    creatorInfo: any,
    leadInfo: any,
    estacionamientos: any[],
    bodegas: any[]
  ): Promise<void> {
    const container = this.createContainer();
    
    try {
      // Create cover page content
      const coverPageContent = this.createCoverPageElement(offerData, propertyDetails, amenities, creatorInfo, leadInfo, estacionamientos, bodegas);
      
      const root = createRoot(container);
      root.render(coverPageContent);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const canvas = await html2canvas(container, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: container.scrollWidth,
        height: container.scrollHeight
      });
      
      this.addCanvasToPage(pdf, canvas, false);
      
    } finally {
      document.body.removeChild(container);
    }
  }

  private async generatePaymentOptionsPage(
    pdf: jsPDF,
    offerData: any,
    propertyDetails: PropertyDetails,
    paymentSchemes: PaymentScheme[]
  ): Promise<void> {
    const container = this.createContainer();
    
    try {
      const paymentPageContent = this.createPaymentOptionsElement(offerData, propertyDetails, paymentSchemes);
      
      const root = createRoot(container);
      root.render(paymentPageContent);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const canvas = await html2canvas(container, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: container.scrollWidth,
        height: container.scrollHeight
      });
      
      this.addCanvasToPage(pdf, canvas, false);
      
    } finally {
      document.body.removeChild(container);
    }
  }

  private async generateBankingDataPage(
    pdf: jsPDF,
    offerData: any,
    propertyDetails: PropertyDetails,
    legalNotices: string[]
  ): Promise<void> {
    const container = this.createContainer();
    
    try {
      const bankingPageContent = this.createBankingDataElement(offerData, propertyDetails, legalNotices);
      
      const root = createRoot(container);
      root.render(bankingPageContent);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const canvas = await html2canvas(container, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: container.scrollWidth,
        height: container.scrollHeight
      });
      
      this.addCanvasToPage(pdf, canvas, false);
      
    } finally {
      document.body.removeChild(container);
    }
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '8.5in';
    container.style.minHeight = '11in';
    container.style.backgroundColor = 'white';
    container.style.fontSize = '16px';
    document.body.appendChild(container);
    return container;
  }

  private addCanvasToPage(pdf: jsPDF, canvas: HTMLCanvasElement, isNewPage: boolean): void {
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    const imgWidthInches = imgWidth / (96 * 2.5);
    const imgHeightInches = imgHeight / (96 * 2.5);
    
    const xMargin = 0.25;
    const yMargin = 0.25;
    const contentWidth = Math.min(imgWidthInches, pdfWidth - (2 * xMargin));
    const contentHeight = Math.min(imgHeightInches, pdfHeight - (2 * yMargin));
    
    pdf.addImage(imgData, 'PNG', xMargin, yMargin, contentWidth, contentHeight);
  }

  private isVideoUrl(url: string): boolean {
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.wmv'];
    const lowerUrl = url.toLowerCase();
    return videoExtensions.some(ext => lowerUrl.includes(ext));
  }

  private async convertImageToBase64(imageUrl: string, maxSizeKB: number = 500): Promise<string> {
    try {
      // Skip videos - they should not be embedded in PDFs
      if (this.isVideoUrl(imageUrl)) {
        console.log('Skipping video file (not suitable for PDF):', imageUrl);
        return ''; // Return empty to signal this should be filtered out
      }

      console.log('Converting image to base64:', imageUrl);
      
      const response = await fetch(imageUrl, {
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': 'image/*'
        }
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        return imageUrl; // Return original URL as fallback
      }
      
      const blob = await response.blob();
      
      // Check if blob is too large (skip files > 5MB to prevent PDF bloat)
      const maxBlobSizeMB = 5;
      if (blob.size > maxBlobSizeMB * 1024 * 1024) {
        console.warn(`Image too large (${(blob.size / 1024 / 1024).toFixed(2)}MB), compressing...`);
        return await this.compressImageBlob(blob, maxSizeKB);
      }
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            const sizeKB = reader.result.length / 1024;
            console.log('Image converted to base64 successfully, size:', sizeKB.toFixed(2), 'KB');
            
            // If result is too large, compress it
            if (sizeKB > maxSizeKB) {
              console.log('Compressing large image...');
              this.compressImageBlob(blob, maxSizeKB).then(resolve).catch(() => resolve(imageUrl));
            } else {
              resolve(reader.result);
            }
          } else {
            console.error('Failed to convert image to base64 - result is not a string');
            resolve(imageUrl); // Return original URL as fallback
          }
        };
        reader.onerror = () => {
          console.error('Error reading blob as base64');
          resolve(imageUrl); // Return original URL as fallback
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image to base64:', error);
      return imageUrl; // Return original URL as fallback
    }
  }

  private async compressImageBlob(blob: Blob, maxSizeKB: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve('');
          return;
        }

        // Calculate new dimensions (max 1000px on longest side)
        const maxDimension = 1000;
        let { width, height } = img;
        
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // CRITICAL: Fill with white background BEFORE drawing to prevent black areas
        // This is needed because JPEG doesn't support transparency
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        // Now draw the image on top of white background
        ctx.drawImage(img, 0, 0, width, height);
        
        // Use higher quality to prevent corrupted images
        let quality = 0.8;
        let result = canvas.toDataURL('image/jpeg', quality);
        
        // Only reduce quality if significantly over limit
        while (result.length / 1024 > maxSizeKB && quality > 0.4) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        
        console.log('Compressed image to', (result.length / 1024).toFixed(2), 'KB at quality', quality.toFixed(1));
        resolve(result);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve('');
      };
      
      img.src = url;
    });
  }

  private async fetchPropertyDetails(propertyId: number, offerId?: number): Promise<PropertyDetails> {
    console.log('Fetching property details for ID:', propertyId, 'offerId:', offerId);

    // Get property basic data
    const { data: propiedad, error: propiedadError } = await supabase
      .from('propiedades')
      .select(`
        id,
        numero_propiedad,
        precio_lista,
        m2_interiores,
        m2_exteriores,
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
    let ownerStpBankAccount = null;

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
            const proyectoQuery = await supabase
              .from('proyectos')
              .select(`
                id, 
                nombre, 
                url_imagen_portada,
                url_logo,
                mostrar_precio_m2_en_oferta,
                mostrar_piso_en_oferta,
                mostrar_seccion_efectivo_en_oferta,
                precio_m2_actual
              `)
              .eq('id', edificioData.id_proyecto)
              .single();
            
            const proyecto = proyectoQuery.data as any;

            if (proyecto) {
              console.log('Project data fetched:', proyecto);
              console.log('Logo URL before conversion:', proyecto.url_logo);
              console.log('Cover image URL before conversion:', proyecto.url_imagen_portada);
              
              // Don't convert logo and cover image - html2canvas handles URLs better
              // The conversion to base64 causes issues with large images
              
              projectData = proyecto;
              
              // If cash section should be shown, get the STP bank account
              if (proyecto.mostrar_seccion_efectivo_en_oferta && propiedad.id_entidad_relacionada_dueno) {
                console.log('Fetching STP bank account for owner entity:', propiedad.id_entidad_relacionada_dueno);
                
                const { data: ownerEntity, error: ownerEntityError } = await supabase
                  .from('entidades_relacionadas')
                  .select('id_persona')
                  .eq('id', propiedad.id_entidad_relacionada_dueno)
                  .maybeSingle();

                if (ownerEntityError) {
                  console.error('Error fetching owner entity:', ownerEntityError);
                }

                if (ownerEntity?.id_persona) {
                  console.log('Owner person ID:', ownerEntity.id_persona);
                  
                  const { data: stpAccount, error: stpError } = await supabase
                    .from('cuentas_bancarias')
                    .select(`
                      numero_cuenta,
                      cuenta_clabe,
                      cuenta_swift,
                      id_banco
                    `)
                    .eq('id_persona', ownerEntity.id_persona)
                    .eq('activo', true)
                    .not('cuenta_clabe', 'is', null)
                    .limit(1)
                    .maybeSingle();

                  if (stpError) {
                    console.error('Error fetching STP account:', stpError);
                  }

                  if (stpAccount) {
                    console.log('STP account found:', stpAccount);
                    
                    // Fetch bank name separately
                    let bancoNombre = 'Banco no especificado';
                    if (stpAccount.id_banco) {
                      const { data: bancoData } = await supabase
                        .from('bancos')
                        .select('nombre')
                        .eq('id', stpAccount.id_banco)
                        .single();
                      
                      if (bancoData) {
                        bancoNombre = bancoData.nombre;
                      }
                    }
                    
                    ownerStpBankAccount = {
                      numero_cuenta: stpAccount.numero_cuenta,
                      cuenta_clabe: stpAccount.cuenta_clabe,
                      cuenta_swift: stpAccount.cuenta_swift || '',
                      banco_nombre: bancoNombre
                    };
                    console.log('Owner STP bank account set:', ownerStpBankAccount);
                  } else {
                    console.warn('No STP account found for person:', ownerEntity.id_persona);
                  }
                } else {
                  console.warn('No person found for owner entity:', propiedad.id_entidad_relacionada_dueno);
                }
              }
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

    // Check if property has balcony (id_caracteristica = 1)
    let tieneBalcon = false;

    // First check in propiedades_caracteristicas
    const { data: propCaracteristicas } = await supabase
      .from('propiedades_caracteristicas')
      .select('id_caracteristica')
      .eq('id_propiedad', propertyId)
      .eq('id_caracteristica', 1)
      .eq('activo', true)
      .maybeSingle();

    if (propCaracteristicas) {
      tieneBalcon = true;
    } else if (model?.id) {
      // If not found in property characteristics, check in model characteristics
      const { data: modelCaracteristicas } = await supabase
        .from('modelos_caracteristicas')
        .select('id_caracteristica')
        .eq('id_modelo', model.id)
        .eq('id_caracteristica', 1)
        .eq('activo', true)
        .maybeSingle();
      
      if (modelCaracteristicas) {
        tieneBalcon = true;
      }
    }

    // Get model images
    let modelImages = null;
    if (model?.id) {
      const { data: imagesData } = await supabase
        .from('multimedias_modelo')
        .select('url, ver_como_ubicacion_en_oferta')
        .eq('id_modelo', model.id)
        .eq('activo', true)
        .eq('es_imagen', true) // Filter only images, exclude videos
        .order('ver_como_ubicacion_en_oferta', { ascending: false });

      if (imagesData && imagesData.length > 0) {
        // Filter out videos and convert images to base64 with compression
        const validImages = imagesData.filter(img => !this.isVideoUrl(img.url));
        console.log(`Filtered ${imagesData.length - validImages.length} video files from model images`);
        
        if (validImages.length > 0) {
          // Limit to first 5 images for PDF
          const limitedImages = validImages.slice(0, 5);
          if (validImages.length > 5) {
            console.log(`Limiting model images from ${validImages.length} to 5 for PDF size optimization`);
          }
          
          modelImages = await Promise.all(
            limitedImages.map(async (img) => {
              try {
                const base64Url = await this.convertImageToBase64(img.url, 300); // 300KB max per image
                // Skip if conversion returned empty (video or failed)
                if (!base64Url) return null;
                return {
                  url: base64Url,
                  ver_como_ubicacion_en_oferta: img.ver_como_ubicacion_en_oferta
                };
              } catch (error) {
                console.error('Error converting model image to base64:', error);
                return null;
              }
            })
          );
          // Filter out null entries (failed conversions or videos)
          modelImages = modelImages.filter(img => img !== null);
        }
      }
    }

    // Get vista data with image
    let vista = null;
    if (propiedad.id_vista) {
      const { data: vistaData } = await supabase
        .from('vistas')
        .select('id, nombre, url')
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

    // Get CLABE: first try clabe_stp_tmp_apartado, if null get from cuentas_cobranza using offerId
    let clabeStp = propiedad.clabe_stp_tmp_apartado;
    if (!clabeStp && offerId) {
      const { data: cuentaCobranza } = await supabase
        .from('cuentas_cobranza')
        .select('clabe_stp')
        .eq('id_oferta', offerId)
        .eq('activo', true)
        .not('clabe_stp', 'is', null)
        .maybeSingle();

      if (cuentaCobranza?.clabe_stp) {
        clabeStp = cuentaCobranza.clabe_stp;
      }
    }

    return {
      id: propiedad.id,
      numero_propiedad: propiedad.numero_propiedad,
      precio_lista: propiedad.precio_lista,
      m2_interiores: propiedad.m2_interiores,
      m2_exteriores: propiedad.m2_exteriores,
      descripcion: propiedad.descripcion,
      numero_piso: propiedad.numero_piso?.toString() || null,
      clabe_stp_tmp_apartado: clabeStp,
      tieneBalcon,
      building,
      model,
      vista,
      projectData,
      ownerStpBankAccount,
      ownerData,
      modelImages,
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

    const selectedSchemeId = offerData?.id_esquema_pago_seleccionado;

    // Get the project ID from the property
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

    let schemes: any[] = [];

    if (selectedSchemeId) {
      // Get the selected scheme to check if it's manual
      const { data: selectedScheme } = await supabase
        .from('esquemas_pago')
        .select('es_manual')
        .eq('id', selectedSchemeId)
        .single();

      if (selectedScheme?.es_manual) {
        // If manual: show only the selected manual scheme
        const { data: manualScheme, error } = await supabase
          .from('esquemas_pago')
          .select('*')
          .eq('id', selectedSchemeId)
          .eq('activo', true)
          .single();

        if (error) {
          console.error('Error fetching manual payment scheme:', error);
          return [];
        }

        schemes = manualScheme ? [manualScheme] : [];
      } else {
        // If not manual: show all non-manual schemes from the project
        const { data: nonManualSchemes, error } = await supabase
          .from('esquemas_pago')
          .select('*')
          .eq('id_proyecto', projectId)
          .eq('es_manual', false)
          .eq('activo', true)
          .order('id');

        if (error) {
          console.error('Error fetching non-manual payment schemes:', error);
          return [];
        }

        schemes = nonManualSchemes || [];
      }
    } else {
      // If no scheme is selected, show all non-manual schemes from the project
      const { data: allSchemes, error } = await supabase
        .from('esquemas_pago')
        .select('*')
        .eq('id_proyecto', projectId)
        .eq('es_manual', false)
        .eq('activo', true)
        .order('id');

      if (error) {
        console.error('Error fetching all payment schemes:', error);
        return [];
      }

      schemes = allSchemes || [];
    }

    // Mark the selected scheme
    const schemesWithSelection = schemes.map(scheme => ({
      ...scheme,
      is_selected: scheme.id === selectedSchemeId
    }));

    console.log('Found payment schemes:', schemesWithSelection);
    return schemesWithSelection;
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
    const normalizedEmail = creatorEmail?.trim().toLowerCase();
    console.log('Fetching creator info for normalized email:', normalizedEmail);

    // First try personas table (where agents update their data)
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .select('id, nombre_legal, email, telefono')
      .ilike('email', normalizedEmail)
      .single();

    if (!personaError && persona) {
      console.log('Found persona:', persona.nombre_legal, 'Phone:', persona.telefono);
      return persona;
    }

    console.log('Persona not found, trying usuarios. Error:', personaError?.message);

    // Fallback to usuarios table
    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('nombre, email, telefono')
      .ilike('email', normalizedEmail)
      .single();

    if (!usuarioError && usuario) {
      return {
        nombre_legal: usuario.nombre,
        email: usuario.email,
        telefono: usuario.telefono
      };
    }

    console.error('Error fetching creator info from both tables:', personaError || usuarioError);
    return null;
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

    // Add RFC validation
    const hasValidRFC = isValidRFC(persona?.rfc);
    
    return {
      ...persona,
      hasValidRFC
    };
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

  private async fetchProductDetails(productId: number, propertyId?: number): Promise<any> {
    console.log('Fetching product details for ID:', productId);
    
    const { data: product, error } = await supabase
      .from('productos_servicios')
      .select(`
        id,
        nombre,
        precio_lista,
        id_entidad_relacionada_dueno,
        id_categoria
      `)
      .eq('id', productId)
      .single();

    if (error) {
      console.error('Error fetching product:', error);
      throw error;
    }

    // Fetch category info including tiene_metraje
    let categoria_nombre = null;
    let tiene_metraje = false;
    if (product.id_categoria) {
      const { data: categoria } = await supabase
        .from('categorias_producto')
        .select('nombre, tiene_metraje')
        .eq('id', product.id_categoria)
        .single();
      
      categoria_nombre = categoria?.nombre;
      tiene_metraje = categoria?.tiene_metraje || false;
    }

    // Calculate final price - if tiene_metraje, get metraje from bodega or estacionamiento
    let precio_final = product.precio_lista;
    let metraje = null;
    
    if (tiene_metraje && propertyId) {
      // Try to find the metraje from bodegas first
      const { data: bodega } = await supabase
        .from('bodegas')
        .select('m2')
        .eq('id_producto', productId)
        .eq('id_propiedad', propertyId)
        .eq('activo', true)
        .maybeSingle();
      
      if (bodega?.m2) {
        metraje = bodega.m2;
        precio_final = product.precio_lista * metraje;
      } else {
        // Try estacionamientos
        const { data: estacionamiento } = await supabase
          .from('estacionamientos')
          .select('m2')
          .eq('id_producto', productId)
          .eq('id_propiedad', propertyId)
          .eq('activo', true)
          .maybeSingle();
        
        if (estacionamiento?.m2) {
          metraje = estacionamiento.m2;
          precio_final = product.precio_lista * metraje;
        }
      }
    }

    // Fetch owner bank account data
    let ownerStpBankAccount = null;
    let ownerData = null;

    if (product.id_entidad_relacionada_dueno) {
      const { data: entidadRelacionada } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona')
        .eq('id', product.id_entidad_relacionada_dueno)
        .single();

      if (entidadRelacionada?.id_persona) {
        // Fetch owner data
        const { data: persona } = await supabase
          .from('personas')
          .select('id, nombre_legal, email, telefono')
          .eq('id', entidadRelacionada.id_persona)
          .single();

        ownerData = persona;

        // Fetch STP bank account
        const { data: stpAccount } = await supabase
          .from('cuentas_bancarias')
          .select(`
            numero_cuenta,
            cuenta_clabe,
            cuenta_swift,
            id_banco
          `)
          .eq('id_persona', entidadRelacionada.id_persona)
          .eq('es_cuenta_fisica_para_stp', true)
          .eq('activo', true)
          .single();

        if (stpAccount) {
          // Fetch bank name
          let banco_nombre = 'Banco desconocido';
          if (stpAccount.id_banco) {
            const { data: banco } = await supabase
              .from('bancos')
              .select('nombre')
              .eq('id', stpAccount.id_banco)
              .single();
            
            banco_nombre = banco?.nombre || banco_nombre;
          }

          ownerStpBankAccount = {
            numero_cuenta: stpAccount.numero_cuenta,
            cuenta_clabe: stpAccount.cuenta_clabe || '',
            cuenta_swift: stpAccount.cuenta_swift || '',
            banco_nombre
          };
        }
      }
    }

    return {
      id: product.id,
      nombre: product.nombre,
      precio_lista: precio_final, // Use calculated price (includes metraje if applicable)
      precio_por_m2: tiene_metraje ? product.precio_lista : null,
      metraje: metraje,
      categoria_nombre,
      ownerData,
      ownerStpBankAccount
    };
  }

  private async generateProductPDFFromHTML(
    offerData: {
      id: number;
      fecha_generacion: string;
      propertyNumber: string;
      leadName: string;
      leadEmail: string;
      email_creador: string;
      id_esquema_pago_seleccionado?: number | null;
      clabe_stp_tmp_producto?: string | null;
      clabe_stp?: string | null;
      id_estatus_aprobacion?: number | null;
      estatus_aprobacion_nombre?: string | null;
    },
    propertyDetails: PropertyDetails,
    productDetails: any,
    paymentSchemes: PaymentScheme[],
    creatorInfo: any,
    leadInfo: any,
    legalNotices: string[]
  ): Promise<void> {
    // Use native PDF generation for faster, text-selectable PDFs
    const { ofertaProductoPdfNativeService } = await import('./ofertaProductoPdfNativeService');
    const { ofertaPdfStorageService } = await import('./ofertaPdfStorageService');
    
    // Generate PDF (now returns blob)
    const { blob, filename } = await ofertaProductoPdfNativeService.generateOfferPDF({
      offerData,
      propertyDetails,
      productDetails,
      paymentSchemes,
      creatorInfo,
      leadInfo,
      legalNotices,
      id_estatus_aprobacion: offerData.id_estatus_aprobacion,
      estatus_aprobacion_nombre: offerData.estatus_aprobacion_nombre,
    });
    
    // Upload to storage and save URL in DB
    await ofertaPdfStorageService.uploadAndSave(offerData.id, blob, filename, true);
    
    // Download locally
    ofertaPdfStorageService.downloadBlob(blob, filename);
    
    console.log('Native Product PDF generated and stored successfully');
  }

  private formatOfferNumber(offerId: number): string {
    return `OFE-${offerId.toString().padStart(6, '0')}`;
  }

  private createCoverPageElement(
    offerData: any,
    propertyDetails: PropertyDetails,
    amenities: ProjectAmenity[],
    creatorInfo: any,
    leadInfo: any,
    estacionamientos: any[],
    bodegas: any[]
  ) {
    const formatOfferNumber = (offerId: number) => {
      return `OFE-${offerId.toString().padStart(6, '0')}`;
    };

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(amount);
    };

    return React.createElement('div', {
      className: 'bg-white text-gray-900 font-sans text-base leading-relaxed min-h-screen p-12 flex flex-col relative overflow-hidden'
    }, [
      // Background gradient
      React.createElement('div', {
        key: 'bg',
        className: 'absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10'
      }),
      
      // Project Image
      propertyDetails.projectData?.url_imagen_portada && React.createElement('div', {
        key: 'image',
        className: 'relative z-10 mb-8 rounded-2xl overflow-hidden shadow-2xl'
      }, [
        React.createElement('img', {
          key: 'img',
          src: propertyDetails.projectData.url_imagen_portada,
          alt: propertyDetails.projectData.nombre,
          className: 'w-full h-48 object-cover'
        })
      ]),

      // Header
      React.createElement('div', {
        key: 'header',
        className: 'relative z-10 flex justify-between items-start mb-8'
      }, [
        React.createElement('div', { key: 'left' }, [
          React.createElement('h1', {
            key: 'title',
            className: 'text-xl font-bold text-primary mb-1'
          }, `Cotización departamento ${propertyDetails.numero_propiedad} de ${propertyDetails.projectData?.nombre}`),
          React.createElement('p', {
            key: 'offer-id',
            className: 'text-sm text-muted-foreground'
          }, formatOfferNumber(offerData.id))
        ]),
        React.createElement('div', {
          key: 'right',
          className: 'text-right'
        }, [
          React.createElement('p', {
            key: 'date-label',
            className: 'text-xs text-muted-foreground'
          }, 'Fecha de generación'),
          React.createElement('p', {
            key: 'date-value',
            className: 'text-sm font-semibold'
          }, new Date(offerData.fecha_generacion).toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }))
        ])
      ]),

      // Property Summary
      React.createElement('div', {
        key: 'summary',
        className: 'relative z-10 bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-border'
      }, [
        React.createElement('h3', {
          key: 'summary-title',
          className: 'text-base font-bold mb-4 text-primary'
        }, 'Detalles de la Propiedad'),
        React.createElement('div', {
          key: 'summary-grid',
          className: 'grid grid-cols-2 gap-8'
        }, [
          // Left Column - Property Details
          React.createElement('div', {
            key: 'left-col',
            className: 'space-y-1'
          }, [
            React.createElement('div', {
              key: 'prop-num',
              className: 'flex justify-between'
            }, [
              React.createElement('span', {
                key: 'label',
                className: 'text-muted-foreground'
              }, 'Número de departamento:'),
              React.createElement('span', {
                key: 'value',
                className: 'font-semibold'
              }, propertyDetails.numero_propiedad)
            ]),
            React.createElement('div', {
              key: 'price',
              className: 'flex justify-between'
            }, [
              React.createElement('span', {
                key: 'label',
                className: 'text-muted-foreground'
              }, 'Precio de lista:'),
              React.createElement('span', {
                key: 'value',
                className: 'font-semibold'
              }, formatCurrency(propertyDetails.precio_lista))
            ]),
            // Precio por m² - if configured
            propertyDetails.projectData?.mostrar_precio_m2_en_oferta !== false && propertyDetails.m2_exteriores && React.createElement('div', {
              key: 'price-m2',
              className: 'flex justify-between'
            }, [
              React.createElement('span', {
                key: 'label',
                className: 'text-muted-foreground'
              }, 'Precio por m²:'),
              React.createElement('span', {
                key: 'value',
                className: 'font-semibold'
              }, formatCurrency(propertyDetails.precio_lista / propertyDetails.m2_exteriores))
            ]),
            // Piso - if configured
            propertyDetails.projectData?.mostrar_piso_en_oferta !== false && propertyDetails.numero_piso && React.createElement('div', {
              key: 'floor',
              className: 'flex justify-between'
            }, [
              React.createElement('span', {
                key: 'label',
                className: 'text-muted-foreground'
              }, 'Nivel:'),
              React.createElement('span', {
                key: 'value',
                className: 'font-semibold'
              }, propertyDetails.numero_piso)
            ]),
            // Modelo - always show if available
            propertyDetails.model?.nombre && React.createElement('div', {
              key: 'model',
              className: 'flex justify-between'
            }, [
              React.createElement('span', {
                key: 'label',
                className: 'text-muted-foreground'
              }, 'Modelo:'),
              React.createElement('span', {
                key: 'value',
                className: 'font-semibold'
              }, propertyDetails.model.nombre)
            ]),
            // Edificio - always show if available
            propertyDetails.building?.nombre && React.createElement('div', {
              key: 'building',
              className: 'flex justify-between'
            }, [
              React.createElement('span', {
                key: 'label',
                className: 'text-muted-foreground'
              }, 'Edificio:'),
              React.createElement('span', {
                key: 'value',
                className: 'font-semibold'
              }, propertyDetails.building.nombre)
            ]),
            // Estacionamientos - always show if available
            estacionamientos && estacionamientos.length > 0 && React.createElement('div', {
              key: 'parking',
              className: 'flex justify-between'
            }, [
              React.createElement('span', {
                key: 'label',
                className: 'text-muted-foreground'
              }, 'Estacionamientos:'),
              React.createElement('span', {
                key: 'value',
                className: 'font-semibold'
              }, estacionamientos.map(e => e.nombre).join(', '))
            ]),
            // Bodegas - always show if available
            bodegas && bodegas.length > 0 && React.createElement('div', {
              key: 'storage',
              className: 'flex justify-between'
            }, [
              React.createElement('span', {
                key: 'label',
                className: 'text-muted-foreground'
              }, 'Bodega:'),
              React.createElement('span', {
                key: 'value',
                className: 'font-semibold'
              }, bodegas.map(b => b.nombre).join(', '))
            ])
          ]),
          
          // Right Column - Amenities
          React.createElement('div', { key: 'right-col' }, [
            React.createElement('h4', {
              key: 'amenities-title',
              className: 'text-sm font-bold mb-3 text-primary'
            }, 'Amenidades'),
            React.createElement('div', {
              key: 'amenities-grid',
              className: 'grid grid-cols-5 gap-2'
            }, amenities.filter(amenity => amenity.url).slice(0, 15).map((amenity) =>
              React.createElement('div', {
                key: amenity.id,
                className: 'flex justify-center'
              }, [
                React.createElement('img', {
                  key: 'icon',
                  src: amenity.url,
                  alt: amenity.nombre,
                  className: 'w-8 h-8 object-contain'
                })
              ])
            ))
          ])
        ])
      ]),

      // Contacts Section
      React.createElement('div', {
        key: 'contacts',
        className: 'relative z-10 mt-4 grid grid-cols-2 gap-6'
      }, [
        // Agent Info Card
        React.createElement('div', {
          key: 'agent',
          className: 'bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-border'
        }, [
          React.createElement('h3', {
            key: 'agent-title',
            className: 'text-sm font-bold mb-3 text-primary'
          }, 'Información del Agente'),
          React.createElement('div', {
            key: 'agent-info',
            className: 'space-y-2 text-xs leading-tight'
          }, [
            React.createElement('div', { key: 'name' }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Nombre'),
              React.createElement('p', {
                key: 'value',
                className: 'font-semibold'
              }, creatorInfo?.nombre_legal || 'No disponible')
            ]),
            React.createElement('div', { key: 'email' }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Email'),
              React.createElement('p', {
                key: 'value',
                className: 'font-semibold'
              }, creatorInfo?.email || 'No disponible')
            ])
          ])
        ]),

        // Buyer Info Card
        React.createElement('div', {
          key: 'buyer',
          className: 'bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-border'
        }, [
          React.createElement('h3', {
            key: 'buyer-title',
            className: 'text-sm font-bold mb-3 text-primary'
          }, 'Información del Comprador'),
          React.createElement('div', {
            key: 'buyer-info',
            className: 'space-y-2 text-xs leading-tight'
          }, [
            React.createElement('div', { key: 'name' }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Nombre'),
              React.createElement('p', {
                key: 'value',
                className: 'font-semibold'
              }, (leadInfo?.nombre_legal || offerData.leadName).toUpperCase())
            ]),
            React.createElement('div', { key: 'email' }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Email'),
              React.createElement('p', {
                key: 'value',
                className: 'font-semibold'
              }, leadInfo?.email || offerData.leadEmail)
            ])
          ])
        ])
      ])
    ]);
  }

  private createPaymentOptionsElement(
    offerData: any,
    propertyDetails: PropertyDetails,
    paymentSchemes: PaymentScheme[]
  ) {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(amount);
    };

    const calculatePaymentAmounts = (scheme: PaymentScheme) => {
      const basePrice = propertyDetails.precio_lista;
      const discount = basePrice * (scheme.porcentaje_descuento_aumento / 100);
      const finalPrice = basePrice - discount;
      
      return {
        enganche: finalPrice * (scheme.porcentaje_enganche / 100),
        mensualidad: (finalPrice * (scheme.porcentaje_mensualidades / 100)) / scheme.numero_mensualidades,
        entrega: finalPrice * (scheme.porcentaje_entrega / 100),
        finalPrice,
        discount
      };
    };

    const selectedPaymentScheme = paymentSchemes.find(scheme => scheme.is_selected);
    
    return React.createElement('div', {
      className: 'bg-white text-gray-900 font-sans text-base leading-relaxed min-h-screen p-10'
    }, [
      React.createElement('h2', {
        key: 'title',
        className: 'text-sm font-bold mb-6 text-primary text-center'
      }, 'Opciones de Pago Disponibles'),
      
      React.createElement('div', {
        key: 'schemes-grid',
        className: 'grid grid-cols-2 gap-4'
      }, paymentSchemes.map((scheme) => {
        const calculation = calculatePaymentAmounts(scheme);
        const isSelected = scheme.is_selected;
        
        return React.createElement('div', {
          key: scheme.id,
          className: `rounded-xl p-4 shadow-lg border-2 ${isSelected 
            ? 'bg-blue-50 border-blue-500' 
            : 'bg-white border-border'}`
        }, [
          React.createElement('div', {
            key: 'scheme-title',
            className: 'text-center mb-3 relative'
          }, [
            React.createElement('h4', {
              key: 'name',
              className: `text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-gray-900'}`
            }, scheme.nombre)
          ]),
          
          React.createElement('div', {
            key: 'scheme-details',
            className: 'space-y-2'
          }, [
            React.createElement('div', {
              key: 'enganche',
              className: 'text-center'
            }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Enganche'),
              React.createElement('p', {
                key: 'amount',
                className: 'font-bold text-xs'
              }, formatCurrency(calculation.enganche)),
              React.createElement('p', {
                key: 'percent',
                className: 'text-xs text-muted-foreground'
              }, `(${scheme.porcentaje_enganche}%)`)
            ]),
            React.createElement('div', {
              key: 'mensualidad',
              className: 'text-center'
            }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Mensualidad'),
              React.createElement('p', {
                key: 'amount',
                className: 'font-bold text-xs'
              }, formatCurrency(calculation.mensualidad)),
              React.createElement('p', {
                key: 'months',
                className: 'text-xs text-muted-foreground'
              }, `${scheme.numero_mensualidades} meses`)
            ]),
            React.createElement('div', {
              key: 'entrega',
              className: 'text-center'
            }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Contra Entrega'),
              React.createElement('p', {
                key: 'amount',
                className: 'font-bold text-xs'
              }, formatCurrency(calculation.entrega)),
              React.createElement('p', {
                key: 'percent',
                className: 'text-xs text-muted-foreground'
              }, `(${scheme.porcentaje_entrega}%)`)
            ]),
            React.createElement('div', {
              key: 'final',
              className: 'text-center'
            }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Precio Final'),
              React.createElement('p', {
                key: 'amount',
                className: 'font-bold text-primary text-xs'
              }, formatCurrency(calculation.finalPrice))
            ])
          ])
        ]);
      }))
    ]);
  }

  private createBankingDataElement(
    offerData: any,
    propertyDetails: PropertyDetails,
    legalNotices: string[]
  ) {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(amount);
    };

    return React.createElement('div', {
      className: 'bg-white text-gray-900 font-sans text-base leading-relaxed min-h-screen p-10'
    }, [
      React.createElement('h2', {
        key: 'title',
        className: 'text-sm font-bold mb-6 text-primary text-center'
      }, 'Datos Bancarios'),
      
      React.createElement('div', {
        key: 'banking-grid',
        className: 'grid grid-cols-2 gap-6'
      }, [
        // Transfer Card
        React.createElement('div', {
          key: 'transfer',
          className: 'bg-white rounded-2xl p-6 shadow-lg border border-border'
        }, [
          React.createElement('h3', {
            key: 'transfer-title',
            className: 'text-sm font-bold mb-4 text-primary'
          }, 'Transferencia'),
          React.createElement('div', {
            key: 'transfer-details',
            className: 'space-y-3'
          }, [
            React.createElement('div', { key: 'beneficiary' }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Beneficiario'),
              React.createElement('p', {
                key: 'value',
                className: 'text-xs font-semibold'
              }, propertyDetails.ownerData?.nombre_legal || 'No disponible')
            ]),
            React.createElement('div', { key: 'bank' }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Banco'),
              React.createElement('p', {
                key: 'value',
                className: 'text-xs font-semibold'
              }, 'Sistema de Transacciones y Pagos')
            ]),
            React.createElement('div', { key: 'clabe' }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'CLABE'),
              React.createElement('p', {
                key: 'value',
                className: 'text-xs font-semibold font-mono'
              }, propertyDetails.clabe_stp_tmp_apartado || 'Por asignar')
            ]),
            React.createElement('div', { key: 'concept' }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Concepto de Pago'),
              React.createElement('p', {
                key: 'value',
                className: 'text-xs font-semibold'
              }, `Apartado Depto. ${propertyDetails.numero_propiedad}`)
            ])
          ])
        ]),

        // Cash Payment Card - only show if enabled with bank data only
        propertyDetails.projectData?.mostrar_seccion_efectivo_en_oferta !== false && propertyDetails.ownerStpBankAccount && React.createElement('div', {
          key: 'cash',
          className: 'bg-white rounded-2xl p-6 shadow-lg border border-border'
        }, [
          React.createElement('h3', {
            key: 'cash-title',
            className: 'text-sm font-bold mb-4 text-primary'
          }, 'En Efectivo'),
          React.createElement('div', {
            key: 'bank-info',
            className: 'space-y-2'
          }, [
            React.createElement('div', { key: 'bank' }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Banco'),
              React.createElement('p', {
                key: 'value',
                className: 'text-xs font-semibold'
              }, propertyDetails.ownerStpBankAccount.banco_nombre)
            ]),
            propertyDetails.ownerStpBankAccount.cuenta_clabe && React.createElement('div', { key: 'clabe' }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'CLABE'),
              React.createElement('p', {
                key: 'value',
                className: 'text-xs font-semibold font-mono'
              }, propertyDetails.ownerStpBankAccount.cuenta_clabe)
            ]),
            React.createElement('div', { key: 'account' }, [
              React.createElement('p', {
                key: 'label',
                className: 'text-xs text-muted-foreground'
              }, 'Número de Cuenta'),
              React.createElement('p', {
                key: 'value',
                className: 'text-xs font-semibold font-mono'
              }, propertyDetails.ownerStpBankAccount.numero_cuenta)
            ])
          ])
        ])
      ]),

      // Legal Notice
      React.createElement('div', {
        key: 'legal',
        className: 'mt-8 p-4 bg-muted rounded-xl'
      }, [
        React.createElement('h4', {
          key: 'legal-title',
          className: 'text-xs font-bold mb-2'
        }, 'Aviso Legal'),
        React.createElement('p', {
          key: 'legal-text',
          className: 'text-xs text-muted-foreground leading-relaxed'
        }, legalNotices && legalNotices.length > 0 
          ? legalNotices.join('. ')
          : 'Esta cotización es válida por 5 días a partir de la fecha de generación. Los precios están sujetos a cambios sin previo aviso.')
      ])
    ]);
  }
}

export const generateOfferPDF = async (offerData: OfferData) => {
  const service = new HTMLToPDFService();
  await service.generateOfferPDF(offerData);
};

/**
 * Generate offer PDF(s) as base64 strings without downloading.
 * Used for sending via email from the client side.
 * Returns an array of { base64, filename } for the main offer and product offers.
 */
export const generateOfferPDFAsBase64 = async (offerData: OfferData): Promise<{ base64: string; filename: string }[]> => {
  const results: { base64: string; filename: string }[] = [];
  
  const { data: offerDetails, error: offerError } = await supabase
    .from('ofertas')
    .select('*')
    .eq('id', offerData.offerId)
    .single();

  if (offerError || !offerDetails) {
    throw new Error('Error fetching offer details');
  }

  const offerOptions = offerData.offerOptions || {
    mostrar_piso_en_oferta: offerDetails.mostrar_piso_en_oferta ?? true,
    mostrar_precio_m2_en_oferta: offerDetails.mostrar_precio_m2_en_oferta ?? true,
    mostrar_seccion_efectivo_en_oferta: offerDetails.mostrar_seccion_efectivo_en_oferta ?? true,
  };

  if (offerData.isProductOffer && offerData.productId) {
    // Product offer
    const service = new HTMLToPDFService();
    const propertyDetails = await (service as any).fetchPropertyDetails(offerData.propertyId);
    const productDetails = await (service as any).fetchProductDetails(offerData.productId, offerData.propertyId);
    
    let clabeStp = offerDetails.clabe_stp_tmp_producto;
    if (!clabeStp) {
      const { data: cuentaCobranza } = await supabase
        .from('cuentas_cobranza')
        .select('clabe_stp')
        .eq('id_oferta', offerData.offerId)
        .single();
      if (cuentaCobranza?.clabe_stp) clabeStp = cuentaCobranza.clabe_stp;
    }

    const { data: paymentSchemes } = await supabase
      .from('esquemas_pago')
      .select('*')
      .eq('id_producto', offerData.productId)
      .eq('activo', true)
      .order('nombre', { ascending: true });

    const [creatorInfo, leadInfo, legalNotices] = await Promise.all([
      (service as any).fetchCreatorInfo(offerDetails.email_creador),
      (service as any).fetchLeadInfo(offerDetails.id_persona_lead),
      (service as any).fetchLegalNotices(offerData.propertyId)
    ]);

    let estatus_aprobacion_nombre: string | null = null;
    if (offerDetails.id_estatus_aprobacion) {
      const { data: estatusData } = await supabase
        .from('estatus_aprobacion')
        .select('nombre')
        .eq('id', offerDetails.id_estatus_aprobacion)
        .single();
      estatus_aprobacion_nombre = estatusData?.nombre || null;
    }

    const { ofertaProductoPdfNativeService } = await import('./ofertaProductoPdfNativeService');
    const { blob, filename } = await ofertaProductoPdfNativeService.generateOfferPDF({
      offerData: {
        id: offerData.offerId,
        fecha_generacion: offerDetails.fecha_generacion,
        propertyNumber: offerData.propertyNumber,
        leadName: offerData.leadName,
        leadEmail: offerData.leadEmail,
        email_creador: offerData.creatorEmail,
        id_esquema_pago_seleccionado: offerDetails.id_esquema_pago_seleccionado,
        clabe_stp_tmp_producto: offerDetails.clabe_stp_tmp_producto,
        clabe_stp: clabeStp,
      } as any,
      propertyDetails,
      productDetails,
      paymentSchemes: paymentSchemes || [],
      creatorInfo,
      leadInfo,
      legalNotices,
      id_estatus_aprobacion: offerDetails.id_estatus_aprobacion,
      estatus_aprobacion_nombre,
    });

    const base64 = await blobToBase64(blob);
    results.push({ base64, filename });
  } else {
    // Property offer
    const service = new HTMLToPDFService();
    const [propertyDetails, paymentSchemes, amenities, creatorInfo, leadInfo, legalNotices, estacionamientos, bodegas] = await Promise.all([
      (service as any).fetchPropertyDetails(offerData.propertyId, offerData.offerId),
      (service as any).fetchPaymentSchemes(offerData.propertyId, offerData.offerId),
      (service as any).fetchProjectAmenities(offerData.propertyId),
      (service as any).fetchCreatorInfo(offerDetails.email_creador),
      (service as any).fetchLeadInfo(offerDetails.id_persona_lead),
      (service as any).fetchLegalNotices(offerData.propertyId),
      (service as any).fetchEstacionamientos(offerData.propertyId),
      (service as any).fetchBodegas(offerData.propertyId)
    ]);

    let estatus_aprobacion_nombre: string | null = null;
    if (offerDetails.id_estatus_aprobacion) {
      const { data: estatusData } = await supabase
        .from('estatus_aprobacion')
        .select('nombre')
        .eq('id', offerDetails.id_estatus_aprobacion)
        .single();
      estatus_aprobacion_nombre = estatusData?.nombre || null;
    }

    const finalPropertyDetails = {
      ...propertyDetails,
      projectData: {
        ...propertyDetails.projectData,
        mostrar_piso_en_oferta: offerOptions?.mostrar_piso_en_oferta ?? propertyDetails.projectData?.mostrar_piso_en_oferta,
        mostrar_precio_m2_en_oferta: offerOptions?.mostrar_precio_m2_en_oferta ?? propertyDetails.projectData?.mostrar_precio_m2_en_oferta,
        mostrar_seccion_efectivo_en_oferta: offerOptions?.mostrar_seccion_efectivo_en_oferta ?? propertyDetails.projectData?.mostrar_seccion_efectivo_en_oferta,
      }
    };

    const { ofertaPdfNativeService } = await import('./ofertaPdfNativeService');
    const { blob, filename } = await ofertaPdfNativeService.generateOfferPDF({
      offerData: {
        id: offerData.offerId,
        fecha_generacion: offerDetails.fecha_generacion,
        propertyNumber: offerData.propertyNumber,
        leadName: offerData.leadName,
        leadEmail: offerData.leadEmail,
        email_creador: offerData.creatorEmail,
      } as any,
      propertyDetails: finalPropertyDetails,
      paymentSchemes,
      creatorInfo,
      leadInfo,
      estacionamientos,
      bodegas,
      id_estatus_aprobacion: offerDetails.id_estatus_aprobacion,
      estatus_aprobacion_nombre,
    });

    // Also upload to storage
    const { ofertaPdfStorageService } = await import('./ofertaPdfStorageService');
    await ofertaPdfStorageService.uploadAndSave(offerData.offerId, blob, filename, false);

    const base64 = await blobToBase64(blob);
    results.push({ base64, filename });
  }

  return results;
};

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Remove the data:application/pdf;base64, prefix
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}