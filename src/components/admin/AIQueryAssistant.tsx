import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Bot, ChevronDown, Loader2, TrendingUp, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AIQueryResponse {
  explanation: string;
  sqlQuery: string | null;
  chartType: "bar" | "line" | "pie" | "area" | null;
  chartData: Array<{ name: string; value: number; [key: string]: any }> | null;
  rawData: Array<any>;
  summary?: {
    totalPagado?: number;
    totalPendiente?: number;
    [key: string]: any;
  };
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

const EXAMPLE_QUESTIONS = [
  "¿Cuánto me pagaron este mes y cuánto me deben?",
  "¿Cuáles son las 5 propiedades con más pagos pendientes?",
  "Muéstrame un gráfico de pagos por mes en el último año",
  "¿Qué porcentaje de mis cuentas está completamente pagado?",
];

export function AIQueryAssistant() {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<AIQueryResponse | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [chartType, setChartType] = useState<"auto" | "pie" | "bar" | "line" | "area">("auto");
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!question.trim()) {
      toast({
        title: "Error",
        description: "Por favor escribe una pregunta",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setResponse(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-database-query', {
        body: { 
          question: question.trim(),
          preferredChartType: chartType === "auto" ? null : chartType
        }
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      let processedData = data as AIQueryResponse;

      // Try to parse explanation if it contains JSON
      if (processedData.explanation && processedData.explanation.includes('"explanation"')) {
        try {
          const jsonMatch = processedData.explanation.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            processedData = {
              ...processedData,
              explanation: parsed.explanation || processedData.explanation,
              chartType: parsed.chartType || processedData.chartType,
              chartData: parsed.chartData || processedData.chartData,
              summary: parsed.summary || processedData.summary,
            };
          }
        } catch (e) {
          console.log("Could not parse embedded JSON, using as is");
        }
      }

      // Auto-generate chart data if we have summary but no chart
      if (!processedData.chartData && processedData.summary) {
        const { totalPagado, totalPendiente } = processedData.summary;
        if (totalPagado !== undefined || totalPendiente !== undefined) {
          const chartData = [];
          if (totalPagado !== undefined && totalPagado > 0) {
            chartData.push({ name: "Total Recibido", value: totalPagado });
          }
          if (totalPendiente !== undefined && totalPendiente > 0) {
            chartData.push({ name: "Deuda Pendiente", value: totalPendiente });
          }
          if (chartData.length > 0) {
            processedData.chartData = chartData;
            processedData.chartType = "pie";
          }
        }
      }

      setResponse(processedData);
    } catch (error: any) {
      console.error("Error querying AI:", error);
      toast({
        title: "Error",
        description: error.message || "Error al procesar la consulta",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-1">{label}</p>
          <p className="text-primary text-sm">
            Monto: {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    if (!response?.chartData || !response.chartType) return null;

    const formatYAxis = (value: number) => {
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
      } else if (value >= 1000) {
        return `$${(value / 1000).toFixed(0)}K`;
      }
      return `$${value}`;
    };

    switch (response.chartType) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={response.chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={formatYAxis} />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                formatter={() => "Monto"} 
                wrapperStyle={{ paddingTop: '10px' }}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" name="Monto" />
            </BarChart>
          </ResponsiveContainer>
        );
      case "line":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={response.chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={formatYAxis} />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                formatter={() => "Monto"} 
                wrapperStyle={{ paddingTop: '10px' }}
              />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" name="Monto" />
            </LineChart>
          </ResponsiveContainer>
        );
      case "pie":
        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={response.chartData}
                cx="50%"
                cy="50%"
                labelLine={true}
                label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}
                outerRadius={100}
                fill="hsl(var(--primary))"
                dataKey="value"
              >
                {response.chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                formatter={(value, entry: any) => entry.payload.name}
                wrapperStyle={{ paddingTop: '20px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      case "area":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={response.chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={formatYAxis} />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                formatter={() => "Monto"} 
                wrapperStyle={{ paddingTop: '10px' }}
              />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" name="Monto" />
            </AreaChart>
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Bot className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Consultas IA</h1>
          <p className="text-muted-foreground">Pregunta sobre tus datos en lenguaje natural</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hazme una pregunta</CardTitle>
          <CardDescription>Pregunta cualquier cosa sobre pagos, propiedades, cuentas, etc.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="Ej: ¿Cuánto dinero recibí este mes?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  handleSubmit();
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUESTIONS.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  onClick={() => setQuestion(q)}
                  className="text-xs"
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tipo de gráfico</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "auto", label: "Automático" },
                { value: "pie", label: "Pastel" },
                { value: "bar", label: "Barras" },
                { value: "line", label: "Línea" },
                { value: "area", label: "Área" },
              ].map((option) => (
                <Button
                  key={option.value}
                  variant={chartType === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setChartType(option.value as any)}
                  className="text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <Button 
            onClick={handleSubmit} 
            disabled={isLoading || !question.trim()}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analizando...
              </>
            ) : (
              <>
                <Bot className="mr-2 h-4 w-4" />
                Analizar
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {response && (
        <Card>
          <CardHeader>
            <CardTitle>Respuesta</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="explanation" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="explanation">Explicación</TabsTrigger>
                <TabsTrigger 
                  value="chart" 
                  disabled={!response.chartData || response.chartData.length === 0}
                >
                  Gráfico
                </TabsTrigger>
                <TabsTrigger value="data">Datos</TabsTrigger>
              </TabsList>

              <TabsContent value="explanation" className="space-y-4">
                {response.summary && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {response.summary.totalPagado !== undefined && response.summary.totalPagado !== null && (
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Total Pagado</CardTitle>
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                            ${response.summary.totalPagado?.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Ingresos recibidos
                          </p>
                        </CardContent>
                      </Card>
                    )}
                    {response.summary.totalPendiente !== undefined && response.summary.totalPendiente !== null && (
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Total Pendiente</CardTitle>
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                            ${response.summary.totalPendiente?.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Por cobrar
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
                
                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base">Análisis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">{response.explanation}</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="chart">
                {response.chartData && response.chartData.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Visualización</CardTitle>
                      <CardDescription>
                        Representación gráfica de los datos
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="py-4">
                        {renderChart()}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No hay datos para graficar</p>
                    <p className="text-xs mt-2">Intenta preguntas como "¿Cuánto me pagaron y cuánto me deben?"</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="data">
                {response.summary && Object.keys(response.summary).length > 0 && (response.summary.totalPagado !== undefined || response.summary.totalPendiente !== undefined) ? (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Resumen de Datos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Concepto</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Object.entries(response.summary).map(([key, value]) => {
                                let label = key;
                                if (key === 'totalPagado') label = 'Total Pagado';
                                if (key === 'totalPendiente') label = 'Total Pendiente';
                                
                                const displayValue = typeof value === 'number' 
                                  ? `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : String(value);
                                
                                return (
                                  <TableRow key={key}>
                                    <TableCell className="font-medium">{label}</TableCell>
                                    <TableCell className="text-right">{displayValue}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                    
                    {response.rawData && response.rawData.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Datos Detallados</CardTitle>
                          <CardDescription>
                            Mostrando {response.rawData.length} registro(s)
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="rounded-md border overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {Object.keys(response.rawData[0]).map((key) => (
                                    <TableHead key={key} className="capitalize">
                                      {key.replace(/_/g, ' ')}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {response.rawData.slice(0, 50).map((row, i) => (
                                  <TableRow key={i}>
                                    {Object.values(row).map((value: any, j) => (
                                      <TableCell key={j}>
                                        {value === null 
                                          ? '-' 
                                          : typeof value === 'number'
                                            ? value.toLocaleString('es-MX')
                                            : String(value)}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                            {response.rawData.length > 50 && (
                              <div className="p-2 text-xs text-center text-muted-foreground bg-muted">
                                Mostrando primeros 50 de {response.rawData.length} registros
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : response.rawData && response.rawData.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Datos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {Object.keys(response.rawData[0]).map((key) => (
                                <TableHead key={key} className="capitalize">
                                  {key.replace(/_/g, ' ')}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {response.rawData.map((row, i) => (
                              <TableRow key={i}>
                                {Object.values(row).map((value: any, j) => (
                                  <TableCell key={j}>
                                    {value === null ? '-' : String(value)}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay datos para mostrar
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
