import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { TrendingUp, ShoppingCart, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

const MIN_DATE = '2026-01-01';

function isVigente(fechaGeneracion: string): boolean {
  const fecha = new Date(fechaGeneracion);
  const expira = new Date(fecha);
  expira.setDate(expira.getDate() + 5);
  return expira >= new Date();
}

interface OfertaData {
  id: number;
  email_creador: string;
  fecha_generacion: string;
  id_esquema_pago_seleccionado: number | null;
  id_estatus_aprobacion: number | null;
  id_propiedad: number | null;
  proyecto_id?: number;
  proyecto_nombre?: string;
  precio?: number | null;
  estatus_disponibilidad?: number;
}

export default function DashboardEjecutivo() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ofertas, setOfertas] = useState<OfertaData[]>([]);

  const [inmobiliarias, setInmobiliarias] = useState<{ id: number; nombre: string }[]>([]);
  const [selectedInmobiliaria, setSelectedInmobiliaria] = useState<string>('all');
  const [agentes, setAgentes] = useState<{ email: string; nombre: string }[]>([]);
  const [selectedAgentes, setSelectedAgentes] = useState<string[]>([]);
  const [proyectos, setProyectos] = useState<{ id: number; nombre: string }[]>([]);
  const [selectedProyectos, setSelectedProyectos] = useState<string[]>([]);

  const isSuperAdmin = profile?.rol_nombre === 'Super Administrador';
  const isInmobiliaria = profile?.rol_id === 4;
  const isAgente = profile?.rol_id === 3 || profile?.rol_id === 9;

  useEffect(() => {
    if (!profile) return;
    const loadFilters = async () => {
      if (isSuperAdmin) {
        const { data } = await (supabase.from('personas' as any).select('id, nombre, apellido_paterno').eq('activo', true).eq('id_tipo_persona', 4));
        if (data) setInmobiliarias(data.map((i: any) => ({ id: i.id, nombre: `${i.nombre} ${i.apellido_paterno || ''}`.trim() })));
      }
      if (isSuperAdmin) {
        const { data } = await supabase.from('proyectos').select('id, nombre').eq('activo', true).order('nombre');
        if (data) setProyectos(data);
      } else {
        const { data } = await supabase.from('proyectos_acceso').select('proyecto_id').eq('usuario_id', profile.email).eq('activo', true) as any;
        if (data) {
          const ids = data.map((a: any) => a.proyecto_id).filter(Boolean);
          if (ids.length > 0) {
            const { data: projs } = await supabase.from('proyectos').select('id, nombre').in('id', ids).eq('activo', true);
            if (projs) { setProyectos(projs); if (projs.length === 1) setSelectedProyectos([String(projs[0].id)]); }
          }
        }
      }
    };
    loadFilters();
  }, [profile, isSuperAdmin]);

  useEffect(() => {
    if (!profile) return;
    const loadAgentes = async () => {
      let ownerId: number | null = null;
      if (isSuperAdmin && selectedInmobiliaria !== 'all') ownerId = Number(selectedInmobiliaria);
      else if (isInmobiliaria) ownerId = profile.id_persona;
      if (!ownerId) { setAgentes([]); return; }
      const { data } = await supabase.from('entidades_relacionadas').select('id_persona').eq('id_persona_duena_lead', ownerId).eq('id_tipo_entidad', 19).eq('activo', true) as any;
      if (data) {
        const ids = data.map((d: any) => d.id_persona).filter(Boolean);
        if (ids.length > 0) {
          const { data: usuarios } = await supabase.from('usuarios').select('email, id_persona').in('id_persona', ids).eq('activo', true) as any;
          if (usuarios) {
            const pIds = usuarios.map((u: any) => u.id_persona).filter(Boolean);
            const { data: personas } = await supabase.from('personas').select('id, nombre, apellido_paterno').in('id', pIds) as any;
            const pm = new Map<number, string>();
            (personas || []).forEach((p: any) => pm.set(p.id, `${p.nombre} ${p.apellido_paterno || ''}`.trim()));
            setAgentes(usuarios.map((u: any) => ({ email: u.email, nombre: pm.get(u.id_persona) || u.email })));
          }
        }
      }
    };
    loadAgentes();
  }, [profile, isSuperAdmin, isInmobiliaria, selectedInmobiliaria]);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase.from('ofertas')
        .select('id, email_creador, fecha_generacion, id_esquema_pago_seleccionado, id_estatus_aprobacion, id_propiedad')
        .eq('activo', true).gte('fecha_generacion', MIN_DATE);

      if (isAgente) query = query.eq('email_creador', profile.email);
      else if (isInmobiliaria && agentes.length > 0) {
        const emails = selectedAgentes.length > 0 ? selectedAgentes : agentes.map(a => a.email);
        query = query.in('email_creador', emails);
      } else if (isSuperAdmin) {
        if (selectedAgentes.length > 0) query = query.in('email_creador', selectedAgentes);
        else if (selectedInmobiliaria !== 'all' && agentes.length > 0) query = query.in('email_creador', agentes.map(a => a.email));
      }

      const { data: ofertasData } = await query;
      if (!ofertasData) { setOfertas([]); setLoading(false); return; }

      const propIds = [...new Set(ofertasData.map((o: any) => o.id_propiedad).filter(Boolean))] as number[];
      let propMap = new Map<number, any>();
      let edModeloToProyecto = new Map<number, number>();
      let proyectoMap = new Map<number, { id: number; nombre: string }>();

      if (propIds.length > 0) {
        const { data: props } = await supabase.from('propiedades').select('id, precio_lista, id_estatus_disponibilidad, id_edificio_modelo').in('id', propIds) as any;
        (props || []).forEach((p: any) => propMap.set(p.id, p));
        const emIds = [...new Set((props || []).map((p: any) => p.id_edificio_modelo).filter(Boolean))] as number[];
        if (emIds.length > 0) {
          const { data: ems } = await supabase.from('edificios_modelos').select('id, id_edificio').in('id', emIds) as any;
          const edIds = [...new Set((ems || []).map((e: any) => e.id_edificio).filter(Boolean))] as number[];
          if (edIds.length > 0) {
            const { data: eds } = await supabase.from('edificios').select('id, id_proyecto').in('id', edIds) as any;
            const pjIds = [...new Set((eds || []).map((e: any) => e.id_proyecto).filter(Boolean))] as number[];
            if (pjIds.length > 0) {
              const { data: pjs } = await supabase.from('proyectos').select('id, nombre').in('id', pjIds);
              (pjs || []).forEach((p: any) => proyectoMap.set(p.id, p));
            }
            const edToPj = new Map<number, number>();
            (eds || []).forEach((e: any) => edToPj.set(e.id, e.id_proyecto));
            (ems || []).forEach((em: any) => { const pj = edToPj.get(em.id_edificio); if (pj) edModeloToProyecto.set(em.id, pj); });
          }
        }
      }

      const enriched: OfertaData[] = ofertasData.map((o: any) => {
        const prop = o.id_propiedad ? propMap.get(o.id_propiedad) : null;
        const projId = prop?.id_edificio_modelo ? edModeloToProyecto.get(prop.id_edificio_modelo) : undefined;
        return { ...o, proyecto_id: projId, proyecto_nombre: projId ? proyectoMap.get(projId)?.nombre : '', precio: prop?.precio_lista, estatus_disponibilidad: prop?.id_estatus_disponibilidad };
      });

      let filtered = enriched;
      if (selectedProyectos.length > 0) {
        const ids = selectedProyectos.map(Number);
        filtered = filtered.filter(o => o.proyecto_id && ids.includes(o.proyecto_id));
      }
      setOfertas(filtered);
    } catch (err) { console.error(err); toast.error('Error cargando datos'); }
    finally { setLoading(false); }
  }, [profile, isAgente, isInmobiliaria, isSuperAdmin, agentes, selectedAgentes, selectedInmobiliaria, selectedProyectos]);

  useEffect(() => { loadData(); }, [loadData]);

  const stageSummary = useMemo(() => {
    const stages = [
      { label: 'Nuevas', filter: (o: OfertaData) => !o.id_esquema_pago_seleccionado && isVigente(o.fecha_generacion), color: '#3b82f6' },
      { label: 'Pendientes', filter: (o: OfertaData) => !!o.id_esquema_pago_seleccionado && o.id_estatus_aprobacion === 1 && isVigente(o.fecha_generacion), color: '#f59e0b' },
      { label: 'Aprobadas', filter: (o: OfertaData) => !!o.id_esquema_pago_seleccionado && o.id_estatus_aprobacion === 2, color: '#10b981' },
      { label: 'Rechazadas', filter: (o: OfertaData) => !!o.id_esquema_pago_seleccionado && o.id_estatus_aprobacion === 3 && isVigente(o.fecha_generacion), color: '#ef4444' },
      { label: 'En Revisión', filter: (o: OfertaData) => !!o.id_esquema_pago_seleccionado && o.id_estatus_aprobacion === 4 && isVigente(o.fecha_generacion), color: '#8b5cf6' },
      { label: 'Vendidas', filter: (o: OfertaData) => o.estatus_disponibilidad === 5, color: '#059669' },
    ];
    return stages.map(s => ({ label: s.label, count: ofertas.filter(s.filter).length, color: s.color }));
  }, [ofertas]);

  const byProject = useMemo(() => {
    const map = new Map<string, number>();
    ofertas.forEach(o => { const n = o.proyecto_nombre || 'Sin proyecto'; map.set(n, (map.get(n) || 0) + 1); });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [ofertas]);

  const byAgent = useMemo(() => {
    const map = new Map<string, number>();
    ofertas.forEach(o => { const a = agentes.find(ag => ag.email === o.email_creador); const n = a?.nombre || o.email_creador; map.set(n, (map.get(n) || 0) + 1); });
    return Array.from(map.entries()).map(([name, count]) => ({ name: name.length > 20 ? name.substring(0, 20) + '...' : name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [ofertas, agentes]);

  const potentialValue = useMemo(() => {
    const byProp = new Map<number, number>();
    ofertas.filter(o => o.id_esquema_pago_seleccionado && o.precio && o.id_propiedad).forEach(o => {
      const cur = byProp.get(o.id_propiedad!) || 0;
      if (o.precio! > cur) byProp.set(o.id_propiedad!, o.precio!);
    });
    return Array.from(byProp.values()).reduce((s, v) => s + v, 0);
  }, [ofertas]);

  const soldOffers = useMemo(() => ofertas.filter(o => o.estatus_disponibilidad === 5), [ofertas]);
  const soldValue = useMemo(() => {
    const byProp = new Map<number, number>();
    soldOffers.filter(o => o.precio && o.id_propiedad).forEach(o => {
      const cur = byProp.get(o.id_propiedad!) || 0;
      if (o.precio! > cur) byProp.set(o.id_propiedad!, o.precio!);
    });
    return Array.from(byProp.values()).reduce((s, v) => s + v, 0);
  }, [soldOffers]);

  // MultiSelectFilter adapters
  const agenteOptions = agentes.map(a => a.nombre || a.email);
  const agenteNameToEmail = new Map<string, string>();
  agentes.forEach(a => agenteNameToEmail.set(a.nombre || a.email, a.email));
  const selectedAgenteNames = selectedAgentes.map(email => agentes.find(a => a.email === email)?.nombre || email);

  const proyectoOptions = proyectos.map(p => p.nombre);
  const proyNameToId = new Map<string, string>();
  proyectos.forEach(p => proyNameToId.set(p.nombre, String(p.id)));
  const selectedProyNames = selectedProyectos.map(id => proyectos.find(p => String(p.id) === id)?.nombre || id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard Ejecutivo</h1>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            {isSuperAdmin && (
              <div className="min-w-[200px]">
                <label className="text-sm font-medium mb-1 block">Inmobiliaria</label>
                <Select value={selectedInmobiliaria} onValueChange={v => { setSelectedInmobiliaria(v); setSelectedAgentes([]); }}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {inmobiliarias.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(isSuperAdmin || isInmobiliaria) && agentes.length > 0 && (
              <div className="min-w-[200px]">
                <label className="text-sm font-medium mb-1 block">Agentes</label>
                <MultiSelectFilter options={agenteOptions} values={selectedAgenteNames}
                  onValuesChange={names => setSelectedAgentes(names.map(n => agenteNameToEmail.get(n) || n))}
                  placeholder="Todos los agentes" />
              </div>
            )}
            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">Proyectos</label>
              {proyectos.length <= 1 ? (
                <Select value={proyectos[0] ? String(proyectos[0].id) : ''} disabled>
                  <SelectTrigger><SelectValue placeholder={proyectos[0]?.nombre || 'Sin proyectos'} /></SelectTrigger>
                  <SelectContent>{proyectos.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <MultiSelectFilter options={proyectoOptions} values={selectedProyNames}
                  onValuesChange={names => setSelectedProyectos(names.map(n => proyNameToId.get(n) || n))}
                  placeholder="Todos los proyectos" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {stageSummary.map(s => (
              <Card key={s.label}>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">Valor Potencial</span>
                </div>
                <p className="text-2xl font-bold">${potentialValue.toLocaleString('es-MX')}</p>
                <p className="text-xs text-muted-foreground">Mayor precio por propiedad con esquema</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">Ventas Cerradas</span>
                </div>
                <p className="text-2xl font-bold">{new Set(soldOffers.map(o => o.id_propiedad)).size} propiedades</p>
                <p className="text-xs text-muted-foreground">${soldValue.toLocaleString('es-MX')} total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">Total Ofertas</span>
                </div>
                <p className="text-2xl font-bold">{ofertas.length}</p>
                <p className="text-xs text-muted-foreground">Desde Ene 2026</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Ofertas por Proyecto</CardTitle></CardHeader>
              <CardContent>
                {byProject.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={byProject} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-center text-muted-foreground py-8">Sin datos</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Top Agentes</CardTitle></CardHeader>
              <CardContent>
                {byAgent.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={byAgent} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-center text-muted-foreground py-8">Sin datos</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Distribución por Etapa</CardTitle></CardHeader>
              <CardContent>
                {stageSummary.some(s => s.count > 0) ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={stageSummary.filter(s => s.count > 0)} dataKey="count" nameKey="label"
                        cx="50%" cy="50%" outerRadius={100} label={({ label, count }: any) => `${label}: ${count}`}>
                        {stageSummary.filter(s => s.count > 0).map((s, i) => <Cell key={i} fill={s.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-center text-muted-foreground py-8">Sin datos</p>}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
