import { forwardRef } from 'react';
import recamarasIcon from '@/assets/icons/recamaras.png';
import banosIcon from '@/assets/icons/banos.png';
import mediosBanosIcon from '@/assets/icons/medios-banos.png';
import estacionamientoIcon from '@/assets/icons/estacionamiento.png';
import bodegaIcon from '@/assets/icons/bodega.png';

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
          <div style={{ 
            flex: '0 0 320px', 
            height: '120px', 
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'flex-start',
            overflow: 'visible'
          }}>
            {propertyDetails.projectData?.url_logo ? (
              <img
                src={propertyDetails.projectData.url_logo}
                alt={`Logo ${propertyDetails.projectData.nombre}`}
                style={{ 
                  maxHeight: '120px', 
                  maxWidth: '320px',
                  height: 'auto',
                  width: 'auto',
                  objectFit: 'contain'
                }}
              />
            ) : (
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1a1a1a' }}>
                {propertyDetails.projectData?.nombre || 'Proyecto'}
              </div>
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
            gridTemplateColumns: '18% 18% 54%', 
            gap: '5%',
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
                {propertyDetails.projectData?.precio_m2_actual && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ fontWeight: 'normal' }}>Precio m2: </span>
                    <span style={{ fontWeight: 'bold' }}>{formatCurrency(propertyDetails.projectData.precio_m2_actual)}</span>
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
              gap: '24px',
              paddingTop: '20px',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {/* Recámara */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <img 
                  src={recamarasIcon} 
                  alt="Recámaras"
                  style={{ width: '50px', height: '50px', margin: '0 auto 8px', display: 'block' }}
                />
                <div style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                  Una
                </div>
              </div>
              
              {/* Baño Completo */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <img 
                  src={banosIcon} 
                  alt="Baños"
                  style={{ width: '50px', height: '50px', margin: '0 auto 8px', display: 'block' }}
                />
                <div style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                  Uno
                </div>
              </div>
              
              {/* Medio Baño */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <img 
                  src={mediosBanosIcon} 
                  alt="Medios Baños"
                  style={{ width: '50px', height: '50px', margin: '0 auto 8px', display: 'block' }}
                />
                <div style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                  Uno
                </div>
              </div>
              
              {/* Estacionamiento */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <img 
                  src={estacionamientoIcon} 
                  alt="Estacionamiento"
                  style={{ width: '50px', height: '50px', margin: '0 auto 8px', display: 'block' }}
                />
                <div style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                  1 Normal
                </div>
              </div>
              
              {/* Bodega */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <img 
                  src={bodegaIcon} 
                  alt="Bodega"
                  style={{ width: '50px', height: '50px', margin: '0 auto 8px', display: 'block' }}
                />
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
                overflow: 'hidden'
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
