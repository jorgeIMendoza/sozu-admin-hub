import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Check, X, Download, FileText, FileCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { downloadDocument } from "@/utils/googleDriveUrl";
import { 
  extraerDatos, 
  validarDatosFiscales, 
  prepararDatosExcelSat,
  DatosValidados,
  ExcelSatData,
  ComparisonResult
} from "@/services/validacionFiscalService";

interface ValidarDatosFiscalesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaCobranzaId: number;
  comprador: {
    id_persona: number;
    nombre_legal: string;
    rfc?: string;
  };
  xmlUrl: string;
  csfUrl?: string;
}

export function ValidarDatosFiscalesDialog({
  isOpen,
  onClose,
  cuentaCobranzaId,
  comprador,
  xmlUrl,
  csfUrl: initialCsfUrl
}: ValidarDatosFiscalesDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [csfUrl, setCsfUrl] = useState<string | undefined>(initialCsfUrl);
  const [datosValidados, setDatosValidados] = useState<DatosValidados | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Load CSF URL if not provided
  useEffect(() => {
    if (!initialCsfUrl && isOpen) {
      loadCsfUrl();
    }
  }, [isOpen, initialCsfUrl, comprador.id_persona, cuentaCobranzaId]);

  const loadCsfUrl = async () => {
    setIsLoading(true);
    try {
      // CSF is tipo_documento 6 (Constancia de Situación Fiscal)
      const { data, error } = await supabase
        .from('documentos')
        .select('url')
        .eq('id_cuenta_cobranza', cuentaCobranzaId)
        .eq('id_persona', comprador.id_persona)
        .eq('id_tipo_documento', 6)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading CSF:', error);
      }
      
      if (data) {
        setCsfUrl(data.url);
      }
    } catch (err) {
      console.error('Error loading CSF URL:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExtraerYComparar = async () => {
    if (!xmlUrl || !csfUrl) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Se requieren tanto el XML como la CSF para validar"
      });
      return;
    }

    setIsExtracting(true);
    setError(null);
    setDatosValidados(null);

    try {
      const result = await extraerDatos(
        xmlUrl,
        csfUrl,
        cuentaCobranzaId,
        comprador.id_persona
      );

      if (!result.success) {
        throw new Error(result.error || 'Error al extraer datos');
      }

      const validacion = validarDatosFiscales(result.xml, result.csf);
      setDatosValidados(validacion);

      const coincidencias = validacion.comparacion.filter(c => c.coincide).length;
      const total = validacion.comparacion.length;

      toast({
        title: validacion.todoCoincide ? "Validación exitosa" : "Validación completada",
        description: `${coincidencias} de ${total} campos coinciden`,
        variant: validacion.todoCoincide ? "default" : "destructive"
      });
    } catch (err) {
      console.error('Error extracting data:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido al extraer datos');
      toast({
        variant: "destructive",
        title: "Error de extracción",
        description: err instanceof Error ? err.message : 'Error al procesar los documentos'
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleGenerarExcel = async () => {
    if (!datosValidados || !datosValidados.todoCoincide) {
      toast({
        variant: "destructive",
        title: "No se puede generar",
        description: "Todos los campos deben coincidir para generar el Excel"
      });
      return;
    }

    try {
      const excelData = prepararDatosExcelSat(datosValidados, cuentaCobranzaId);
      
      // TODO: Implement Excel generation with xlsx library
      // For now, log the data and show a message
      console.log('Excel data prepared:', excelData);
      
      toast({
        title: "Datos preparados",
        description: "Funcionalidad de generación de Excel en desarrollo"
      });
    } catch (err) {
      console.error('Error generating Excel:', err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al generar el archivo Excel"
      });
    }
  };

  const handleDownloadXml = () => {
    if (xmlUrl) {
      downloadDocument(xmlUrl, `factura_${cuentaCobranzaId}.xml`);
    }
  };

  const handleDownloadCsf = () => {
    if (csfUrl) {
      downloadDocument(csfUrl, `csf_${comprador.rfc || comprador.id_persona}.pdf`);
    }
  };

  const renderComparisonIcon = (coincide: boolean) => {
    return coincide ? (
      <Check className="h-5 w-5 text-green-600" />
    ) : (
      <X className="h-5 w-5 text-red-600" />
    );
  };

  const getCoincidenciasCount = () => {
    if (!datosValidados) return { count: 0, total: 0 };
    const count = datosValidados.comparacion.filter(c => c.coincide).length;
    return { count, total: datosValidados.comparacion.length };
  };

  const { count, total } = getCoincidenciasCount();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Validar Datos Fiscales para SAT
          </DialogTitle>
          <DialogDescription>
            Compara los datos del XML de factura con la Constancia de Situación Fiscal (CSF)
          </DialogDescription>
        </DialogHeader>

        {/* Información del Comprador */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Comprador:</span>
                <p className="font-medium">{comprador.nombre_legal}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">RFC:</span>
                <p className="font-medium">{comprador.rfc || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estado de Documentos */}
        <div className="grid grid-cols-2 gap-4">
          {/* XML */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium">Factura XML</span>
                </div>
                {xmlUrl ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">Disponible</Badge>
                    <Button variant="ghost" size="icon" onClick={handleDownloadXml}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Badge variant="destructive">No disponible</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* CSF */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium">CSF</span>
                </div>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : csfUrl ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">Disponible</Badge>
                    <Button variant="ghost" size="icon" onClick={handleDownloadCsf}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Badge variant="destructive">No disponible</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Missing Documents Warning */}
        {(!xmlUrl || !csfUrl) && !isLoading && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {!xmlUrl && !csfUrl 
                ? "Se requiere el XML de la factura y la CSF del comprador para realizar la validación."
                : !xmlUrl 
                  ? "Se requiere el XML de la factura para realizar la validación."
                  : "Se requiere la Constancia de Situación Fiscal (CSF) del comprador para realizar la validación."
              }
            </AlertDescription>
          </Alert>
        )}

        {/* Botón Extraer y Comparar */}
        <div className="flex justify-center">
          <Button
            onClick={handleExtraerYComparar}
            disabled={!xmlUrl || !csfUrl || isExtracting}
            size="lg"
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Extrayendo datos...
              </>
            ) : datosValidados ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Volver a comparar
              </>
            ) : (
              <>
                <FileCheck className="h-4 w-4 mr-2" />
                Extraer y Comparar
              </>
            )}
          </Button>
        </div>

        {/* Tabla Comparativa */}
        {datosValidados && (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Campo</TableHead>
                    <TableHead>XML (Factura)</TableHead>
                    <TableHead>CSF</TableHead>
                    <TableHead className="w-[80px] text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datosValidados.comparacion.map((resultado: ComparisonResult, index: number) => (
                    <TableRow key={index} className={!resultado.coincide ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                      <TableCell className="font-medium">{resultado.campo}</TableCell>
                      <TableCell className="font-mono text-sm">{resultado.valorXml}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {resultado.valorCsf}
                        {resultado.detalle && (
                          <p className="text-xs text-muted-foreground mt-1">{resultado.detalle}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {renderComparisonIcon(resultado.coincide)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Resumen */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                {datosValidados.todoCoincide ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                )}
                <span className="font-medium">
                  {count} de {total} campos coinciden
                </span>
              </div>
              <Badge variant={datosValidados.todoCoincide ? "default" : "secondary"}>
                {datosValidados.todoCoincide ? "Validación exitosa" : "Hay discrepancias"}
              </Badge>
            </div>

            {/* Botón Generar Excel */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
              <Button
                onClick={handleGenerarExcel}
                disabled={!datosValidados.todoCoincide}
                className={datosValidados.todoCoincide ? "bg-green-600 hover:bg-green-700" : ""}
              >
                <Download className="h-4 w-4 mr-2" />
                Generar Excel SAT
              </Button>
            </div>
          </>
        )}

        {/* Close button when no validation done */}
        {!datosValidados && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
