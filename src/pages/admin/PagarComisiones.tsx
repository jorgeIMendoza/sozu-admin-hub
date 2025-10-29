import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Upload, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function PagarComisiones() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filtroGeneral, setFiltroGeneral] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [selectedComisionista, setSelectedComisionista] = useState<{ email: string; idCuenta: number } | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  const toggleItem = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const pagarComisionMutation = useMutation({
    mutationFn: async ({ email, idCuenta, file }: { email: string; idCuenta: number; file: File }) => {
      // Subir archivo a storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${email}_${idCuenta}_${Date.now()}.${fileExt}`;
      const filePath = `evidencias-pago-comision/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      // Actualizar comisionista
      const { error: updateError } = await supabase
        .from("comisionistas")
        .update({ 
          pagada: true,
          url_evidencia_pago: publicUrl
        })
        .eq("email_usuario", email)
        .eq("id_cuenta_cobranza", idCuenta)
        .eq("activo", true);
      
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pagar-comisiones"] });
      toast({
        title: "Comisión pagada",
        description: "La comisión ha sido marcada como pagada exitosamente"
      });
      setUploadDialogOpen(false);
      setEvidenciaFile(null);
      setSelectedComisionista(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al procesar el pago",
        variant: "destructive"
      });
      console.error("Error al pagar comisión:", error);
    }
  });

  const { data: comisionistasAgrupados, isLoading: loadingComisionistas } = useQuery({
    queryKey: ["pagar-comisiones", "por-comisionista"],
    queryFn: async () => {
      const { data: comisionistas, error } = await supabase
        .from("comisionistas")
        .select(`
          email_usuario,
          porcentaje_comision,
          pagada,
          url_evidencia_pago,
          aprobada,
          id_cuenta_cobranza,
          cuentas_cobranza!comisionistas_id_cuenta_cobranza_fkey(
            id,
            precio_final,
            ofertas!fk_cuentas_cobranza_oferta!inner(
              id_propiedad,
              id_producto,
              propiedades(
                numero,
                edificios(
                  nombre,
                  proyectos(nombre)
                ),
                modelos(nombre)
              ),
              productos(
                id,
                categorias_producto(nombre)
              )
            )
          )
        `)
        .eq("activo", true)
        .eq("aprobada", true)
        .order("email_usuario");

      if (error) throw error;

      // Agrupar por comisionista
      const grouped = comisionistas.reduce((acc: any, com: any) => {
        if (!acc[com.email_usuario]) {
          acc[com.email_usuario] = {
            email: com.email_usuario,
            montoTotal: 0,
            cuentas: []
          };
        }

        const cuenta = com.cuentas_cobranza;
        const oferta = cuenta.ofertas;
        const propiedad = oferta?.propiedades;
        const producto = oferta?.productos;
        const montoComision = (cuenta.precio_final * com.porcentaje_comision) / 100;

        acc[com.email_usuario].montoTotal += montoComision;
        acc[com.email_usuario].cuentas.push({
          idCuenta: cuenta.id,
          numeroCuenta: formatCuentaCobranzaId(cuenta.id),
          tipo: producto ? producto.categorias_producto?.nombre : 'Propiedad',
          proyecto: propiedad?.edificios?.proyectos?.nombre || 'N/A',
          edificio: propiedad?.edificios?.nombre || 'N/A',
          modelo: propiedad?.modelos?.nombre || 'N/A',
          numeroDepartamento: propiedad?.numero || 'N/A',
          precioFinal: cuenta.precio_final,
          porcentajeComision: com.porcentaje_comision,
          montoComision,
          pagada: com.pagada,
          urlEvidencia: com.url_evidencia_pago
        });

        return acc;
      }, {});

      return Object.values(grouped);
    }
  });

  const { data: cuentasAgrupadas, isLoading: loadingCuentas } = useQuery({
    queryKey: ["pagar-comisiones", "por-cuenta"],
    queryFn: async () => {
      const { data: comisionistas, error } = await supabase
        .from("comisionistas")
        .select(`
          email_usuario,
          porcentaje_comision,
          pagada,
          url_evidencia_pago,
          aprobada,
          id_cuenta_cobranza,
          cuentas_cobranza!comisionistas_id_cuenta_cobranza_fkey(
            id,
            precio_final,
            ofertas!fk_cuentas_cobranza_oferta!inner(
              id_propiedad,
              id_producto,
              propiedades(
                numero,
                edificios(
                  nombre,
                  proyectos(nombre)
                ),
                modelos(nombre)
              ),
              productos(
                id,
                categorias_producto(nombre)
              )
            )
          )
        `)
        .eq("activo", true)
        .eq("aprobada", true)
        .order("id_cuenta_cobranza");

      if (error) throw error;

      // Agrupar por cuenta
      const grouped = comisionistas.reduce((acc: any, com: any) => {
        const cuentaId = com.id_cuenta_cobranza;
        if (!acc[cuentaId]) {
          const cuenta = com.cuentas_cobranza;
          const oferta = cuenta.ofertas;
          const propiedad = oferta?.propiedades;
          const producto = oferta?.productos;

          acc[cuentaId] = {
            idCuenta: cuenta.id,
            numeroCuenta: formatCuentaCobranzaId(cuenta.id),
            tipo: producto ? producto.categorias_producto?.nombre : 'Propiedad',
            proyecto: propiedad?.edificios?.proyectos?.nombre || 'N/A',
            edificio: propiedad?.edificios?.nombre || 'N/A',
            modelo: propiedad?.modelos?.nombre || 'N/A',
            numeroDepartamento: propiedad?.numero || 'N/A',
            precioFinal: cuenta.precio_final,
            comisionistas: []
          };
        }

        const montoComision = (com.cuentas_cobranza.precio_final * com.porcentaje_comision) / 100;

        acc[cuentaId].comisionistas.push({
          email: com.email_usuario,
          porcentajeComision: com.porcentaje_comision,
          montoComision,
          pagada: com.pagada,
          urlEvidencia: com.url_evidencia_pago
        });

        return acc;
      }, {});

      return Object.values(grouped);
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setEvidenciaFile(e.target.files[0]);
    }
  };

  const handlePagar = () => {
    if (!selectedComisionista || !evidenciaFile) {
      toast({
        title: "Error",
        description: "Debe seleccionar un archivo de evidencia",
        variant: "destructive"
      });
      return;
    }

    pagarComisionMutation.mutate({
      email: selectedComisionista.email,
      idCuenta: selectedComisionista.idCuenta,
      file: evidenciaFile
    });
  };

  const openPagarDialog = (email: string, idCuenta: number) => {
    setSelectedComisionista({ email, idCuenta });
    setUploadDialogOpen(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value);
  };

  const comisionistasFiltrados = comisionistasAgrupados?.filter((com: any) =>
    com.email.toLowerCase().includes(filtroGeneral.toLowerCase())
  );

  const cuentasFiltradas = cuentasAgrupadas?.filter((cuenta: any) =>
    cuenta.numeroCuenta.toLowerCase().includes(filtroGeneral.toLowerCase()) ||
    cuenta.proyecto.toLowerCase().includes(filtroGeneral.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Pagar Comisiones</h1>
          <p className="text-muted-foreground">Gestión de pagos de comisiones aprobadas</p>
        </div>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Buscar..."
          value={filtroGeneral}
          onChange={(e) => setFiltroGeneral(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Tabs defaultValue="por-comisionista" className="space-y-4">
        <TabsList>
          <TabsTrigger value="por-comisionista">Agrupada por Comisionista</TabsTrigger>
          <TabsTrigger value="por-cuenta">Agrupada por Cuenta de Cobranza</TabsTrigger>
        </TabsList>

        <TabsContent value="por-comisionista" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Comisiones por Comisionista</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingComisionistas ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Comisionista</TableHead>
                      <TableHead className="text-right">Monto Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comisionistasFiltrados?.map((com: any) => (
                      <>
                        <TableRow 
                          key={com.email}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleItem(com.email)}
                        >
                          <TableCell>
                            {expandedItems.has(com.email) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{com.email}</TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(com.montoTotal)}
                          </TableCell>
                        </TableRow>
                        {expandedItems.has(com.email) && (
                          <TableRow>
                            <TableCell colSpan={3} className="bg-muted/30 p-0">
                              <div className="p-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Cuenta</TableHead>
                                      <TableHead>Tipo</TableHead>
                                      <TableHead>Proyecto</TableHead>
                                      <TableHead>Edificio</TableHead>
                                      <TableHead>Modelo</TableHead>
                                      <TableHead>Depto</TableHead>
                                      <TableHead className="text-right">Precio Final</TableHead>
                                      <TableHead className="text-right">Comisión</TableHead>
                                      <TableHead>Estatus</TableHead>
                                      <TableHead>Acciones</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {com.cuentas.map((cuenta: any) => (
                                      <TableRow key={cuenta.idCuenta}>
                                        <TableCell>{cuenta.numeroCuenta}</TableCell>
                                        <TableCell>{cuenta.tipo}</TableCell>
                                        <TableCell>{cuenta.proyecto}</TableCell>
                                        <TableCell>{cuenta.edificio}</TableCell>
                                        <TableCell>{cuenta.modelo}</TableCell>
                                        <TableCell>{cuenta.numeroDepartamento}</TableCell>
                                        <TableCell className="text-right">
                                          {formatCurrency(cuenta.precioFinal)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {formatCurrency(cuenta.montoComision)}
                                          <span className="text-muted-foreground text-xs ml-1">
                                            ({cuenta.porcentajeComision}%)
                                          </span>
                                        </TableCell>
                                        <TableCell>
                                          {cuenta.pagada ? (
                                            <Badge variant="default">Pagada</Badge>
                                          ) : (
                                            <Badge variant="secondary">Pendiente</Badge>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex gap-2">
                                            {!cuenta.pagada ? (
                                              <Button
                                                size="sm"
                                                onClick={() => openPagarDialog(com.email, cuenta.idCuenta)}
                                              >
                                                <Upload className="h-4 w-4 mr-1" />
                                                Pagar
                                              </Button>
                                            ) : cuenta.urlEvidencia ? (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => window.open(cuenta.urlEvidencia, '_blank')}
                                              >
                                                <Eye className="h-4 w-4 mr-1" />
                                                Ver Evidencia
                                              </Button>
                                            ) : null}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="por-cuenta" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Comisiones por Cuenta de Cobranza</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCuentas ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Edificio</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Depto</TableHead>
                      <TableHead className="text-right">Precio Final</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cuentasFiltradas?.map((cuenta: any) => (
                      <>
                        <TableRow 
                          key={cuenta.idCuenta}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleItem(`cuenta-${cuenta.idCuenta}`)}
                        >
                          <TableCell>
                            {expandedItems.has(`cuenta-${cuenta.idCuenta}`) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{cuenta.numeroCuenta}</TableCell>
                          <TableCell>{cuenta.tipo}</TableCell>
                          <TableCell>{cuenta.proyecto}</TableCell>
                          <TableCell>{cuenta.edificio}</TableCell>
                          <TableCell>{cuenta.modelo}</TableCell>
                          <TableCell>{cuenta.numeroDepartamento}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(cuenta.precioFinal)}
                          </TableCell>
                        </TableRow>
                        {expandedItems.has(`cuenta-${cuenta.idCuenta}`) && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/30 p-0">
                              <div className="p-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Comisionista</TableHead>
                                      <TableHead className="text-right">Comisión</TableHead>
                                      <TableHead>Estatus</TableHead>
                                      <TableHead>Acciones</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {cuenta.comisionistas.map((com: any) => (
                                      <TableRow key={`${cuenta.idCuenta}-${com.email}`}>
                                        <TableCell>{com.email}</TableCell>
                                        <TableCell className="text-right">
                                          {formatCurrency(com.montoComision)}
                                          <span className="text-muted-foreground text-xs ml-1">
                                            ({com.porcentajeComision}%)
                                          </span>
                                        </TableCell>
                                        <TableCell>
                                          {com.pagada ? (
                                            <Badge variant="default">Pagada</Badge>
                                          ) : (
                                            <Badge variant="secondary">Pendiente</Badge>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex gap-2">
                                            {!com.pagada ? (
                                              <Button
                                                size="sm"
                                                onClick={() => openPagarDialog(com.email, cuenta.idCuenta)}
                                              >
                                                <Upload className="h-4 w-4 mr-1" />
                                                Pagar
                                              </Button>
                                            ) : com.urlEvidencia ? (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => window.open(com.urlEvidencia, '_blank')}
                                              >
                                                <Eye className="h-4 w-4 mr-1" />
                                                Ver Evidencia
                                              </Button>
                                            ) : null}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir Evidencia de Pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Archivo de evidencia</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="mt-2"
              />
              {evidenciaFile && (
                <p className="text-sm text-muted-foreground mt-2">
                  Archivo seleccionado: {evidenciaFile.name}
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setUploadDialogOpen(false);
                  setEvidenciaFile(null);
                  setSelectedComisionista(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handlePagar}
                disabled={!evidenciaFile || pagarComisionMutation.isPending}
              >
                {pagarComisionMutation.isPending ? "Procesando..." : "Confirmar Pago"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
