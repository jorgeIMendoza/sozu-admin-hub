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
import { CheckCircle, AlertCircle, XCircle, FileText, Play, AlertTriangle, Copy, Check, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  variables_no_usadas?: string[];
  total_variables_sistema?: number;
  total_variables_usadas?: number;
  total_template?: number;
  total_placeholders_template?: number;
  total_disponibles: number;
  total_faltantes: number;
  total_vacios: number;
  total_no_usadas?: number;
  tiene_problemas: boolean;
}

interface ValidarPlaceholdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validacion: ValidacionData | null;
  compradores: any[];
  tipoPersona: string;
  templateName: string;
  onGenerarContrato?: (options: { marcarVacios: boolean }) => void;
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
  const [seccionActiva, setSeccionActiva] = React.useState<'todas' | 'disponibles' | 'vacios' | 'faltantes' | 'variables' | 'noUsadas'>('disponibles');
  const [copiedVariable, setCopiedVariable] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState<string>("");
  const [showConfirmDialog, setShowConfirmDialog] = React.useState(false);

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

  // Filtrar por término de búsqueda
  const filterBySearch = (placeholder: string) => {
    if (!searchTerm.trim()) return true;
    return placeholder.toLowerCase().includes(searchTerm.toLowerCase());
  };

  const filteredPlaceholdersDisponibles = React.useMemo(() => {
    return validacion.placeholders_disponibles.filter(p => p.estado === 'ok' && filterBySearch(p.placeholder));
  }, [validacion.placeholders_disponibles, searchTerm]);

  const filteredPlaceholdersVacios = React.useMemo(() => {
    return (validacion.placeholders_vacios || []).filter(filterBySearch);
  }, [validacion.placeholders_vacios, searchTerm]);

  const filteredPlaceholdersFaltantes = React.useMemo(() => {
    return (validacion.placeholders_faltantes || []).filter(filterBySearch);
  }, [validacion.placeholders_faltantes, searchTerm]);

  const filteredTodosPlaceholdersTemplate = React.useMemo(() => {
    return todosPlaceholdersTemplate.filter(filterBySearch);
  }, [todosPlaceholdersTemplate, searchTerm]);

  const filteredVariablesNoUsadas = React.useMemo(() => {
    return (validacion.variables_no_usadas || []).filter(filterBySearch);
  }, [validacion.variables_no_usadas, searchTerm]);

  const estadoBadge = (estado: string) => {
    switch (estado) {
      case 'ok':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> OK</Badge>;
      case 'vacío':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-500"><AlertCircle className="w-3 h-3 mr-1" /> Vacío</Badge>;
      case 'faltante':
        return <Badge variant="outline" className="border-orange-500 text-orange-500 bg-orange-50"><AlertCircle className="w-3 h-3 mr-1" /> Por Solicitar</Badge>;
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
            {/* Resumen - Orden: Variables Template, Encontradas, Vacíos, Por Solicitar, No Usadas */}
            <div className="grid grid-cols-5 gap-3">
              {/* 1. Variables Template (azul) */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Card 
                      className={`p-3 border-blue-500 cursor-pointer transition-all ${
                        seccionActiva === 'variables' 
                          ? 'bg-blue-100 dark:bg-blue-950 ring-2 ring-blue-500' 
                          : 'hover:bg-blue-50 dark:hover:bg-blue-950'
                      }`}
                      onClick={() => setSeccionActiva(seccionActiva === 'variables' ? 'todas' : 'variables')}
                    >
                      <div className="text-xs text-muted-foreground">Variables Template</div>
                      <div className="text-xl font-bold text-blue-500">{totalTemplate}</div>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-semibold">Variables del Template</p>
                    <p className="text-xs">Todas las variables {`{{placeholder}}`} encontradas dentro del documento de contrato.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* 2. Encontradas (verde) */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Card 
                      className={`p-3 border-green-500 cursor-pointer transition-all ${
                        seccionActiva === 'disponibles' 
                          ? 'bg-green-100 dark:bg-green-950 ring-2 ring-green-500' 
                          : 'hover:bg-green-50 dark:hover:bg-green-950'
                      }`}
                      onClick={() => setSeccionActiva(seccionActiva === 'disponibles' ? 'todas' : 'disponibles')}
                    >
                      <div className="text-xs text-muted-foreground">Encontradas</div>
                      <div className="text-xl font-bold text-green-500">{validacion.total_disponibles}</div>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-semibold">Variables Encontradas</p>
                    <p className="text-xs">Variables del template que están mapeadas en el sistema Y tienen un valor asignado. Listas para generar.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* 3. Vacíos (amarillo) */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Card 
                      className={`p-3 border-yellow-500 cursor-pointer transition-all ${
                        seccionActiva === 'vacios' 
                          ? 'bg-yellow-100 dark:bg-yellow-950 ring-2 ring-yellow-500' 
                          : 'hover:bg-yellow-50 dark:hover:bg-yellow-950'
                      }`}
                      onClick={() => setSeccionActiva(seccionActiva === 'vacios' ? 'todas' : 'vacios')}
                    >
                      <div className="text-xs text-muted-foreground">Vacíos</div>
                      <div className="text-xl font-bold text-yellow-500">{validacion.total_vacios}</div>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-semibold">Variables Vacías</p>
                    <p className="text-xs">Variables del template que están mapeadas en el sistema PERO no tienen valor. Requieren que se capture la información.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* 4. Por Solicitar (naranja) */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Card 
                      className={`p-3 border-orange-500 cursor-pointer transition-all ${
                        seccionActiva === 'faltantes' 
                          ? 'bg-orange-100 dark:bg-orange-950 ring-2 ring-orange-500' 
                          : 'hover:bg-orange-50 dark:hover:bg-orange-950'
                      }`}
                      onClick={() => setSeccionActiva(seccionActiva === 'faltantes' ? 'todas' : 'faltantes')}
                    >
                      <div className="text-xs text-muted-foreground">Por Solicitar</div>
                      <div className="text-xl font-bold text-orange-500">{validacion.total_faltantes}</div>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-semibold">Variables Por Solicitar</p>
                    <p className="text-xs">Variables en el template que NO están mapeadas en el sistema. Requieren solicitarse al administrador del sistema para agregarlas al código.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* 5. No Usadas (gris) */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Card 
                      className={`p-3 border-gray-400 cursor-pointer transition-all ${
                        seccionActiva === 'noUsadas' 
                          ? 'bg-gray-100 dark:bg-gray-800 ring-2 ring-gray-400' 
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => setSeccionActiva(seccionActiva === 'noUsadas' ? 'todas' : 'noUsadas')}
                    >
                      <div className="text-xs text-muted-foreground">No Usadas</div>
                      <div className="text-xl font-bold text-gray-500">{validacion.total_no_usadas || 0}</div>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-semibold">Variables No Usadas</p>
                    <p className="text-xs">Variables disponibles en el sistema que NO están siendo usadas en el template actual. Puedes copiarlas y agregarlas al template.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Barra de búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar placeholder... (ej: nombre, rfc, precio)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setSearchTerm("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="text-xs text-muted-foreground text-center">
              💡 Haz clic en las tarjetas para filtrar la información
            </div>

            {/* Variables disponibles en el sistema */}
            {(seccionActiva === 'todas' || seccionActiva === 'variables') && todosPlaceholdersTemplate.length > 0 && (
              <Card className="p-4 border-blue-500 bg-blue-50 dark:bg-blue-950">
                <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  📋 Variables del Template: {validacion.total_disponibles || 0} encontradas + {validacion.total_vacios || 0} vacías + {validacion.total_faltantes || 0} por solicitar = {totalTemplate} total
                  {searchTerm && <span className="text-xs">({filteredTodosPlaceholdersTemplate.length} resultados)</span>}
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  <span className="text-green-600 dark:text-green-400 font-semibold">Verde = Encontrada con datos ({validacion.total_disponibles || 0})</span>, 
                  <span className="text-yellow-600 dark:text-yellow-400 font-semibold"> Amarillo = Vacía ({validacion.total_vacios || 0})</span>, 
                  <span className="text-orange-600 dark:text-orange-400 font-semibold"> Naranja = Por Solicitar ({validacion.total_faltantes || 0})</span>
                </div>
                <ScrollArea className="h-[300px] w-full border rounded bg-white dark:bg-background p-2">
                  {filteredTodosPlaceholdersTemplate.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {filteredTodosPlaceholdersTemplate.map((variable, i) => {
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
                          bgColor = 'bg-orange-50 dark:bg-orange-900 border-orange-300 dark:border-orange-700 hover:bg-orange-100 dark:hover:bg-orange-800';
                          iconColor = 'text-orange-600 dark:text-orange-400';
                          Icon = AlertCircle;
                          tooltip = '🔶 Por Solicitar - No mapeada en el sistema';
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
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      No se encontraron resultados para "{searchTerm}"
                    </div>
                  )}
                </ScrollArea>
              </Card>
            )}

            {/* Placeholders Por Solicitar - En template pero NO en sistema */}
            {(seccionActiva === 'todas' || seccionActiva === 'faltantes') && (
              validacion.placeholders_faltantes.length > 0 ? (
                <Card className="p-4 border-orange-500 bg-orange-50 dark:bg-orange-950">
                  <div className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    🔶 {validacion.total_faltantes} Placeholders POR SOLICITAR (aparecerán en NARANJA)
                    {searchTerm && <span className="text-xs">({filteredPlaceholdersFaltantes.length} resultados)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Estos placeholders están en el template pero NO están mapeados en el sistema. Deben ser agregados al código.
                  </div>
                  <ScrollArea className="h-[200px] w-full border rounded bg-white dark:bg-background p-2">
                    {filteredPlaceholdersFaltantes.length > 0 ? (
                      <div className="space-y-1">
                        {filteredPlaceholdersFaltantes.map((ph, i) => (
                          <div key={i} className="text-sm font-mono bg-orange-50 dark:bg-orange-900 p-2 rounded border border-orange-300 dark:border-orange-700 flex items-center justify-between">
                            <span>{`{{${ph}}}`}</span>
                            <Badge variant="outline" className="text-orange-600 border-orange-400 text-xs">
                              Por agregar
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        No se encontraron resultados para "{searchTerm}"
                      </div>
                    )}
                  </ScrollArea>
                </Card>
              ) : seccionActiva === 'faltantes' && (
                <Card className="p-4 border-orange-500 bg-orange-50 dark:bg-orange-950">
                  <div className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    ✅ No hay placeholders por solicitar
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
                    {searchTerm && <span className="text-xs">({filteredPlaceholdersVacios.length} resultados)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Estos placeholders tienen datos mapeados pero los valores están vacíos
                  </div>
                  <ScrollArea className="h-[150px] w-full border rounded bg-white dark:bg-background p-2">
                    {filteredPlaceholdersVacios.length > 0 ? (
                      <div className="space-y-1">
                        {filteredPlaceholdersVacios.map((ph, i) => (
                          <div key={i} className="text-sm font-mono bg-yellow-50 dark:bg-yellow-900 p-2 rounded border border-yellow-300 dark:border-yellow-700">
                            {`{{${ph}}}`}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        No se encontraron resultados para "{searchTerm}"
                      </div>
                    )}
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
                    {searchTerm && <span className="text-xs">({filteredPlaceholdersDisponibles.length} resultados)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Estos placeholders se reemplazarán correctamente en el contrato
                  </div>
                  <div className="h-[250px] border border-green-300 dark:border-green-700 rounded-md overflow-y-scroll bg-green-50 dark:bg-green-950">
                    {filteredPlaceholdersDisponibles.length > 0 ? (
                      <Table>
                        <TableHeader className="sticky top-0 bg-green-100 dark:bg-green-900 z-10 border-b border-green-300 dark:border-green-700">
                          <TableRow className="hover:bg-green-100 dark:hover:bg-green-900">
                            <TableHead className="w-[300px] text-green-700 dark:text-green-300">Placeholder</TableHead>
                            <TableHead className="text-green-700 dark:text-green-300">Valor que se usará</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredPlaceholdersDisponibles.map((item, i) => (
                            <TableRow key={i} className="hover:bg-green-100 dark:hover:bg-green-900 border-green-200 dark:border-green-800">
                              <TableCell className="font-mono text-sm text-green-700 dark:text-green-300">{`{{${item.placeholder}}}`}</TableCell>
                              <TableCell className="text-sm text-green-700 dark:text-green-300">{item.valor}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        No se encontraron resultados para "{searchTerm}"
                      </div>
                    )}
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

            {/* Variables disponibles en el sistema pero NO usadas en el template */}
            {(seccionActiva === 'todas' || seccionActiva === 'noUsadas') && (
              (validacion.variables_no_usadas || []).length > 0 ? (
                <Card className="p-4 border-gray-400 bg-gray-50 dark:bg-gray-900">
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    📦 {validacion.total_no_usadas || 0} Variables Disponibles (no usadas en template)
                    {searchTerm && <span className="text-xs">({filteredVariablesNoUsadas.length} resultados)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Estas variables están disponibles en el sistema y puedes agregarlas a tu template de Google Docs
                  </div>
                  <ScrollArea className="h-[250px] w-full border rounded bg-white dark:bg-background p-2">
                    {filteredVariablesNoUsadas.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {filteredVariablesNoUsadas.map((variable, i) => {
                          const isCopied = copiedVariable === variable;
                          return (
                            <div 
                              key={i} 
                              className="text-xs font-mono p-2 rounded border cursor-pointer transition-all flex items-center justify-between gap-2 group bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                              onClick={() => handleCopyVariable(variable)}
                              title="Click para copiar y usar en tu template"
                            >
                              <span className="flex-1 truncate">{`{{${variable}}}`}</span>
                              <div className="flex items-center gap-1">
                                {isCopied ? (
                                  <Check className="w-3 h-3 text-green-500 animate-in zoom-in" />
                                ) : (
                                  <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        No se encontraron resultados para "{searchTerm}"
                      </div>
                    )}
                  </ScrollArea>
                </Card>
              ) : seccionActiva === 'noUsadas' && (
                <Card className="p-4 border-gray-400 bg-gray-50 dark:bg-gray-900">
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    ✅ Todas las variables del sistema están siendo usadas
                  </div>
                  <div className="text-xs text-muted-foreground">
                    No hay variables adicionales disponibles para agregar al template
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
                      <p>Si generas el contrato ahora, los placeholders Por Solicitar aparecerán en NARANJA y los vacíos en AMARILLO. Puedes continuar de todas formas, pero deberás completar manualmente esos campos en Google Docs.</p>
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
                  // Si hay placeholders vacíos, mostrar confirmación
                  if ((validacion.total_vacios || 0) > 0) {
                    setShowConfirmDialog(true);
                  } else {
                    // Si no hay vacíos, generar directamente
                    onGenerarContrato({ marcarVacios: false });
                    onOpenChange(false);
                  }
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

        {/* Diálogo de confirmación para placeholders vacíos */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="max-w-xl w-[95vw]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Placeholders Vacíos Detectados
              </DialogTitle>
              <DialogDescription>
                Se encontraron <strong>{validacion.total_vacios}</strong> placeholders con valores vacíos. 
                ¿Cómo deseas manejarlos en el contrato?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm font-medium text-muted-foreground">¿Cómo manejar los {validacion.total_vacios} placeholders vacíos?</p>
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3 px-4"
                onClick={() => {
                  setShowConfirmDialog(false);
                  onGenerarContrato({ marcarVacios: false });
                  onOpenChange(false);
                }}
              >
                <div className="text-left">
                  <div className="font-medium">Dejar vacíos</div>
                  <div className="text-xs text-muted-foreground">
                    Los placeholders se reemplazan por texto vacío (no visibles)
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3 px-4 border-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                onClick={() => {
                  setShowConfirmDialog(false);
                  onGenerarContrato({ marcarVacios: true });
                  onOpenChange(false);
                }}
              >
                <div className="text-left">
                  <div className="font-medium flex items-center gap-2">
                    <span className="bg-yellow-300 px-1.5 py-0.5 rounded text-black text-xs font-mono">{'{{placeholder}}'}</span>
                    Marcar en amarillo
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Los placeholders vacíos aparecerán con su nombre y fondo amarillo
                  </div>
                </div>
              </Button>
            </div>

            {/* Información sobre placeholders Por Solicitar - al final */}
            {(validacion.total_faltantes || 0) > 0 && (
              <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-950 border border-orange-300 dark:border-orange-700 rounded-md mt-2">
                <span className="bg-orange-400 px-1.5 py-0.5 rounded text-white text-xs font-mono">{'{{variable}}'}</span>
                <span className="text-sm text-orange-700 dark:text-orange-300">
                  <strong>{validacion.total_faltantes}</strong> placeholders Por Solicitar se marcarán en <strong>NARANJA</strong>
                </span>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowConfirmDialog(false)}>
                Cancelar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
