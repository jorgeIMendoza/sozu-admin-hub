import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, FlaskConical, BarChart3, Users, Calendar, Trophy, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const ABTests = () => {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [finalizarTest, setFinalizarTest] = useState<any>(null);
  const [selectedWinner, setSelectedWinner] = useState("A");

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ["ab-tests-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ab_tests").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: assignmentCounts = {} } = useQuery({
    queryKey: ["ab-test-assignment-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ab_test_assignments").select("ab_test_id, variante");
      if (error) throw error;
      const counts: Record<number, Record<string, number>> = {};
      (data || []).forEach((a: any) => {
        if (!counts[a.ab_test_id]) counts[a.ab_test_id] = {};
        counts[a.ab_test_id][a.variante] = (counts[a.ab_test_id][a.variante] || 0) + 1;
      });
      return counts;
    },
  });

  const { data: visitsByTest = {} } = useQuery({
    queryKey: ["ab-test-visit-counts"],
    queryFn: async () => {
      // Get all assignments to map user_email -> (test_id, variant)
      const { data: assignments, error: aErr } = await supabase.from("ab_test_assignments").select("ab_test_id, user_email, variante");
      if (aErr) throw aErr;

      // Get all active test pages to filter page_views
      const { data: allTests, error: tErr } = await supabase.from("ab_tests").select("id, pagina");
      if (tErr) throw tErr;

      const pageByTest: Record<number, string> = {};
      (allTests || []).forEach((t: any) => { pageByTest[t.id] = t.pagina; });

      // Build user->variant map per test
      const userVariantMap: Record<number, Record<string, string>> = {};
      (assignments || []).forEach((a: any) => {
        if (!userVariantMap[a.ab_test_id]) userVariantMap[a.ab_test_id] = {};
        userVariantMap[a.ab_test_id][a.user_email] = a.variante;
      });

      // Get page_view events
      const { data: pageViews, error: pvErr } = await supabase.from("cta_events").select("user_email, page").eq("element_id", "page_view");
      if (pvErr) throw pvErr;

      // Normalize page paths for matching (e.g. "/admin/inmobiliarias/inventario" -> "inventario")
      const normalizePageForMatch = (p: string) => p.replace(/^\//, "").split("/").pop() || p;

      const counts: Record<number, Record<string, number>> = {};
      (pageViews || []).forEach((pv: any) => {
        // Match to each test by page (normalized)
        const pvNorm = normalizePageForMatch(pv.page);
        Object.entries(pageByTest).forEach(([testIdStr, pagina]) => {
          const testId = Number(testIdStr);
          if (pvNorm === normalizePageForMatch(pagina) && userVariantMap[testId]?.[pv.user_email]) {
            const variant = userVariantMap[testId][pv.user_email];
            if (!counts[testId]) counts[testId] = {};
            counts[testId][variant] = (counts[testId][variant] || 0) + 1;
          }
        });
      });
      return counts;
    },
  });

  const activeTests = tests.filter((t: any) => t.activo);
  const pastTests = tests.filter((t: any) => !t.activo);

  const handleFinalizar = (test: any) => {
    setSelectedWinner("A");
    setFinalizarTest(test);
  };

  const confirmFinalizar = async () => {
    if (!finalizarTest) return;
    const { error } = await supabase
      .from("ab_tests")
      .update({ activo: false, fecha_fin: new Date().toISOString(), variante_ganadora: selectedWinner })
      .eq("id", finalizarTest.id);
    if (error) toast.error("Error al finalizar");
    else {
      toast.success(`Test finalizado. Ganadora: Variante ${selectedWinner}`);
      queryClient.invalidateQueries({ queryKey: ["ab-tests-all"] });
    }
    setFinalizarTest(null);
  };

  const reactivarTest = async (testId: number) => {
    const { error } = await supabase
      .from("ab_tests")
      .update({ activo: true, fecha_fin: null, variante_ganadora: null })
      .eq("id", testId);
    if (error) toast.error("Error al reactivar");
    else { toast.success("Test reactivado"); queryClient.invalidateQueries({ queryKey: ["ab-tests-all"] }); }
  };

  const updateGanadora = async (testId: number, variante: string) => {
    const { error } = await supabase
      .from("ab_tests")
      .update({ variante_ganadora: variante })
      .eq("id", testId);
    if (error) toast.error("Error al actualizar ganadora");
    else { toast.success(`Ganadora actualizada a Variante ${variante}`); queryClient.invalidateQueries({ queryKey: ["ab-tests-all"] }); }
  };

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">A/B Tests</h1>
          <p className="text-sm text-muted-foreground">Gestión y resultados de pruebas A/B</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo Test</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Crear A/B Test</DialogTitle></DialogHeader>
            <CreateTestForm onCreated={() => { setCreateOpen(false); queryClient.invalidateQueries({ queryKey: ["ab-tests-all"] }); }} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Tests */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-emerald-500" /> Tests Activos ({activeTests.length})
        </h2>
        {activeTests.length === 0 && <p className="text-sm text-muted-foreground">No hay tests activos</p>}
        {activeTests.map((test: any) => (
          <TestCard key={test.id} test={test} assignments={assignmentCounts[test.id] || {}} visits={visitsByTest[test.id] || {}} onFinalizar={() => handleFinalizar(test)} />
        ))}
      </div>

      {/* Past Tests */}
      {pastTests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Tests Finalizados ({pastTests.length})
          </h2>
          {pastTests.map((test: any) => (
            <TestCard key={test.id} test={test} assignments={assignmentCounts[test.id] || {}} visits={visitsByTest[test.id] || {}} onReactivar={() => reactivarTest(test.id)} onUpdateGanadora={(v) => updateGanadora(test.id, v)} isPast />
          ))}
        </div>
      )}

      {/* Finalizar Dialog */}
      <Dialog open={!!finalizarTest} onOpenChange={(open) => !open && setFinalizarTest(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Finalizar Test</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Selecciona la variante ganadora. Todos los usuarios verán esta variante a partir de ahora.</p>
          <RadioGroup value={selectedWinner} onValueChange={setSelectedWinner} className="mt-3 space-y-2">
            {((finalizarTest?.variantes as string[]) || ["A", "B"]).map((v: string) => (
              <div key={v} className="flex items-center space-x-2">
                <RadioGroupItem value={v} id={`winner-${v}`} />
                <Label htmlFor={`winner-${v}`} className="cursor-pointer">Variante {v}</Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setFinalizarTest(null)}>Cancelar</Button>
            <Button onClick={confirmFinalizar} className="gap-2"><Trophy className="h-4 w-4" /> Finalizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const TestCard = ({ test, assignments, visits, onFinalizar, onReactivar, onUpdateGanadora, isPast }: { test: any; assignments: Record<string, number>; visits: Record<string, number>; onFinalizar?: () => void; onReactivar?: () => void; onUpdateGanadora?: (v: string) => void; isPast?: boolean }) => {
  const variantes = (test.variantes as string[]) || ["A", "B"];
  const chartData = variantes.map((v) => {
    const usuarios = assignments[v] || 0;
    const visitas = visits[v] || 0;
    const efectividad = usuarios > 0 ? Math.round((visitas / usuarios) * 10) / 10 : 0;
    return { name: `Variante ${v}`, usuarios, visitas, efectividad };
  });
  const totalUsers = Object.values(assignments).reduce((a: number, b: number) => a + b, 0);

  // Suggest winner based on highest effectiveness
  const bestVariant = chartData.reduce((best, curr) => curr.efectividad > best.efectividad ? curr : best, chartData[0]);
  const suggestedWinner = totalUsers > 0 && bestVariant.efectividad > 0 ? bestVariant.name.replace("Variante ", "") : null;

  return (
    <Card className={`border ${isPast ? "border-muted" : "border-primary/20"}`}>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">{test.nombre}</h3>
            {test.descripcion && <p className="text-xs text-muted-foreground mt-0.5">{test.descripcion}</p>}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>Página: <span className="font-medium text-foreground">{test.pagina}</span></span>
              <span>Inicio: {format(new Date(test.fecha_inicio), "dd MMM yyyy", { locale: es })}</span>
              {test.fecha_fin && <span>Fin: {format(new Date(test.fecha_fin), "dd MMM yyyy", { locale: es })}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-muted-foreground">Ver:</span>
              <Link to={`${test.pagina}?ab_force=A`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Variante A <ExternalLink className="h-3 w-3" />
              </Link>
              <Link to={`${test.pagina}?ab_force=B`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Variante B <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {test.variante_ganadora && (
              <Badge className="bg-amber-500/90 text-white gap-1">
                <Trophy className="h-3 w-3" /> {test.variante_ganadora}
              </Badge>
            )}
            <Badge className={test.activo ? "bg-emerald-500/90 text-white" : "bg-muted text-muted-foreground"}>{test.activo ? "Activo" : "Finalizado"}</Badge>
            {isPast ? (
              <Button variant="outline" size="sm" onClick={onReactivar}>Reactivar</Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onFinalizar}>Finalizar</Button>
            )}
          </div>
        </div>

        <div className="flex gap-4 flex-wrap">
          {variantes.map((v: string) => {
            const usuarios = assignments[v] || 0;
            const visitas = visits[v] || 0;
    const efectividad = usuarios > 0 ? Math.round((visitas / usuarios) * 10) / 10 : 0;
            return (
              <div key={v} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Var. {v}:</span>
                <span>{usuarios} usuarios</span>
                <span className="text-muted-foreground">•</span>
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{visitas} visitas</span>
                <span className="text-muted-foreground">•</span>
                <span className="font-semibold text-foreground">{efectividad} visitas/usuario</span>
                {isPast && onUpdateGanadora && (
                  <Button variant={test.variante_ganadora === v ? "default" : "ghost"} size="sm" className="ml-2 h-6 text-xs" onClick={() => onUpdateGanadora(v)}>
                    {test.variante_ganadora === v ? <><Trophy className="h-3 w-3 mr-1" /> Ganadora</> : "Elegir"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {suggestedWinner && !test.variante_ganadora && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50 text-sm">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="text-muted-foreground">Sugerencia:</span>
            <span className="font-semibold text-foreground">Variante {suggestedWinner}</span>
            <span className="text-muted-foreground">tiene mayor efectividad ({bestVariant.efectividad} visitas/usuario)</span>
          </div>
        )}

        {totalUsers > 0 && (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ left: 0, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="usuarios" name="Usuarios" fill="hsl(210, 80%, 55%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="visitas" name="Visitas" fill="hsl(158, 64%, 38%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

const CreateTestForm = ({ onCreated }: { onCreated: () => void }) => {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [pagina, setPagina] = useState("/admin/inmobiliarias/inventario");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!nombre.trim() || !pagina.trim()) { toast.error("Nombre y página son obligatorios"); return; }
    setSaving(true);
    const { error } = await supabase.from("ab_tests").insert({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, pagina: pagina.trim() });
    if (error) toast.error("Error: " + error.message);
    else { toast.success("Test creado"); onCreated(); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div><Label>Nombre *</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="mt-1" placeholder="Test inventario carrusel" /></div>
      <div><Label>Descripción</Label><Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="mt-1" placeholder="Comparar grid vs carrusel" /></div>
      <div><Label>Página *</Label><Input value={pagina} onChange={(e) => setPagina(e.target.value)} className="mt-1" /></div>
      <Button onClick={handleCreate} disabled={saving} className="w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear Test"}</Button>
    </div>
  );
};

export default ABTests;
