import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, CreditCard, Eye, X, Edit, Plus, Download, Loader2, Filter, TrendingUp, TrendingDown, Equal, AlertCircle, DollarSign } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { CompradoresDetailDialog } from "@/components/admin/CompradoresDetailDialog";
import { EditCuentaCobranzaDialog } from "@/components/admin/EditCuentaCobranzaDialog";
import { AddManualPaymentDialog } from "@/components/admin/AddManualPaymentDialog";
import { TransferMoneyDialog } from "@/components/admin/TransferMoneyDialog";
import { CancelCuentaDialog } from "@/components/admin/CancelCuentaDialog";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";

interface Comprador {
  nombre_legal: string;
  rfc: string | null;
  porcentaje_copropiedad: number;
  id_persona?: number;
}

interface CuentaCobranza {
  id: number;
  tipo: 'Propiedad' | 'Producto' | 'Servicio';
  producto_nombre?: string;
  clabe_stp: string | null;
  precio_final: number;
  precio_lista: number | null;
  pagado: number;
  restante: number;
  compradores: Comprador[];
  dueno: string;
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
  activo: boolean;
  id_oferta: number;
  motivo_cancelacion?: string | null;
  apartado_pagado: boolean;
  tiene_acuerdos: boolean;
  cash_limit?: number;
  cash_paid?: number;
  cash_remaining?: number;
  cash_percentage?: number;
}

