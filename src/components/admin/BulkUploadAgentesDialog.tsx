import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Upload, Download, CheckCircle, XCircle, AlertCircle, Loader2, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useActivityLogger } from '@/hooks/useActivityLogger';

interface BulkUploadAgentesDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface AgentRow {
  nombre: string;
  telefono: string;
  email: string;
  inmobiliaria: string;
  proyecto: string;
}

interface ProcessResult {
  email: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message: string;
}

interface UploadResponse {
  success: boolean;
  error?: string;
  technicalError?: string;
  phase?: 'validation' | 'execution_rollback' | 'completed';
  message?: string;
  errors?: string[];
  summary?: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    valid?: number;
    invalid?: number;
  };
  details?: ProcessResult[];
}

export function BulkUploadAgentesDialog({ open, onClose, onSuccess }: BulkUploadAgentesDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { registrarCreacion } = useActivityLogger();
  const [results, setResults] = useState<UploadResponse | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast.error('Por favor selecciona un archivo CSV');
        return;
      }
      setFile(selectedFile);
      setResults(null);
    }
  };

  const parseCSV = (text: string): AgentRow[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const agents: AgentRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length >= 5) {
        agents.push({
          nombre: values[headers.indexOf('nombre')] || values[0],
          telefono: values[headers.indexOf('telefono')] || values[1],
          email: values[headers.indexOf('email')] || values[2],
          inmobiliaria: values[headers.indexOf('inmobiliaria')] || values[3],
          proyecto: values[headers.indexOf('proyecto')] || values[4],
        });
      }
    }

    return agents;
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Por favor selecciona un archivo');
      return;
    }

    setIsProcessing(true);
    setProgress(10);

    try {
      const text = await file.text();
      const agents = parseCSV(text);

      if (agents.length === 0) {
        toast.error('No se encontraron agentes válidos en el archivo');
        setIsProcessing(false);
        return;
      }

      setProgress(30);
      console.log(`Procesando ${agents.length} agentes...`);

      const { data, error } = await supabase.functions.invoke('bulk-create-agents', {
        body: { agents },
      });

      setProgress(100);

      // Ahora todas las respuestas vienen en data (status 200)
      if (error) {
        // Error de red o similar
        console.error('Error en invoke:', error);
        setResults({ success: false, error: error.message || 'Error de conexión' });
        toast.error('Error de conexión con el servidor');
        return;
      }

      const parsedData = data as UploadResponse;
      console.log('Respuesta del servidor:', parsedData);
      setResults(parsedData);

      if (parsedData.success) {
        await registrarCreacion(
          'agentes',
          {
            nombre_archivo: file.name,
            tamano_kb: (file.size / 1024).toFixed(1),
            total: parsedData.summary?.total,
            creados: parsedData.summary?.created,
            actualizados: parsedData.summary?.updated,
            omitidos: parsedData.summary?.skipped,
          },
          'carga_masiva_agentes'
        );
        toast.success(`Proceso completado: ${parsedData.summary?.created || 0} creados, ${parsedData.summary?.updated || 0} actualizados`);
        onSuccess();
      } else if (parsedData.phase === 'validation') {
        await registrarCreacion(
          'agentes',
          {
            nombre_archivo: file.name,
            errores: parsedData.errors?.length || 0,
          },
          'carga_masiva_agentes',
          'error',
          'Errores de validación'
        );
        toast.warning(`Validación fallida: ${parsedData.errors?.length || 0} errores encontrados`);
      } else if (parsedData.phase === 'execution_rollback') {
        await registrarCreacion(
          'agentes',
          {
            nombre_archivo: file.name,
          },
          'carga_masiva_agentes',
          'error',
          'Rollback ejecutado'
        );
        toast.error('Error durante la creación. Todos los cambios fueron revertidos.');
      } else {
        await registrarCreacion(
          'agentes',
          {
            nombre_archivo: file.name,
          },
          'carga_masiva_agentes',
          'error',
          parsedData.error || parsedData.message
        );
        toast.error(parsedData.error || parsedData.message || 'Error procesando agentes');
      }

    } catch (error) {
      console.error('Error en carga masiva:', error);
      const errorMsg = error instanceof Error ? error.message : 'Error procesando archivo';
      toast.error(errorMsg);
      setResults({ success: false, error: errorMsg });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = 'Nombre,Telefono,Email,Inmobiliaria,Proyecto\nJuan Pérez,3312345678,juan@trust-realestate.mx,TRUST,Vive Daiku';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_agentes.csv';
    link.click();
  };

  const handleClose = () => {
    setFile(null);
    setResults(null);
    setProgress(0);
    onClose();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'created':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'updated':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'skipped':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carga Masiva de Agentes</DialogTitle>
          <DialogDescription>
            Sube un archivo CSV con los datos de los agentes a crear.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template download */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">
              Descarga el template CSV con el formato correcto
            </span>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Template
            </Button>
          </div>

          {/* File input */}
          <div className="space-y-2">
            <Label htmlFor="csv-file">Archivo CSV</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Archivo seleccionado: {file.name}
              </p>
            )}
          </div>

          {/* Progress bar */}
          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground text-center">
                Procesando agentes...
              </p>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-3">
              {/* Mensaje de validación fallida */}
              {!results.success && results.phase === 'validation' && (
                <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded border border-amber-300">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    <span className="font-medium text-amber-800 dark:text-amber-200">
                      Errores de validación encontrados
                    </span>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                    {results.message || 'No se creó ningún registro. Corrige los errores e intenta de nuevo.'}
                  </p>
                  {results.summary && (
                    <p className="text-xs text-amber-600">
                      Total: {results.summary.total} | Válidos: {results.summary.valid || 0} | Con errores: {results.summary.invalid || 0}
                    </p>
                  )}
                </div>
              )}

              {/* Mensaje de rollback */}
              {!results.success && results.phase === 'execution_rollback' && (
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded border border-red-300 space-y-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="font-medium text-red-800 dark:text-red-200">
                      Error durante la creación - Cambios revertidos
                    </span>
                  </div>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {results.message || 'Ocurrió un error. Todos los cambios fueron revertidos. No se creó ningún registro.'}
                  </p>
                  {results.error && (
                    <div className="p-2 bg-red-200/50 dark:bg-red-800/30 rounded">
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">Error:</p>
                      <p className="text-sm text-red-700 dark:text-red-300">{results.error}</p>
                    </div>
                  )}
                  {results.technicalError && (
                    <div className="p-2 bg-red-200/50 dark:bg-red-800/30 rounded">
                      <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Detalle técnico:</p>
                      <code className="text-xs text-red-600 dark:text-red-400 break-all block bg-red-100 dark:bg-red-900/50 p-2 rounded">
                        {results.technicalError}
                      </code>
                    </div>
                  )}
                </div>
              )}

              {/* Lista de errores de validación con emails a quitar */}
              {results.errors && results.errors.length > 0 && (
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                      ¿Qué hacer?
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Abre tu archivo CSV, busca y elimina las filas con estos correos, guarda el archivo y vuelve a subirlo.
                    </p>
                  </div>
                  
                  <div className="border border-destructive/30 rounded bg-destructive/5">
                    <div className="p-2 bg-destructive/10 flex items-center justify-between sticky top-0">
                      <span className="text-sm font-medium text-destructive">
                        Correos a eliminar del CSV ({results.errors.length})
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          const emails = results.errors?.map(err => err.split(':')[0].trim()).join('\n') || '';
                          navigator.clipboard.writeText(emails);
                          toast.success('Correos copiados al portapapeles');
                        }}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copiar emails
                      </Button>
                    </div>
                    <div className="max-h-40 overflow-y-auto p-2 space-y-2">
                      {results.errors.map((err, idx) => {
                        const [email, ...reasonParts] = err.split(':');
                        const reason = reasonParts.join(':').trim();
                        return (
                          <div key={idx} className="p-2 bg-background rounded border text-sm">
                            <div className="font-mono font-medium text-destructive">{email.trim()}</div>
                            {reason && (
                              <div className="text-xs text-muted-foreground mt-1">{reason}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Resumen de éxito */}
              {results.success && results.summary && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded">
                    <div className="text-lg font-bold text-green-600">{results.summary.created}</div>
                    <div className="text-xs text-muted-foreground">Creados</div>
                  </div>
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
                    <div className="text-lg font-bold text-blue-600">{results.summary.updated}</div>
                    <div className="text-xs text-muted-foreground">Actualizados</div>
                  </div>
                  <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                    <div className="text-lg font-bold text-yellow-600">{results.summary.skipped}</div>
                    <div className="text-xs text-muted-foreground">Omitidos</div>
                  </div>
                  <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded">
                    <div className="text-lg font-bold text-red-600">{results.summary.errors}</div>
                    <div className="text-xs text-muted-foreground">Errores</div>
                  </div>
                </div>
              )}

              {results.details && results.details.length > 0 && (
                <div className="max-h-48 overflow-y-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Email</th>
                        <th className="p-2 text-left">Estado</th>
                        <th className="p-2 text-left">Mensaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.details.map((detail, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2 font-mono text-xs">{detail.email}</td>
                          <td className="p-2">
                            <span className="flex items-center gap-1">
                              {getStatusIcon(detail.status)}
                              <span className="capitalize">{detail.status}</span>
                            </span>
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">{detail.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Error genérico */}
              {!results.success && !results.phase && results.error && (
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded text-red-600">
                  {results.error}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
              {results?.success ? 'Cerrar' : 'Cancelar'}
            </Button>
            {/* Show retry button when there are validation errors */}
            {results && !results.success && (
              <Button 
                variant="secondary"
                onClick={() => {
                  setResults(null);
                  setFile(null);
                  setProgress(0);
                }}
              >
                <Upload className="w-4 h-4 mr-2" />
                Subir nuevo archivo
              </Button>
            )}
            {!results && (
              <Button onClick={handleUpload} disabled={!file || isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Cargar Agentes
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
