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
import { FileText, Upload, Eye, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmMantenimientoDialog } from "./ConfirmMantenimientoDialog";

interface DocumentsTabProps {
  entityId?: number;
  entityType: 'persona' | 'propiedad' | 'cuenta_cobranza';
  tipoPersona?: 'pf' | 'pm'; // Tipo de persona para filtrar documentos
  pendingDocuments?: Array<{
    file: File;
    tipoDocumento: string;
    tempId: string;
  }>;
  onPendingDocumentsChange?: (docs: Array<{
    file: File;
    tipoDocumento: string;
    tempId: string;
  }>) => void;
  onDocumentAdded?: () => void;
  shouldAutoGenerateInvoice?: boolean; // Flag to disable invoice options when auto-generated
  compradores?: Array<{ id_persona: number; nombre_legal: string }>; // Lista de compradores
  propiedadId?: number; // ID de la propiedad asociada
}

interface TipoDocumento {
  id: number;
  nombre: string;
}

interface Documento {
  numero: string | null;
  url: string;
  es_verificado: boolean;
  activo: boolean;
  id_tipo_documento: number;
  fecha_creacion: string;
  id_persona?: number;
  id_propiedad?: number;
  tipo_documento_nombre?: string;
}

export function DocumentsTab({ 
  entityId, 
  entityType, 
  tipoPersona = 'pf',
  pendingDocuments = [], 
  onPendingDocumentsChange, 
  onDocumentAdded,
  shouldAutoGenerateInvoice = false,
  compradores = [],
  propiedadId
}: DocumentsTabProps) {
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTipoDocumento, setSelectedTipoDocumento] = useState<string>("");
  const [numeroDocumento, setNumeroDocumento] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumento[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [viewerDialog, setViewerDialog] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: ''
  });
  const [showMantenimientoDialog, setShowMantenimientoDialog] = useState(false);
  const [dialogAlreadyShown, setDialogAlreadyShown] = useState(false);
  const [selectedComprador, setSelectedComprador] = useState<string>("");
  const { toast } = useToast();

  // Load document types based on entity type and person type
  const loadTiposDocumento = async () => {
    try {
      // Filter by asignado_a based on entity type
      // For cuenta_cobranza, use 'prop' since documents are property-related
      const asignadoA = (entityType === 'propiedad' || entityType === 'cuenta_cobranza') ? 'prop' : 'per';
      
      // Build query
      let query = supabase
        .from('tipos_documento')
        .select('id, nombre')
        .eq('activo', true)
        .eq('asignado_a', asignadoA);
      
      // For persona entity type, filter by padre based on tipoPersona
      if (entityType === 'persona' && tipoPersona) {
        // For personas físicas: padre = 'pf' or 'a'
        // For personas morales: padre = 'pm' or 'a'
        const filtros = tipoPersona === 'pf' ? ['pf', 'a'] : ['pm', 'a'];
        query = query.in('padre', filtros);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error loading document types:', error);
      } else {
        // Sort alphabetically by nombre
        const sortedData = (data || []).sort((a, b) => 
          a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
        );
        setTiposDocumento(sortedData);
      }
    } catch (err) {
      console.error('Error loading document types:', err);
    }
  };

  // Load existing documents
  const loadDocumentos = async () => {
    if (!entityId) return;
    
    setIsLoading(true);
    const column = entityType === 'persona' 
      ? 'id_persona' 
      : entityType === 'cuenta_cobranza'
      ? 'id_cuenta_cobranza'
      : 'id_propiedad';
    
    try {
      const { data: docsData, error: docsError } = await supabase
        .from('documentos')
        .select('*')
        .eq(column, entityId)
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
      
      // Combine the data - map numero to string as it's text in database
      const docs = (docsData || []).map((doc) => ({
        ...doc,
        numero: doc.numero != null ? String(doc.numero) : null,
        tipo_documento_nombre: tiposMap.get(doc.id_tipo_documento) || 'Tipo desconocido'
      }));
      
      setDocumentos(docs);
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize data when component mounts or entityId/tipoPersona changes
  useEffect(() => {
    loadTiposDocumento();
    loadDocumentos();
  }, [entityId, entityType, tipoPersona]);

  // Check category 7 documents - simplified to avoid TS deep instantiation errors
  useEffect(() => {
    if (entityType !== 'cuenta_cobranza' || !entityId || dialogAlreadyShown || documentos.length === 0) {
      return;
    }

    const checkCategory7 = async () => {
      try {
        // Using type assertion to avoid deep type inference issues
        const supabaseClient = supabase as any;
        const response = await supabaseClient
          .from('tipos_documento')
          .select('id')
          .eq('id_categoria_tipo_documento', 7)
          .eq('activo', true);
        
        if (!response.data || response.data.length === 0) return;
        
        // Extract IDs
        const categoria7Ids: number[] = [];
        for (let i = 0; i < response.data.length; i++) {
          categoria7Ids.push(response.data[i].id);
        }
        
        // Filter documents of category 7
        const categoria7Docs: Documento[] = [];
        for (let i = 0; i < documentos.length; i++) {
          const doc = documentos[i];
          if (categoria7Ids.indexOf(doc.id_tipo_documento) !== -1 && doc.activo) {
            categoria7Docs.push(doc);
          }
        }
        
        // Check if all are verified
        if (categoria7Docs.length > 0) {
          let allVerified = true;
          for (let i = 0; i < categoria7Docs.length; i++) {
            if (!categoria7Docs[i].es_verificado) {
              allVerified = false;
              break;
            }
          }
          
          if (allVerified) {
            setShowMantenimientoDialog(true);
            setDialogAlreadyShown(true);
          }
        }
      } catch (error) {
        console.error('Error checking category 7:', error);
      }
    };

    checkCategory7();
  }, [documentos.length, entityType, entityId, dialogAlreadyShown]);

  const handleUpload = async () => {
    if (!selectedFile || !selectedTipoDocumento) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Faltan datos requeridos",
      });
      return;
    }
    
    // Verificar si es factura y dueño NO factura
    const tipoDoc = tiposDocumento.find(t => t.id.toString() === selectedTipoDocumento);
    const isInvoice = tipoDoc?.nombre.toLowerCase().includes('factura');
    
    if (isInvoice && !shouldAutoGenerateInvoice && entityType === 'cuenta_cobranza' && compradores.length > 0) {
      // Si no hay comprador seleccionado y hay más de un comprador, mostrar error
      if (!selectedComprador && compradores.length > 1) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Debe seleccionar un comprador para la factura",
        });
        return;
      }
      
      // Si solo hay un comprador, seleccionarlo automáticamente
      const compradorId = selectedComprador || compradores[0]?.id_persona.toString();
      
      if (!compradorId) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo determinar el comprador",
        });
        return;
      }
    }

    // If no entityId, add to pending documents
    if (!entityId) {
      const tempId = `temp_${Date.now()}_${Math.random()}`;
      const newPendingDoc = {
        file: selectedFile,
        tipoDocumento: selectedTipoDocumento,
        tempId
      };
      
      onPendingDocumentsChange?.([...pendingDocuments, newPendingDoc]);
      
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
      setSelectedTipoDocumento("");
      setNumeroDocumento("");
      setSelectedComprador("");
      onDocumentAdded?.();
      
      toast({
        title: "Documento agregado",
        description: "El documento se agregará al guardar la información básica"
      });
      return;
    }

    setIsUploading(true);

    try {
      // Upload file to Supabase Storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${entityType}_${entityId}_${Date.now()}.${fileExt}`;
      const filePath = fileName; // Sin prefijo 'documentos/' para evitar duplicación

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      // Use user-provided numero or leave as null
      const numeroValue = numeroDocumento && numeroDocumento.trim() !== '' 
        ? numeroDocumento.trim() 
        : null;

      // Get cuenta_cobranza and propiedad based on entity type
      let idCuentaCobranza = null;
      let idPropiedad = null;
      let idPersona = null;
      
      if (entityType === 'propiedad') {
        // First get the ofertas for this property
        const { data: ofertasData } = await supabase
          .from('ofertas')
          .select('id')
          .eq('id_propiedad', entityId)
          .eq('activo', true);
        
        if (ofertasData && ofertasData.length > 0) {
          const ofertaIds = ofertasData.map(o => o.id);
          
          // Get the first cuenta_cobranza
          const { data: cuentaData } = await supabase
            .from('cuentas_cobranza')
            .select('id')
            .in('id_oferta', ofertaIds)
            .eq('activo', true)
            .limit(1)
            .maybeSingle();
          
          if (cuentaData) {
            idCuentaCobranza = cuentaData.id;
          }
        }
        idPropiedad = entityId;
      } else if (entityType === 'cuenta_cobranza') {
        idCuentaCobranza = entityId;
        
        // Get propiedad from cuenta_cobranza
        const { data: cuentaData } = await supabase
          .from('cuentas_cobranza')
          .select('id_oferta')
          .eq('id', entityId)
          .single();
          
        if (cuentaData) {
          const { data: ofertaData } = await supabase
            .from('ofertas')
            .select('id_propiedad')
            .eq('id', cuentaData.id_oferta)
            .single();
            
          if (ofertaData) {
            idPropiedad = ofertaData.id_propiedad;
          }
        }
        
        // Si es factura y dueño NO factura, usar el comprador seleccionado
        if (isInvoice && !shouldAutoGenerateInvoice && compradores.length > 0) {
          idPersona = parseInt(selectedComprador || compradores[0]?.id_persona.toString());
        }
      }

      // Create documento record
      const documentoData: any = {
        numero: numeroValue,
        url: urlData.publicUrl,
        id_tipo_documento: parseInt(selectedTipoDocumento),
        activo: true,
        es_verificado: false,
      };

      // Add foreign keys based on entity type
      if (entityType === 'persona') {
        documentoData.id_persona = entityId;
      } else if (entityType === 'propiedad') {
        documentoData.id_propiedad = idPropiedad;
        documentoData.id_cuenta_cobranza = idCuentaCobranza;
      } else if (entityType === 'cuenta_cobranza') {
        documentoData.id_cuenta_cobranza = idCuentaCobranza;
        documentoData.id_propiedad = idPropiedad;
        if (idPersona) {
          documentoData.id_persona = idPersona;
        }
      }

      const { error: insertError } = await supabase.from('documentos').insert(documentoData);

      if (insertError) throw insertError;

      // Reload documents
      await loadDocumentos();
      
      // Clear form
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
      setSelectedTipoDocumento("");
      setNumeroDocumento("");
      setSelectedComprador("");
      
      toast({
        title: "Éxito",
        description: "Documento subido correctamente",
      });

      // Notify parent
      onDocumentAdded?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Error al subir el documento: ${error.message}`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePending = (tempId: string) => {
    const updatedPending = pendingDocuments.filter(doc => doc.tempId !== tempId);
    onPendingDocumentsChange?.(updatedPending);
    toast({
      title: "Documento eliminado",
      description: "El documento pendiente ha sido eliminado"
    });
  };

  const handleDelete = async (documento: Documento) => {
    const column = entityType === 'persona' ? 'id_persona' : 'id_propiedad';
    
    try {
      const { error } = await supabase
        .from('documentos')
        .update({ activo: false })
        .eq('numero', documento.numero as any)
        .eq(column, entityId);

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

  const handleToggleVerification = async (documento: Documento) => {
    const column = entityType === 'persona' ? 'id_persona' : entityType === 'cuenta_cobranza' ? 'id_cuenta_cobranza' : 'id_propiedad';
    
    try {
      const { error } = await supabase.from('documentos').update({ es_verificado: !documento.es_verificado }).eq('numero', documento.numero as any).eq(column, entityId);
      if (error) throw error;
      await loadDocumentos();
      toast({ title: "Éxito", description: "Estado de verificación actualizado" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: `Error: ${error.message}` });
    }
  };

  if (!entityId && pendingDocuments.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Documentos</h3>
          <Button type="button" onClick={() => setIsUploadDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Subir Documento
          </Button>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="text-center py-6">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-center">
                Puedes agregar documentos que se guardarán al crear la persona
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Upload Dialog */}
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Subir Documento</DialogTitle>
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
                        // Filter out document types that are already added (in saved or pending documents)
                        const existsInSaved = documentos.some(doc => doc.id_tipo_documento === tipo.id && doc.activo);
                        const existsInPending = pendingDocuments.some(doc => doc.tipoDocumento === tipo.id.toString());
                        return !existsInSaved && !existsInPending;
                      })
                      .map((tipo) => {
                        const isInvoiceType = tipo.nombre.toLowerCase().includes('factura');
                        const isDisabled = shouldAutoGenerateInvoice && isInvoiceType;
                        
                        return (
                          <SelectItem 
                            key={tipo.id} 
                            value={tipo.id.toString()}
                            disabled={isDisabled}
                          >
                            {tipo.nombre}
                            {isDisabled && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (Se genera automáticamente)
                              </span>
                            )}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="numero-documento-temp">Número de Documento (Opcional)</Label>
                <Input
                  id="numero-documento-temp"
                  type="number"
                  placeholder="Ej: 12345"
                  value={numeroDocumento}
                  onChange={(e) => setNumeroDocumento(e.target.value)}
                />
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
                  setNumeroDocumento("");
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleUpload}
                disabled={!selectedFile || !selectedTipoDocumento}
              >
                Agregar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Documentos</h3>
        <Button type="button" onClick={() => setIsUploadDialogOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Subir Documento
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documentos Adjuntos ({documentos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground">Cargando documentos...</p>
            </div>
          ) : documentos.length === 0 && pendingDocuments.length === 0 ? (
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
                  <TableHead>Número</TableHead>
                  <TableHead>Verificado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Pending documents */}
                  {pendingDocuments.map((pendingDoc) => {
                    const tipoDocumentoNombre = tiposDocumento.find(t => t.id.toString() === pendingDoc.tipoDocumento)?.nombre || 'Tipo desconocido';
                    return (
                      <TableRow key={pendingDoc.tempId}>
                        <TableCell className="font-medium">-</TableCell>
                        <TableCell>{tipoDocumentoNombre}</TableCell>
                        <TableCell></TableCell>
                        <TableCell>
                          <Badge variant="secondary">Pendiente</Badge>
                        </TableCell>
                        <TableCell>
                          {new Date().toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeletePending(pendingDoc.tempId)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  
                  {/* Saved documents */}
                  {documentos.map((documento, index) => (
                    <TableRow key={`${documento.numero}-${index}`}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>{documento.tipo_documento_nombre}</TableCell>
                      <TableCell>{documento.numero || ''}</TableCell>
                      <TableCell>
                        <Badge variant={documento.es_verificado ? "default" : "secondary"}>
                          {documento.es_verificado ? "Verificado" : "Pendiente"}
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
                                  onClick={() => handleToggleVerification(documento)}
                                >
                                  {documento.es_verificado ? (
                                    <Check className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <X className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{documento.es_verificado ? 'Verificado' : 'No verificado'}</p>
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
                                  onClick={() => handleDelete(documento)}
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
        </CardContent>
      </Card>

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

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir Documento</DialogTitle>
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
                      // Filter out document types that are already added (in saved or pending documents)
                      const existsInSaved = documentos.some(doc => doc.id_tipo_documento === tipo.id && doc.activo);
                      const existsInPending = pendingDocuments.some(doc => doc.tipoDocumento === tipo.id.toString());
                      return !existsInSaved && !existsInPending;
                    })
                    .map((tipo) => {
                      const isInvoiceType = tipo.nombre.toLowerCase().includes('factura');
                      const isDisabled = shouldAutoGenerateInvoice && isInvoiceType;
                      
                      return (
                        <SelectItem 
                          key={tipo.id} 
                          value={tipo.id.toString()}
                          disabled={isDisabled}
                        >
                          {tipo.nombre}
                          {isDisabled && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (Se genera automáticamente)
                            </span>
                          )}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="numero-documento">Número de Documento (Opcional)</Label>
              <Input
                id="numero-documento"
                type="number"
                placeholder="Ej: 12345"
                value={numeroDocumento}
                onChange={(e) => setNumeroDocumento(e.target.value)}
              />
            </div>
            {/* Selector de comprador para facturas cuando dueño NO factura */}
            {(() => {
              const tipoDoc = tiposDocumento.find(t => t.id.toString() === selectedTipoDocumento);
              const isInvoice = tipoDoc?.nombre.toLowerCase().includes('factura');
              return isInvoice && !shouldAutoGenerateInvoice && entityType === 'cuenta_cobranza' && compradores.length > 1 && (
                <div>
                  <Label htmlFor="comprador">Comprador</Label>
                  <Select value={selectedComprador} onValueChange={setSelectedComprador}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el comprador" />
                    </SelectTrigger>
                    <SelectContent>
                      {compradores.map((comprador) => (
                        <SelectItem key={comprador.id_persona} value={comprador.id_persona.toString()}>
                          {comprador.nombre_legal}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}
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
                setNumeroDocumento("");
                setSelectedComprador("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || !selectedTipoDocumento || isUploading}
            >
              {isUploading ? "Subiendo..." : entityId ? "Subir" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mantenimiento Confirmation Dialog */}
      {entityType === 'cuenta_cobranza' && entityId && (
        <ConfirmMantenimientoDialog
          isOpen={showMantenimientoDialog}
          onClose={() => setShowMantenimientoDialog(false)}
          cuentaCobranzaId={entityId}
          onSuccess={() => {
            setShowMantenimientoDialog(false);
            loadDocumentos();
          }}
        />
      )}
    </div>
  );
}