export default function Pagos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activas");
  const [selectedTipos, setSelectedTipos] = useState<Array<'Propiedad' | 'Producto' | 'Servicio'>>(['Propiedad', 'Producto', 'Servicio']);
  const [cancelDialog, setCancelDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null
  });
  const [editDialog, setEditDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null
  });
  const [loadingDownload, setLoadingDownload] = useState<number | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null
  });
  const [transferDialog, setTransferDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: cuentasCobranza, isLoading } = useQuery({
    queryKey: ["cuentas_cobranza"],
    queryFn: async () => {
      // Get basic cuenta cobranza data with payment sums
      const { data: cuentas, error: cuentasError } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          clabe_stp,
          precio_final,
          id_oferta,
          activo,
          valor_uma,
          tipos_cancelacion:id_tipo_cancelacion(nombre)
        `);

      if (cuentasError) {
        console.error('Error fetching cuentas:', cuentasError);
        return [];
      }

      if (!cuentas || cuentas.length === 0) return [];

      // Get all payment amounts for each account
      const cuentaIds = cuentas.map(c => c.id);
      console.log('Cuenta IDs:', cuentaIds);
      
      const { data: pagosSums, error: pagosError } = await supabase
        .from('pagos')
        .select('id_cuenta_cobranza, monto')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true);

      console.log('Pagos query result:', { pagosSums, pagosError });

      // Calculate total payments per account
      const pagadoPorCuenta = cuentas.reduce((acc: Record<number, number>, cuenta) => {
        const totalPagado = pagosSums
          ?.filter(p => p.id_cuenta_cobranza === cuenta.id)
          ?.reduce((sum, p) => sum + (p.monto || 0), 0) || 0;
        acc[cuenta.id] = totalPagado;
        console.log(`Cuenta ${cuenta.id}: pagado = ${totalPagado}`);
        return acc;
      }, {});
      
      console.log('Pagado por cuenta:', pagadoPorCuenta);

      // Get cash payments (id_metodos_pago = 1) for all accounts
      const { data: pagosCash } = await supabase
        .from('pagos')
        .select('id_cuenta_cobranza, monto')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('id_metodos_pago', 1)
        .eq('activo', true);

      const pagadoEfectivoPorCuenta = cuentas.reduce((acc: Record<number, number>, cuenta) => {
        const totalEfectivo = pagosCash
          ?.filter(p => p.id_cuenta_cobranza === cuenta.id)
          ?.reduce((sum, p) => sum + (p.monto || 0), 0) || 0;
        acc[cuenta.id] = totalEfectivo;
        return acc;
      }, {});

      // Get acuerdos_pago to check if "Apartado" or "Enganche" is paid
      const { data: acuerdosPago } = await supabase
        .from('acuerdos_pago')
        .select('id, id_cuenta_cobranza, id_concepto, pago_completado')
        .in('id_cuenta_cobranza', cuentaIds)
        .eq('activo', true);

      console.log('🔍 Acuerdos de pago:', acuerdosPago);

      // Get aplicaciones_pago para verificar si hay pagos de cesión de derechos
      const acuerdoIds = acuerdosPago?.map(a => a.id) || [];
      let cesionDerechosMap: Record<number, boolean> = {};
      
      if (acuerdoIds.length > 0) {
        const { data: aplicaciones } = await supabase
          .from('aplicaciones_pago')
          .select('id_acuerdo_pago, monto')
          .in('id_acuerdo_pago', acuerdoIds)
          .eq('activo', true);

        // Crear mapeo de acuerdo_id a concepto_id y cuenta_id
        const acuerdosMap = acuerdosPago?.reduce((acc: any, a) => {
          acc[a.id] = { id_concepto: a.id_concepto, id_cuenta_cobranza: a.id_cuenta_cobranza };
          return acc;
        }, {});

        // Crear un mapa de cuentas que tienen cesión de derechos con pagos (id_concepto = 6)
        aplicaciones?.forEach((app: any) => {
          const acuerdo = acuerdosMap[app.id_acuerdo_pago];
          if (acuerdo && acuerdo.id_concepto === 6 && app.monto > 0) {
            cesionDerechosMap[acuerdo.id_cuenta_cobranza] = true;
          }
        });
        
        console.log('🔍 Cuentas con cesión de derechos:', cesionDerechosMap);
      }

      // Primero necesitamos determinar qué cuentas son de productos
      // Obtenemos las ofertas para saber cuáles tienen id_producto
      const { data: ofertasTemp } = await supabase
        .from('ofertas')
        .select('id, id_producto')
        .in('id', cuentas.map(c => c.id_oferta));

      const cuentasProductoSet = new Set(
        ofertasTemp?.filter(o => o.id_producto).map(o => 
          cuentas.find(c => c.id_oferta === o.id)?.id
        ).filter(Boolean) || []
      );

      console.log('🔍 Cuentas de productos:', Array.from(cuentasProductoSet));

      // Create a map of whether initial payment is made for each cuenta
      const apartadoPagadoPorCuenta = cuentas.reduce((acc: Record<number, boolean>, cuenta) => {
        const esProducto = cuentasProductoSet.has(cuenta.id);
        
        if (esProducto) {
          // Para productos, el pago inicial es el Enganche (id_concepto = 2)
          const acuerdoEnganche = acuerdosPago?.find(
            ap => ap.id_cuenta_cobranza === cuenta.id && ap.id_concepto === 2
          );
          acc[cuenta.id] = acuerdoEnganche?.pago_completado || false;
          console.log(`💰 Cuenta ${cuenta.id} [PRODUCTO]: enganche_pagado = ${acc[cuenta.id]}`);
        } else {
          // Para propiedades, el pago inicial es Apartado (id_concepto = 1) o Cesión de derechos (id_concepto = 6)
          const acuerdoApartado = acuerdosPago?.find(
            ap => ap.id_cuenta_cobranza === cuenta.id && ap.id_concepto === 1
          );
          acc[cuenta.id] = (acuerdoApartado?.pago_completado || false) || (cesionDerechosMap[cuenta.id] || false);
          console.log(`💰 Cuenta ${cuenta.id} [PROPIEDAD]: apartado_pagado = ${acc[cuenta.id]} (apartado: ${acuerdoApartado?.pago_completado}, cesión: ${cesionDerechosMap[cuenta.id]})`);
        }
        
        return acc;
      }, {});

      // Create a map to check if each cuenta has acuerdos
      const tieneAcuerdosPorCuenta = cuentas.reduce((acc: Record<number, boolean>, cuenta) => {
        const tieneAcuerdos = acuerdosPago?.some(ap => ap.id_cuenta_cobranza === cuenta.id) || false;
        acc[cuenta.id] = tieneAcuerdos;
        return acc;
      }, {});

      // Get offer IDs to fetch related data
      const ofertaIds = cuentas.map(c => c.id_oferta);

      // Get ofertas with properties and products
      const { data: ofertas, error: ofertasError } = await supabase
        .from('ofertas')
        .select(`
          id,
          id_propiedad,
          id_producto,
          propiedades!ofertas_id_propiedad_fkey(
            id,
            numero_propiedad,
            precio_lista,
            id_entidad_relacionada_dueno,
            id_edificio_modelo
          )
        `)
        .in('id', ofertaIds);

      if (ofertasError) {
        console.error('Error fetching ofertas:', ofertasError);
        return [];
      }

      // Get compradores
      const { data: compradores } = await supabase
        .from('compradores')
        .select(`
          id_cuenta_cobranza,
          porcentaje_copropiedad,
          id_persona,
          personas!compradores_id_persona_fkey(id, nombre_legal, rfc)
        `)
        .in('id_cuenta_cobranza', cuentas.map(c => c.id));

      // Get entidades relacionadas, proyectos, edificios, modelos, productos
      const entidadIds = ofertas?.map(o => o.propiedades?.id_entidad_relacionada_dueno).filter(Boolean) || [];
      const edificioModeloIds = ofertas?.map(o => o.propiedades?.id_edificio_modelo).filter(Boolean) || [];
      const productoIds = ofertas?.map(o => o.id_producto).filter(Boolean) || [];

      const [entidadesResult, edificiosModelosResult, productosResult] = await Promise.all([
        supabase
          .from('entidades_relacionadas')
          .select(`
            id,
            personas!fk_entrel_persona(nombre_legal),
            proyectos!entidades_relacionadas_id_proyecto_fkey(
              nombre,
              id_tipo_uso
            )
          `)
          .in('id', entidadIds),
        supabase
          .from('edificios_modelos')
          .select(`
            id,
            edificios!edificios_modelos_id_edificio_fkey(nombre),
            modelos!edificios_modelos_id_modelo_fkey(nombre)
          `)
          .in('id', edificioModeloIds),
        productoIds.length > 0 ? supabase
          .from('productos_servicios')
          .select(`
            id,
            nombre,
            id_proyecto,
            proyectos!productos_servicios_id_proyecto_fkey(
              id_tipo_uso
            )
          `)
          .in('id', productoIds) : Promise.resolve({ data: [] })
      ]);

      // Transform the data
      const transformedData: CuentaCobranza[] = cuentas.map(cuenta => {
        const oferta = ofertas?.find(o => o.id === cuenta.id_oferta);
        const propiedad = oferta?.propiedades;
        const entidad = entidadesResult.data?.find(e => e.id === propiedad?.id_entidad_relacionada_dueno);
        const edificioModelo = edificiosModelosResult.data?.find(em => em.id === propiedad?.id_edificio_modelo);
        const cuentaCompradores = compradores?.filter(c => c.id_cuenta_cobranza === cuenta.id) || [];
        
        // Determine tipo based on oferta
        let tipo: 'Propiedad' | 'Producto' | 'Servicio' = 'Propiedad';
        let productoNombre: string | undefined;
        if (oferta?.id_producto) {
          const producto = productosResult.data?.find(p => p.id === oferta.id_producto);
          productoNombre = producto?.nombre;
          if (producto && producto.proyectos) {
            // id_tipo_uso: 9 = Productos, 10 = Servicios, 11 = Mantenimientos (also Servicios)
            const tipoUso = producto.proyectos.id_tipo_uso;
            if (tipoUso === 9) {
              tipo = 'Producto';
            } else if (tipoUso === 10 || tipoUso === 11) {
              tipo = 'Servicio';
            }
          } else {
            tipo = 'Producto'; // Default if we can't determine
          }
        }

        const pagado = pagadoPorCuenta[cuenta.id] || 0;
        const precio_final = cuenta.precio_final || 0;
        const restante = precio_final - pagado;

        // Calculate cash payment data (only for properties)
        const valorUma = cuenta.valor_uma || 0;
        const limiteEfectivo = valorUma * 8025;
        const pagadoEfectivo = tipo === 'Propiedad' ? (pagadoEfectivoPorCuenta[cuenta.id] || 0) : 0;
        const restanteEfectivo = limiteEfectivo - pagadoEfectivo;
        const porcentajeEfectivo = limiteEfectivo > 0 ? (pagadoEfectivo / limiteEfectivo) * 100 : 0;

        return {
          id: cuenta.id,
          tipo,
          producto_nombre: productoNombre,
          clabe_stp: cuenta.clabe_stp,
          precio_final,
          precio_lista: propiedad?.precio_lista || null,
          pagado,
          restante,
          cash_limit: limiteEfectivo,
          cash_paid: pagadoEfectivo,
          cash_remaining: restanteEfectivo,
          cash_percentage: porcentajeEfectivo,
          compradores: cuentaCompradores.map(c => ({
            nombre_legal: c.personas?.nombre_legal || '',
            rfc: c.personas?.rfc || null,
            porcentaje_copropiedad: c.porcentaje_copropiedad || 0,
            id_persona: c.id_persona
          })).filter(c => c.nombre_legal),
          dueno: entidad?.personas?.nombre_legal || 'Sin dueño',
          proyecto: entidad?.proyectos?.nombre || 'Sin proyecto',
          edificio: edificioModelo?.edificios?.nombre || 'Sin edificio',
          numero_propiedad: propiedad?.numero_propiedad || 'Sin número',
          modelo: edificioModelo?.modelos?.nombre || 'Sin modelo',
          activo: cuenta.activo,
          id_oferta: cuenta.id_oferta,
          motivo_cancelacion: (cuenta as any).tipos_cancelacion?.nombre || null,
          apartado_pagado: apartadoPagadoPorCuenta[cuenta.id],
          tiene_acuerdos: tieneAcuerdosPorCuenta[cuenta.id]
        };
      });

      return transformedData.sort((a, b) => b.id - a.id);
    },
  });

  // Filter by active status and search term
  const cuentasActivas = cuentasCobranza?.filter(cuenta => cuenta.activo) || [];
  const cuentasCanceladas = cuentasCobranza?.filter(cuenta => !cuenta.activo) || [];
  
  const currentCuentas = activeTab === "activas" ? cuentasActivas : cuentasCanceladas;
  
  const filteredCuentas = currentCuentas.filter(cuenta => {
    // Filter by tipo
    if (!selectedTipos.includes(cuenta.tipo)) {
      return false;
    }
    
    // Filter by search term
    return (
      cuenta.id.toString().includes(searchTerm) ||
      cuenta.compradores.some(c => c.nombre_legal.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.rfc?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      cuenta.dueno.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.clabe_stp?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.proyecto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.edificio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.numero_propiedad.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.producto_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cuenta.precio_final.toString().includes(searchTerm)
    );
  });

  const handleTipoToggle = (tipo: 'Propiedad' | 'Producto' | 'Servicio') => {
    setSelectedTipos(prev => 
      prev.includes(tipo) 
        ? prev.filter(t => t !== tipo)
        : [...prev, tipo]
    );
  };

  const totalMonto = filteredCuentas.reduce((sum, cuenta) => sum + Number(cuenta.precio_final), 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  // Handler to open cancel dialog
  const handleCancelCuenta = (cuenta: CuentaCobranza) => {
    setCancelDialog({ isOpen: true, cuenta });
  };

  const handleEditCuenta = (cuenta: CuentaCobranza) => {
    setEditDialog({ isOpen: true, cuenta });
  };

  // Navigation functions
  const handlePropertyClick = (clabe: string) => {
    navigate(`/admin/propiedades?search=${encodeURIComponent(clabe)}`);
  };

  const handleCompradorClick = (rfc: string) => {
    navigate(`/admin/compradores?search=${encodeURIComponent(rfc)}`);
  };

  const handleVendedorClick = (nombreVendedor: string) => {
    navigate(`/admin/entidades-legales?search=${encodeURIComponent(nombreVendedor)}`);
  };

  const handleAddManualPayment = (cuenta: CuentaCobranza) => {
    setPaymentDialog({ isOpen: true, cuenta });
  };

  const handleDownloadOffer = async (cuenta: CuentaCobranza) => {
    try {
      setLoadingDownload(cuenta.id);
      
      // Get the offer and property data for this account
      const { data: offerData } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id_oferta,
          ofertas!fk_cuentas_cobranza_oferta(
            id_propiedad
          )
        `)
        .eq('id', cuenta.id)
        .single();

      if (!offerData?.id_oferta || !offerData.ofertas?.id_propiedad) {
        toast({
          title: "Error",
          description: "No se encontró la oferta asociada a esta cuenta",
          variant: "destructive",
        });
        return;
      }

      // Generate and download the PDF
      const { generateOfferPDF } = await import('@/services/htmlToPdfService');
      await generateOfferPDF({
        propertyId: offerData.ofertas.id_propiedad,
        offerId: offerData.id_oferta,
        propertyNumber: cuenta.numero_propiedad,
        leadName: cuenta.compradores[0]?.nombre_legal || 'Sin comprador',
        leadEmail: '', // We don't have email in this view
        leadPhone: '', // We don't have phone in this view
        creatorEmail: 'admin@system.com'
      });

      toast({
        title: "PDF Generado",
        description: "La oferta se ha descargado exitosamente",
      });
    } catch (error) {
      console.error('Error downloading offer:', error);
      toast({
        title: "Error",
        description: "No se pudo descargar la oferta",
        variant: "destructive",
      });
    } finally {
      setLoadingDownload(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cuentas de Cobranza</h1>
        <p className="text-muted-foreground">
          Listado de cuentas de cobranza registradas en el sistema
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="activas">Cuentas Activas ({cuentasActivas.length})</TabsTrigger>
          <TabsTrigger value="canceladas">Cuentas Canceladas ({cuentasCanceladas.length})</TabsTrigger>
        </TabsList>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {activeTab === "activas" ? "Cuentas Activas" : "Cuentas Canceladas"}
              </CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredCuentas.length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalMonto)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Promedio por Cuenta</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(filteredCuentas.length > 0 ? totalMonto / filteredCuentas.length : 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        <TabsContent value="activas" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por ID, compradores, dueño, CLABE, proyecto, edificio, propiedad o modelo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Tipo ({selectedTipos.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 bg-background z-50" align="end">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Filtrar por Tipo</h4>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="tipo-propiedad"
                            checked={selectedTipos.includes('Propiedad')}
                            onCheckedChange={() => handleTipoToggle('Propiedad')}
                          />
                          <Label htmlFor="tipo-propiedad" className="cursor-pointer">
                            Propiedad
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="tipo-producto"
                            checked={selectedTipos.includes('Producto')}
                            onCheckedChange={() => handleTipoToggle('Producto')}
                          />
                          <Label htmlFor="tipo-producto" className="cursor-pointer">
                            Producto
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="tipo-servicio"
                            checked={selectedTipos.includes('Servicio')}
                            onCheckedChange={() => handleTipoToggle('Servicio')}
                          />
                          <Label htmlFor="tipo-servicio" className="cursor-pointer">
                            Servicio
                          </Label>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Cargando cuentas de cobranza...</div>
              ) : filteredCuentas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? "No se encontraron cuentas activas que coincidan con la búsqueda" : "No hay cuentas de cobranza activas"}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID Cuenta</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Nombre de producto</TableHead>
                      <TableHead>Compradores</TableHead>
                      <TableHead>Dueño</TableHead>
                      <TableHead>CLABE</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Edificio</TableHead>
                      <TableHead>No. Propiedad</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Precio Final</TableHead>
                      <TableHead>Pagado</TableHead>
                      <TableHead>Restante</TableHead>
                      <TableHead>Pagos en Efectivo</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCuentas.map((cuenta) => (
                      <TableRow 
                        key={cuenta.id}
                      >
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            <span>{formatCuentaCobranzaId(cuenta.id, cuenta.tipo)}</span>
                            {!cuenta.tiene_acuerdos ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 h-6 w-6 p-0 flex items-center justify-center">
                                      <AlertCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-semibold">⚠️ Plan de pagos no seleccionado</p>
                                    <p className="text-sm">La cuenta de cobranza fue generada pero falta seleccionar el esquema de pago para generar los acuerdos</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : !cuenta.apartado_pagado ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 h-6 w-6 p-0 flex items-center justify-center">
                                      <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-semibold">⚠️ Pago inicial pendiente</p>
                                    <p className="text-sm">Esta cuenta fue generada pero aún no ha recibido el pago inicial completo</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={cuenta.tipo === 'Propiedad' ? 'default' : cuenta.tipo === 'Producto' ? 'secondary' : 'outline'}>
                            {cuenta.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {cuenta.producto_nombre ? (
                            <span className="text-sm">{cuenta.producto_nombre}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">N/A</span>
                          )}
                        </TableCell>
                         <TableCell>
                           {cuenta.compradores.length > 0 ? (
                             cuenta.compradores.length > 1 ? (
                               <CompradoresDetailDialog compradores={cuenta.compradores} />
                             ) : (
                               <div className="space-y-1">
                                  <Badge 
                                    variant="secondary" 
                                    className="block w-fit cursor-pointer hover:bg-secondary/80" 
                                    onClick={() => handleCompradorClick(cuenta.compradores[0].rfc || cuenta.compradores[0].nombre_legal)}
                                  >
                                   {cuenta.compradores[0].nombre_legal}
                                 </Badge>
                                 <div className="text-xs text-muted-foreground">
                                   {cuenta.compradores[0].rfc && `RFC: ${cuenta.compradores[0].rfc}`}
                                   <br />
                                   {cuenta.compradores[0].porcentaje_copropiedad.toFixed(2)}% propiedad
                                 </div>
                               </div>
                             )
                           ) : (
                             <span className="text-muted-foreground">Sin compradores</span>
                           )}
                         </TableCell>
                         <TableCell>
                           <span 
                             className="cursor-pointer hover:text-primary hover:underline" 
                             onClick={() => handleVendedorClick(cuenta.dueno)}
                           >
                             {cuenta.dueno}
                           </span>
                         </TableCell>
                         <TableCell>
                           {cuenta.clabe_stp ? (
                             <Badge variant="outline">{cuenta.clabe_stp}</Badge>
                           ) : (
                             <span className="text-muted-foreground">Sin CLABE</span>
                           )}
                         </TableCell>
                         <TableCell>{cuenta.proyecto}</TableCell>
                         <TableCell>{cuenta.edificio}</TableCell>
                          <TableCell>
                            <span 
                              className="cursor-pointer hover:text-primary hover:underline font-medium" 
                              onClick={() => handlePropertyClick(cuenta.clabe_stp || cuenta.numero_propiedad)}
                            >
                              {cuenta.numero_propiedad}
                            </span>
                          </TableCell>
                         <TableCell>{cuenta.modelo}</TableCell>
                         <TableCell className="font-semibold text-green-600">
                           <div className="flex items-center justify-end gap-2">
                             <span>{formatCurrency(Number(cuenta.precio_final))}</span>
                             {cuenta.precio_lista && cuenta.precio_final > cuenta.precio_lista ? (
                               <TooltipProvider>
                                 <Tooltip>
                                   <TooltipTrigger>
                                     <TrendingUp className="h-4 w-4 text-orange-600" />
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Precio final mayor a precio de lista</p>
                                   </TooltipContent>
                                 </Tooltip>
                               </TooltipProvider>
                             ) : cuenta.precio_lista && cuenta.precio_final < cuenta.precio_lista ? (
                               <TooltipProvider>
                                 <Tooltip>
                                   <TooltipTrigger>
                                     <TrendingDown className="h-4 w-4 text-green-600" />
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Precio final menor a precio de lista</p>
                                   </TooltipContent>
                                 </Tooltip>
                               </TooltipProvider>
                             ) : cuenta.precio_lista && cuenta.precio_final === cuenta.precio_lista ? (
                               <TooltipProvider>
                                 <Tooltip>
                                   <TooltipTrigger>
                                     <Equal className="h-4 w-4 text-blue-600" />
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Precio final igual a precio de lista</p>
                                   </TooltipContent>
                                 </Tooltip>
                               </TooltipProvider>
                             ) : null}
                           </div>
                         </TableCell>
                        <TableCell className="font-semibold text-blue-600">
                          {formatCurrency(cuenta.pagado)}
                        </TableCell>
                         <TableCell className="font-semibold text-orange-600">
                           {formatCurrency(cuenta.restante)}
                         </TableCell>
                         <TableCell>
                           {cuenta.tipo === 'Propiedad' ? (
                             <TooltipProvider>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <Link to={`/admin/cuentas-cobranza/${cuenta.id}/detalle`}>
                                     <Button variant="ghost" size="icon">
                                       <DollarSign className={`h-4 w-4 ${
                                         cuenta.cash_percentage >= 85 ? 'text-red-600' :
                                         cuenta.cash_percentage >= 75 ? 'text-yellow-600' :
                                         'text-green-600'
                                       }`} />
                                     </Button>
                                   </Link>
                                 </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Límite: {formatCurrency(cuenta.cash_limit || 0)}</p>
                                    <p>Pagado: {formatCurrency(cuenta.cash_paid || 0)}</p>
                                    <p>Aún permitido: {formatCurrency(cuenta.cash_remaining || 0)}</p>
                                  </TooltipContent>
                               </Tooltip>
                             </TooltipProvider>
                           ) : (
                             <span className="text-muted-foreground text-xs">N/A</span>
                           )}
                         </TableCell>
                         <TableCell>
                           {cuenta.tipo === 'Propiedad' ? (
                             <TooltipProvider>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <Link to={`/admin/cuentas-cobranza/${cuenta.id}/detalle`}>
                                     <Button variant="ghost" size="icon">
                                       <DollarSign className="h-4 w-4 text-muted-foreground" />
                                     </Button>
                                   </Link>
                                 </TooltipTrigger>
                                 <TooltipContent>
                                   <p>Ver detalle de pagos en efectivo</p>
                                 </TooltipContent>
                               </Tooltip>
                             </TooltipProvider>
                           ) : (
                             <span className="text-muted-foreground text-xs">N/A</span>
                           )}
                         </TableCell>
                           <TableCell>
                            <TooltipProvider>
                              <div className="flex gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="outline" size="icon" asChild>
                                      <Link to={`/admin/cuentas-cobranza/${cuenta.id}/detalle`}>
                                        <Eye className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Ver Detalle</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="secondary" 
                                      size="icon"
                                      onClick={() => handleEditCuenta(cuenta)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Editar Cuenta</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="outline" 
                                      size="icon"
                                      onClick={() => handleAddManualPayment(cuenta)}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Agregar Pago Manual</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="outline" 
                                      size="icon"
                                      onClick={() => handleDownloadOffer(cuenta)}
                                      disabled={loadingDownload === cuenta.id}
                                    >
                                      {loadingDownload === cuenta.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Download className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Descargar Oferta</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                     <Button 
                                      variant="destructive" 
                                      size="icon"
                                      onClick={() => handleCancelCuenta(cuenta)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Cancelar Cuenta</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
                          </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="canceladas" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por ID, compradores, dueño, CLABE, proyecto, edificio, propiedad o modelo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Tipo ({selectedTipos.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 bg-background z-50" align="end">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Filtrar por Tipo</h4>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="tipo-propiedad-canceladas"
                            checked={selectedTipos.includes('Propiedad')}
                            onCheckedChange={() => handleTipoToggle('Propiedad')}
                          />
                          <Label htmlFor="tipo-propiedad-canceladas" className="cursor-pointer">
                            Propiedad
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="tipo-producto-canceladas"
                            checked={selectedTipos.includes('Producto')}
                            onCheckedChange={() => handleTipoToggle('Producto')}
                          />
                          <Label htmlFor="tipo-producto-canceladas" className="cursor-pointer">
                            Producto
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="tipo-servicio-canceladas"
                            checked={selectedTipos.includes('Servicio')}
                            onCheckedChange={() => handleTipoToggle('Servicio')}
                          />
                          <Label htmlFor="tipo-servicio-canceladas" className="cursor-pointer">
                            Servicio
                          </Label>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Cargando cuentas de cobranza...</div>
              ) : filteredCuentas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? "No se encontraron cuentas canceladas que coincidan con la búsqueda" : "No hay cuentas de cobranza canceladas"}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID Cuenta</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Nombre de producto</TableHead>
                      <TableHead>Compradores</TableHead>
                      <TableHead>Dueño</TableHead>
                      <TableHead>CLABE</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Edificio</TableHead>
                      <TableHead>No. Propiedad</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Precio Final</TableHead>
                      <TableHead>Pagado</TableHead>
                      <TableHead>Restante</TableHead>
                      <TableHead>Pagos en Efectivo</TableHead>
                      <TableHead>Motivo Cancelación</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCuentas.map((cuenta) => (
                      <TableRow 
                        key={cuenta.id}
                      >
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            <span>{formatCuentaCobranzaId(cuenta.id, cuenta.tipo)}</span>
                            {!cuenta.tiene_acuerdos ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 h-6 w-6 p-0 flex items-center justify-center">
                                      <AlertCircle className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-semibold">⚠️ Plan de pagos no seleccionado</p>
                                    <p className="text-sm">La cuenta de cobranza fue generada pero falta seleccionar el esquema de pago para generar los acuerdos</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : !cuenta.apartado_pagado ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 h-6 w-6 p-0 flex items-center justify-center">
                                      <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-semibold">⚠️ Pago inicial pendiente</p>
                                    <p className="text-sm">Esta cuenta fue generada pero aún no ha recibido el pago inicial completo</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={cuenta.tipo === 'Propiedad' ? 'default' : cuenta.tipo === 'Producto' ? 'secondary' : 'outline'}>
                            {cuenta.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {cuenta.producto_nombre ? (
                            <span className="text-sm">{cuenta.producto_nombre}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">N/A</span>
                          )}
                        </TableCell>
                         <TableCell>
                           {cuenta.compradores.length > 0 ? (
                             cuenta.compradores.length > 1 ? (
                               <CompradoresDetailDialog compradores={cuenta.compradores} />
                             ) : (
                               <div className="space-y-1">
                                  <Badge 
                                    variant="secondary" 
                                    className="block w-fit cursor-pointer hover:bg-secondary/80"
                                    onClick={() => handleCompradorClick(cuenta.compradores[0].rfc || cuenta.compradores[0].nombre_legal)}
                                  >
                                   {cuenta.compradores[0].nombre_legal}
                                 </Badge>
                                  <div className="text-xs text-muted-foreground">
                                    {cuenta.compradores[0].rfc && `RFC: ${cuenta.compradores[0].rfc}`}
                                    <br />
                                    {cuenta.compradores[0].porcentaje_copropiedad.toFixed(2)}% propiedad
                                  </div>
                               </div>
                             )
                           ) : (
                             <span className="text-muted-foreground">Sin compradores</span>
                           )}
                         </TableCell>
                         <TableCell>
                           <span 
                             className="cursor-pointer hover:text-primary hover:underline" 
                             onClick={() => handleVendedorClick(cuenta.dueno)}
                           >
                             {cuenta.dueno}
                           </span>
                         </TableCell>
                         <TableCell>
                           {cuenta.clabe_stp ? (
                             <Badge variant="outline">{cuenta.clabe_stp}</Badge>
                           ) : (
                             <span className="text-muted-foreground">Sin CLABE</span>
                           )}
                         </TableCell>
                         <TableCell>{cuenta.proyecto}</TableCell>
                         <TableCell>{cuenta.edificio}</TableCell>
                          <TableCell>
                            <span 
                              className="cursor-pointer hover:text-primary hover:underline font-medium" 
                              onClick={() => handlePropertyClick(cuenta.clabe_stp || cuenta.numero_propiedad)}
                            >
                              {cuenta.numero_propiedad}
                            </span>
                          </TableCell>
                         <TableCell>{cuenta.modelo}</TableCell>
                         <TableCell className="font-semibold text-green-600">
                           <div className="flex items-center justify-end gap-2">
                             <span>{formatCurrency(Number(cuenta.precio_final))}</span>
                             {cuenta.precio_lista && cuenta.precio_final > cuenta.precio_lista ? (
                               <TooltipProvider>
                                 <Tooltip>
                                   <TooltipTrigger>
                                     <TrendingUp className="h-4 w-4 text-orange-600" />
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Precio final mayor a precio de lista</p>
                                   </TooltipContent>
                                 </Tooltip>
                               </TooltipProvider>
                             ) : cuenta.precio_lista && cuenta.precio_final < cuenta.precio_lista ? (
                               <TooltipProvider>
                                 <Tooltip>
                                   <TooltipTrigger>
                                     <TrendingDown className="h-4 w-4 text-green-600" />
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Precio final menor a precio de lista</p>
                                   </TooltipContent>
                                 </Tooltip>
                               </TooltipProvider>
                             ) : cuenta.precio_lista && cuenta.precio_final === cuenta.precio_lista ? (
                               <TooltipProvider>
                                 <Tooltip>
                                   <TooltipTrigger>
                                     <Equal className="h-4 w-4 text-blue-600" />
                                   </TooltipTrigger>
                                   <TooltipContent>
                                     <p>Precio final igual a precio de lista</p>
                                   </TooltipContent>
                                 </Tooltip>
                               </TooltipProvider>
                             ) : null}
                           </div>
                         </TableCell>
                        <TableCell className="font-semibold text-blue-600">
                          {formatCurrency(cuenta.pagado)}
                        </TableCell>
                         <TableCell className="font-semibold text-orange-600">
                           {formatCurrency(cuenta.restante)}
                         </TableCell>
                         <TableCell>
                           {cuenta.tipo === 'Propiedad' ? (
                             <TooltipProvider>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <Link to={`/admin/cuentas-cobranza/${cuenta.id}/detalle`}>
                                     <Button variant="ghost" size="icon">
                                       <DollarSign className={`h-4 w-4 ${
                                         cuenta.cash_percentage >= 85 ? 'text-red-600' :
                                         cuenta.cash_percentage >= 75 ? 'text-yellow-600' :
                                         'text-green-600'
                                       }`} />
                                     </Button>
                                   </Link>
                                 </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Límite: {formatCurrency(cuenta.cash_limit || 0)}</p>
                                    <p>Pagado: {formatCurrency(cuenta.cash_paid || 0)}</p>
                                    <p>Aún permitido: {formatCurrency(cuenta.cash_remaining || 0)}</p>
                                  </TooltipContent>
                               </Tooltip>
                             </TooltipProvider>
                           ) : (
                             <span className="text-muted-foreground text-xs">N/A</span>
                           )}
                         </TableCell>
                         <TableCell>
                           {cuenta.tipo === 'Propiedad' ? (
                             <TooltipProvider>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <Link to={`/admin/cuentas-cobranza/${cuenta.id}/detalle`}>
                                     <Button variant="ghost" size="icon">
                                       <DollarSign className="h-4 w-4 text-muted-foreground" />
                                     </Button>
                                   </Link>
                                 </TooltipTrigger>
                                 <TooltipContent>
                                   <p>Ver detalle de pagos en efectivo</p>
                                 </TooltipContent>
                               </Tooltip>
                             </TooltipProvider>
                           ) : (
                             <span className="text-muted-foreground text-xs">N/A</span>
                           )}
                         </TableCell>
                         <TableCell>
                          <Badge variant={cuenta.motivo_cancelacion === "Cesión de derechos" ? "secondary" : "destructive"}>
                            {cuenta.motivo_cancelacion || "Sin especificar"}
                          </Badge>
                        </TableCell>
                         <TableCell>
                           <TooltipProvider>
                             <div className="flex gap-2">
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <Button variant="outline" size="icon" asChild>
                                     <Link to={`/admin/cuentas-cobranza/${cuenta.id}/detalle`}>
                                       <Eye className="h-4 w-4" />
                                     </Link>
                                   </Button>
                                 </TooltipTrigger>
                                 <TooltipContent>
                                   <p>Ver Detalle</p>
                                 </TooltipContent>
                               </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="outline" 
                                      size="icon"
                                      onClick={() => handleDownloadOffer(cuenta)}
                                      disabled={loadingDownload === cuenta.id}
                                    >
                                      {loadingDownload === cuenta.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Download className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Descargar Oferta</p>
                                  </TooltipContent>
                                </Tooltip>
                             </div>
                           </TooltipProvider>
                         </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {cancelDialog.isOpen && cancelDialog.cuenta && (
        <CancelCuentaDialog
          isOpen={cancelDialog.isOpen}
          onClose={() => setCancelDialog({ isOpen: false, cuenta: null })}
          cuentaId={cancelDialog.cuenta.id}
          precioFinal={cancelDialog.cuenta.precio_final}
          totalPagado={cancelDialog.cuenta.pagado}
          idOferta={cancelDialog.cuenta.id_oferta}
          clabeStpOriginal={cancelDialog.cuenta.clabe_stp}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["cuentas_cobranza"] });
            setCancelDialog({ isOpen: false, cuenta: null });
          }}
        />
      )}

      {editDialog.isOpen && editDialog.cuenta && (
        <EditCuentaCobranzaDialog
          cuenta={editDialog.cuenta}
          onClose={() => setEditDialog({ isOpen: false, cuenta: null })}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["cuentas_cobranza"] });
            setEditDialog({ isOpen: false, cuenta: null });
          }}
        />
      )}

      {paymentDialog.cuenta && (
        <AddManualPaymentDialog
          isOpen={paymentDialog.isOpen}
          cuentaCobranzaId={paymentDialog.cuenta.id}
          cuentaCobranzaLabel={formatCuentaCobranzaId(paymentDialog.cuenta.id, paymentDialog.cuenta.tipo)}
          onClose={() => setPaymentDialog({ isOpen: false, cuenta: null })}
          tipoCuenta={paymentDialog.cuenta.tipo}
        />
      )}
    </div>
  );
}