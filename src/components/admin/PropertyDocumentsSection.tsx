import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Upload, Eye, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PropertyDocumentsSectionProps {
  propertyId?: number;
  onDocumentsChange?: (documents: TempDocument[]) => void;
  initialDocuments?: TempDocument[];
}

interface TipoDocumento {
  id: number;
  nombre: string;
}

interface TempDocument {
  id: string;
  file: File;
  tipoDocumentoId: number;
  tipoDocumentoNombre: string;
}

interface Documento {
  numero: string | null;
  url: string;
  id_estatus_verificacion: number; // 1=Pendiente, 2=Validado, 3=Rechazado, 4=Expirado
  activo: boolean;
  id_tipo_documento: number;
  fecha_creacion: string;
  id_propiedad?: number;
  tipo_documento_nombre?: string;
}

export const PropertyDocumentsSection = ({ 
  propertyId,
  onDocumentsChange,
  initialDocuments = []
}: PropertyDocumentsSectionProps) => {
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTipoDocumento, setSelectedTipoDocumento] = useState<string>("");
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumento[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [tempDocuments, setTempDocuments] = useState<TempDocument[]>(initialDocuments);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [viewerDialog, setViewerDialog] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: ''
  });
  const { toast } = useToast();

  // Load document types
  const loadTiposDocumento = async () => {
    try {
      const { data, error } = await supabase
        .from('tipos_documento')
        .select('id, nombre')
        .eq('activo', true)
        .eq('asignado_a', 'prop');
      
      if (error) {
        console.error('Error loading document types:', error);
      } else {
        setTiposDocumento(data || []);
      }
    } catch (err) {
      console.error('Error loading document types:', err);
    }
  };

  // Load existing documents (only if propertyId exists)
  const loadDocumentos = async () => {
    if (!propertyId) return;
    
    setIsLoading(true);
    
    try {
      const { data: docsData, error: docsError } = await supabase
        .from('documentos')
        .select('*')
        .eq('id_propiedad', propertyId)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false });
      
      if (docsError) throw docsError;
      
      // Get document types separately
      const { data: tiposData, error: tiposError } = await supabase
        .from('tipos_documento')
        .select('id, nombre')
        .eq('activo', true);
      
      if (tiposError) throw tiposError;
      
      // Create types map
      const tiposMap = new Map<number, string>();
      if (tiposData) {
        tiposData.forEach((tipo) => {
          tiposMap.set(tipo.id, tipo.nombre);
        });
      }
      
      // Combine the data
      const docs = (docsData || []).map((doc) => ({
        ...doc,
        tipo_documento_nombre: tiposMap.get(doc.id_tipo_documento) || 'Tipo desconocido'
      }));
      
      setDocumentos(docs);
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTiposDocumento();
    if (propertyId) {
      loadDocumentos();
    }
  }, [propertyId]);

  const handleAddTempDocument = () => {
    if (!selectedFile || !selectedTipoDocumento) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Selecciona un archivo y tipo de documento",
      });
      return;
    }

    const tipoDocumento = tiposDocumento.find(t => t.id.toString() === selectedTipoDocumento);
    if (!tipoDocumento) return;

    const newTempDoc: TempDocument = {
      id: `temp_${Date.now()}_${Math.random()}`,
      file: selectedFile,
      tipoDocumentoId: parseInt(selectedTipoDocumento),
      tipoDocumentoNombre: tipoDocumento.nombre
    };

    const updatedTempDocs = [...tempDocuments, newTempDoc];
    setTempDocuments(updatedTempDocs);
    onDocumentsChange?.(updatedTempDocs);

    setIsUploadDialogOpen(false);
    setSelectedFile(null);
    setSelectedTipoDocumento("");
    
    toast({
      title: "Documento agregado",
      description: "El documento se cargará cuando se guarde la propiedad",
    });
  };

  const handleRemoveTempDocument = (documentId: string) => {
    const updatedTempDocs = tempDocuments.filter(doc => doc.id !== documentId);
    setTempDocuments(updatedTempDocs);
    onDocumentsChange?.(updatedTempDocs);
  };

  const handleDeleteDocument = async (documento: Documento) => {
    if (!propertyId) return;
    
    try {
      const { error } = await supabase
        .from('documentos')
        .update({ activo: false })
        .eq('numero', documento.numero)
        .eq('id_propiedad', propertyId);

      if (error) throw error;
      
      await loadDocumentos();
      toast({
        title: "Éxito",
        description: "Documento eliminado correctamente",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Error al eliminar el documento: ${error.message}`,
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documentos
          </div>
          <Button type="button" onClick={() => setIsUploadDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Agregar Documento
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Temporary documents (for creation mode) */}
        {tempDocuments.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium mb-3">Documentos a cargar:</h4>
            <div className="space-y-2">
              {tempDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{doc.file.name}</p>
                      <p className="text-xs text-muted-foreground">{doc.tipoDocumentoNombre}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveTempDocument(doc.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Existing documents (for edit mode) */}
        {propertyId && (
          <>
            {isLoading ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground">Cargando documentos...</p>
              </div>
            ) : documentos.length === 0 ? (
              <div className="text-center py-6">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No hay documentos adjuntos</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Tipo de Documento</TableHead>
                      <TableHead>Verificado</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentos.map((documento) => (
                      <TableRow key={documento.numero}>
                        <TableCell className="font-medium">{documento.numero}</TableCell>
                        <TableCell>{documento.tipo_documento_nombre}</TableCell>
                        <TableCell>
                          <Badge variant={documento.id_estatus_verificacion === 2 ? "default" : documento.id_estatus_verificacion === 3 ? "destructive" : "secondary"}>
                            {documento.id_estatus_verificacion === 2 ? "Validado" : documento.id_estatus_verificacion === 3 ? "Rechazado" : documento.id_estatus_verificacion === 4 ? "Expirado" : "Pendiente"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(documento.fecha_creacion).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setViewerDialog({
                                        isOpen: true,
                                        url: documento.url,
                                        title: documento.tipo_documento_nombre || 'Documento'
                                      });
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Ver documento</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteDocument(documento)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Eliminar documento</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        {!propertyId && tempDocuments.length === 0 && (
          <div className="text-center py-6">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No hay documentos agregados</p>
          </div>
        )}
      </CardContent>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tipo-documento">Tipo de Documento</Label>
              <Select value={selectedTipoDocumento} onValueChange={setSelectedTipoDocumento}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el tipo de documento" />
                </SelectTrigger>
                <SelectContent>
                  {tiposDocumento
                    .filter((tipo) => {
                      // Filter out document types that are already added (in saved or temp documents)
                      const existsInSaved = documentos.some(doc => doc.id_tipo_documento === tipo.id && doc.activo);
                      const existsInTemp = tempDocuments.some(doc => doc.tipoDocumentoId === tipo.id);
                      return !existsInSaved && !existsInTemp;
                    })
                    .map((tipo) => (
                      <SelectItem key={tipo.id} value={tipo.id.toString()}>
                        {tipo.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="file">Archivo</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsUploadDialogOpen(false);
                setSelectedFile(null);
                setSelectedTipoDocumento("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAddTempDocument}
              disabled={!selectedFile || !selectedTipoDocumento}
            >
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Viewer Dialog */}
      <Dialog open={viewerDialog.isOpen} onOpenChange={(open) => setViewerDialog({ ...viewerDialog, isOpen: open })}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-3 border-b shrink-0">
            <DialogTitle>{viewerDialog.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <iframe
              src={`${viewerDialog.url}#page=1&view=FitH`}
              className="w-full h-full border-0"
              title={viewerDialog.title}
            />
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
