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

interface ProductDetails {
  id: number;
  nombre: string;
  precio_lista: number;
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

interface OfferPDFTemplateProductoProps {
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
  };
  propertyDetails: PropertyDetails;
  productDetails: ProductDetails;
  paymentSchemes: PaymentScheme[];
  creatorInfo: any;
  leadInfo: any;
  legalNotices: string[];
}

export const OfferPDFTemplateProducto = forwardRef<HTMLDivElement, OfferPDFTemplateProductoProps>(
  ({ offerData, propertyDetails, productDetails, paymentSchemes, creatorInfo, leadInfo, legalNotices }, ref) => {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(amount);
    };

    const formatOfferNumber = (offerId: number) => {
      return `OP-${offerId.toString().padStart(6, '0')}`;
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
      date.setDate(date.getDate() + 5);
      return date.toLocaleDateString('es-MX', { 
        year: 'numeric', 
        month: 'short', 
        day: '2-digit' 
      });
    };

    // Convención de porcentaje_descuento_aumento:
    // - Valor positivo: incremento (aumenta el precio)
    // - Valor negativo: descuento (reduce el precio)
    // Ejemplo: +10 = 10% más caro, -8 = 8% más barato
    const calculatePaymentAmounts = (scheme: PaymentScheme, basePrice: number) => {
      const adjustment = basePrice * (scheme.porcentaje_descuento_aumento / 100);
      const finalPrice = basePrice + adjustment; // Cambio crítico: ahora suma el ajuste
      
      return {
        enganche: finalPrice * (scheme.porcentaje_enganche / 100),
        mensualidad: (finalPrice * (scheme.porcentaje_mensualidades / 100)) / scheme.numero_mensualidades,
        entrega: finalPrice * (scheme.porcentaje_entrega / 100),
        finalPrice,
        adjustment
      };
    };

    // Get the selected scheme
    const selectedScheme = paymentSchemes.find(scheme => scheme.id === offerData.id_esquema_pago_seleccionado);
    
    // If selected scheme is manual, show only that scheme
    // Otherwise, filter out manual schemes and show all non-manual schemes
    const displaySchemes = selectedScheme?.es_manual 
      ? [selectedScheme] 
      : paymentSchemes.filter(scheme => !scheme.es_manual);

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
          paddingBottom: '40px'
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
              <div style={{ fontSize: '40px', fontWeight: 'bold', color: '#1a1a1a' }}>
                {propertyDetails.projectData?.nombre || 'Proyecto'}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '36px', color: '#000' }}>
              <span style={{ fontWeight: '600' }}>ID Oferta:</span>{' '}
              <span style={{ fontWeight: '400' }}>{formatOfferNumber(offerData.id)}</span>
            </div>
            <div style={{ fontSize: '36px', color: '#000' }}>
              <span style={{ fontWeight: '600' }}>Expedición:</span>{' '}
              <span style={{ fontWeight: '400' }}>{formatDate(offerData.fecha_generacion)}</span>
            </div>
            <div style={{ fontSize: '36px', color: '#000' }}>
              <span style={{ fontWeight: '600' }}>Vigencia:</span>{' '}
              <span style={{ fontWeight: '400' }}>{calculateVigencia(offerData.fecha_generacion)}</span>
            </div>
          </div>
        </div>

        {/* Divider Line before Property Details */}
        <div style={{ 
          width: '100%',
          height: '4px',
          backgroundColor: '#D3D3D3',
          marginBottom: '32px'
        }} />

        {/* Property Details Section (Simplified for Products) */}
        <div style={{ marginBottom: '60px' }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '40px',
            alignItems: 'start'
          }}>
            {/* Column 1: Property Data */}
            <div>
              <h2 style={{ 
                fontSize: '48px', 
                fontWeight: 'bold', 
                color: '#000000',
                marginBottom: '40px'
              }}>
                Datos de la Propiedad:
              </h2>
              <div style={{ 
                backgroundColor: '#F5F5F5',
                padding: '40px',
                borderRadius: '8px',
                border: '2px solid #D0D0D0'
              }}>
                <div style={{ fontSize: '47px', lineHeight: '1.8' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontWeight: 'normal' }}>Proyecto: </span>
                    <span style={{ fontWeight: 'bold' }}>{propertyDetails.projectData?.nombre || 'N/A'}</span>
                  </div>
                  {propertyDetails.model && (
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontWeight: 'normal' }}>Modelo: </span>
                      <span style={{ fontWeight: 'bold' }}>{propertyDetails.model.nombre}</span>
                    </div>
                  )}
                  {propertyDetails.building && (
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontWeight: 'normal' }}>Edificio: </span>
                      <span style={{ fontWeight: 'bold' }}>{propertyDetails.building.nombre}</span>
                    </div>
                  )}
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontWeight: 'normal' }}>No° de propiedad: </span>
                    <span style={{ fontWeight: 'bold' }}>{propertyDetails.numero_propiedad}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Product Information */}
            <div>
              <h3 style={{ 
                fontSize: '48px', 
                fontWeight: 'bold', 
                color: '#000000',
                marginBottom: '40px'
              }}>
                Datos del producto:
              </h3>
              <div style={{ 
                backgroundColor: '#F5F5F5',
                padding: '40px',
                borderRadius: '8px',
                border: '2px solid #D0D0D0'
              }}>
                <div style={{ fontSize: '47px', lineHeight: '1.8' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ fontWeight: 'normal' }}>Categoría: </span>
                    <span style={{ fontWeight: 'bold', color: '#000' }}>
                      {productDetails.categoria_nombre || 'N/A'}
                    </span>
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ fontWeight: 'normal' }}>Producto: </span>
                    <span style={{ fontWeight: 'bold', color: '#000', fontSize: '47px' }}>
                      {productDetails.nombre}
                    </span>
                  </div>
                  <div style={{ marginBottom: '0' }}>
                    <span style={{ fontWeight: 'normal' }}>Precio de lista: </span>
                    <span style={{ fontWeight: 'bold', color: '#000', fontSize: '47px' }}>
                      {formatCurrency(productDetails.precio_lista)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider Line before Payment Schemes */}
        {displaySchemes.length > 0 && (
          <div style={{ 
            width: '100%',
            height: '4px',
            backgroundColor: '#D3D3D3',
            marginBottom: '32px'
          }} />
        )}

        {/* Payment Schemes Section - Show all available schemes */}
        {displaySchemes.length > 0 && (
          <div style={{ marginBottom: '60px' }}>
            <h2 style={{ 
              fontSize: '51px', 
              fontWeight: 'bold', 
              color: '#000000',
              marginBottom: '40px'
            }}>
              Esquemas de pago disponibles:
            </h2>
            
            <div style={{ 
              display: 'flex',
              flexWrap: 'wrap',
              gap: '30px'
            }}>
              {displaySchemes.map((scheme) => {
                const amounts = calculatePaymentAmounts(scheme, productDetails.precio_lista);
                const hasSavings = amounts.adjustment < 0;
                const isSelected = offerData.id_esquema_pago_seleccionado === scheme.id;
                
                return (
                  <div 
                    key={scheme.id}
                    style={{ 
                      backgroundColor: isSelected ? '#E8F4E8' : '#F5F5F5',
                      padding: '40px',
                      border: isSelected ? '4px solid #22C55E' : '2px solid #D0D0D0',
                      borderRadius: '8px',
                      minWidth: '500px',
                      maxWidth: '700px',
                      flex: '1 1 auto'
                    }}
                  >
                    <h3 style={{ 
                      fontSize: '43px', 
                      fontWeight: 'bold', 
                      color: '#000000',
                      marginBottom: '24px'
                    }}>
                      {scheme.nombre}
                    </h3>
                    
                    <div style={{ 
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                      fontSize: '33px',
                      lineHeight: '1.4'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#000000' }}>Precio final:</span>
                        <span style={{ color: '#000000', fontWeight: 'bold' }}>
                          {formatCurrency(amounts.finalPrice)}
                        </span>
                      </div>
                      
                      {hasSavings && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#000000' }}>Ahorro:</span>
                          <span style={{ color: '#000000', fontWeight: 'bold' }}>
                            {Math.abs(scheme.porcentaje_descuento_aumento)}% {formatCurrency(Math.abs(amounts.adjustment))}
                          </span>
                        </div>
                      )}
                      
                      {scheme.porcentaje_enganche > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#000000' }}>Enganche ({scheme.porcentaje_enganche}%):</span>
                          <span style={{ color: '#000000', fontWeight: 'bold' }}>
                            {formatCurrency(amounts.enganche)}
                          </span>
                        </div>
                      )}
                      
                      {scheme.porcentaje_mensualidades > 0 && scheme.numero_mensualidades > 0 && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#000000' }}>Durante la obra:</span>
                            <span style={{ color: '#000000', fontWeight: 'bold' }}>
                              {scheme.porcentaje_mensualidades}% {formatCurrency(amounts.finalPrice * (scheme.porcentaje_mensualidades / 100))}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#000000' }}>
                              {scheme.numero_mensualidades} mensualidades:
                            </span>
                            <span style={{ color: '#000000', fontWeight: 'bold' }}>
                              {formatCurrency(amounts.mensualidad)}
                            </span>
                          </div>
                        </>
                      )}
                      
                      {scheme.porcentaje_entrega > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#000000' }}>A la entrega ({scheme.porcentaje_entrega}%):</span>
                          <span style={{ color: '#000000', fontWeight: 'bold' }}>
                            {formatCurrency(amounts.entrega)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Divider Line before Banking Data - Only show if lead has RFC */}
        {leadInfo?.rfc && offerData.id_esquema_pago_seleccionado && (
          <div style={{ 
            width: '100%',
            height: '4px',
            backgroundColor: '#D3D3D3',
            marginBottom: '32px'
          }} />
        )}

        {/* Banking Data Section - Only show if there's a CLABE (meaning a scheme was selected) */}
        {offerData.id_esquema_pago_seleccionado && (offerData.clabe_stp_tmp_producto || offerData.clabe_stp) && (
          <div style={{ marginBottom: '60px' }}>
            <h2 style={{ 
              fontSize: '51px', 
              fontWeight: 'bold', 
              color: '#000000',
              marginBottom: '40px'
              }}>
                Datos Bancarios
              </h2>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: ((offerData.clabe_stp_tmp_producto || offerData.clabe_stp) && productDetails.ownerStpBankAccount) 
                ? '1fr 1fr' 
                : '1fr', 
              gap: '40px',
              backgroundColor: '#D3D3D3',
              padding: '0',
              borderRadius: '20px'
            }}>
              {/* Pago por transferencia - Only shown if CLABE exists */}
              {(offerData.clabe_stp_tmp_producto || offerData.clabe_stp) && (
                <div style={{ 
                  backgroundColor: '#D3D3D3',
                  padding: '32px',
                  borderRadius: '20px'
                }}>
                  <h3 style={{ 
                    fontSize: '39px', 
                    fontWeight: 'bold', 
                    color: '#000000', 
                    marginBottom: '24px',
                    fontFamily: 'Arial, sans-serif'
                  }}>
                    Pago por transferencia
                  </h3>
                  <div style={{ fontSize: '35px', lineHeight: '1.8', fontFamily: 'Arial, sans-serif' }}>
                  <p style={{ color: '#000000', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '400' }}>Banco: </span>
                    <span style={{ fontWeight: '400' }}>Sistema de Transferencias y Pagos (STP)</span>
                  </p>
                  <p style={{ color: '#000000', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '400' }}>Titular: </span>
                    <span style={{ fontWeight: '400' }}>
                      {productDetails.ownerData?.nombre_legal || 'N/A'}
                    </span>
                  </p>
                  <p style={{ color: '#000000' }}>
                    <span style={{ fontWeight: '400' }}>Cuenta CLABE: </span>
                    <span style={{ fontWeight: '400' }}>
                      {offerData.clabe_stp_tmp_producto || offerData.clabe_stp}
                    </span>
                  </p>
                </div>
              </div>
            )}
            
            {/* Pago en efectivo - Only shown if bank account exists */}
            {productDetails.ownerStpBankAccount && (
              <div style={{ 
                backgroundColor: '#D3D3D3',
                padding: '32px',
                borderRadius: '20px'
              }}>
                <h3 style={{ 
                  fontSize: '39px', 
                  fontWeight: 'bold', 
                  color: '#000000', 
                  marginBottom: '24px',
                  fontFamily: 'Arial, sans-serif'
                }}>
                  Pago en efectivo
                </h3>
                <div style={{ fontSize: '35px', lineHeight: '1.8', fontFamily: 'Arial, sans-serif' }}>
                  <p style={{ color: '#000000', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '400' }}>Banco: </span>
                    <span style={{ fontWeight: '400' }}>
                      {productDetails.ownerStpBankAccount.banco_nombre}
                    </span>
                  </p>
                  <p style={{ color: '#000000', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '400' }}>Titular: </span>
                    <span style={{ fontWeight: '400' }}>
                      {productDetails.ownerData?.nombre_legal || 'N/A'}
                    </span>
                  </p>
                  <p style={{ color: '#000000', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '400' }}>Número de Cuenta: </span>
                    <span style={{ fontWeight: '400' }}>
                      {productDetails.ownerStpBankAccount.numero_cuenta}
                    </span>
                  </p>
                  <p style={{ color: '#000000' }}>
                    <span style={{ fontWeight: '400' }}>Cuenta CLABE: </span>
                    <span style={{ fontWeight: '400' }}>
                      {productDetails.ownerStpBankAccount.cuenta_clabe}
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
          </div>
        )}

        {/* Divider Line before Contact Data */}
        <div style={{ 
          width: '100%',
          height: '4px',
          backgroundColor: '#D3D3D3',
          marginBottom: '32px'
        }} />

        {/* Contact Data Section */}
        <div>
          <h2 style={{ 
            fontSize: '51px', 
            fontWeight: 'bold', 
            color: '#000000',
            marginBottom: '40px'
          }}>
            Datos de Contacto:
          </h2>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '40px',
            fontSize: '33px'
          }}>
            {/* Agent/Creator Info */}
            <div>
              <h3 style={{ fontSize: '39px', fontWeight: 'bold', marginBottom: '20px', color: '#000' }}>
                Agente:
              </h3>
              <div style={{ lineHeight: '1.6' }}>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'normal' }}>Nombre: </span>
                  <span style={{ fontWeight: 'bold' }}>
                    {creatorInfo?.nombre_legal || creatorInfo?.nombre || offerData.email_creador}
                  </span>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'normal' }}>Email: </span>
                  <span style={{ fontWeight: 'bold' }}>{offerData.email_creador}</span>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'normal' }}>Teléfono: </span>
                  <span style={{ fontWeight: 'bold' }}>{creatorInfo?.telefono || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Lead/Buyer Info */}
            <div>
              <h3 style={{ fontSize: '39px', fontWeight: 'bold', marginBottom: '20px', color: '#000' }}>
                Comprador:
              </h3>
              <div style={{ lineHeight: '1.6' }}>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'normal' }}>Nombre: </span>
                  <span style={{ fontWeight: 'bold' }}>{offerData.leadName}</span>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'normal' }}>Email: </span>
                  <span style={{ fontWeight: 'bold' }}>{offerData.leadEmail}</span>
                </div>
                {leadInfo?.telefono && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ fontWeight: 'normal' }}>Teléfono: </span>
                    <span style={{ fontWeight: 'bold' }}>{leadInfo.telefono}</span>
                  </div>
                )}
                {leadInfo?.rfc && (
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ fontWeight: 'normal' }}>RFC: </span>
                    <span style={{ fontWeight: 'bold' }}>{leadInfo.rfc}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

OfferPDFTemplateProducto.displayName = 'OfferPDFTemplateProducto';
