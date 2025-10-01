import { forwardRef } from 'react';

interface OfferData {
  id: number;
  fecha_generacion: string;
  email_creador: string;
  id_persona_lead: number;
  id_propiedad: number;
  id_esquema_pago_seleccionado: number | null;
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

interface OfferPDFTemplateSozuProps {
  offerData: {
    id: number;
    fecha_generacion: string;
    propertyNumber: string;
    leadName: string;
    leadEmail: string;
  };
  propertyDetails: PropertyDetails;
  paymentSchemes: PaymentScheme[];
  amenities: ProjectAmenity[];
  creatorInfo: any;
  leadInfo: any;
  legalNotices: string[];
  estacionamientos: any[];
  bodegas: any[];
}

export const OfferPDFTemplateSozu = forwardRef<HTMLDivElement, OfferPDFTemplateSozuProps>(
  ({ offerData, propertyDetails, paymentSchemes, amenities, creatorInfo, leadInfo, legalNotices, estacionamientos, bodegas }, ref) => {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(amount);
    };

    const formatOfferNumber = (offerId: number) => {
      return `O-${offerId.toString().padStart(6, '0')}`;
    };

    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-MX', { 
        year: 'numeric', 
        month: 'short', 
        day: '2-digit' 
      });
    };

    const calculateVigencia = (dateString: string) => {
      const date = new Date(dateString);
      date.setDate(date.getDate() + 30);
      return date.toLocaleDateString('es-MX', { 
        year: 'numeric', 
        month: 'short', 
        day: '2-digit' 
      });
    };

    const selectedPaymentScheme = paymentSchemes[0];
    
    const filteredPaymentSchemes = selectedPaymentScheme?.es_manual 
      ? paymentSchemes.filter(scheme => scheme.es_manual)
      : paymentSchemes.filter(scheme => !scheme.es_manual);

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

    return (
      <div 
        ref={ref} 
        style={{ 
          width: '2550px', 
          height: '3300px', 
          backgroundColor: 'white',
          fontFamily: 'Arial, sans-serif',
          position: 'relative',
          padding: '80px'
        }}
      >
        {/* Header with Project Logo and Offer Info */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '60px',
          paddingBottom: '40px',
          borderBottom: '2px solid #e0e0e0'
        }}>
          <div style={{ flex: '0 0 auto' }}>
            {propertyDetails.projectData?.url_logo && (
              <img
                src={propertyDetails.projectData.url_logo}
                alt="Logo Proyecto"
                style={{ height: '120px', width: '320px', objectFit: 'contain' }}
              />
            )}
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '28px', color: '#000' }}>
              <span style={{ fontWeight: '600' }}>ID Oferta:</span>{' '}
              <span style={{ fontWeight: '400' }}>{formatOfferNumber(offerData.id)}</span>
            </div>
            <div style={{ fontSize: '28px', color: '#000' }}>
              <span style={{ fontWeight: '600' }}>Expedición:</span>{' '}
              <span style={{ fontWeight: '400' }}>{formatDate(offerData.fecha_generacion)}</span>
            </div>
            <div style={{ fontSize: '28px', color: '#000' }}>
              <span style={{ fontWeight: '600' }}>Vigencia:</span>{' '}
              <span style={{ fontWeight: '400' }}>{calculateVigencia(offerData.fecha_generacion)}</span>
            </div>
          </div>
        </div>


        {/* Property Details Section */}
        <div style={{ marginBottom: '80px' }}>
          <h2 style={{ 
            fontSize: '48px', 
            fontWeight: 'bold', 
            color: '#000',
            marginBottom: '40px'
          }}>
            Datos de la Propiedad:
          </h2>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1.2fr 120px 1fr', 
            gap: '40px',
            alignItems: 'start'
          }}>
            {/* Left Column: Property Data */}
            <div>
              <div style={{ fontSize: '28px', lineHeight: '1.6' }}>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'normal' }}>No° de propiedad: </span>
                  <span style={{ fontWeight: 'bold' }}>{propertyDetails.numero_propiedad}</span>
                </div>
                {propertyDetails.model && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ fontWeight: 'normal' }}>Modelo: </span>
                    <span style={{ fontWeight: 'bold' }}>{propertyDetails.model.nombre}</span>
                  </div>
                )}
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'normal' }}>Área: </span>
                  <span style={{ fontWeight: 'bold' }}>{propertyDetails.m2_reales?.toFixed(2) || 'N/A'} m²</span>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'normal' }}>Precio de lista: </span>
                  <span style={{ fontWeight: 'bold' }}>{formatCurrency(propertyDetails.precio_lista)}</span>
                </div>
                {propertyDetails.projectData?.precio_m2 && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ fontWeight: 'normal' }}>Precio m2: </span>
                    <span style={{ fontWeight: 'bold' }}>{formatCurrency(propertyDetails.projectData.precio_m2)}</span>
                  </div>
                )}
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'normal' }}>Piso: </span>
                  <span style={{ fontWeight: 'bold' }}>{propertyDetails.numero_piso || 'N/A'}</span>
                </div>
                {propertyDetails.building && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ fontWeight: 'normal' }}>Edificio: </span>
                    <span style={{ fontWeight: 'bold' }}>{propertyDetails.building.nombre}</span>
                  </div>
                )}
                {propertyDetails.vista && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ fontWeight: 'normal' }}>Vista: </span>
                    <span style={{ fontWeight: 'bold' }}>{propertyDetails.vista.nombre}</span>
                  </div>
                )}
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'normal' }}>Precio bodega: </span>
                  <span style={{ fontWeight: 'bold' }}>N/A</span>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'normal' }}>Bodega m2: </span>
                  <span style={{ fontWeight: 'bold' }}>N/A</span>
                </div>
              </div>
            </div>

            {/* Middle Column: Vertical Icons (Icon Only) */}
            <div style={{ 
              display: 'flex',
              flexDirection: 'column',
              gap: '52px',
              paddingTop: '20px',
              justifyContent: 'flex-start'
            }}>
              {/* Recámara Icon */}
              <div style={{ textAlign: 'center' }}>
                <svg width="70" height="70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2.5" y="10.5" width="19" height="9.5" rx="1.2" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <path d="M6.5 10.5V8.5C6.5 7.11929 7.61929 6 9 6H15C16.3807 6 17.5 7.11929 17.5 8.5V10.5" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <line x1="2.5" y1="16" x2="21.5" y2="16" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <rect x="6.5" y="13.5" width="3.5" height="2.5" rx="0.3" fill="#2d2d2d"/>
                  <rect x="14" y="13.5" width="3.5" height="2.5" rx="0.3" fill="#2d2d2d"/>
                </svg>
              </div>
              
              {/* Baño Completo Icon */}
              <div style={{ textAlign: 'center' }}>
                <svg width="70" height="70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 12.5H20V16C20 18.2091 18.2091 20 16 20H8C5.79086 20 4 18.2091 4 16V12.5Z" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <path d="M9 12.5V10.5C9 8.84315 10.3431 7.5 12 7.5C13.6569 7.5 15 8.84315 15 10.5V12.5" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <circle cx="12" cy="4.5" r="1.8" fill="#2d2d2d"/>
                  <line x1="8" y1="15.5" x2="8" y2="18" stroke="#fff" strokeWidth="1.3"/>
                  <line x1="12" y1="15.5" x2="12" y2="18" stroke="#fff" strokeWidth="1.3"/>
                  <line x1="16" y1="15.5" x2="16" y2="18" stroke="#fff" strokeWidth="1.3"/>
                </svg>
              </div>
              
              {/* Medio Baño Icon */}
              <div style={{ textAlign: 'center' }}>
                <svg width="70" height="70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <ellipse cx="12" cy="9" rx="5" ry="3.5" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <path d="M7 9V15C7 16.6569 9.23858 18 12 18C14.7614 18 17 16.6569 17 15V9" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <path d="M12 5V9" stroke="#2d2d2d" strokeWidth="1.6" strokeLinecap="round"/>
                  <circle cx="12" cy="4" r="1" fill="#2d2d2d"/>
                </svg>
              </div>
              
              {/* Estacionamiento Icon */}
              <div style={{ textAlign: 'center' }}>
                <svg width="70" height="70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 11.5V16C3 16.5523 3.44772 17 4 17H5" stroke="#2d2d2d" strokeWidth="1.6" strokeLinecap="round"/>
                  <path d="M21 11.5V16C21 16.5523 20.5523 17 20 17H19" stroke="#2d2d2d" strokeWidth="1.6" strokeLinecap="round"/>
                  <circle cx="7" cy="17" r="1.8" fill="#2d2d2d"/>
                  <circle cx="17" cy="17" r="1.8" fill="#2d2d2d"/>
                  <path d="M5 17C5 15.067 6.567 13.5 8.5 13.5H15.5C17.433 13.5 19 15.067 19 17" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <path d="M5 11.5L7.2 6.8C7.6 5.9 8.5 5.2 9.5 5.2H14.5C15.5 5.2 16.4 5.9 16.8 6.8L19 11.5" stroke="#2d2d2d" strokeWidth="1.6" strokeLinecap="round"/>
                  <rect x="7" y="8.5" width="10" height="2.5" rx="0.5" fill="#2d2d2d"/>
                </svg>
              </div>
              
              {/* Bodega Icon */}
              <div style={{ textAlign: 'center' }}>
                <svg width="70" height="70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="4.5" y="9.5" width="15" height="11" rx="1.2" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <path d="M8 9.5V6.5C8 5.11929 9.11929 4 10.5 4H13.5C14.8807 4 16 5.11929 16 6.5V9.5" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <line x1="4.5" y1="13.5" x2="19.5" y2="13.5" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <line x1="4.5" y1="17" x2="19.5" y2="17" stroke="#2d2d2d" strokeWidth="1.6"/>
                  <circle cx="15.5" cy="13.5" r="1" fill="#2d2d2d"/>
                </svg>
              </div>
            </div>

            {/* Right Column: Location Image */}
            {propertyDetails.modelImages && propertyDetails.modelImages.length > 0 && (
              <div style={{ 
                width: '100%',
                height: '450px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1.5px solid #d0d0d0'
              }}>
                <img
                  src={propertyDetails.modelImages.find(img => img.ver_como_ubicacion_en_oferta)?.url || propertyDetails.modelImages[0]?.url}
                  alt="Ubicación"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Payment Schemes */}
        {filteredPaymentSchemes.length > 0 && (
          <div style={{ marginBottom: '80px' }}>
            <h2 style={{ 
              fontSize: '56px', 
              fontWeight: 'bold', 
              color: '#1a1a1a',
              marginBottom: '48px',
              borderBottom: '4px solid #1a1a1a',
              paddingBottom: '20px'
            }}>
              Esquemas de Pago
            </h2>
            
            {filteredPaymentSchemes.map((scheme, index) => {
              const amounts = calculatePaymentAmounts(scheme);
              return (
                <div 
                  key={scheme.id} 
                  style={{ 
                    backgroundColor: '#f8f8f8',
                    padding: '48px',
                    marginBottom: '32px',
                    borderRadius: '12px',
                    border: '2px solid #d0d0d0'
                  }}
                >
                  <h3 style={{ 
                    fontSize: '40px', 
                    fontWeight: 'bold', 
                    color: '#1a1a1a',
                    marginBottom: '40px'
                  }}>
                    {scheme.nombre}
                  </h3>
                  
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr 1fr', 
                    gap: '40px',
                    fontSize: '28px'
                  }}>
                    <div style={{ 
                      padding: '32px', 
                      backgroundColor: '#fff',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ color: '#585858', marginBottom: '16px' }}>
                        Enganche ({scheme.porcentaje_enganche}%)
                      </div>
                      <div style={{ color: '#1a1a1a', fontSize: '48px', fontWeight: 'bold' }}>
                        {formatCurrency(amounts.enganche)}
                      </div>
                    </div>
                    
                    <div style={{ 
                      padding: '32px', 
                      backgroundColor: '#fff',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ color: '#585858', marginBottom: '16px' }}>
                        Mensualidades ({scheme.numero_mensualidades})
                      </div>
                      <div style={{ color: '#1a1a1a', fontSize: '48px', fontWeight: 'bold' }}>
                        {formatCurrency(amounts.mensualidad)}
                      </div>
                    </div>
                    
                    <div style={{ 
                      padding: '32px', 
                      backgroundColor: '#fff',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ color: '#585858', marginBottom: '16px' }}>
                        Contra Entrega ({scheme.porcentaje_entrega}%)
                      </div>
                      <div style={{ color: '#1a1a1a', fontSize: '48px', fontWeight: 'bold' }}>
                        {formatCurrency(amounts.entrega)}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ 
                    marginTop: '40px', 
                    padding: '32px', 
                    backgroundColor: '#1a1a1a',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <span style={{ color: '#fff', fontSize: '32px', marginRight: '20px' }}>
                      Precio Final:
                    </span>
                    <span style={{ color: '#fff', fontSize: '56px', fontWeight: 'bold' }}>
                      {formatCurrency(amounts.finalPrice)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Contact Info */}
        <div style={{ marginBottom: '80px' }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '40px'
          }}>
            <div style={{ 
              backgroundColor: '#f8f8f8',
              padding: '48px',
              borderRadius: '12px'
            }}>
              <h3 style={{ fontSize: '40px', fontWeight: 'bold', color: '#1a1a1a', marginBottom: '32px' }}>
                Agente
              </h3>
              <div style={{ fontSize: '28px', lineHeight: '1.8' }}>
                <p style={{ color: '#585858', marginBottom: '16px' }}>
                  <span style={{ fontWeight: '600' }}>Nombre:</span><br/>
                  {creatorInfo?.nombre || 'N/A'}
                </p>
                <p style={{ color: '#585858', marginBottom: '16px' }}>
                  <span style={{ fontWeight: '600' }}>Email:</span><br/>
                  {creatorInfo?.email || offerData.leadEmail}
                </p>
                {creatorInfo?.telefono && (
                  <p style={{ color: '#585858' }}>
                    <span style={{ fontWeight: '600' }}>Teléfono:</span><br/>
                    {creatorInfo.telefono}
                  </p>
                )}
              </div>
            </div>

            <div style={{ 
              backgroundColor: '#f8f8f8',
              padding: '48px',
              borderRadius: '12px'
            }}>
              <h3 style={{ fontSize: '40px', fontWeight: 'bold', color: '#1a1a1a', marginBottom: '32px' }}>
                Comprador:
              </h3>
              <div style={{ fontSize: '28px', lineHeight: '1.8' }}>
                <p style={{ color: '#585858', marginBottom: '16px' }}>
                  <span style={{ fontWeight: '600' }}>Nombre:</span><br/>
                  {leadInfo?.nombre_legal || offerData.leadName}
                </p>
                <p style={{ color: '#585858', marginBottom: '16px' }}>
                  <span style={{ fontWeight: '600' }}>Email:</span><br/>
                  {leadInfo?.email || offerData.leadEmail}
                </p>
                {leadInfo?.telefono && (
                  <p style={{ color: '#585858' }}>
                    <span style={{ fontWeight: '600' }}>Teléfono:</span><br/>
                    {leadInfo.telefono}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Divider Line */}
        <div style={{ 
          position: 'absolute',
          bottom: '300px',
          left: '0',
          right: '0',
          height: '2px',
          backgroundColor: '#585858'
        }} />

        {/* Footer Section */}
        <div style={{ 
          position: 'absolute',
          bottom: '80px',
          left: '80px',
          right: '80px'
        }}>
          <div style={{ fontSize: '24px', color: '#585858', lineHeight: '1.6' }}>
            <p style={{ marginBottom: '16px' }}>
              <strong>Datos del Inmueble Comprador:</strong> {leadInfo?.nombre_legal || offerData.leadName}
            </p>
            {propertyDetails.ownerStpBankAccount && (
              <p style={{ marginBottom: '16px' }}>
                <strong>Banco:</strong> {propertyDetails.ownerStpBankAccount.banco_nombre} | 
                <strong> CLABE:</strong> {propertyDetails.ownerStpBankAccount.cuenta_clabe}
              </p>
            )}
            <p style={{ fontSize: '20px', opacity: 0.7 }}>
              S15,138.00 | 15,138.00 | Precio: $1,515,138.00
            </p>
          </div>
        </div>
      </div>
    );
  }
);

OfferPDFTemplateSozu.displayName = 'OfferPDFTemplateSozu';
