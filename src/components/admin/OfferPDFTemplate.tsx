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
  m2_interiores: number | null;
  m2_exteriores: number | null;
  descripcion: string | null;
  numero_piso?: string | null;
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
    monto_mensualidad?: number;
    fecha_limite?: string;
  }> | null;
}

interface ProjectAmenity {
  id: number;
  nombre: string;
  url: string | null;
}

interface OfferPDFTemplateProps {
  offerData: {
    id: number;
    fecha_generacion: string;
    propertyNumber: string;
    leadName: string;
    leadEmail: string;
    id_esquema_pago_seleccionado?: number | null;
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

export const OfferPDFTemplate = forwardRef<HTMLDivElement, OfferPDFTemplateProps>(
  ({ offerData, propertyDetails, paymentSchemes, amenities, creatorInfo, leadInfo, legalNotices, estacionamientos, bodegas }, ref) => {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      }).format(amount);
    };

    const formatOfferNumber = (offerId: number) => {
      return `OFE-${offerId.toString().padStart(6, '0')}`;
    };

    const selectedPaymentScheme = paymentSchemes[0]; // Use first payment scheme as default
    
    // Filter payment schemes based on whether the selected one is manual or not
    const filteredPaymentSchemes = selectedPaymentScheme?.es_manual 
      ? paymentSchemes.filter(scheme => scheme.es_manual)
      : paymentSchemes.filter(scheme => !scheme.es_manual);

    // Convención de porcentaje_descuento_aumento:
    // - Valor positivo: incremento (aumenta el precio)
    // - Valor negativo: descuento (reduce el precio)
    // Ejemplo: +10 = 10% más caro, -8 = 8% más barato
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

    const paymentCalculation = selectedPaymentScheme ? calculatePaymentAmounts(selectedPaymentScheme) : null;

