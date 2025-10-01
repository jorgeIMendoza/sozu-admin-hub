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
            gridTemplateColumns: 'auto 160px 1fr', 
            gap: '60px',
            alignItems: 'start'
          }}>
            {/* Column 1: Property Data */}
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

            {/* Column 2: Icons Only */}
            <div style={{ 
              display: 'flex',
              flexDirection: 'column',
              gap: '48px',
              paddingTop: '20px',
              alignItems: 'center'
            }}>
              {/* Recámara */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <svg width="80" height="80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto 12px', display: 'block' }}>
                  <rect x="6" y="22" width="36" height="16" rx="2" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 22V18C12 15.7909 13.7909 14 16 14H32C34.2091 14 36 18V22" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="6" y1="32" x2="42" y2="32" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/>
                  <rect x="12" y="28" width="6" height="4" rx="1" fill="#1a1a1a"/>
                  <rect x="30" y="28" width="6" height="4" rx="1" fill="#1a1a1a"/>
                  <line x1="6" y1="38" x2="6" y2="42" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="42" y1="38" x2="42" y2="42" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
                <div style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                  Una
                </div>
              </div>
              
              {/* Baño Completo */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <svg width="80" height="80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto 12px', display: 'block' }}>
                  <path d="M8 26H40V32C40 36.4183 36.4183 40 32 40H16C11.5817 40 8 36.4183 8 32V26Z" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M18 26V22C18 18.6863 20.6863 16 24 16C27.3137 16 30 18.6863 30 22V26" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="24" cy="10" r="3" fill="#1a1a1a"/>
                  <line x1="16" y1="32" x2="16" y2="36" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
                  <line x1="24" y1="32" x2="24" y2="36" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
                  <line x1="32" y1="32" x2="32" y2="36" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
                <div style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                  Uno
                </div>
              </div>
              
              {/* Medio Baño */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <svg width="80" height="80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto 12px', display: 'block' }}>
                  <ellipse cx="24" cy="18" rx="10" ry="7" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 18V30C14 33.3137 18.4772 36 24 36C29.5228 36 34 33.3137 34 30V18" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="24" y1="8" x2="24" y2="18" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/>
                  <circle cx="24" cy="6" r="2" fill="#1a1a1a"/>
                </svg>
                <div style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                  Uno
                </div>
              </div>
              
              {/* Estacionamiento */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <svg width="80" height="80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto 12px', display: 'block' }}>
                  <path d="M6 24V32C6 33.1046 6.89543 34 8 34H10" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M42 24V32C42 33.1046 41.1046 34 40 34H38" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/>
                  <circle cx="14" cy="34" r="3.5" fill="#1a1a1a"/>
                  <circle cx="34" cy="34" r="3.5" fill="#1a1a1a"/>
                  <path d="M10 34C10 30.134 13.134 27 17 27H31C34.866 27 38 30.134 38 34" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M10 24L14.4 13.6C15.2 11.8 17 10.4 19 10.4H29C31 10.4 32.8 11.8 33.6 13.6L38 24" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/>
                  <rect x="14" y="17" width="20" height="5" rx="1" fill="#1a1a1a"/>
                </svg>
                <div style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                  1 Normal
                </div>
              </div>
              
              {/* Bodega */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <svg width="80" height="80" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto 12px', display: 'block' }}>
                  <rect x="9" y="19" width="30" height="22" rx="2" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M16 19V13C16 10.2386 18.2386 8 21 8H27C29.7614 8 32 10.2386 32 13V19" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="9" y1="27" x2="39" y2="27" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="9" y1="34" x2="39" y2="34" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/>
                  <circle cx="31" cy="27" r="1.8" fill="#1a1a1a"/>
                </svg>
                <div style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                  N/A
                </div>
              </div>
            </div>

            {/* Column 3: Image Only */}
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
