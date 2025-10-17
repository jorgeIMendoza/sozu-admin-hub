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
        body: { question: question.trim() }
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

      setResponse(data as AIQueryResponse);
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

  const renderChart = () => {
    if (!response?.chartData || !response.chartType) return null;

    const commonProps = {
      width: 500,
      height: 300,
      data: response.chartData,
    };

    switch (response.chartType) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={response.chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        );
      case "line":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={response.chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" />
            </LineChart>
          </ResponsiveContainer>
        );
      case "pie":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={response.chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.value}`}
                outerRadius={80}
                fill="hsl(var(--primary))"
                dataKey="value"
              >
                {response.chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );
      case "area":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={response.chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
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
                <TabsTrigger value="chart" disabled={!response.chartData}>Gráfico</TabsTrigger>
                <TabsTrigger value="data">Datos</TabsTrigger>
              </TabsList>

              <TabsContent value="explanation" className="space-y-4">
                {response.summary && Object.keys(response.summary).length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {response.summary.totalPagado !== undefined && (
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Total Pagado</CardTitle>
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            ${response.summary.totalPagado?.toLocaleString('es-MX')}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {response.summary.totalPendiente !== undefined && (
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Total Pendiente</CardTitle>
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            ${response.summary.totalPendiente?.toLocaleString('es-MX')}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
                
                <div className="prose prose-sm max-w-none">
                  <p className="whitespace-pre-wrap">{response.explanation}</p>
                </div>

                {response.sqlQuery && (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full">
                        <ChevronDown className="mr-2 h-4 w-4" />
                        Ver SQL ejecutado
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-2 p-4 bg-muted rounded-lg text-xs overflow-x-auto">
                        <code>{response.sqlQuery}</code>
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </TabsContent>

              <TabsContent value="chart">
                {response.chartData ? (
                  <div className="py-4">
                    {renderChart()}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay datos para graficar
                  </div>
                )}
              </TabsContent>

              <TabsContent value="data">
                {response.rawData && response.rawData.length > 0 ? (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(response.rawData[0]).map((key) => (
                            <TableHead key={key}>{key}</TableHead>
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
