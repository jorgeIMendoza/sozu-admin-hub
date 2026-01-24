import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, RefreshCw, Upload, FileCheck, AlertCircle, CheckCircle2, XCircle, Users, FileSearch } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SATNotificationService, SATNotificationStatus, CompradorSATStatus } from "@/services/satNotificationService";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';

interface SATNotificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaCobranzaId: number;
  cuentaLabel: string;
  onSuccess?: () => void;
}

interface ExtractedData {
  constancia_situacion_fiscal: {
    origen: string;
    datos_identificacion: {
      id_cif: string;
      rfc: string;
      curp: string;
      nombre: string;
      fecha_inicio_operaciones: string;
      estatus: string;
    };
    domicilio_fiscal: {
      codigo_postal: string;
      vialidad: string;
      colonia: string;
      municipio: string;
      entidad: string;
    };
    regimenes: string[];
  };
  factura_cfdi: {
    origen: string;
    informacion_general: {
      version: string;
      folio: string;
      fecha: string;
      uuid: string;
      tipo_comprobante: string;
      lugar_expedicion: string;
    };
    emisor: {
      rfc: string;
      nombre: string;
      regimen_fiscal: string;
    };
    receptor: {
      rfc: string;
      nombre: string;
      uso_cfdi: string;
      domicilio_fiscal: string;
      regimen_fiscal: string;
    };
    totales: {
      moneda: string;
      subtotal: number;
      total: number;
    };
    conceptos: Array<{
      clave_prod_serv: string;
      cantidad: number;
      descripcion: string;
      importe: number;
    }>;
  };
}

interface ComparisonResult {
  campo: string;
  valorCsf: string;
  valorCfdi: string;
  coincide: boolean;
  requerido: boolean;
}

