import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Upload, Eye, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DocumentsTabProps {
  entityId?: number;
  entityType: 'persona' | 'propiedad';
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
}

interface TipoDocumento {
  id: number;
  nombre: string;
}

interface Documento {
  numero: number;
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
  pendingDocuments = [], 
  onPendingDocumentsChange, 
  onDocumentAdded 
}: DocumentsTabProps) {
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTipoDocumento, setSelectedTipoDocumento] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumento[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { toast } = useToast();

  // Load document types based on entity type
  const loadTiposDocumento = async () => {
    try {
      // Filter by asignado_a based on entity type
      const asignadoA = entityType === 'propiedad' ? 'prop' : 'per';
      
      // Bypass TypeScript issues for now
      const result: any = await (supabase as any)
        .from('tipos_documento')
        .select('id, nombre')
        .eq('activo', true)
        .eq('asignado_a', asignadoA);
      
      const { data, error } = result;
      
      if (error) {
        console.error('Error loading document types:', error);
      } else {
        setTiposDocumento(data || []);
      }
    } catch (err) {
      console.error('Error loading document types:', err);
    }
  };

  // Load existing documents
  const loadDocumentos = async () => {
    if (!entityId) return;
    
    setIsLoading(true);
    const column = entityType === 'persona' ? 'id_persona' : 'id_propiedad';
    
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

  // Initialize data when component mounts or entityId changes
  useEffect(() => {
    loadTiposDocumento();
    loadDocumentos();
  }, [entityId, entityType]);

  const handleUpload = async () => {
    if (!selectedFile || !selectedTipoDocumento) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Faltan datos requeridos",
      });
      return;
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
      const filePath = `documentos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      // Generate next numero for this entity
      const column = entityType === 'persona' ? 'id_persona' : 'id_propiedad';
      const { data: existingDocs } = await supabase
        .from('documentos')
        .select('numero')
        .eq(column, entityId)
        .order('numero', { ascending: false })
        .limit(1);

      const nextNumero = existingDocs && existingDocs.length > 0 
        ? existingDocs[0].numero + 1 
        : 1;

      // Save document record
      const documentData = {
        numero: nextNumero,
        url: urlData.publicUrl,
        es_verificado: false,
        activo: true,
        id_tipo_documento: parseInt(selectedTipoDocumento),
        ...(entityType === 'persona' 
          ? { id_persona: entityId } 
          : { id_propiedad: entityId })
      };

      const { error: dbError } = await supabase
        .from('documentos')
        .insert(documentData);

      if (dbError) throw dbError;

      // Reload documents and close dialog
      await loadDocumentos();
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
      setSelectedTipoDocumento("");
      onDocumentAdded?.();
      
      toast({
        title: "Éxito",
        description: "Documento subido correctamente",
      });
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
        .eq('numero', documento.numero)
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
    const column = entityType === 'persona' ? 'id_persona' : 'id_propiedad';
    
    try {
      const { error } = await supabase
        .from('documentos')
        .update({ es_verificado: !documento.es_verificado })
        .eq('numero', documento.numero)
        .eq(column, entityId);

      if (error) throw error;
      
      await loadDocumentos();
      toast({
        title: "Éxito",
        description: "Estado de verificación actualizado",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Error al actualizar la verificación: ${error.message}`,
      });
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
                    {tiposDocumento.map((tipo) => (
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
                        <TableCell className="font-medium">Pendiente</TableCell>
                        <TableCell>{tipoDocumentoNombre}</TableCell>
                        <TableCell>
                          <Badge variant="outline">Pendiente</Badge>
                        </TableCell>
                        <TableCell>
                          {pendingDoc.file.name}
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
                  {documentos.map((documento) => (
                    <TableRow key={documento.numero}>
                      <TableCell className="font-medium">{documento.numero}</TableCell>
                      <TableCell>{documento.tipo_documento_nombre}</TableCell>
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
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(documento.url, '_blank')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleVerification(documento)}
                          >
                            {documento.es_verificado ? (
                              <X className="h-4 w-4" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(documento)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
                  {tiposDocumento.map((tipo) => (
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
                onClick={handleUpload}
                disabled={!selectedFile || !selectedTipoDocumento || isUploading}
              >
                {isUploading ? "Subiendo..." : entityId ? "Subir" : "Agregar"}
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}