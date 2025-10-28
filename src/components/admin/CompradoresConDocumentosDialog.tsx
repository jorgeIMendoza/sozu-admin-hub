import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Users, FileCheck, Eye, Loader2, Download, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import JSZip from "jszip";
import { useToast } from "@/hooks/use-toast";

interface Documento {
  id: number;
  tipo: string;
  url: string;
  fecha: string;
}

interface Comprador {
  id_persona: number;
  nombre_legal: string;
  rfc: string | null;
  curp: string | null;
  tipo_persona: 'PF' | 'PM';
  porcentaje_copropiedad: number;
  email: string | null;
  telefono: string | null;
  documentos: Documento[];
}

interface CompradoresConDocumentosDialogProps {
  cuentaCobranzaId: number;
  fetchCompradores: (cuentaId: number) => Promise<Comprador[]>;
  triggerButtonText?: string;
}

export function CompradoresConDocumentosDialog({ 
  cuentaCobranzaId, 
  fetchCompradores,
  triggerButtonText = "Ver compradores"
}: CompradoresConDocumentosDialogProps) {
  const [open, setOpen] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const { toast } = useToast();

  const { data: compradores = [], isLoading } = useQuery({
    queryKey: ['compradores-documentos', cuentaCobranzaId],
    queryFn: () => fetchCompradores(cuentaCobranzaId),
    enabled: open,
  });

  // Fetch pagos realizados
  const { data: pagos = [] } = useQuery({
    queryKey: ['pagos-cuenta', cuentaCobranzaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagos')
        .select(`
          id,
          monto,
          fecha_pago,
          clave_rastreo,
          descripcion,
          url_cep,
          url_recibo,
          metodos_pago!pagos_id_metodos_pago_fkey(nombre)
        `)
        .eq('id_cuenta_cobranza', cuentaCobranzaId)
        .eq('activo', true)
        .order('fecha_pago', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const handleDownloadZip = async () => {
    try {
      setDownloadingZip(true);
      const zip = new JSZip();

      // Carpeta de documentos
      const documentosFolder = zip.folder("documentos");
      if (documentosFolder) {
        for (const comprador of compradores) {
          for (const doc of comprador.documentos) {
            try {
              const response = await fetch(doc.url);
              const blob = await response.blob();
              const extension = doc.url.split('.').pop()?.split('?')[0] || 'pdf';
              const fileName = `${doc.tipo.replace(/[^a-z0-9]/gi, '_')}_${comprador.nombre_legal.replace(/[^a-z0-9]/gi, '_')}.${extension}`;
              documentosFolder.file(fileName, blob);
            } catch (error) {
              console.error(`Error descargando documento: ${doc.url}`, error);
            }
          }
        }
      }

      // Carpeta de evidencias de pago
      const evidenciasFolder = zip.folder("evidencias_pago");
      if (evidenciasFolder) {
        let consecutivo = 1;
        for (const pago of pagos) {
          const evidenciaUrl = pago.url_cep || pago.url_recibo;
          if (evidenciaUrl) {
            try {
              const response = await fetch(evidenciaUrl);
              const blob = await response.blob();
              const fechaFormateada = format(new Date(pago.fecha_pago), 'yyyyMMdd');
              const montoFormateado = pago.monto.toString().replace('.', '-');
              const metodoPago = pago.metodos_pago?.nombre.replace(/[^a-z0-9]/gi, '_') || 'desconocido';
              const extension = evidenciaUrl.split('.').pop()?.split('?')[0] || 'pdf';
              const fileName = `pago_${consecutivo}_${metodoPago}_${fechaFormateada}_${montoFormateado}.${extension}`;
              evidenciasFolder.file(fileName, blob);
              consecutivo++;
            } catch (error) {
              console.error(`Error descargando evidencia: ${evidenciaUrl}`, error);
            }
          }
        }
      }

      // Generar y descargar el ZIP
      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CC-${cuentaCobranzaId.toString().padStart(6, '0')}_documentos.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "ZIP descargado",
        description: "Los documentos y evidencias se han descargado correctamente.",
      });
    } catch (error) {
      console.error('Error generando ZIP:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo generar el archivo ZIP.",
      });
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Users className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Ver compradores</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Compradores - CC-{cuentaCobranzaId.toString().padStart(6, '0')}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : compradores.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay compradores registrados
          </div>
        ) : (
          <div className="space-y-6">
            {/* Datos de los compradores */}
            <div className="space-y-4">
              {compradores.map((comprador) => (
                <Card key={comprador.id_persona}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{comprador.nombre_legal}</span>
                      <Badge variant={comprador.tipo_persona === 'PM' ? 'secondary' : 'default'}>
                        {comprador.tipo_persona === 'PM' ? 'Persona Moral (PM)' : 'Persona Física (PF)'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">RFC:</span>
                        <p className="font-medium">{comprador.rfc || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">CURP:</span>
                        <p className="font-medium">{comprador.curp || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">% Copropiedad:</span>
                        <p className="font-medium">{comprador.porcentaje_copropiedad}%</p>
                      </div>
                      {comprador.email && (
                        <div>
                          <span className="text-muted-foreground">Email:</span>
                          <p className="font-medium text-xs">{comprador.email}</p>
                        </div>
                      )}
                      {comprador.telefono && (
                        <div>
                          <span className="text-muted-foreground">Teléfono:</span>
                          <p className="font-medium">{comprador.telefono}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Botón de descargar ZIP */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={handleDownloadZip}
                disabled={downloadingZip}
              >
                {downloadingZip ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Descargar ZIP
              </Button>
            </div>

            {/* Pestañas */}
            <Tabs defaultValue="documentos" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="documentos">
                  <FileCheck className="h-4 w-4 mr-2" />
                  Documentos Verificados
                </TabsTrigger>
                <TabsTrigger value="pagos">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Pagos Realizados
                </TabsTrigger>
              </TabsList>

              <TabsContent value="documentos" className="space-y-4 mt-4">
                {compradores.map((comprador) => (
                  <Card key={comprador.id_persona}>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        Documentos de {comprador.nombre_legal}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {comprador.documentos?.length > 0 ? (
                        <div className="border rounded-lg">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Fecha</TableHead>
                                <TableHead className="text-right">Acción</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {comprador.documentos.map((doc) => (
                                <TableRow key={doc.id}>
                                  <TableCell>{doc.tipo}</TableCell>
                                  <TableCell>
                                    {format(new Date(doc.fecha), 'dd/MM/yyyy', { locale: es })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => window.open(doc.url, '_blank')}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No hay documentos verificados
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="pagos" className="space-y-4 mt-4">
                {pagos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay pagos realizados</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Total de pagos: <strong>{pagos.length}</strong>
                      </p>
                      <p className="text-sm font-semibold">
                        Total: ${pagos.reduce((sum, p) => sum + Number(p.monto), 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      {pagos.map((pago) => (
                        <Card key={pago.id}>
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <DollarSign className="h-4 w-4 text-green-600" />
                                  <span className="font-semibold text-lg">
                                    ${Number(pago.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  </span>
                                  <Badge variant="outline">{pago.metodos_pago?.nombre || 'N/A'}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(pago.fecha_pago), 'dd/MM/yyyy', { locale: es })}
                                </p>
                                {pago.clave_rastreo && (
                                  <p className="text-xs text-muted-foreground">
                                    Clave: {pago.clave_rastreo}
                                  </p>
                                )}
                                {pago.descripcion && (
                                  <p className="text-xs text-muted-foreground">
                                    {pago.descripcion}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-2">
                                {(pago.url_cep || pago.url_recibo) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(pago.url_cep || pago.url_recibo || '', '_blank')}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    Ver Evidencia
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