export function SATNotificationDialog({
  isOpen,
  onClose,
  cuentaCobranzaId,
  cuentaLabel,
  onSuccess
}: SATNotificationDialogProps) {
  const [status, setStatus] = useState<SATNotificationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCompradoresOpen, setIsCompradoresOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && cuentaCobranzaId) {
      loadStatus();
      // Reset extracted data when dialog opens
      setExtractedData(null);
      setComparisonResults([]);
    }
  }, [isOpen, cuentaCobranzaId]);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const statusData = await SATNotificationService.getStatus(cuentaCobranzaId);
      setStatus(statusData);
      // Auto-expand if there are issues
      if (statusData.compradoresListos < statusData.totalCompradores) {
        setIsCompradoresOpen(true);
      }
    } catch (error) {
      console.error('Error loading SAT status:', error);
      toast({
        title: "Error",
        description: "No se pudo cargar el estado de notificación SAT",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const normalizeText = (text: string): string => {
    if (!text) return '';
    return text
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const handleExtractData = async () => {
    setIsExtracting(true);
    try {
      // Get compradores for this cuenta
      const { data: compradores } = await supabase
        .from('compradores')
        .select('id_persona')
        .eq('id_cuenta_cobranza', cuentaCobranzaId)
        .eq('activo', true)
        .limit(1);

      if (!compradores?.length) {
        throw new Error('No se encontraron compradores');
      }

      const idPersona = compradores[0].id_persona;

      // Get the XML factura URL (type 21)
      const { data: xmlDoc } = await supabase
        .from('documentos')
        .select('url')
        .eq('id_cuenta_cobranza', cuentaCobranzaId)
        .eq('id_persona', idPersona)
        .eq('id_tipo_documento', 21)
        .eq('activo', true)
        .eq('es_draft', false)
        .order('fecha_creacion', { ascending: false })
        .limit(1);

      // Get the CSF URL (type 6)
      const { data: csfDoc } = await supabase
        .from('documentos')
        .select('url')
        .eq('id_persona', idPersona)
        .eq('id_tipo_documento', 6)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false })
        .limit(1);

      if (!xmlDoc?.length || !csfDoc?.length) {
        throw new Error('No se encontraron los documentos necesarios (XML y CSF)');
      }

      // Call Edge Function to extract data
      const { data, error } = await supabase.functions.invoke('trigger-sat-notification', {
        body: {
          id_cuenta_cobranza: cuentaCobranzaId,
          id_persona: idPersona,
          xml_url: xmlDoc[0].url,
          csf_url: csfDoc[0].url,
          ambiente: 'produccion'
        }
      });

      if (error) throw error;

      console.log('SAT extraction response:', JSON.stringify(data, null, 2));

      if (data.success && data.result?.documentos_procesados) {
        const docs = data.result.documentos_procesados;
        
        // Get CSF and CFDI with flexible structure handling
        const csf = docs.constancia_situacion_fiscal;
        const cfdi = docs.factura_cfdi;
        
        console.log('CSF data:', csf);
        console.log('CFDI data:', cfdi);
        
        // Build comparison results even with partial data - show what we have
        const csfRfc = csf?.datos_identificacion?.rfc || '';
        const csfNombre = csf?.datos_identificacion?.nombre || '';
        const csfCp = csf?.domicilio_fiscal?.codigo_postal || '';
        const cfdiRfc = cfdi?.receptor?.rfc || '';
        const cfdiNombre = cfdi?.receptor?.nombre || '';
        const cfdiCp = cfdi?.receptor?.domicilio_fiscal || '';
        
        // Check if we have minimum required data
        const hasMinimumData = csfRfc || cfdiRfc || csfNombre || cfdiNombre;
        
        if (!hasMinimumData) {
          // Show detailed error about what's missing
          const missingParts = [];
          if (!csf) missingParts.push('CSF');
          if (!cfdi) missingParts.push('CFDI');
          if (csf && !csf.datos_identificacion) missingParts.push('datos_identificacion');
          if (cfdi && !cfdi.receptor) missingParts.push('receptor');
          throw new Error(`Datos incompletos. Faltan: ${missingParts.join(', ')}. Estructura recibida: ${JSON.stringify(Object.keys(docs))}`);
        }
        
        setExtractedData(docs);
        
        // Build comparison results
        const results: ComparisonResult[] = [
          {
            campo: 'RFC',
            valorCsf: csfRfc,
            valorCfdi: cfdiRfc,
            coincide: csfRfc !== '' && cfdiRfc !== '' && csfRfc === cfdiRfc,
            requerido: true
          },
          {
            campo: 'Nombre',
            valorCsf: csfNombre,
            valorCfdi: cfdiNombre,
            coincide: csfNombre !== '' && cfdiNombre !== '' && normalizeText(csfNombre) === normalizeText(cfdiNombre),
            requerido: true
          },
          {
            campo: 'Código Postal',
            valorCsf: csfCp,
            valorCfdi: cfdiCp,
            coincide: csfCp !== '' && cfdiCp !== '' && csfCp === cfdiCp,
            requerido: true
          }
        ];

        setComparisonResults(results);
        setIsComparisonOpen(true);

        toast({
          title: "Datos extraídos",
          description: "Los datos han sido extraídos. Verifica la comparación."
        });
      } else {
        throw new Error(data.error || `Error al extraer datos. Respuesta: ${JSON.stringify(data).substring(0, 200)}`);
      }
    } catch (error: any) {
      console.error('Error extracting data:', error);
      toast({
        title: "Error",
        description: error.message || "Error al extraer datos",
        variant: "destructive"
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const allRequiredFieldsMatch = () => {
    if (comparisonResults.length === 0) return false;
    return comparisonResults.filter(r => r.requerido).every(r => r.coincide);
  };

  const handleGenerateExcel = async () => {
    if (!extractedData) {
      toast({
        title: "Error",
        description: "Primero debes extraer los datos",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    try {
      // Load the template
      const response = await fetch('/templates/template-aviso-sat-inmuebles.xlsm');
      if (!response.ok) throw new Error('No se pudo cargar el template');
      
      const arrayBuffer = await response.arrayBuffer();
      // Read with cellStyles to preserve formatting
      const workbook = XLSX.read(arrayBuffer, { 
        type: 'array', 
        bookVBA: true,
        cellStyles: true,
        cellNF: true,
        cellDates: true
      });
      
      // Get the first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const csf = extractedData.constancia_situacion_fiscal;
      const cfdi = extractedData.factura_cfdi;
      
      // Validate data exists
      if (!csf?.datos_identificacion || !csf?.domicilio_fiscal || !cfdi?.receptor) {
        throw new Error('Datos incompletos. Extrae los datos nuevamente.');
      }
      
      // Extract name components from CSF
      const nombreCompleto = csf.datos_identificacion.nombre || '';
      const nombreParts = nombreCompleto.split(' ').filter(Boolean);
      const apellidoPaterno = nombreParts.length >= 2 ? nombreParts[nombreParts.length - 2] : '';
      const apellidoMaterno = nombreParts.length >= 1 ? nombreParts[nombreParts.length - 1] : '';
      const nombres = nombreParts.length > 2 ? nombreParts.slice(0, -2).join(' ') : '';
      
      // Extract birth date from CURP (positions 4-9: YYMMDD)
      const curp = csf.datos_identificacion.curp || '';
      let fechaNacimiento = '';
      if (curp.length >= 10) {
        const yy = curp.substring(4, 6);
        const mm = curp.substring(6, 8);
        const dd = curp.substring(8, 10);
        const year = parseInt(yy) > 30 ? `19${yy}` : `20${yy}`;
        fechaNacimiento = `${dd}/${mm}/${year}`;
      }

      // Helper to update cell value preserving style
      const updateCell = (cellRef: string, value: string | number) => {
        if (worksheet[cellRef]) {
          // Preserve existing cell properties (style, format, etc.) and update only value
          const existingCell = worksheet[cellRef];
          if (typeof value === 'number') {
            existingCell.t = 'n';
            existingCell.v = value;
          } else {
            existingCell.t = 's';
            existingCell.v = value;
          }
        } else {
          // Cell doesn't exist, create with basic type
          worksheet[cellRef] = typeof value === 'number' 
            ? { t: 'n', v: value }
            : { t: 's', v: value };
        }
      };

      // Fill in the template cells - preserving original formatting
      updateCell('B2', csf.datos_identificacion.rfc);
      updateCell('B3', csf.datos_identificacion.curp);
      updateCell('B4', apellidoPaterno);
      updateCell('B5', apellidoMaterno);
      updateCell('B6', nombres);
      updateCell('B7', fechaNacimiento);
      
      // Address
      updateCell('B10', csf.domicilio_fiscal.vialidad);
      updateCell('B11', csf.domicilio_fiscal.colonia);
      updateCell('B12', csf.domicilio_fiscal.municipio);
      updateCell('B13', csf.domicilio_fiscal.entidad);
      updateCell('B14', csf.domicilio_fiscal.codigo_postal);
      
      // CFDI data
      updateCell('B17', cfdi.informacion_general.uuid);
      updateCell('B18', cfdi.informacion_general.fecha);
      updateCell('B19', cfdi.totales.total);
      
      // Emisor
      updateCell('B22', cfdi.emisor.rfc);
      updateCell('B23', cfdi.emisor.nombre);
      
      // Concepto (first one)
      if (cfdi.conceptos && cfdi.conceptos.length > 0) {
        updateCell('B26', cfdi.conceptos[0].descripcion.substring(0, 500));
      }

      // Generate the file
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsm', type: 'array', bookVBA: true });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' });
      
      // Upload to storage
      const filename = `notificacion_sat_${cuentaCobranzaId}_${Date.now()}.xlsm`;
      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(`sat-notifications/${filename}`, blob, {
          contentType: 'application/vnd.ms-excel.sheet.macroEnabled.12'
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(`sat-notifications/${filename}`);

      const documentUrl = urlData.publicUrl;

      // Create document record
      const { error: docError } = await supabase
        .from('documentos')
        .insert({
          id_cuenta_cobranza: cuentaCobranzaId,
          id_tipo_documento: 44,
          url: documentUrl,
          activo: true
        });

      if (docError) throw docError;

      // Also download the file for the user
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      toast({
        title: "Éxito",
        description: "Archivo de notificación SAT generado y descargado"
      });

      await loadStatus();
      onSuccess?.();
    } catch (error: any) {
      console.error('Error generating Excel:', error);
      toast({
        title: "Error",
        description: error.message || "Error al generar el archivo",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    // Invalidate previous and regenerate
    setIsGenerating(true);
    try {
      await SATNotificationService.invalidatePrevious(cuentaCobranzaId);
      setExtractedData(null);
      setComparisonResults([]);
      toast({
        title: "Archivo anterior invalidado",
        description: "Extrae los datos nuevamente para regenerar"
      });
      await loadStatus();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error al invalidar",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (status?.archivoSATUrl) {
      window.open(status.archivoSATUrl, '_blank');
    }
  };

  const handleViewAcuse = () => {
    if (status?.acuseSATUrl) {
      window.open(status.acuseSATUrl, '_blank');
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await SATNotificationService.uploadAcuse(cuentaCobranzaId, file);
      if (result.success) {
        toast({
          title: "Éxito",
          description: "Acuse de notificación SAT subido correctamente"
        });
        await loadStatus();
        onSuccess?.();
      } else {
        toast({
          title: "Error",
          description: result.error || "Error al subir el acuse",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error al subir el acuse",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const renderConditionBadge = (label: string, met: boolean) => (
    <div className="flex items-center gap-2">
      {met ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500" />
      )}
      <span className={met ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
        {label}
      </span>
    </div>
  );

  const renderStatusIcon = (met: boolean) => (
    met ? (
      <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500 mx-auto" />
    )
  );

  const renderCompradoresTable = (compradoresStatus: CompradorSATStatus[]) => {
    if (compradoresStatus.length === 0) {
      return (
        <div className="text-sm text-muted-foreground text-center py-4">
          No hay compradores registrados
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Comprador</TableHead>
            <TableHead className="text-center w-[60px]">PDF</TableHead>
            <TableHead className="text-center w-[60px]">XML</TableHead>
            <TableHead className="text-center w-[60px]">CSF</TableHead>
            <TableHead className="text-center w-[80px]">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {compradoresStatus.map((comprador) => (
            <TableRow 
              key={comprador.id_persona}
              className={!comprador.cumpleRequisitos ? "bg-red-50 dark:bg-red-950/20" : ""}
            >
              <TableCell className="font-medium text-sm">
                {comprador.nombre_legal.length > 25 
                  ? comprador.nombre_legal.substring(0, 25) + '...' 
                  : comprador.nombre_legal}
              </TableCell>
              <TableCell className="text-center">
                {renderStatusIcon(comprador.tieneFacturaPdf && comprador.facturaPdfVerificada)}
              </TableCell>
              <TableCell className="text-center">
                {renderStatusIcon(comprador.tieneFacturaXml && comprador.facturaXmlVerificada)}
              </TableCell>
              <TableCell className="text-center">
                {renderStatusIcon(comprador.tieneConstancia && comprador.constanciaVerificada)}
              </TableCell>
              <TableCell className="text-center">
                {comprador.cumpleRequisitos ? (
                  <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                    Listo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">
                    Falta
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const renderComparisonTable = () => {
    if (comparisonResults.length === 0) return null;

    return (
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Campo</TableHead>
              <TableHead>Valor CSF</TableHead>
              <TableHead>Valor CFDI</TableHead>
              <TableHead className="text-center w-[80px]">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparisonResults.map((result, index) => (
              <TableRow 
                key={index}
                className={!result.coincide ? "bg-red-50 dark:bg-red-950/20" : ""}
              >
                <TableCell className="font-medium text-sm">
                  {result.campo}
                  {result.requerido && <span className="text-red-500 ml-1">*</span>}
                </TableCell>
                <TableCell className="text-sm font-mono">
                  {result.valorCsf.length > 30 ? result.valorCsf.substring(0, 30) + '...' : result.valorCsf}
                </TableCell>
                <TableCell className="text-sm font-mono">
                  {result.valorCfdi.length > 30 ? result.valorCfdi.substring(0, 30) + '...' : result.valorCfdi}
                </TableCell>
                <TableCell className="text-center">
                  {renderStatusIcon(result.coincide)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground p-2 border-t">
          * Campos requeridos para generar el Excel
        </p>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="outline" className="font-bold text-sm px-2 py-1">SAT</Badge>
            Notificación al SAT
          </DialogTitle>
          <DialogDescription>
            Cuenta: {cuentaLabel}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : status ? (
          <div className="space-y-4">
            {/* General status */}
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium text-sm mb-3">Requisitos Generales:</h4>
              {renderConditionBadge(
                `Propiedad Pagada Completamente (${status.estaPagadaCompletamente ? 
                  `$${status.totalPagado.toLocaleString('es-MX')} / $${status.precioFinal.toLocaleString('es-MX')}` : 
                  `Falta: $${(status.precioFinal - status.totalPagado).toLocaleString('es-MX')}`})`,
                status.estaPagadaCompletamente
              )}
              
              {/* Compradores summary with badge */}
              <div className="flex items-center gap-2 mt-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Compradores con documentos completos:</span>
                <Badge 
                  variant={status.compradoresListos === status.totalCompradores ? "default" : "destructive"}
                  className={status.compradoresListos === status.totalCompradores ? "bg-green-600" : ""}
                >
                  {status.compradoresListos}/{status.totalCompradores}
                </Badge>
              </div>
            </div>

            {/* Collapsible compradores detail */}
            {status.totalCompradores > 0 && (
              <Collapsible open={isCompradoresOpen} onOpenChange={setIsCompradoresOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4" />
                      Detalle por Comprador
                    </span>
                    {isCompradoresOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="border rounded-lg overflow-hidden">
                    {renderCompradoresTable(status.compradoresStatus)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    PDF = Factura PDF verificada | XML = Factura XML verificada | CSF = Constancia de Situación Fiscal verificada
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Comparison section - only show when data is extracted */}
            {comparisonResults.length > 0 && (
              <Collapsible open={isComparisonOpen} onOpenChange={setIsComparisonOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <FileSearch className="h-4 w-4" />
                      Comparación de Datos
                      {allRequiredFieldsMatch() ? (
                        <Badge className="bg-green-600 text-xs">Coinciden</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">No coinciden</Badge>
                      )}
                    </span>
                    {isComparisonOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  {renderComparisonTable()}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Current status */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Archivo de Notificación:</span>
                {status.hasArchivoSAT ? (
                  <Badge variant="default" className="bg-green-600">
                    <FileCheck className="h-3 w-3 mr-1" />
                    Generado
                  </Badge>
                ) : (
                  <Badge variant="secondary">No generado</Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Acuse de Envío:</span>
                {status.hasAcuseSAT ? (
                  <Badge variant="default" className="bg-green-600">
                    <FileCheck className="h-3 w-3 mr-1" />
                    Subido
                  </Badge>
                ) : (
                  <Badge variant="secondary">No subido</Badge>
                )}
              </div>
            </div>

            {!status.canGenerate && !status.hasArchivoSAT && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No se cumplen los requisitos para generar la notificación. 
                  {!status.estaPagadaCompletamente && " La propiedad debe estar pagada completamente."}
                  {status.compradoresListos < status.totalCompradores && 
                    ` Faltan documentos verificados para ${status.totalCompradores - status.compradoresListos} comprador(es).`}
                </AlertDescription>
              </Alert>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No se pudo cargar el estado
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {status && !isLoading && (
            <>
              {/* Case 1: No archivo SAT - Show Extract Data button first, then Generate if data matches */}
              {!status.hasArchivoSAT && status.canGenerate && (
                <>
                  {!extractedData ? (
                    <Button onClick={handleExtractData} disabled={isExtracting}>
                      {isExtracting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileSearch className="h-4 w-4 mr-2" />
                      )}
                      Extraer y Comparar Datos
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleGenerateExcel} 
                      disabled={isGenerating || !allRequiredFieldsMatch()}
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileCheck className="h-4 w-4 mr-2" />
                      )}
                      Generar Excel SAT
                    </Button>
                  )}
                </>
              )}

              {/* Case 2: Has archivo SAT but no acuse - Show Download, Regenerate, Upload Acuse */}
              {status.hasArchivoSAT && !status.hasAcuseSAT && (
                <>
                  <Button variant="outline" onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Descargar
                  </Button>
                  <Button variant="outline" onClick={handleRegenerate} disabled={isGenerating}>
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Regenerar
                  </Button>
                  <Button onClick={handleUploadClick} disabled={isUploading}>
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Subir Acuse
                  </Button>
                </>
              )}

              {/* Case 3: Has both archivo and acuse - Only Download and View Acuse */}
              {status.hasArchivoSAT && status.hasAcuseSAT && (
                <>
                  <Button variant="outline" onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Descargar Archivo
                  </Button>
                  <Button variant="outline" onClick={handleViewAcuse}>
                    <FileCheck className="h-4 w-4 mr-2" />
                    Ver Acuse
                  </Button>
                </>
              )}
            </>
          )}
          
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
