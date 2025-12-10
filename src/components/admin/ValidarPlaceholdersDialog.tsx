import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, AlertCircle, XCircle, FileText, Play, AlertTriangle, Copy, Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import React from "react";

interface ValidacionData {
  placeholders_en_template?: string[];
  todosPlaceholdersTemplate?: string[];
  placeholders_disponibles: Array<{placeholder: string, valor: string, estado: string}>;
  placeholders_faltantes: string[];
  placeholders_vacios: string[];
  variables_disponibles_sistema?: string[];
  variables_sistema?: string[];
  variables_usadas_en_template?: string[];
  total_variables_sistema?: number;
  total_variables_usadas?: number;
  total_template?: number;
  total_placeholders_template?: number;
  total_disponibles: number;
  total_faltantes: number;
  total_vacios: number;
  tiene_problemas: boolean;
}

interface ValidarPlaceholdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validacion: ValidacionData | null;
  compradores: any[];
  tipoPersona: string;
  templateName: string;
  onGenerarContrato?: () => void;
  isGenerating?: boolean;
}

export function ValidarPlaceholdersDialog({
  open,
  onOpenChange,
  validacion,
  compradores,
  tipoPersona,
  templateName,
  onGenerarContrato,
  isGenerating = false
}: ValidarPlaceholdersDialogProps) {
  if (!validacion) return null;

  const { toast } = useToast();
  const [seccionActiva, setSeccionActiva] = React.useState<'todas' | 'disponibles' | 'vacios' | 'faltantes' | 'variables'>('disponibles');
  const [copiedVariable, setCopiedVariable] = React.useState<string | null>(null);

  const handleCopyVariable = (variable: string) => {
    const textoACopiar = `{{${variable}}}`;
    navigator.clipboard.writeText(textoACopiar);
    setCopiedVariable(variable);
    toast({
      title: "✅ Variable copiada",
      description: `${textoACopiar} copiado al portapapeles`,
      duration: 2000,
    });
    setTimeout(() => setCopiedVariable(null), 2000);
  };

  // Crear Sets para clasificar los placeholders del template
  const placeholdersDisponiblesSet = React.useMemo(() => {
    return new Set(validacion.placeholders_disponibles.filter(p => p.estado === 'ok').map(p => p.placeholder));
  }, [validacion.placeholders_disponibles]);

  const placeholdersVaciosSet = React.useMemo(() => {
    return new Set(validacion.placeholders_vacios || []);
  }, [validacion.placeholders_vacios]);

  const placeholdersFaltantesSet = React.useMemo(() => {
    return new Set(validacion.placeholders_faltantes || []);
  }, [validacion.placeholders_faltantes]);

  // Todos los placeholders del template - soporta ambos nombres de campo
  const todosPlaceholdersTemplate = React.useMemo(() => {
    return validacion.todosPlaceholdersTemplate || validacion.placeholders_en_template || validacion.variables_usadas_en_template || [];
  }, [validacion.todosPlaceholdersTemplate, validacion.placeholders_en_template, validacion.variables_usadas_en_template]);
  
  // Total de placeholders del template - soporta ambos nombres
  const totalTemplate = validacion.total_placeholders_template || validacion.total_template || todosPlaceholdersTemplate.length;

  const estadoBadge = (estado: string) => {
    switch (estado) {
      case 'ok':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> OK</Badge>;
      case 'vacío':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-500"><AlertCircle className="w-3 h-3 mr-1" /> Vacío</Badge>;
      default:
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Falta</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Validación de Placeholders - {templateName}
          </DialogTitle>
          <DialogDescription>
            Revisión de placeholders antes de generar el contrato
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {/* Resumen */}
            <div className="grid grid-cols-4 gap-4">
              <Card 
                className={`p-4 border-green-500 cursor-pointer transition-all relative ${
                  seccionActiva === 'disponibles' 
                    ? 'bg-green-100 dark:bg-green-950 ring-2 ring-green-500' 
                    : 'hover:bg-green-50 dark:hover:bg-green-950'
                }`}
                onClick={() => setSeccionActiva(seccionActiva === 'disponibles' ? 'todas' : 'disponibles')}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="absolute top-2 right-2 text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-semibold cursor-help">
                        Template
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Datos extraídos del template de Google Docs</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div className="text-sm text-muted-foreground">Encontradas</div>
                <div className="text-2xl font-bold text-green-500">{validacion.total_disponibles}</div>
              </Card>
              <Card 
                className={`p-4 border-yellow-500 cursor-pointer transition-all relative ${
                  seccionActiva === 'vacios' 
                    ? 'bg-yellow-100 dark:bg-yellow-950 ring-2 ring-yellow-500' 
                    : 'hover:bg-yellow-50 dark:hover:bg-yellow-950'
                }`}
                onClick={() => setSeccionActiva(seccionActiva === 'vacios' ? 'todas' : 'vacios')}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="absolute top-2 right-2 text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-semibold cursor-help">
                        Template
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Datos extraídos del template de Google Docs</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div className="text-sm text-muted-foreground">Vacíos</div>
                <div className="text-2xl font-bold text-yellow-500">{validacion.total_vacios}</div>
              </Card>
              <Card 
                className={`p-4 border-red-500 cursor-pointer transition-all relative ${
                  seccionActiva === 'faltantes' 
                    ? 'bg-red-100 dark:bg-red-950 ring-2 ring-red-500' 
                    : 'hover:bg-red-50 dark:hover:bg-red-950'
                }`}
                onClick={() => setSeccionActiva(seccionActiva === 'faltantes' ? 'todas' : 'faltantes')}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="absolute top-2 right-2 text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-semibold cursor-help">
                        Template
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Datos extraídos del template de Google Docs</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div className="text-sm text-muted-foreground">Faltantes</div>
                <div className="text-2xl font-bold text-red-500">{validacion.total_faltantes}</div>
              </Card>
              <Card 
                className={`p-4 border-blue-500 cursor-pointer transition-all ${
                  seccionActiva === 'variables' 
                    ? 'bg-blue-100 dark:bg-blue-950 ring-2 ring-blue-500' 
                    : 'hover:bg-blue-50 dark:hover:bg-blue-950'
                }`}
                onClick={() => setSeccionActiva(seccionActiva === 'variables' ? 'todas' : 'variables')}
              >
                <div className="text-sm text-muted-foreground">Variables Template</div>
                <div className="text-2xl font-bold text-blue-500">
                  {totalTemplate}
                </div>
              </Card>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              💡 Haz clic en las tarjetas para filtrar la información
            </div>

            {/* Variables disponibles en el sistema */}
            {(seccionActiva === 'todas' || seccionActiva === 'variables') && todosPlaceholdersTemplate.length > 0 && (
              <Card className="p-4 border-blue-500 bg-blue-50 dark:bg-blue-950">
                <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  📋 Variables del Template: {validacion.total_disponibles || 0} encontradas + {validacion.total_vacios || 0} vacías + {validacion.total_faltantes || 0} faltantes = {totalTemplate} total
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  <span className="text-green-600 dark:text-green-400 font-semibold">Verde = Encontrada con datos ({validacion.total_disponibles || 0})</span>, 
                  <span className="text-yellow-600 dark:text-yellow-400 font-semibold"> Amarillo = Vacía ({validacion.total_vacios || 0})</span>, 
                  <span className="text-red-600 dark:text-red-400 font-semibold"> Rojo = Faltante ({validacion.total_faltantes || 0})</span>
                </div>
                <ScrollArea className="h-[300px] w-full border rounded bg-white dark:bg-background p-2">
                  <div className="grid grid-cols-2 gap-2">
                    {todosPlaceholdersTemplate.map((variable, i) => {
                      const isCopied = copiedVariable === variable;
                      const estaDisponible = placeholdersDisponiblesSet.has(variable);
                      const estaVacio = placeholdersVaciosSet.has(variable);
                      const estaFaltante = placeholdersFaltantesSet.has(variable);
                      
                      let bgColor = 'bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800';
                      let iconColor = 'text-blue-600 dark:text-blue-400';
                      let Icon = CheckCircle;
                      let tooltip = 'Click para copiar al portapapeles';
                      
                      if (estaDisponible) {
                        bgColor = 'bg-green-50 dark:bg-green-900 border-green-300 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-800';
                        iconColor = 'text-green-600 dark:text-green-400';
                        Icon = CheckCircle;
                        tooltip = '✅ Encontrada con datos - Click para copiar';
                      } else if (estaVacio) {
                        bgColor = 'bg-yellow-50 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-yellow-800';
                        iconColor = 'text-yellow-600 dark:text-yellow-400';
                        Icon = AlertCircle;
                        tooltip = '⚠️ Vacía - Click para copiar';
                      } else if (estaFaltante) {
                        bgColor = 'bg-red-50 dark:bg-red-900 border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-800';
                        iconColor = 'text-red-600 dark:text-red-400';
                        Icon = XCircle;
                        tooltip = '❌ Faltante - No existe en el sistema';
                      }
                      
                      return (
                        <div 
                          key={i} 
                          className={`text-xs font-mono p-2 rounded border cursor-pointer transition-all flex items-center justify-between gap-2 group ${bgColor}`}
                          onClick={() => handleCopyVariable(variable)}
                          title={tooltip}
                        >
                          <span className="flex-1">{`{{${variable}}}`}</span>
                          <div className="flex items-center gap-1">
                            <Icon className={`w-3 h-3 ${iconColor}`} />
                            {isCopied ? (
                              <Check className={`w-3 h-3 ${iconColor} animate-in zoom-in`} />
                            ) : (
                              <Copy className={`w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ${iconColor}`} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </Card>
            )}

            {/* Placeholders Faltantes - PRIORIDAD */}
            {(seccionActiva === 'todas' || seccionActiva === 'faltantes') && (
              validacion.placeholders_faltantes.length > 0 ? (
                <Card className="p-4 border-red-500 bg-red-50 dark:bg-red-950">
                  <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    ⚠️ CRÍTICO: {validacion.total_faltantes} Placeholders NO GENERADOS (aparecerán en ROJO)
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Estos placeholders están en el template pero NO tienen datos disponibles
                  </div>
                  <ScrollArea className="h-[200px] w-full border rounded bg-white dark:bg-background p-2">
                    <div className="space-y-1">
                      {validacion.placeholders_faltantes.map((ph, i) => (
                        <div key={i} className="text-sm font-mono bg-red-50 dark:bg-red-900 p-2 rounded border border-red-300 dark:border-red-700">
                          {`{{${ph}}}`}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </Card>
              ) : seccionActiva === 'faltantes' && (
                <Card className="p-4 border-red-500 bg-red-50 dark:bg-red-950">
                  <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    ✅ No hay placeholders faltantes
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Todos los placeholders del template tienen datos mapeados en el sistema
                  </div>
                </Card>
              )
            )}

            {/* Placeholders Vacíos */}
            {(seccionActiva === 'todas' || seccionActiva === 'vacios') && (
              validacion.placeholders_vacios.length > 0 ? (
                <Card className="p-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                  <div className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {validacion.total_vacios} Placeholders con datos VACÍOS (aparecerán en AMARILLO)
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Estos placeholders tienen datos mapeados pero los valores están vacíos
                  </div>
                  <ScrollArea className="h-[150px] w-full border rounded bg-white dark:bg-background p-2">
                    <div className="space-y-1">
                      {validacion.placeholders_vacios.map((ph, i) => (
                        <div key={i} className="text-sm font-mono bg-yellow-50 dark:bg-yellow-900 p-2 rounded border border-yellow-300 dark:border-yellow-700">
                          {`{{${ph}}}`}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </Card>
              ) : seccionActiva === 'vacios' && (
                <Card className="p-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                  <div className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    ✅ No hay placeholders vacíos
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Todos los placeholders del template tienen datos completos
                  </div>
                </Card>
              )
            )}

            {/* Tabla completa de placeholders ENCONTRADOS OK */}
            {(seccionActiva === 'todas' || seccionActiva === 'disponibles') && (
              validacion.placeholders_disponibles.filter(p => p.estado === 'ok').length > 0 ? (
                <div>
                  <div className="text-sm font-medium mb-2 flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    ✅ {validacion.placeholders_disponibles.filter(p => p.estado === 'ok').length} Placeholders Correctamente Mapeados
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Estos placeholders se reemplazarán correctamente en el contrato
                  </div>
                  <div className="h-[250px] border border-green-300 dark:border-green-700 rounded-md overflow-y-scroll bg-green-50 dark:bg-green-950">
                    <Table>
                      <TableHeader className="sticky top-0 bg-green-100 dark:bg-green-900 z-10 border-b border-green-300 dark:border-green-700">
                        <TableRow className="hover:bg-green-100 dark:hover:bg-green-900">
                          <TableHead className="w-[300px] text-green-700 dark:text-green-300">Placeholder</TableHead>
                          <TableHead className="text-green-700 dark:text-green-300">Valor que se usará</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validacion.placeholders_disponibles
                          .filter(item => item.estado === 'ok')
                          .map((item, i) => (
                            <TableRow key={i} className="hover:bg-green-100 dark:hover:bg-green-900 border-green-200 dark:border-green-800">
                              <TableCell className="font-mono text-sm text-green-700 dark:text-green-300">{`{{${item.placeholder}}}`}</TableCell>
                              <TableCell className="text-sm text-green-700 dark:text-green-300">{item.valor}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : seccionActiva === 'disponibles' && (
                <Card className="p-4 border-green-500 bg-green-50 dark:bg-green-950">
                  <div className="text-sm font-medium text-green-600 dark:text-green-400 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    ℹ️ No hay placeholders encontrados con datos
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Revisa las secciones de Vacíos y Faltantes para ver qué placeholders necesitan atención
                  </div>
                </Card>
              )
            )}

          </div>
        </ScrollArea>

        {onGenerarContrato && (
          <DialogFooter className="flex justify-between items-center gap-3">
            {/* Advertencia como icono con tooltip */}
            <div className="flex items-center gap-2">
              {validacion.tiene_problemas && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="text-sm font-medium">Advertencia</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      <p>Si generas el contrato ahora, los placeholders faltantes aparecerán en ROJO y los vacíos en AMARILLO. Puedes continuar de todas formas, pero deberás completar manualmente esos campos en Google Docs.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {!validacion.tiene_problemas && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">Todo listo</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Todos los placeholders están correctamente mapeados. El contrato se generará sin problemas.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isGenerating}
              >
                Cerrar
              </Button>
              <Button
                onClick={() => {
                  onGenerarContrato();
                  onOpenChange(false);
                }}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <AlertCircle className="w-4 h-4 mr-2 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Generar Contrato
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
