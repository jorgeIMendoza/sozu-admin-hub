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

interface OfferPDFTemplateProps {
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
}

export const OfferPDFTemplate = forwardRef<HTMLDivElement, OfferPDFTemplateProps>(
  ({ offerData, propertyDetails, paymentSchemes, amenities, creatorInfo }, ref) => {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    };

    const formatOfferNumber = (offerId: number) => {
      return `OFE-${offerId.toString().padStart(6, '0')}`;
    };

    const selectedPaymentScheme = paymentSchemes[0]; // Use first payment scheme as default

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

    const paymentCalculation = selectedPaymentScheme ? calculatePaymentAmounts(selectedPaymentScheme) : null;

    return (
      <div ref={ref} className="bg-white text-gray-900 font-sans">
        {/* Cover Page */}
        <div className="min-h-screen p-8 flex flex-col relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10"></div>
          
          {/* Header */}
          <div className="relative z-10 flex justify-between items-start mb-8">
            <div>
              <h1 className="text-4xl font-bold text-primary mb-2">OFERTA INMOBILIARIA</h1>
              <p className="text-xl text-muted-foreground">
                {formatOfferNumber(offerData.id)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Fecha de generación</p>
              <p className="text-lg font-semibold">
                {new Date(offerData.fecha_generacion).toLocaleDateString('es-MX', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
          </div>

          {/* Project Image */}
          {propertyDetails.projectData?.url_imagen_portada && (
            <div className="relative z-10 mb-8 rounded-2xl overflow-hidden shadow-2xl">
              <img
                src={propertyDetails.projectData.url_imagen_portada}
                alt={propertyDetails.projectData.nombre}
                className="w-full h-80 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
              <div className="absolute bottom-6 left-6 text-white">
                <h2 className="text-3xl font-bold mb-2">
                  {propertyDetails.projectData.nombre}
                </h2>
                <p className="text-xl opacity-90">
                  {propertyDetails.building?.nombre} - {offerData.propertyNumber}
                </p>
              </div>
            </div>
          )}

          {/* Property Summary */}
          <div className="relative z-10 bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-border">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h3 className="text-2xl font-bold mb-4 text-primary">Detalles de la Propiedad</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Modelo:</span>
                    <span className="font-semibold">{propertyDetails.model?.nombre}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recámaras:</span>
                    <span className="font-semibold">{propertyDetails.model?.numero_recamaras || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Baños:</span>
                    <span className="font-semibold">
                      {(propertyDetails.model?.numero_completo_banos || 0) + 
                       (propertyDetails.model?.numero_medio_bano || 0) * 0.5}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">M² Reales:</span>
                    <span className="font-semibold">{propertyDetails.m2_reales || 'N/A'} m²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vista:</span>
                    <span className="font-semibold">{propertyDetails.vista?.nombre || 'N/A'}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-2xl font-bold mb-4 text-primary">Información Financiera</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Precio Lista:</span>
                    <span className="font-semibold">{formatCurrency(propertyDetails.precio_lista)}</span>
                  </div>
                  {paymentCalculation && paymentCalculation.discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Descuento:</span>
                      <span className="font-semibold">-{formatCurrency(paymentCalculation.discount)}</span>
                    </div>
                  )}
                  {paymentCalculation && (
                    <>
                      <div className="flex justify-between text-2xl font-bold text-primary border-t pt-2">
                        <span>Precio Final:</span>
                        <span>{formatCurrency(paymentCalculation.finalPrice)}</span>
                      </div>
                      <div className="mt-4 p-4 bg-primary/5 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-2">Esquema seleccionado:</p>
                        <p className="font-semibold">{selectedPaymentScheme?.nombre}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="relative z-10 mt-auto pt-8">
            <div className="text-center text-muted-foreground">
              <p>Oferta generada por: {creatorInfo?.nombre_legal || 'No disponible'}</p>
              <p className="text-sm mt-1">Cliente: {offerData.leadName} ({offerData.leadEmail})</p>
              <p className="text-sm mt-1">Esta oferta es válida por 30 días a partir de su fecha de generación</p>
            </div>
          </div>
        </div>

        {/* Payment Plans Page */}
        {paymentCalculation && (
          <div className="min-h-screen p-8 break-before-page">
            <h2 className="text-3xl font-bold mb-8 text-primary text-center">Plan de Pagos</h2>
            
            <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-2xl p-8 mb-8">
              <h3 className="text-2xl font-bold mb-6 text-center">{selectedPaymentScheme?.nombre}</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl p-6 shadow-lg text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    {formatCurrency(paymentCalculation.enganche)}
                  </div>
                  <div className="text-muted-foreground">
                    Enganche ({selectedPaymentScheme.porcentaje_enganche}%)
                  </div>
                </div>
                
                <div className="bg-white rounded-xl p-6 shadow-lg text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    {formatCurrency(paymentCalculation.mensualidad)}
                  </div>
                  <div className="text-muted-foreground">
                    {selectedPaymentScheme.numero_mensualidades} mensualidades
                  </div>
                </div>
                
                <div className="bg-white rounded-xl p-6 shadow-lg text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    {formatCurrency(paymentCalculation.entrega)}
                  </div>
                  <div className="text-muted-foreground">
                    Contra entrega ({selectedPaymentScheme.porcentaje_entrega}%)
                  </div>
                </div>
              </div>
            </div>

            {/* All Payment Schemes */}
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-center mb-6">Opciones de Pago Disponibles</h3>
              {paymentSchemes.map((scheme) => {
                const calculation = calculatePaymentAmounts(scheme);
                return (
                  <div key={scheme.id} className={`bg-white rounded-xl p-6 shadow-lg border-2 ${
                    scheme.id === selectedPaymentScheme?.id ? 'border-primary' : 'border-border'
                  }`}>
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-xl font-bold">{scheme.nombre}</h4>
                      {scheme.id === selectedPaymentScheme?.id && (
                        <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">
                          Seleccionado
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Enganche</p>
                        <p className="font-bold">{formatCurrency(calculation.enganche)}</p>
                        <p className="text-xs text-muted-foreground">({scheme.porcentaje_enganche}%)</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Mensualidad</p>
                        <p className="font-bold">{formatCurrency(calculation.mensualidad)}</p>
                        <p className="text-xs text-muted-foreground">{scheme.numero_mensualidades} meses</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Contra Entrega</p>
                        <p className="font-bold">{formatCurrency(calculation.entrega)}</p>
                        <p className="text-xs text-muted-foreground">({scheme.porcentaje_entrega}%)</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Precio Final</p>
                        <p className="font-bold text-primary">{formatCurrency(calculation.finalPrice)}</p>
                        {calculation.discount > 0 && (
                          <p className="text-xs text-green-600">Ahorro: {formatCurrency(calculation.discount)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Amenities Page */}
        {amenities.length > 0 && (
          <div className="min-h-screen p-8 break-before-page">
            <h2 className="text-3xl font-bold mb-8 text-primary text-center">Amenidades del Proyecto</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {amenities.map((amenity) => (
                <div key={amenity.id} className="bg-white rounded-xl p-6 shadow-lg text-center">
                  {amenity.url && (
                    <div className="mb-4">
                      <img
                        src={amenity.url}
                        alt={amenity.nombre}
                        className="w-16 h-16 mx-auto object-contain"
                      />
                    </div>
                  )}
                  <h4 className="font-semibold text-lg">{amenity.nombre}</h4>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact Information Page */}
        <div className="min-h-screen p-8 break-before-page">
          <h2 className="text-3xl font-bold mb-8 text-primary text-center">Información de Contacto</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Seller Info */}
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h3 className="text-2xl font-bold mb-6 text-primary">Información del Vendedor</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Nombre</p>
                  <p className="font-semibold text-lg">{creatorInfo?.nombre_legal || 'No disponible'}</p>
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

            {/* Property Owner Info */}
            {propertyDetails.ownerData && (
              <div className="bg-white rounded-2xl p-8 shadow-lg">
                <h3 className="text-2xl font-bold mb-6 text-primary">Información del Propietario</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Nombre</p>
                    <p className="font-semibold text-lg">{propertyDetails.ownerData.nombre_legal}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-semibold">{propertyDetails.ownerData.email}</p>
                  </div>
                  {propertyDetails.ownerData.telefono && (
                    <div>
                      <p className="text-sm text-muted-foreground">Teléfono</p>
                      <p className="font-semibold">{propertyDetails.ownerData.telefono}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Legal Notice */}
          <div className="mt-12 p-6 bg-muted rounded-xl">
            <h4 className="font-bold mb-3">Aviso Legal</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Esta oferta es válida por 30 días calendario a partir de la fecha de generación. 
              Los precios y condiciones están sujetos a disponibilidad y pueden cambiar sin previo aviso. 
              Para formalizar la compra se requiere la firma del contrato correspondiente y el cumplimiento 
              de todos los requisitos legales aplicables. Las imágenes y descripciones son referenciales 
              y pueden no corresponder exactamente al inmueble final.
            </p>
          </div>
        </div>
      </div>
    );
  }
);

OfferPDFTemplate.displayName = 'OfferPDFTemplate';