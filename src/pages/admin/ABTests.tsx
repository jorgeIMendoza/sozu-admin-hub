import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, FlaskConical, BarChart3, Users, Calendar } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from "recharts";

const ABTests = () => {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ["ab-tests-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ab_tests").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch assignments count per test
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

  // Fetch CTA events grouped by test
  const { data: ctaByTest = {} } = useQuery({
    queryKey: ["ab-test-cta-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cta_events").select("ab_test_id, ab_variant, element_id").not("ab_test_id", "is", null);
      if (error) throw error;
      const counts: Record<number, Record<string, number>> = {};
      (data || []).forEach((e: any) => {
        if (!counts[e.ab_test_id]) counts[e.ab_test_id] = {};
        counts[e.ab_test_id][e.ab_variant] = (counts[e.ab_test_id][e.ab_variant] || 0) + 1;
      });
      return counts;
    },
  });

  const activeTests = tests.filter((t: any) => t.activo);
  const pastTests = tests.filter((t: any) => !t.activo);

  const toggleTest = async (testId: number, currentActive: boolean) => {
    const { error } = await supabase.from("ab_tests").update({ activo: !currentActive, ...(currentActive ? { fecha_fin: new Date().toISOString() } : {}) }).eq("id", testId);
    if (error) toast.error("Error al actualizar");
    else { toast.success(currentActive ? "Test finalizado" : "Test reactivado"); queryClient.invalidateQueries({ queryKey: ["ab-tests-all"] }); }
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
          <TestCard key={test.id} test={test} assignments={assignmentCounts[test.id] || {}} cta={ctaByTest[test.id] || {}} onToggle={() => toggleTest(test.id, true)} />
        ))}
      </div>

      {/* Past Tests */}
      {pastTests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Tests Finalizados ({pastTests.length})
          </h2>
          {pastTests.map((test: any) => (
            <TestCard key={test.id} test={test} assignments={assignmentCounts[test.id] || {}} cta={ctaByTest[test.id] || {}} onToggle={() => toggleTest(test.id, false)} isPast />
          ))}
        </div>
      )}
    </div>
  );
};

const TestCard = ({ test, assignments, cta, onToggle, isPast }: { test: any; assignments: Record<string, number>; cta: Record<string, number>; onToggle: () => void; isPast?: boolean }) => {
  const variantes = (test.variantes as string[]) || ["A", "B"];
  const chartData = variantes.map((v) => ({
    name: `Variante ${v}`,
    usuarios: assignments[v] || 0,
    clicks: cta[v] || 0,
  }));
  const totalUsers = Object.values(assignments).reduce((a: number, b: number) => a + b, 0);

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
          </div>
          <div className="flex items-center gap-2">
            <Badge className={test.activo ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}>{test.activo ? "Activo" : "Finalizado"}</Badge>
            <Button variant="outline" size="sm" onClick={onToggle}>{isPast ? "Reactivar" : "Finalizar"}</Button>
          </div>
        </div>

        <div className="flex gap-4">
          {variantes.map((v: string) => (
            <div key={v} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Var. {v}:</span>
              <span>{assignments[v] || 0} usuarios</span>
              <span className="text-muted-foreground">•</span>
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{cta[v] || 0} clicks</span>
            </div>
          ))}
        </div>

        {totalUsers > 0 && (
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData} margin={{ left: 0, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="usuarios" name="Usuarios" fill="hsl(210, 80%, 55%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="clicks" name="Clicks" fill="hsl(158, 64%, 38%)" radius={[4, 4, 0, 0]} />
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
