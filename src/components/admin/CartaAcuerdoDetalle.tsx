import { useState, useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SignaturePadDialog } from "@/components/admin/SignaturePadDialog";
import { PdfViewerDialog } from "@/components/admin/PdfViewerDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TemplateEditorWithPreview } from "@/components/admin/TemplateEditorWithPreview";
import { MifielSigningDialog } from "@/components/admin/MifielSigningDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Save, Loader2, CheckCircle2, Clock, XCircle, Send, Plus, Trash2,
  Users, Info, PenTool, Fingerprint, RefreshCw, Pencil, Check,
} from "lucide-react";

const PLACEHOLDERS = [
  { key: "nombre_agente", label: "Nombre completo del agente", editable: true },
  { key: "rfc_agente", label: "RFC del agente", editable: true },
  { key: "fecha_actual", label: "Fecha actual", editable: false },
  { key: "fecha_fin", label: "Fecha fin (+3 meses)", editable: false },
];

const ESTADO_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pendiente: { label: "Pendiente", variant: "secondary", icon: Clock },
  enviado: { label: "Enviado", variant: "outline", icon: Send },
  firmado_parcial: { label: "Firma parcial", variant: "default", icon: Clock },
  completado: { label: "Completado", variant: "default", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", variant: "destructive", icon: XCircle },
};

interface Firmante {
  name: string;
  email: string;
  cargo: string;
  firma_imagen?: string;
}

interface CartaAcuerdoDetalleProps {
  cartaId: string;
  cartaNombre: string;
}

