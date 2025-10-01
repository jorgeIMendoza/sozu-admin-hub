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
            gridTemplateColumns: 'auto 180px 1fr', 
            gap: '60px',
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

            {/* Middle Column: Vertical Icons */}
            <div style={{ 
              display: 'flex',
              flexDirection: 'column',
              gap: '48px',
              paddingTop: '20px'
            }}>
              {/* Recámara */}
              <div style={{ textAlign: 'center' }}>
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto 8px' }}>
                  <rect x="3" y="11" width="18" height="9" rx="1" stroke="#333" strokeWidth="1.5"/>
                  <path d="M7 11V9C7 7.89543 7.89543 7 9 7H15C16.1046 7 17 7.89543 17 9V11" stroke="#333" strokeWidth="1.5"/>
                  <line x1="3" y1="16" x2="21" y2="16" stroke="#333" strokeWidth="1.5"/>
                  <rect x="7" y="14" width="3" height="2" fill="#333"/>
                  <rect x="14" y="14" width="3" height="2" fill="#333"/>
                </svg>
                <div style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '2px' }}>
                  Una
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  Recámara
                </div>
              </div>
              
              {/* Baño */}
              <div style={{ textAlign: 'center' }}>
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto 8px' }}>
                  <path d="M4 13H20V16C20 18.2091 18.2091 20 16 20H8C5.79086 20 4 18.2091 4 16V13Z" stroke="#333" strokeWidth="1.5"/>
                  <path d="M9 13V11C9 9.34315 10.3431 8 12 8C13.6569 8 15 9.34315 15 11V13" stroke="#333" strokeWidth="1.5"/>
                  <circle cx="12" cy="5" r="1.5" fill="#333"/>
                  <line x1="8" y1="16" x2="8" y2="18" stroke="#fff" strokeWidth="1.2"/>
                  <line x1="12" y1="16" x2="12" y2="18" stroke="#fff" strokeWidth="1.2"/>
                  <line x1="16" y1="16" x2="16" y2="18" stroke="#fff" strokeWidth="1.2"/>
                </svg>
                <div style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '2px' }}>
                  Uno
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  Baño
                </div>
              </div>
              
              {/* Estacionamiento */}
              <div style={{ textAlign: 'center' }}>
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto 8px' }}>
                  <path d="M3 12V16C3 16.5523 3.44772 17 4 17H5" stroke="#333" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M21 12V16C21 16.5523 20.5523 17 20 17H19" stroke="#333" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="7" cy="17" r="1.5" fill="#333"/>
                  <circle cx="17" cy="17" r="1.5" fill="#333"/>
                  <path d="M5 17C5 15.3431 6.34315 14 8 14H16C17.6569 14 19 15.3431 19 17" stroke="#333" strokeWidth="1.5"/>
                  <path d="M5.5 12L7.5 7.5C7.77614 6.94772 8.34863 6.5 9 6.5H15C15.6514 6.5 16.2239 6.94772 16.5 7.5L18.5 12" stroke="#333" strokeWidth="1.5" strokeLinecap="round"/>
                  <rect x="7" y="9" width="10" height="2.5" rx="0.5" fill="#333"/>
                </svg>
                <div style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '2px' }}>
                  1 Normal
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  Estacionamiento
                </div>
              </div>
              
              {/* Bodega */}
              <div style={{ textAlign: 'center' }}>
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto 8px' }}>
                  <rect x="5" y="10" width="14" height="10" rx="1" stroke="#333" strokeWidth="1.5"/>
                  <path d="M8 10V7C8 5.89543 8.89543 5 10 5H14C15.1046 5 16 5.89543 16 7V10" stroke="#333" strokeWidth="1.5"/>
                  <line x1="5" y1="14" x2="19" y2="14" stroke="#333" strokeWidth="1.5"/>
                  <line x1="5" y1="17" x2="19" y2="17" stroke="#333" strokeWidth="1.5"/>
                  <circle cx="15" cy="14" r="0.8" fill="#333"/>
                </svg>
                <div style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '2px' }}>
                  N/A
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  Bodega
                </div>
              </div>
            </div>

            {/* Right Column: Location Image */}
            {propertyDetails.modelImages && propertyDetails.modelImages.length > 0 && (
              <div style={{ 
                width: '100%',
                height: '500px',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '2px solid #e0e0e0'
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