    return (
      <div ref={ref} className="bg-white text-gray-900 font-sans text-lg leading-relaxed">
        {/* Cover Page */}
        <div className="min-h-screen p-12 flex flex-col relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10"></div>
          
          {/* Project Image at top */}
          {propertyDetails.projectData?.url_imagen_portada && (
            <div className="relative z-10 mb-8 rounded-2xl overflow-hidden shadow-2xl">
              <img
                src={propertyDetails.projectData.url_imagen_portada}
                alt={propertyDetails.projectData.nombre}
                className="w-full h-48 object-cover"
              />
            </div>
          )}

          {/* Header */}
          <div className="relative z-10 flex justify-between items-start mb-8">
            <div>
              <h1 className="text-xl font-bold text-primary mb-1">
                Cotización departamento {propertyDetails.numero_propiedad} de {propertyDetails.projectData?.nombre}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatOfferNumber(offerData.id)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Fecha de generación</p>
              <p className="text-sm font-semibold">
                {new Date(offerData.fecha_generacion).toLocaleDateString('es-MX', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
          </div>

          {/* Property Summary */}
          <div className="relative z-10 bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-border">
            <h3 className="text-xl font-bold mb-4 text-primary">Detalles de la Propiedad</h3>
            <div className="grid grid-cols-2 gap-8">
              {/* Left Column - Property Details */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Proyecto:</span>
                <span className="font-semibold">{propertyDetails.projectData?.nombre || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Edificio:</span>
                <span className="font-semibold">{propertyDetails.building?.nombre || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Modelo:</span>
                <span className="font-semibold">{propertyDetails.model?.nombre || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Número de propiedad:</span>
                <span className="font-semibold">{propertyDetails.numero_propiedad}</span>
              </div>
              {propertyDetails.projectData?.mostrar_piso_en_oferta !== false && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nivel:</span>
                  <span className="font-semibold">{propertyDetails.numero_piso !== null && propertyDetails.numero_piso !== undefined ? propertyDetails.numero_piso : 'N/A'}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vista:</span>
                <span className="font-semibold">{propertyDetails.vista?.nombre || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Área:</span>
                <span className="font-semibold">
                  {((propertyDetails.m2_interiores || 0) + (propertyDetails.m2_exteriores || 0)).toFixed(2)} m²
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Precio de lista:</span>
                <span className="font-semibold">{formatCurrency(propertyDetails.precio_lista)}</span>
              </div>
              {propertyDetails.projectData?.mostrar_precio_m2_en_oferta !== false && (propertyDetails.m2_interiores || propertyDetails.m2_exteriores) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Precio por m²:</span>
                  <span className="font-semibold">
                    {formatCurrency(propertyDetails.precio_lista / ((propertyDetails.m2_interiores || 0) + (propertyDetails.m2_exteriores || 0)))}
                  </span>
                </div>
              )}
            </div>
              
              {/* Right Column - Amenities */}
              <div>
                <h4 className="text-lg font-bold mb-3 text-primary">Amenidades</h4>
                <div className="grid grid-cols-5 gap-2">
                  {amenities.filter(amenity => amenity.url).slice(0, 15).map((amenity) => (
                    <div key={amenity.id} className="flex justify-center">
                      <img
                        src={amenity.url}
                        alt={amenity.nombre}
                        className="w-10 h-10 object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Contacts Section */}
          <div className="relative z-10 mt-4 grid grid-cols-2 gap-6">
            {/* Agent Info Card */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 shadow-lg border border-border">
              <h3 className="text-lg font-bold mb-4 text-primary">Información del Agente</h3>
              <div className="space-y-2 text-sm leading-tight">
                <div>
                  <p className="text-sm text-muted-foreground">Nombre</p>
                  <p className="font-semibold">{creatorInfo?.nombre_legal || 'No disponible'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-semibold">{creatorInfo?.email || 'No disponible'}</p>
                </div>
                {creatorInfo?.telefono && (
                  <div>
                    <p className="text-sm text-muted-foreground">Teléfono</p>
                    <p className="font-semibold">{creatorInfo.telefono}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Buyer Info Card */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 shadow-lg border border-border">
              <h3 className="text-lg font-bold mb-4 text-primary">Información del Comprador</h3>
              <div className="space-y-2 text-sm leading-tight">
                <div>
                  <p className="text-sm text-muted-foreground">Nombre</p>
                  <p className="font-semibold">{(leadInfo?.nombre_legal || offerData.leadName).toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-semibold">{leadInfo?.email || offerData.leadEmail}</p>
                </div>
                {leadInfo?.telefono && (
                  <div>
                    <p className="text-sm text-muted-foreground">Teléfono</p>
                    <p className="font-semibold">{leadInfo.telefono}</p>
                  </div>
                )}
                {leadInfo?.rfc && (
                  <div>
                    <p className="text-sm text-muted-foreground">RFC</p>
                    <p className="font-semibold">{leadInfo.rfc}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Payment Options Page */}
        <div className="min-h-screen p-10 break-before-page">
          <h2 className="text-xl font-bold mb-6 text-primary text-center">Opciones de Pago Disponibles</h2>
          
          <div className="grid grid-cols-2 gap-4">
            {filteredPaymentSchemes.map((scheme) => {
              const calculation = calculatePaymentAmounts(scheme);
              return (
                <div key={scheme.id} className="bg-white rounded-xl p-4 shadow-lg border border-border">
                  {!scheme.es_manual && (
                    <div className="text-center mb-3">
                      <h4 className="text-sm font-bold">{scheme.nombre}</h4>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    {scheme.porcentaje_enganche > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">
                          Enganche{scheme.numero_pagos_enganche > 1 ? ` (en ${scheme.numero_pagos_enganche} pagos)` : ''}
                        </p>
                        <p className="font-bold text-xs">{formatCurrency(calculation.enganche)}</p>
                        <p className="text-xs text-muted-foreground">({scheme.porcentaje_enganche}%)</p>
                      </div>
                    )}
                    {scheme.porcentaje_mensualidades > 0 && scheme.numero_mensualidades > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Mensualidades</p>
                        {scheme.tramos_mensualidad && scheme.tramos_mensualidad.length > 0 ? (
                          // Tiered payments
                          <div className="space-y-1">
                            {scheme.tramos_mensualidad.map((tramo, idx) => {
                              const mensualidadesAcumuladas = scheme.tramos_mensualidad!
                                .slice(0, idx)
                                .reduce((acc, t) => acc + t.numero_mensualidades, 0);
                              return (
                                <div key={idx} className="text-xs">
                                  <p className="font-bold">{tramo.numero_mensualidades} pagos de {formatCurrency(tramo.monto)}</p>
                                  {idx > 0 && (
                                    <p className="text-[10px] text-muted-foreground">(a partir del mes {mensualidadesAcumuladas + 1})</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          // Uniform payments
                          <>
                            <p className="font-bold text-xs">{formatCurrency(calculation.mensualidad)}</p>
                            <p className="text-xs text-muted-foreground">{scheme.numero_mensualidades} meses</p>
                          </>
                        )}
                      </div>
                    )}
                    {scheme.porcentaje_entrega > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Contra Entrega</p>
                        <p className="font-bold text-xs">{formatCurrency(calculation.entrega)}</p>
                        <p className="text-xs text-muted-foreground">({scheme.porcentaje_entrega}%)</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Precio Final</p>
                      <p className="font-bold text-primary text-xs">{formatCurrency(calculation.finalPrice)}</p>
                      {calculation.adjustment < 0 && (
                        <p className="text-xs text-green-600">Ahorro: {formatCurrency(Math.abs(calculation.adjustment))}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
        </div>

        {/* Banking Data Page - Only show if lead has RFC */}
        {leadInfo?.rfc && offerData.id_esquema_pago_seleccionado && (
          <div className="min-h-screen p-10 break-before-page">
            <h2 className="text-xl font-bold mb-6 text-primary text-center">Datos Bancarios</h2>
            
            <div className="grid grid-cols-2 gap-6">
            {/* Transfer Card */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-border">
              <h3 className="text-sm font-bold mb-4 text-primary">Transferencia</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Beneficiario</p>
                  <p className="text-xs font-semibold">{propertyDetails.ownerData?.nombre_legal || 'No disponible'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Banco</p>
                  <p className="text-xs font-semibold">Sistema de Transacciones y Pagos</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CLABE</p>
                  <p className="text-xs font-semibold font-mono">{propertyDetails.clabe_stp_tmp_apartado || 'Por asignar'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Concepto de Pago</p>
                  <p className="text-xs font-semibold">Apartado Depto. {propertyDetails.numero_propiedad}</p>
                </div>
              </div>
            </div>

            {/* Cash Payment Card */}
            {propertyDetails.projectData?.mostrar_seccion_efectivo_en_oferta !== false && propertyDetails.ownerStpBankAccount && (
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-border">
                <h3 className="text-sm font-bold mb-4 text-primary">En Efectivo</h3>
                <div className="space-y-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-primary">{formatCurrency(propertyDetails.precio_lista)}</p>
                    <p className="text-xs text-muted-foreground">Precio de contado</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">
                      Sin financiamiento - Pago único al momento de la escrituración
                    </p>
                  </div>
                  
                  {/* Bank Account Information */}
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <h4 className="text-xs font-bold text-primary text-center">Información Bancaria</h4>
                    <div>
                      <p className="text-xs text-muted-foreground">Beneficiario</p>
                      <p className="text-xs font-semibold">{propertyDetails.ownerData?.nombre_legal || 'No disponible'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Banco</p>
                      <p className="text-xs font-semibold">{propertyDetails.ownerStpBankAccount.banco_nombre}</p>
                    </div>
                    {propertyDetails.ownerStpBankAccount.cuenta_clabe && (
                      <div>
                        <p className="text-xs text-muted-foreground">CLABE</p>
                        <p className="text-xs font-semibold font-mono">{propertyDetails.ownerStpBankAccount.cuenta_clabe}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Número de Cuenta</p>
                      <p className="text-xs font-semibold font-mono">{propertyDetails.ownerStpBankAccount.numero_cuenta}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Legal Notice */}
          <div className="mt-8 p-4 bg-muted rounded-xl">
            <h4 className="text-xs font-bold mb-2">Aviso Legal</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {legalNotices && legalNotices.length > 0 
                ? legalNotices.join('. ')
                : 'Esta oferta es válida por 5 días calendario a partir de la fecha de generación. Los precios y condiciones están sujetos a disponibilidad y pueden cambiar sin previo aviso. Para formalizar la compra se requiere la firma del contrato correspondiente y el cumplimiento de todos los requisitos legales aplicables. Las imágenes y descripciones son referenciales y pueden no corresponder exactamente al inmueble final.'
              }
            </p>
          </div>
          </div>
        )}
      </div>
    );
  }
);

OfferPDFTemplate.displayName = 'OfferPDFTemplate';