export function CartaAcuerdoDetalle({ cartaId, cartaNombre }: CartaAcuerdoDetalleProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [editorHtml, setEditorHtml] = useState<string | null>(null);
  const [firmantes, setFirmantes] = useState<Firmante[]>([]);
  const [firmantesLoaded, setFirmantesLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCargo, setNewCargo] = useState("");
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingWidgetId, setSigningWidgetId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editableName, setEditableName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [signatureTargetIndex, setSignatureTargetIndex] = useState<number>(-1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Fetch carta
  const { data: carta, isLoading: cartaLoading } = useQuery({
    queryKey: ["carta-acuerdo", cartaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cartas_acuerdo")
        .select("*")
        .eq("id", cartaId)
        .single();
      if (error) throw error;
      if (!firmantesLoaded && data?.firmantes_config) {
        setFirmantes(data.firmantes_config);
        setFirmantesLoaded(true);
      }
      return data;
    },
  });

  // Fetch firmas for this carta
  const { data: firmas = [], isLoading: firmasLoading } = useQuery({
    queryKey: ["firmas-digitales", cartaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("firmas_digitales")
        .select("*")
        .eq("tipo_documento", "carta_acuerdos")
        .eq("carta_acuerdo_id", cartaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async ({ html, firmantesConfig, biometrica }: { html: string; firmantesConfig: Firmante[]; biometrica: boolean }) => {
      const { error } = await (supabase as any)
        .from("cartas_acuerdo")
        .update({
          contenido_html: html,
          firmantes_config: firmantesConfig,
          requiere_validacion_biometrica: biometrica,
          updated_by: profile?.email || "unknown",
          updated_at: new Date().toISOString(),
        })
        .eq("id", cartaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "✅ Carta guardada", description: "Los cambios se guardaron correctamente." });
      queryClient.invalidateQueries({ queryKey: ["carta-acuerdo", cartaId] });
      queryClient.invalidateQueries({ queryKey: ["cartas-acuerdo"] });
    },
    onError: (err: any) => {
      toast({ title: "❌ Error", description: err.message, variant: "destructive" });
    },
  });

  const currentHtml = editorHtml ?? carta?.contenido_html ?? "";
  const biometrica = carta?.requiere_validacion_biometrica ?? false;

  const addFirmante = () => {
    if (!newName.trim() || !newEmail.trim() || !newCargo.trim()) {
      toast({ title: "Completa nombre, cargo y correo", variant: "destructive" });
      return;
    }
    setFirmantes([...firmantes, { name: newName.trim(), email: newEmail.trim(), cargo: newCargo.trim() }]);
    setNewName("");
    setNewEmail("");
    setNewCargo("");
  };

  const removeFirmante = (index: number) => {
    setFirmantes(firmantes.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const sinFirma = firmantes.filter(f => !f.firma_imagen);
    if (sinFirma.length > 0) {
      toast({
        title: "Firma autógrafa requerida",
        description: `Los siguientes firmantes no tienen firma: ${sinFirma.map(f => f.name).join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate({ html: currentHtml, firmantesConfig: firmantes, biometrica });
  };

  const handleToggleBiometrica = async (checked: boolean) => {
    const { error } = await (supabase as any)
      .from("cartas_acuerdo")
      .update({ requiere_validacion_biometrica: checked, updated_at: new Date().toISOString() })
      .eq("id", cartaId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["carta-acuerdo", cartaId] });
    }
  };

  const openSigningWidget = (widgetId: string) => {
    setSigningWidgetId(widgetId);
    setSigningOpen(true);
  };

  // Sync firmas with Mifiel
  const handleSyncMifiel = async () => {
    const toCheck = firmas.filter((f: any) => f.mifiel_document_id && f.estado !== "cancelado" && f.estado !== "completado");
    if (toCheck.length === 0) {
      toast({ title: "No hay firmas pendientes para sincronizar" });
      return;
    }
    setSyncing(true);
    let cancelled = 0;
    let updated = 0;
    try {
      for (const firma of toCheck) {
        try {
          const { data, error } = await supabase.functions.invoke("mifiel-consultar-documento", {
            body: { document_id: firma.mifiel_document_id },
          });
          const notFound = error || !data?.success || data?.upstream_status === 404;
          const mifielStatus = data?.document?.status;
          const isArchived = mifielStatus === "archived" || mifielStatus === "deleted" || mifielStatus === "canceled" || mifielStatus === "cancelled";
          if (notFound || isArchived) {
            await (supabase as any).from("firmas_digitales").update({ estado: "cancelado" }).eq("id", firma.id);
            cancelled++;
          } else if (data?.document) {
            // Update firmantes with signed status from Mifiel
            const mifielSigners = (data.document.signers || []) as any[];
            const updatedFirmantes = (firma.firmantes || []).map((f: any) => {
              const mifielSigner = mifielSigners.find((s: any) => s.email?.toLowerCase() === f.email?.toLowerCase());
              return { ...f, signed: mifielSigner?.signed ?? f.signed ?? false };
            });

            // Check if all firmantes have signed → update estado to completado
            const allSigned = updatedFirmantes.length > 0 && updatedFirmantes.every((f: any) => f.signed === true);
            const mifielStatus = data.document.status;
            let newEstado = firma.estado;
            if (allSigned || mifielStatus === "completed" || mifielStatus === "signed") {
              newEstado = "completado";
            } else if (mifielStatus === "partially_signed" || updatedFirmantes.some((f: any) => f.signed)) {
              newEstado = "firmado_parcial";
            }

            // Try to persist a stable PDF URL when completed
            const updatePayload: any = { firmantes: updatedFirmantes, estado: newEstado };
            if (newEstado === "completado" && !firma.pdf_firmado_url) {
              if (data?.pdf_storage_url) {
                updatePayload.pdf_firmado_url = data.pdf_storage_url;
              } else if (typeof data?.document?.file === "string" && data.document.file.includes("/storage/v1/object/")) {
                updatePayload.pdf_firmado_url = data.document.file;
              }
            }

            await (supabase as any).from("firmas_digitales").update(updatePayload).eq("id", firma.id);
            updated++;
          }
        } catch {
          // skip individual errors
        }
      }
      queryClient.invalidateQueries({ queryKey: ["firmas-digitales", cartaId] });
      queryClient.invalidateQueries({ queryKey: ["cartas-acuerdo-firma-counts"] });
      toast({
        title: cancelled > 0 ? `⚠️ ${cancelled} firma(s) cancelada(s)` : "✅ Todo sincronizado",
        description: cancelled > 0
          ? "Se marcaron como canceladas firmas que ya no existen en Mifiel."
          : updated > 0
            ? `Se actualizó el estado de firma de ${updated} documento(s).`
            : "Todas las firmas están al día.",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Rename carta
  const startEditingName = () => {
    setEditableName(cartaNombre || carta?.nombre || "");
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const saveCartaName = async () => {
    const trimmed = editableName.trim();
    if (!trimmed) {
      setEditingName(false);
      return;
    }
    const { error } = await (supabase as any)
      .from("cartas_acuerdo")
      .update({ nombre: trimmed, updated_at: new Date().toISOString() })
      .eq("id", cartaId);
    if (error) {
      toast({ title: "Error al renombrar", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["carta-acuerdo", cartaId] });
      queryClient.invalidateQueries({ queryKey: ["cartas-acuerdo"] });
      toast({ title: "Nombre actualizado" });
    }
    setEditingName(false);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="editor">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {editingName ? (
              <div className="flex items-center gap-1">
                <Input
                  ref={nameInputRef}
                  value={editableName}
                  onChange={(e) => setEditableName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCartaName(); if (e.key === "Escape") setEditingName(false); }}
                  className="h-8 text-lg font-semibold w-64"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={saveCartaName}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <CardTitle className="text-lg flex items-center gap-1 cursor-pointer group" onClick={startEditingName}>
                {carta?.nombre || cartaNombre}
                <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </CardTitle>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Biometric toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="bio-toggle" className="text-xs cursor-pointer">Biométrica</Label>
                    <Switch
                      id="bio-toggle"
                      checked={biometrica}
                      onCheckedChange={handleToggleBiometrica}
                      disabled={cartaLoading}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Si se activa, los firmantes deberán verificar su identidad con reconocimiento facial (FESCV).
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TabsList>
              <TabsTrigger value="editor">Editor</TabsTrigger>
              <TabsTrigger value="firmantes">Firmantes</TabsTrigger>
              <TabsTrigger value="firmas">Firmas ({firmas.length})</TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Editor Tab */}
        <TabsContent value="editor" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Template de la Carta</CardTitle>
                <Button onClick={handleSave} disabled={saveMutation.isPending || cartaLoading} size="sm">
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Guardar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {cartaLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <TemplateEditorWithPreview
                    value={currentHtml}
                    onChange={setEditorHtml}
                    placeholders={PLACEHOLDERS}
                    firmantes={firmantes}
                  />
                  {/* Signature preview */}
                  <div className="mt-6 border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <PenTool className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold text-muted-foreground">Sección de Firmas (generada automáticamente)</h4>
                    </div>
                    <div className="bg-muted/40 border rounded-lg p-6 space-y-8 pointer-events-none select-none opacity-80">
                      <p className="font-bold text-sm border-b pb-2">Firmas</p>
                      {firmantes.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">No hay firmantes configurados.</p>
                      )}
                      {firmantes.map((f, i) => (
                        <div key={i} className="space-y-1 text-sm">
                          <p className="font-bold text-base">{f.name || "SOZU"}</p>
                          <p>Cargo: {f.cargo}</p>
                          <div className="flex items-end gap-1 my-2">
                            <span>Firma:</span>
                            <div className="relative h-36 w-[230px] shrink-0">
                              {f.firma_imagen ? (
                                <img
                                  src={f.firma_imagen}
                                  alt={`Firma de ${f.name}`}
                                  className="absolute left-1/2 -translate-x-1/2 bottom-1 h-32 max-w-[260px] object-contain"
                                />
                              ) : null}
                              <span className="absolute left-0 bottom-0">___________________________</span>
                            </div>
                          </div>
                          <p>Fecha: <Badge variant="secondary" className="text-xs">{"{{fecha_actual}}"}</Badge></p>
                        </div>
                      ))}
                      <div className="space-y-1 text-sm border-t pt-4">
                        <p className="font-bold text-base">EL AGENTE</p>
                        <p>Nombre/Razón Social: <Badge variant="secondary" className="text-xs">{"{{nombre_agente}}"}</Badge></p>
                        <p>RFC: <Badge variant="secondary" className="text-xs">{"{{rfc_agente}}"}</Badge></p>
                        <div className="flex items-end gap-1 my-2">
                          <span>Firma:</span>
                          <div className="relative h-36 w-[230px] shrink-0">
                            <span className="absolute left-0 bottom-0">___________________________</span>
                          </div>
                        </div>
                        <p>Fecha: <Badge variant="secondary" className="text-xs">{"{{fecha_actual}}"}</Badge></p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Esta sección se genera automáticamente al crear el PDF.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Firmantes Tab */}
        <TabsContent value="firmantes" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Firmantes Configurados
                </CardTitle>
                <Button onClick={handleSave} disabled={saveMutation.isPending || cartaLoading} size="sm">
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Guardar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {firmantes.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">No hay firmantes configurados.</div>
              )}
              {firmantes.map((f, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{f.cargo}</p>
                    <p className="text-xs text-muted-foreground truncate">{f.email}</p>
                    {/* Signature preview */}
                    <div className="mt-2">
                      {f.firma_imagen ? (
                        <div className="flex items-center gap-2">
                          <img src={f.firma_imagen} alt={`Firma de ${f.name}`} className="h-12 border rounded bg-white p-1 object-contain" />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => { setSignatureTargetIndex(i); setSignatureDialogOpen(true); }}
                          >
                            <PenTool className="h-3 w-3 mr-1" />
                            Editar firma
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 border-dashed"
                          onClick={() => { setSignatureTargetIndex(i); setSignatureDialogOpen(true); }}
                        >
                          <PenTool className="h-3 w-3 mr-1" />
                          Agregar firma autógrafa *
                        </Button>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeFirmante(i)} className="shrink-0 mt-1">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="space-y-2 pt-2 border-t">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre</label>
                    <Input placeholder="Nombre completo" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Cargo</label>
                    <Input placeholder="Director Comercial" value={newCargo} onChange={(e) => setNewCargo(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Correo</label>
                    <Input placeholder="correo@empresa.com" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFirmante()} />
                  </div>
                </div>
                <Button onClick={addFirmante} size="sm" variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar firmante
                </Button>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg border bg-muted/50">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  El agente se agrega automáticamente al momento de firmar. Los firmantes aquí recibirán correo de Mifiel para firmar.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Firmas Tab */}
        <TabsContent value="firmas" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Historial de Firmas</CardTitle>
                <Button variant="outline" size="sm" onClick={handleSyncMifiel} disabled={syncing || firmasLoading}>
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Sincronizar con Mifiel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {firmasLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : firmas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No hay firmas digitales registradas</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Firmantes</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {firmas.map((firma: any) => {
                      const config = ESTADO_CONFIG[firma.estado] || ESTADO_CONFIG.pendiente;
                      const Icon = config.icon;
                      return (
                        <TableRow key={firma.id}>
                          <TableCell className="font-mono text-xs">{firma.id?.substring?.(0, 8) || firma.id}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {(firma.firmantes || []).map((f: any, i: number) => {
                                const canSign = !!f.widget_id && firma.estado !== "completado";
                                const hasSigned = f.signed === true;
                                return (
                                  <div key={i} className="flex items-center gap-2">
                                    {hasSigned ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                    ) : (
                                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    )}
                                    <div className="text-xs">
                                      <span className={`font-medium ${hasSigned ? "text-green-700" : ""}`}>{f.name}</span>
                                      {f.email && (
                                        <button
                                          type="button"
                                          className="ml-1 text-muted-foreground hover:text-primary cursor-pointer underline decoration-dotted"
                                          title="Copiar correo"
                                          onClick={() => {
                                            navigator.clipboard.writeText(f.email);
                                            toast({ title: "Correo copiado", description: f.email });
                                          }}
                                        >
                                          ({f.email})
                                        </button>
                                      )}
                                      {hasSigned && <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 border-green-300 text-green-700">Firmado</Badge>}
                                    </div>
                                    {canSign && !hasSigned && (
                                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => openSigningWidget(f.widget_id)}>
                                        <PenTool className="h-3 w-3 mr-1" />
                                        Firmar
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={config.variant} className="gap-1">
                              <Icon className="h-3 w-3" />
                              {config.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(firma.created_at).toLocaleDateString("es-MX")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {firma.pdf_firmado_url && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setPdfViewerUrl(
                                      firma.mifiel_document_id
                                        ? `/api/v1/documents/${firma.mifiel_document_id}/file_signed`
                                        : firma.pdf_firmado_url,
                                    )
                                  }
                                >
                                  Ver PDF
                                </Button>
                              )}
                              {/* Delete button - only enabled when NO firmante has signed */}
                              {(() => {
                                const anySigned = (firma.firmantes || []).some((f: any) => f.signed === true);
                                return (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={anySigned}
                                    title={anySigned ? "No se puede eliminar: ya hay firmas registradas" : "Eliminar documento"}
                                    onClick={() => setDeleteConfirmId(firma.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                );
                              })()}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <MifielSigningDialog
        open={signingOpen}
        onOpenChange={(open) => {
          setSigningOpen(open);
          if (!open) {
            queryClient.invalidateQueries({ queryKey: ["firmas-digitales", cartaId] });
          }
        }}
        widgetId={signingWidgetId}
        onSuccess={() => {
          toast({ title: "✅ Firma registrada" });
          setSigningOpen(false);
          queryClient.invalidateQueries({ queryKey: ["firmas-digitales", cartaId] });
          queryClient.invalidateQueries({ queryKey: ["cartas-acuerdo-firma-counts"] });
        }}
        onError={(err) => {
          toast({ title: "Error en firma", description: err, variant: "destructive" });
          setSigningOpen(false);
        }}
      />

      <PdfViewerDialog
        open={!!pdfViewerUrl}
        onOpenChange={(open) => { if (!open) setPdfViewerUrl(null); }}
        url={pdfViewerUrl || ""}
        title="Carta de Acuerdo Firmada"
      />

      <SignaturePadDialog
        open={signatureDialogOpen}
        onOpenChange={setSignatureDialogOpen}
        initialImage={signatureTargetIndex >= 0 ? firmantes[signatureTargetIndex]?.firma_imagen : undefined}
        onSave={(dataUrl) => {
          if (signatureTargetIndex >= 0) {
            setFirmantes(prev => prev.map((f, i) => i === signatureTargetIndex ? { ...f, firma_imagen: dataUrl } : f));
          }
        }}
      />

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento de firma?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el documento tanto en Mifiel como en la base de datos. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const firmaToDelete = firmas.find((f: any) => f.id === deleteConfirmId);
                try {
                  // 1. Delete from Mifiel if there's a mifiel_document_id
                  if (firmaToDelete?.mifiel_document_id) {
                    const { data: mifielResult, error: mifielError } = await supabase.functions.invoke("mifiel-cancelar-documento", {
                      body: { document_id: firmaToDelete.mifiel_document_id },
                    });
                    if (mifielError || !mifielResult?.success) {
                      console.error("Mifiel cancel error:", mifielError || mifielResult);
                      toast({ title: "Error al eliminar en Mifiel", description: mifielError?.message || mifielResult?.error || "Error desconocido", variant: "destructive" });
                      setDeleteConfirmId(null);
                      return;
                    }
                  }
                  // 2. Delete from DB
                  const { error: dbError } = await (supabase as any).from("firmas_digitales").delete().eq("id", deleteConfirmId);
                  if (dbError) {
                    toast({ title: "Error al eliminar de la base de datos", description: dbError.message, variant: "destructive" });
                  } else {
                    queryClient.invalidateQueries({ queryKey: ["firmas-digitales", cartaId] });
                    queryClient.invalidateQueries({ queryKey: ["cartas-acuerdo-firma-counts"] });
                    toast({ title: "🗑️ Documento eliminado", description: "Se eliminó de Mifiel y de la base de datos." });
                  }
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                } finally {
                  setDeleteConfirmId(null);
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
