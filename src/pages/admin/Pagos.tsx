import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, CreditCard, Eye, X, Edit, Plus, Download, Loader2 } from "lucide-react";
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

interface Comprador {
  nombre_legal: string;
  rfc: string | null;
  porcentaje_copropiedad: number;
}

interface CuentaCobranza {
  id: number;
  clabe_stp: string | null;
  precio_final: number;
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
}

export default function Pagos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activas");
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

      // Get offer IDs to fetch related data
      const ofertaIds = cuentas.map(c => c.id_oferta);

      // Get ofertas with properties
      const { data: ofertas, error: ofertasError } = await supabase
        .from('ofertas')
        .select(`
          id,
          id_propiedad,
          propiedades!ofertas_id_propiedad_fkey(
            id,
            numero_propiedad,
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
          personas!compradores_id_persona_fkey(nombre_legal, rfc)
        `)
        .in('id_cuenta_cobranza', cuentas.map(c => c.id));

      // Get entidades relacionadas, proyectos, edificios, modelos
      const entidadIds = ofertas?.map(o => o.propiedades?.id_entidad_relacionada_dueno).filter(Boolean) || [];
      const edificioModeloIds = ofertas?.map(o => o.propiedades?.id_edificio_modelo).filter(Boolean) || [];

      const [entidadesResult, edificiosModelosResult] = await Promise.all([
        supabase
          .from('entidades_relacionadas')
          .select(`
            id,
            personas!fk_entrel_persona(nombre_legal),
            proyectos!entidades_relacionadas_id_proyecto_fkey(nombre)
          `)
          .in('id', entidadIds),
        supabase
          .from('edificios_modelos')
          .select(`
            id,
            edificios!edificios_modelos_id_edificio_fkey(nombre),
            modelos!edificios_modelos_id_modelo_fkey(nombre)
          `)
          .in('id', edificioModeloIds)
      ]);

      // Transform the data
      const transformedData: CuentaCobranza[] = cuentas.map(cuenta => {
        const oferta = ofertas?.find(o => o.id === cuenta.id_oferta);
        const propiedad = oferta?.propiedades;
        const entidad = entidadesResult.data?.find(e => e.id === propiedad?.id_entidad_relacionada_dueno);
        const edificioModelo = edificiosModelosResult.data?.find(em => em.id === propiedad?.id_edificio_modelo);
        const cuentaCompradores = compradores?.filter(c => c.id_cuenta_cobranza === cuenta.id) || [];

        const pagado = pagadoPorCuenta[cuenta.id] || 0;
        const precio_final = cuenta.precio_final || 0;
        const restante = precio_final - pagado;

        return {
          id: cuenta.id,
          clabe_stp: cuenta.clabe_stp,
          precio_final,
          pagado,
          restante,
          compradores: cuentaCompradores.map(c => ({
            nombre_legal: c.personas?.nombre_legal || '',
            rfc: c.personas?.rfc || null,
            porcentaje_copropiedad: c.porcentaje_copropiedad || 0
          })).filter(c => c.nombre_legal),
          dueno: entidad?.personas?.nombre_legal || 'Sin dueño',
          proyecto: entidad?.proyectos?.nombre || 'Sin proyecto',
          edificio: edificioModelo?.edificios?.nombre || 'Sin edificio',
          numero_propiedad: propiedad?.numero_propiedad || 'Sin número',
          modelo: edificioModelo?.modelos?.nombre || 'Sin modelo',
          activo: cuenta.activo,
          id_oferta: cuenta.id_oferta,
          motivo_cancelacion: (cuenta as any).tipos_cancelacion?.nombre || null
        };
      });

      return transformedData.sort((a, b) => b.id - a.id);
    },
  });

  // Filter by active status and search term
  const cuentasActivas = cuentasCobranza?.filter(cuenta => cuenta.activo) || [];
  const cuentasCanceladas = cuentasCobranza?.filter(cuenta => !cuenta.activo) || [];
  
  const currentCuentas = activeTab === "activas" ? cuentasActivas : cuentasCanceladas;
  
  const filteredCuentas = currentCuentas.filter(cuenta =>
    cuenta.id.toString().includes(searchTerm) ||
    cuenta.compradores.some(c => c.nombre_legal.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.rfc?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    cuenta.dueno.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.clabe_stp?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.proyecto.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.edificio.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.numero_propiedad.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.precio_final.toString().includes(searchTerm)
  );

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
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por ID, compradores, dueño, CLABE, proyecto, edificio, propiedad o modelo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
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
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCuentas.map((cuenta) => (
                      <TableRow key={cuenta.id}>
                        <TableCell className="font-semibold">CC-{String(cuenta.id).padStart(6, '0')}</TableCell>
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
                          {formatCurrency(Number(cuenta.precio_final))}
                        </TableCell>
                        <TableCell className="font-semibold text-blue-600">
                          {formatCurrency(cuenta.pagado)}
                        </TableCell>
                        <TableCell className="font-semibold text-orange-600">
                          {formatCurrency(cuenta.restante)}
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
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por ID, compradores, dueño, CLABE, proyecto, edificio, propiedad o modelo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
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
                      <TableHead>Motivo Cancelación</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCuentas.map((cuenta) => (
                      <TableRow key={cuenta.id}>
                        <TableCell className="font-semibold">CC-{String(cuenta.id).padStart(6, '0')}</TableCell>
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
                          {formatCurrency(Number(cuenta.precio_final))}
                        </TableCell>
                        <TableCell className="font-semibold text-blue-600">
                          {formatCurrency(cuenta.pagado)}
                        </TableCell>
                        <TableCell className="font-semibold text-orange-600">
                          {formatCurrency(cuenta.restante)}
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
          cuentaCobranzaLabel={`CC-${String(paymentDialog.cuenta.id).padStart(6, '0')}`}
          onClose={() => setPaymentDialog({ isOpen: false, cuenta: null })}
        />
      )}
    </div>
  );
}