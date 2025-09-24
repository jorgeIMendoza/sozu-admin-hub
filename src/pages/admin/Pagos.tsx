import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, CreditCard, Eye, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { useToast } from "@/hooks/use-toast";

interface CuentaCobranza {
  id: number;
  clabe_stp: string | null;
  precio_final: number;
  compradores: string[];
  dueno: string;
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
  activo: boolean;
}

export default function Pagos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activas");
  const [cancelDialog, setCancelDialog] = useState<{ isOpen: boolean; cuenta: CuentaCobranza | null }>({
    isOpen: false,
    cuenta: null
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cuentasCobranza, isLoading } = useQuery({
    queryKey: ["cuentas_cobranza"],
    queryFn: async () => {
      // Get basic cuenta cobranza data
      const { data: cuentas, error: cuentasError } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          clabe_stp,
          precio_final,
          id_oferta,
          activo
        `);

      if (cuentasError) {
        console.error('Error fetching cuentas:', cuentasError);
        return [];
      }

      if (!cuentas || cuentas.length === 0) return [];

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
      const cuentaIds = cuentas.map(c => c.id);
      const { data: compradores } = await supabase
        .from('compradores')
        .select(`
          id_cuenta_cobranza,
          personas!compradores_id_persona_fkey(nombre_legal)
        `)
        .in('id_cuenta_cobranza', cuentaIds);

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

        return {
          id: cuenta.id,
          clabe_stp: cuenta.clabe_stp,
          precio_final: cuenta.precio_final || 0,
          compradores: cuentaCompradores.map(c => c.personas?.nombre_legal).filter(Boolean),
          dueno: entidad?.personas?.nombre_legal || 'Sin dueño',
          proyecto: entidad?.proyectos?.nombre || 'Sin proyecto',
          edificio: edificioModelo?.edificios?.nombre || 'Sin edificio',
          numero_propiedad: propiedad?.numero_propiedad || 'Sin número',
          modelo: edificioModelo?.modelos?.nombre || 'Sin modelo',
          activo: cuenta.activo
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
    cuenta.compradores.some(c => c.toLowerCase().includes(searchTerm.toLowerCase())) ||
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

  // Mutation to cancel a cuenta de cobranza
  const cancelCuentaMutation = useMutation({
    mutationFn: async (cuentaId: number) => {
      const { error } = await supabase
        .from('cuentas_cobranza')
        .update({ activo: false })
        .eq('id', cuentaId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Cuenta cancelada",
        description: "La cuenta de cobranza ha sido cancelada exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["cuentas_cobranza"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo cancelar la cuenta de cobranza",
        variant: "destructive",
      });
    },
  });

  const handleCancelCuenta = (cuenta: CuentaCobranza) => {
    setCancelDialog({ isOpen: true, cuenta });
  };

  const confirmCancel = () => {
    if (cancelDialog.cuenta) {
      cancelCuentaMutation.mutate(cancelDialog.cuenta.id);
    }
    setCancelDialog({ isOpen: false, cuenta: null });
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
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCuentas.map((cuenta) => (
                      <TableRow key={cuenta.id}>
                        <TableCell className="font-semibold">CC-{String(cuenta.id).padStart(6, '0')}</TableCell>
                        <TableCell>
                          {cuenta.compradores.length > 0 ? (
                            <div className="space-y-1">
                              {cuenta.compradores.map((comprador, index) => (
                                <Badge key={index} variant="secondary" className="block w-fit">
                                  {comprador}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Sin compradores</span>
                          )}
                        </TableCell>
                        <TableCell>{cuenta.dueno}</TableCell>
                        <TableCell>
                          {cuenta.clabe_stp ? (
                            <Badge variant="outline">{cuenta.clabe_stp}</Badge>
                          ) : (
                            <span className="text-muted-foreground">Sin CLABE</span>
                          )}
                        </TableCell>
                        <TableCell>{cuenta.proyecto}</TableCell>
                        <TableCell>{cuenta.edificio}</TableCell>
                        <TableCell>{cuenta.numero_propiedad}</TableCell>
                        <TableCell>{cuenta.modelo}</TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrency(Number(cuenta.precio_final))}
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
                                    variant="destructive" 
                                    size="icon"
                                    onClick={() => handleCancelCuenta(cuenta)}
                                    disabled={cancelCuentaMutation.isPending}
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
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCuentas.map((cuenta) => (
                      <TableRow key={cuenta.id}>
                        <TableCell className="font-semibold">CC-{String(cuenta.id).padStart(6, '0')}</TableCell>
                        <TableCell>
                          {cuenta.compradores.length > 0 ? (
                            <div className="space-y-1">
                              {cuenta.compradores.map((comprador, index) => (
                                <Badge key={index} variant="secondary" className="block w-fit">
                                  {comprador}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Sin compradores</span>
                          )}
                        </TableCell>
                        <TableCell>{cuenta.dueno}</TableCell>
                        <TableCell>
                          {cuenta.clabe_stp ? (
                            <Badge variant="outline">{cuenta.clabe_stp}</Badge>
                          ) : (
                            <span className="text-muted-foreground">Sin CLABE</span>
                          )}
                        </TableCell>
                        <TableCell>{cuenta.proyecto}</TableCell>
                        <TableCell>{cuenta.edificio}</TableCell>
                        <TableCell>{cuenta.numero_propiedad}</TableCell>
                        <TableCell>{cuenta.modelo}</TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrency(Number(cuenta.precio_final))}
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
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

      <DeleteConfirmationDialog
        open={cancelDialog.isOpen}
        onOpenChange={(open) => setCancelDialog({ isOpen: open, cuenta: null })}
        onConfirm={confirmCancel}
        title="Cancelar Cuenta de Cobranza"
        description={`¿Estás seguro de que deseas cancelar la cuenta de cobranza #${cancelDialog.cuenta?.id}? Esta acción marcará la cuenta como inactiva.`}
        isLoading={cancelCuentaMutation.isPending}
        actionType="delete"
      />
    </div>
  );
}