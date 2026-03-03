import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TemplateEditorWithPreview } from "@/components/admin/TemplateEditorWithPreview";
import { MifielSigningDialog } from "@/components/admin/MifielSigningDialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, Save, Loader2, CheckCircle2, Clock, XCircle, Send, Plus, Trash2, Users, Info, PenTool } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
}

export default function CartaAcuerdos() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [editorHtml, setEditorHtml] = useState<string | null>(null);
  const [firmantes, setFirmantes] = useState<Firmante[]>([]);
  const [firmantesLoaded, setFirmantesLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Mifiel signing dialog state
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingWidgetId, setSigningWidgetId] = useState("");

  // Fetch template
  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ["carta-acuerdos-template"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("carta_acuerdos_template")
        .select("*")
        .order("id")
        .limit(1)
        .single();
      if (error) throw error;
      // Initialize firmantes from DB
      if (!firmantesLoaded && data?.firmantes_config) {
        setFirmantes(data.firmantes_config);
        setFirmantesLoaded(true);
      }
      return data;
    },
  });

  // Fetch firmas
  const { data: firmas = [], isLoading: firmasLoading } = useQuery({
    queryKey: ["firmas-digitales"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("firmas_digitales")
        .select("*")
        .eq("tipo_documento", "carta_acuerdos")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Save template + firmantes
  const saveMutation = useMutation({
    mutationFn: async ({ html, firmantesConfig }: { html: string; firmantesConfig: Firmante[] }) => {
      const { error } = await (supabase as any)
        .from("carta_acuerdos_template")
        .update({
          contenido_html: html,
          firmantes_config: firmantesConfig,
          updated_by: profile?.email || "unknown",
        })
        .eq("id", template?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "✅ Template guardado", description: "La carta y firmantes se guardaron correctamente." });
      queryClient.invalidateQueries({ queryKey: ["carta-acuerdos-template"] });
    },
    onError: (err: any) => {
      toast({ title: "❌ Error", description: err.message, variant: "destructive" });
    },
  });

  const currentHtml = editorHtml ?? template?.contenido_html ?? "";

  const addFirmante = () => {
    if (!newName.trim() || !newEmail.trim()) {
      toast({ title: "Completa nombre y correo", variant: "destructive" });
      return;
    }
    setFirmantes([...firmantes, { name: newName.trim(), email: newEmail.trim() }]);
    setNewName("");
    setNewEmail("");
  };

  const removeFirmante = (index: number) => {
    setFirmantes(firmantes.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    saveMutation.mutate({ html: currentHtml, firmantesConfig: firmantes });
  };

  const openSigningWidget = (widgetId: string) => {
    setSigningWidgetId(widgetId);
    setSigningOpen(true);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="editor">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Carta de Acuerdos
          </CardTitle>
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="firmantes">Firmantes</TabsTrigger>
            <TabsTrigger value="firmas">Firmas ({firmas.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="editor" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Template de la Carta</CardTitle>
                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || templateLoading}
                  size="sm"
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Guardar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {templateLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <TemplateEditorWithPreview
                  value={currentHtml}
                  onChange={setEditorHtml}
                  placeholders={PLACEHOLDERS}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="firmantes" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Firmantes Configurados
                </CardTitle>
                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || templateLoading}
                  size="sm"
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Guardar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Configured firmantes list */}
              {firmantes.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No hay firmantes configurados. Agrega al menos uno.
                </div>
              )}
              {firmantes.map((f, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{f.email}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeFirmante(i)} className="shrink-0">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}

              {/* Add firmante form */}
              <div className="flex items-end gap-2 pt-2 border-t">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre</label>
                  <Input
                    placeholder="Nombre completo"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Correo</label>
                  <Input
                    placeholder="correo@empresa.com"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addFirmante()}
                  />
                </div>
                <Button onClick={addFirmante} size="icon" variant="outline" className="shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 p-3 rounded-lg border bg-muted/50">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  El agente se agrega automáticamente al momento de firmar desde su portal. 
                  Los firmantes configurados aquí recibirán un correo de Mifiel para firmar cuando el agente inicie el proceso.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="firmas" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial de Firmas</CardTitle>
            </CardHeader>
            <CardContent>
              {firmasLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : firmas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay firmas digitales registradas
                </div>
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
                                const hasWidgetId = !!f.widget_id;
                                const isCompleted = firma.estado === "completado";
                                const canSign = hasWidgetId && !isCompleted;
                                return (
                                  <div key={i} className="flex items-center gap-2">
                                    <div className="text-xs">
                                      <span className="font-medium">{f.name}</span>
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
                                    </div>
                                    {canSign && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-xs px-2"
                                        onClick={() => openSigningWidget(f.widget_id)}
                                      >
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
                            {firma.pdf_firmado_url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(firma.pdf_firmado_url, "_blank")}
                              >
                                Ver PDF
                              </Button>
                            )}
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

      {/* Mifiel Signing Dialog */}
      <MifielSigningDialog
        open={signingOpen}
        onOpenChange={setSigningOpen}
        widgetId={signingWidgetId}
        onSuccess={() => {
          toast({ title: "✅ Firma registrada", description: "Tu firma se ha registrado correctamente." });
          setSigningOpen(false);
          queryClient.invalidateQueries({ queryKey: ["firmas-digitales"] });
        }}
        onError={(err) => {
          toast({ title: "Error en firma", description: err, variant: "destructive" });
        }}
      />
    </div>
  );
}
