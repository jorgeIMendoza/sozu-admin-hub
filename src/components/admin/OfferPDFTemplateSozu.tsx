import { forwardRef } from 'react';
import recamarasIcon from '@/assets/icons/recamaras.png';
import banosIcon from '@/assets/icons/banos.png';
import mediosBanosIcon from '@/assets/icons/medios-banos.png';
import estacionamientoIcon from '@/assets/icons/estacionamiento.png';
import bodegaIcon from '@/assets/icons/bodega.png';
import balconIcon from '@/assets/icons/balcon.png';

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
  numero_pagos_enganche: number;
  porcentaje_mensualidades: number;
  porcentaje_entrega: number;
  porcentaje_descuento_aumento: number;
  es_manual: boolean;
  tramos_mensualidad?: Array<{
    orden: number;
    numero_mensualidades: number;
    monto: number;
  }> | null;
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
    email_creador: string;
    id_esquema_pago_seleccionado?: number | null;
  };
  propertyDetails: PropertyDetails;
  paymentSchemes: PaymentScheme[];
  amenities: ProjectAmenity[];
  creatorInfo: any;
  leadInfo?: {
    nombre_legal: string;
    email: string;
    telefono: string;
    rfc?: string | null;
    hasValidRFC?: boolean;
  };
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
      date.setDate(date.getDate() + 5);
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

    // Convención de porcentaje_descuento_aumento:
    // - Valor positivo: incremento (aumenta el precio)
    // - Valor negativo: descuento (reduce el precio)
    // Ejemplo: +10 = 10% más caro, -8 = 8% más barato
    const numberToSpanishText = (num: number): string => {
      const textMap: { [key: number]: string } = {
        0: 'Cero',
        1: 'Una',
        2: 'Dos',
        3: 'Tres',
        4: 'Cuatro',
        5: 'Cinco',
        6: 'Seis',
        7: 'Siete',
        8: 'Ocho',
        9: 'Nueve',
        10: 'Diez'
      };
      return textMap[num] || num.toString();
    };

    const calculatePaymentAmounts = (scheme: PaymentScheme) => {
      const basePrice = propertyDetails.precio_lista;
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

    // Calcular resumen de estacionamientos
    const estacionamientosResumen = estacionamientos.reduce((acc: any, est: any) => {
      // Acceder al tipo desde la relación tipos_estacionamiento
      const tipo = est.tipos_estacionamiento?.nombre || est.tipo_estacionamiento || 'Sin especificar';
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {});

    const estacionamientosTexto = Object.entries(estacionamientosResumen)
      .map(([tipo, cantidad]) => `${cantidad} ${tipo}`)
      .join(', ') || 'N/A';

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

        {/* Property Details Section */}
        <div style={{ marginBottom: '60px' }}>
          <h2 style={{ 
            fontSize: '48px', 
            fontWeight: 'bold', 
            color: '#000000',
            marginBottom: '40px'
          }}>
            Datos de la Propiedad:
          </h2>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '30% 15% 45%', 
            gap: '5%',
            alignItems: 'start'
          }}>
            {/* Column 1: Property Data */}
            <div>
              <div style={{ fontSize: '38px', lineHeight: '1.2', color: '#000000', fontWeight: '600' }}>
                <div style={{ marginBottom: '4px' }}>
                  <span>Proyecto: </span>
                  <span style={{ fontWeight: '900' }}>{propertyDetails.projectData?.nombre || 'N/A'}</span>
                </div>
                {propertyDetails.building && (
                  <div style={{ marginBottom: '4px' }}>
                    <span>Edificio: </span>
                    <span style={{ fontWeight: '900' }}>{propertyDetails.building.nombre}</span>
                  </div>
                )}
                {propertyDetails.model && (
                  <div style={{ marginBottom: '4px' }}>
                    <span>Modelo: </span>
                    <span style={{ fontWeight: '900' }}>{propertyDetails.model.nombre}</span>
                  </div>
                )}
                <div style={{ marginBottom: '4px' }}>
                  <span>Número de propiedad: </span>
                  <span style={{ fontWeight: '900' }}>{propertyDetails.numero_propiedad}</span>
                </div>
                {propertyDetails.projectData?.mostrar_piso_en_oferta === true && propertyDetails.numero_piso && (
                  <div style={{ marginBottom: '4px' }}>
                    <span>Nivel: </span>
                    <span style={{ fontWeight: '900' }}>{propertyDetails.numero_piso}</span>
                  </div>
                )}
                {propertyDetails.vista && (
                  <div style={{ marginBottom: '4px' }}>
                    <span>Vista: </span>
                    <span style={{ fontWeight: '900' }}>{propertyDetails.vista.nombre}</span>
                  </div>
                )}
                <div style={{ marginBottom: '4px' }}>
                  <span>Área: </span>
                  <span style={{ fontWeight: '900' }}>
                    {((propertyDetails.m2_interiores || 0) + (propertyDetails.m2_exteriores || 0)).toFixed(2)} m²
                  </span>
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <span>Precio de lista: </span>
                  <span style={{ fontWeight: '900' }}>{formatCurrency(propertyDetails.precio_lista)}</span>
                </div>
                {propertyDetails.projectData?.mostrar_precio_m2_en_oferta === true && (propertyDetails.m2_interiores || propertyDetails.m2_exteriores) && (
                  <div style={{ marginBottom: '4px' }}>
                    <span>Precio por m²: </span>
                    <span style={{ fontWeight: '900' }}>
                      {formatCurrency(propertyDetails.precio_lista / ((propertyDetails.m2_interiores || 0) + (propertyDetails.m2_exteriores || 0)))}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Column 2: Icons in 2 Columns */}
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px',
              paddingTop: '20px'
            }}>
              {/* Columna Izquierda */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Recámara */}
                {propertyDetails.model?.numero_recamaras && propertyDetails.model.numero_recamaras > 0 && (
                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <img 
                      src={recamarasIcon} 
                      alt="Recámaras"
                      style={{ width: '50px', height: '50px', margin: '0 auto 8px', display: 'block' }}
                    />
                    <div style={{ fontSize: '28px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                      {numberToSpanishText(propertyDetails.model.numero_recamaras)}
                    </div>
                  </div>
                )}
                
                {/* Baño Completo */}
                {propertyDetails.model?.numero_completo_banos && propertyDetails.model.numero_completo_banos > 0 && (
                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <img 
                      src={banosIcon} 
                      alt="Baños"
                      style={{ width: '50px', height: '50px', margin: '0 auto 8px', display: 'block' }}
                    />
                    <div style={{ fontSize: '28px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                      {numberToSpanishText(propertyDetails.model.numero_completo_banos)}
                    </div>
                  </div>
                )}
                
                {/* Medio Baño */}
                {(propertyDetails.model?.numero_medio_bano ?? 0) > 0 && (
                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <img 
                      src={mediosBanosIcon} 
                      alt="Medios Baños"
                      style={{ width: '50px', height: '50px', margin: '0 auto 8px', display: 'block' }}
                    />
                    <div style={{ fontSize: '28px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                      {numberToSpanishText(propertyDetails.model.numero_medio_bano!)}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Columna Derecha */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Estacionamiento */}
                {estacionamientos.length > 0 && (
                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <img 
                      src={estacionamientoIcon} 
                      alt="Estacionamiento"
                      style={{ width: '50px', height: '50px', margin: '0 auto 8px', display: 'block' }}
                    />
                    <div style={{ fontSize: '28px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                      {estacionamientosTexto}
                    </div>
                  </div>
                )}
                
                {/* Bodega */}
                {bodegas.length > 0 && (
                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <img 
                      src={bodegaIcon} 
                      alt="Bodega"
                      style={{ width: '50px', height: '50px', margin: '0 auto 8px', display: 'block' }}
                    />
                    <div style={{ fontSize: '28px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                      {bodegas.length} {bodegas.length === 1 ? 'Bodega' : 'Bodegas'}
                    </div>
                  </div>
                )}
                
                {/* Balcón - Mostrar solo si la propiedad tiene balcón */}
                {propertyDetails.tieneBalcon && (
                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <img 
                      src={balconIcon} 
                      alt="Balcón"
                      style={{ width: '50px', height: '50px', margin: '0 auto 8px', display: 'block' }}
                    />
                    <div style={{ fontSize: '28px', fontWeight: '500', color: '#1a1a1a', lineHeight: '1.3' }}>
                      Balcón
                    </div>
                  </div>
                )}
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

        {/* Divider Line before Payment Schemes */}
        {filteredPaymentSchemes.length > 0 && (
          <div style={{ 
            width: '100%',
            height: '4px',
            backgroundColor: '#D3D3D3',
            marginBottom: '32px'
          }} />
        )}

        {/* Payment Schemes */}
        {filteredPaymentSchemes.length > 0 && (
          <div style={{ marginBottom: '60px' }}>
            <h2 style={{ 
              fontSize: '51px', 
              fontWeight: 'bold', 
              color: '#000000',
              marginBottom: '40px'
            }}>
              Esquemas de pago:
            </h2>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '0px',
              fontSize: '36px'
            }}>
              {filteredPaymentSchemes.map((scheme, index) => {
                const amounts = calculatePaymentAmounts(scheme);
                const isSelected = offerData.id_esquema_pago_seleccionado === scheme.id;
                const adjustmentPercentage = scheme.porcentaje_descuento_aumento;
                const hasSavings = amounts.adjustment < 0; // Negativo = descuento
                
                return (
                  <div 
                    key={scheme.id} 
                    style={{ 
                      backgroundColor: isSelected ? '#E8F4E8' : '#FFFFFF',
                      padding: '32px',
                      border: isSelected ? '4px solid #22C55E' : '2px solid #D0D0D0',
                      borderRadius: '8px'
                    }}
                  >
                    {!scheme.es_manual && (
                      <h3 style={{ 
                        fontSize: '43px', 
                        fontWeight: 'bold', 
                        color: '#000000',
                        marginBottom: '24px'
                      }}>
                        {scheme.nombre}
                      </h3>
                    )}
                    
                    <div style={{ 
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '33px',
                      lineHeight: '1.1'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#000000' }}>Precio final:</span>
                        <span style={{ color: '#000000', fontWeight: 'bold' }}>
                          {formatCurrency(amounts.finalPrice)}
                        </span>
                      </div>
                      
                      {hasSavings && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#000000' }}>Ahorro ({Math.abs(adjustmentPercentage)}%):</span>
                          <span style={{ color: '#000000', fontWeight: 'bold' }}>
                            {formatCurrency(Math.abs(amounts.adjustment))}
                          </span>
                        </div>
                      )}
                      
                      {scheme.porcentaje_enganche > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#000000' }}>
                            Enganche{scheme.numero_pagos_enganche > 1 ? ` (en ${scheme.numero_pagos_enganche} pagos)` : ''}:
                          </span>
                          <span style={{ color: '#000000', fontWeight: 'bold' }}>
                            {scheme.porcentaje_enganche}% {formatCurrency(amounts.enganche)}
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
                          
                          {scheme.tramos_mensualidad && scheme.tramos_mensualidad.length > 0 ? (
                            // Tiered payments
                            <>
                              {scheme.tramos_mensualidad.map((tramo, idx) => {
                                const mensualidadesAcumuladas = scheme.tramos_mensualidad!
                                  .slice(0, idx)
                                  .reduce((acc, t) => acc + t.numero_mensualidades, 0);
                                return (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#000000' }}>
                                      {tramo.numero_mensualidades} mensualidades:
                                    </span>
                                    <span style={{ color: '#000000', fontWeight: 'bold' }}>
                                      {formatCurrency(tramo.monto)}
                                      {idx > 0 && <span style={{ fontWeight: 'normal', marginLeft: '4px', color: '#666666' }}>(mes {mensualidadesAcumuladas + 1}+)</span>}
                                    </span>
                                  </div>
                                );
                              })}
                            </>
                          ) : (
                            // Uniform payments
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#000000' }}>{scheme.numero_mensualidades} mensualidades:</span>
                              <span style={{ color: '#000000', fontWeight: 'bold' }}>
                                {formatCurrency(amounts.mensualidad)}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      
                      {scheme.porcentaje_entrega > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#000000' }}>A la entrega:</span>
                          <span style={{ color: '#000000', fontWeight: 'bold' }}>
                            {scheme.porcentaje_entrega}% {formatCurrency(amounts.entrega)}
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

        {/* Divider Line before Banking Data */}
        <div style={{ 
          width: '100%',
          height: '4px',
          backgroundColor: '#D3D3D3',
          marginBottom: '32px',
          marginTop: '40px'
        }} />

        {/* Banking Data Section - Only show if lead has valid RFC */}
        {leadInfo?.hasValidRFC && offerData.id_esquema_pago_seleccionado && (propertyDetails.clabe_stp_tmp_apartado || (propertyDetails.projectData?.mostrar_seccion_efectivo_en_oferta && propertyDetails.ownerStpBankAccount)) && (
          <div style={{ 
            marginBottom: '40px'
          }}>
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
              gridTemplateColumns: (propertyDetails.clabe_stp_tmp_apartado && propertyDetails.projectData?.mostrar_seccion_efectivo_en_oferta && propertyDetails.ownerStpBankAccount) 
                ? '1fr 1fr' 
                : '1fr', 
              gap: '40px',
              backgroundColor: '#D3D3D3',
              padding: '0',
              borderRadius: '20px'
            }}>
              {/* Transfer Banking Data - Only shown if CLABE exists */}
              {propertyDetails.clabe_stp_tmp_apartado && (
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
                  <div style={{ fontSize: '35px', lineHeight: '1.2', fontFamily: 'Arial, sans-serif' }}>
                    <p style={{ color: '#000000', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '400' }}>Banco: </span>
                      <span style={{ fontWeight: '400' }}>Sistema de Transferencias y Pagos (STP)</span>
                    </p>
                    <p style={{ color: '#000000', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '400' }}>Titular: </span>
                      <span style={{ fontWeight: '400' }}>
                        {propertyDetails.ownerData?.nombre_legal || 'Vive DAIKU'}
                      </span>
                    </p>
                    <p style={{ color: '#000000' }}>
                      <span style={{ fontWeight: '400' }}>Cuenta CLABE: </span>
                      <span style={{ fontWeight: '400' }}>
                        {propertyDetails.clabe_stp_tmp_apartado}
                      </span>
                    </p>
                  </div>
                </div>
              )}
              
              {/* Cash Banking Data - Only shown if enabled in project settings */}
              {propertyDetails.projectData?.mostrar_seccion_efectivo_en_oferta === true && propertyDetails.ownerStpBankAccount && (
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
                  <div style={{ fontSize: '35px', lineHeight: '1.2', fontFamily: 'Arial, sans-serif' }}>
                    <p style={{ color: '#000000', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '400' }}>Banco: </span>
                      <span style={{ fontWeight: '400' }}>
                        {propertyDetails.ownerStpBankAccount.banco_nombre}
                      </span>
                    </p>
                    <p style={{ color: '#000000', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '400' }}>Titular: </span>
                      <span style={{ fontWeight: '400' }}>
                        {propertyDetails.ownerData?.nombre_legal || 'Vive DAIKU'}
                      </span>
                    </p>
                    <p style={{ color: '#000000', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '400' }}>Número de Cuenta: </span>
                      <span style={{ fontWeight: '400' }}>
                        {propertyDetails.ownerStpBankAccount.numero_cuenta}
                      </span>
                    </p>
                    <p style={{ color: '#000000' }}>
                      <span style={{ fontWeight: '400' }}>Cuenta CLABE: </span>
                      <span style={{ fontWeight: '400' }}>
                        {propertyDetails.ownerStpBankAccount.cuenta_clabe}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Divider Line before Contact Info */}
        <div style={{ 
          width: '100%',
          height: '4px',
          backgroundColor: '#D3D3D3',
          marginBottom: '32px',
          marginTop: '40px'
        }} />

        {/* Contact Info (Datos de Contacto) */}
        <div style={{ 
          marginBottom: '40px'
        }}>
          <h2 style={{ 
            fontSize: '51px', 
            fontWeight: 'bold', 
            color: '#000000', 
            marginBottom: '40px'
          }}>
            Datos de Contacto
          </h2>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '40px'
          }}>
            {/* Agente */}
            <div>
              <h3 style={{ 
                fontSize: '39px', 
                fontWeight: 'bold', 
                color: '#000000', 
                marginBottom: '16px',
                fontFamily: 'Arial, sans-serif'
              }}>
                Agente
              </h3>
              <div style={{ fontSize: '33px', lineHeight: '1.2', fontFamily: 'Arial, sans-serif' }}>
                <p style={{ color: '#000000', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '600' }}>Nombre: </span>
                  <span style={{ fontWeight: '400' }}>{creatorInfo?.nombre_legal || creatorInfo?.nombre || offerData.email_creador}</span>
                </p>
                <p style={{ color: '#000000', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '600' }}>Email: </span>
                  <span style={{ fontWeight: '400' }}>{creatorInfo?.email || offerData.email_creador}</span>
                </p>
                <p style={{ color: '#000000' }}>
                  <span style={{ fontWeight: '600' }}>Teléfono: </span>
                  <span style={{ fontWeight: '400' }}>{creatorInfo?.telefono || 'N/A'}</span>
                </p>
              </div>
            </div>

            {/* Comprador */}
            <div>
              <h3 style={{ 
                fontSize: '39px', 
                fontWeight: 'bold', 
                color: '#000000', 
                marginBottom: '16px',
                fontFamily: 'Arial, sans-serif'
              }}>
                Comprador
              </h3>
              <div style={{ fontSize: '33px', lineHeight: '1.2', fontFamily: 'Arial, sans-serif' }}>
                <p style={{ color: '#000000', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '600' }}>Nombre: </span>
                  <span style={{ fontWeight: '400' }}>{leadInfo?.nombre_legal || offerData.leadName}</span>
                </p>
                <p style={{ color: '#000000', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '600' }}>Email: </span>
                  <span style={{ fontWeight: '400' }}>{leadInfo?.email || offerData.leadEmail}</span>
                </p>
                {leadInfo?.telefono && (
                  <p style={{ color: '#000000', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '600' }}>Teléfono: </span>
                    <span style={{ fontWeight: '400' }}>{leadInfo.telefono}</span>
                  </p>
                )}
                {leadInfo?.rfc && (
                  <p style={{ color: '#000000' }}>
                    <span style={{ fontWeight: '600' }}>RFC: </span>
                    <span style={{ fontWeight: '400' }}>{leadInfo.rfc}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

OfferPDFTemplateSozu.displayName = 'OfferPDFTemplateSozu';
