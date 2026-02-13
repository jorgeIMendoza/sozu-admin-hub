import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { TrendingUp, ShoppingCart, BarChart3, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const MIN_DATE = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
})();

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
  id_producto: number | null;
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
  const [selectedTipoOferta, setSelectedTipoOferta] = useState<string>('all');
  const inmobIdByEmailRef = useRef(new Map<string, number>());
  const agentNamesByEmailRef = useRef(new Map<string, string>());

  const isSuperAdmin = profile?.rol_nombre === 'Super Administrador';
  const isInmobiliaria = profile?.rol_id === 4;
  const isAgente = profile?.rol_id === 3 || profile?.rol_id === 9;

  useEffect(() => {
    if (!profile || isSuperAdmin) return;
    const loadProjectAccess = async () => {
      const { data } = await supabase.from('proyectos_acceso').select('proyecto_id').eq('usuario_id', profile.email).eq('activo', true) as any;
      if (data) {
        const ids = data.map((a: any) => a.proyecto_id).filter(Boolean);
        if (ids.length > 0) {
          const { data: projs } = await supabase.from('proyectos').select('id, nombre').in('id', ids).eq('activo', true);
          if (projs) { setProyectos(projs); if (projs.length === 1) setSelectedProyectos([String(projs[0].id)]); }
        }
      }
    };
    loadProjectAccess();
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
        .select('id, email_creador, fecha_generacion, id_esquema_pago_seleccionado, id_estatus_aprobacion, id_propiedad, id_producto')
        .eq('activo', true).gte('fecha_generacion', MIN_DATE);

      if (isAgente) query = query.eq('email_creador', profile.email);
      else if (isInmobiliaria && agentes.length > 0) {
        query = query.in('email_creador', agentes.map(a => a.email));
      }
      // Super admin: load all, filter client-side

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

      // For super admin: resolve agents and inmobiliarias from offer data
      if (isSuperAdmin) {
        const uniqueEmails = [...new Set(ofertasData.map((o: any) => o.email_creador).filter(Boolean))] as string[];
        const inmobIdByEmail = new Map<string, number>();
        const agentNames = new Map<string, string>();
        if (uniqueEmails.length > 0) {
          const { data: usrData } = await supabase.from('usuarios').select('email, id_persona').in('email', uniqueEmails).eq('activo', true) as any;
          if (usrData && usrData.length > 0) {
            const emailToPersona = new Map<string, number>();
            usrData.forEach((u: any) => { if (u.id_persona) emailToPersona.set(u.email, u.id_persona); });
            const agentPersonaIds = [...new Set(usrData.map((u: any) => u.id_persona).filter(Boolean))] as number[];
            if (agentPersonaIds.length > 0) {
              const [persRes, erRes] = await Promise.all([
                supabase.from('personas').select('id, nombre, apellido_paterno').in('id', agentPersonaIds) as any,
                supabase.from('entidades_relacionadas').select('id_persona, id_persona_duena_lead').in('id_persona', agentPersonaIds).eq('id_tipo_entidad', 19).eq('activo', true) as any,
              ]);
              const pm = new Map<number, string>();
              (persRes.data || []).forEach((p: any) => pm.set(p.id, `${p.nombre} ${p.apellido_paterno || ''}`.trim()));
              emailToPersona.forEach((pid, email) => { const n = pm.get(pid); if (n) agentNames.set(email, n); });
              if (erRes.data && erRes.data.length > 0) {
                const personaToOwner = new Map<number, number>();
                erRes.data.forEach((er: any) => personaToOwner.set(er.id_persona, er.id_persona_duena_lead));
                const ownerIds = [...new Set(erRes.data.map((er: any) => er.id_persona_duena_lead).filter(Boolean))] as number[];
                if (ownerIds.length > 0) {
                  const { data: inmobPersonas } = await supabase.from('personas').select('id, nombre_comercial, nombre_legal').in('id', ownerIds) as any;
                  const ownerMap = new Map<number, string>();
                  (inmobPersonas || []).forEach((p: any) => ownerMap.set(p.id, p.nombre_comercial || p.nombre_legal || ''));
                  emailToPersona.forEach((personaId, email) => {
                    const ownerId = personaToOwner.get(personaId);
                    if (ownerId) inmobIdByEmail.set(email, ownerId);
                  });
                  const inmobSet = new Map<number, { id: number; nombre: string }>();
                  inmobIdByEmail.forEach((ownerId) => {
                    const nombre = ownerMap.get(ownerId);
                    if (nombre) inmobSet.set(ownerId, { id: ownerId, nombre });
                  });
                  setInmobiliarias(Array.from(inmobSet.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)));
                }
              }
            }
          }
        }
        inmobIdByEmailRef.current = inmobIdByEmail;
        agentNamesByEmailRef.current = agentNames;
      }

      // Derive available proyectos
      if (isSuperAdmin) {
        const proySet = new Map<number, { id: number; nombre: string }>();
        enriched.forEach(o => {
          if (o.proyecto_id && o.proyecto_nombre) {
            proySet.set(o.proyecto_id, { id: o.proyecto_id, nombre: o.proyecto_nombre });
          }
        });
        setProyectos(Array.from(proySet.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }

      setOfertas(enriched);
    } catch (err) { console.error(err); toast.error('Error cargando datos'); }
    finally { setLoading(false); }
  }, [profile, isAgente, isInmobiliaria, isSuperAdmin, agentes]);

  const hasLoadedRef = useRef(false);
  const prevDepsRef = useRef<string>('');
  useEffect(() => {
    const depsKey = JSON.stringify({ isAgente, isInmobiliaria, isSuperAdmin, agentesLen: agentes.length });
    if (hasLoadedRef.current && depsKey === prevDepsRef.current) return;
    prevDepsRef.current = depsKey;
    hasLoadedRef.current = true;
    loadData();
  }, [loadData]);

  // Derive available agentes for super admin
  const availableAgentes = useMemo(() => {
    if (!isSuperAdmin) return agentes;
    let source = ofertas;
    if (selectedInmobiliaria !== 'all') {
      const inmobId = Number(selectedInmobiliaria);
      source = source.filter(o => inmobIdByEmailRef.current.get(o.email_creador) === inmobId);
    }
    const map = new Map<string, string>();
    source.forEach(o => {
      if (!map.has(o.email_creador)) {
        map.set(o.email_creador, agentNamesByEmailRef.current.get(o.email_creador) || o.email_creador);
      }
    });
    return Array.from(map.entries()).map(([email, nombre]) => ({ email, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [ofertas, isSuperAdmin, selectedInmobiliaria, agentes]);

  // Client-side filtering
  const filteredOfertas = useMemo(() => {
    let result = ofertas;
    if (isSuperAdmin && selectedInmobiliaria !== 'all') {
      const inmobId = Number(selectedInmobiliaria);
      result = result.filter(o => inmobIdByEmailRef.current.get(o.email_creador) === inmobId);
    }
    if (selectedAgentes.length > 0) {
      result = result.filter(o => selectedAgentes.includes(o.email_creador));
    }
    if (selectedProyectos.length > 0) {
      const projIds = selectedProyectos.map(Number);
      result = result.filter(o => o.proyecto_id && projIds.includes(o.proyecto_id));
    }
    if (selectedTipoOferta === 'propiedad') {
      result = result.filter(o => !!(o as any).id_propiedad && !(o as any).id_producto);
    } else if (selectedTipoOferta === 'producto') {
      result = result.filter(o => !!(o as any).id_producto);
    }
    return result;
  }, [ofertas, isSuperAdmin, selectedInmobiliaria, selectedAgentes, selectedProyectos, selectedTipoOferta]);

  const stageSummary = useMemo(() => {
    const stages = [
      { label: 'Nuevas', filter: (o: OfertaData) => !o.id_esquema_pago_seleccionado && isVigente(o.fecha_generacion), color: '#3b82f6' },
      { label: 'Pendientes', filter: (o: OfertaData) => !!o.id_esquema_pago_seleccionado && o.id_estatus_aprobacion === 1 && isVigente(o.fecha_generacion), color: '#f59e0b' },
      { label: 'Aprobadas', filter: (o: OfertaData) => !!o.id_esquema_pago_seleccionado && o.id_estatus_aprobacion === 2, color: '#10b981' },
      { label: 'Rechazadas', filter: (o: OfertaData) => !!o.id_esquema_pago_seleccionado && o.id_estatus_aprobacion === 3 && isVigente(o.fecha_generacion), color: '#ef4444' },
      { label: 'En Revisión', filter: (o: OfertaData) => !!o.id_esquema_pago_seleccionado && o.id_estatus_aprobacion === 4 && isVigente(o.fecha_generacion), color: '#8b5cf6' },
      { label: 'Vendidas', filter: (o: OfertaData) => o.estatus_disponibilidad === 5, color: '#059669' },
    ];
    return stages.map(s => ({ label: s.label, count: filteredOfertas.filter(s.filter).length, color: s.color }));
  }, [filteredOfertas]);

  const byProject = useMemo(() => {
    const map = new Map<string, number>();
    filteredOfertas.forEach(o => { const n = o.proyecto_nombre || 'Sin proyecto'; map.set(n, (map.get(n) || 0) + 1); });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [filteredOfertas]);

  const byAgent = useMemo(() => {
    const map = new Map<string, number>();
    filteredOfertas.forEach(o => {
      const n = agentNamesByEmailRef.current.get(o.email_creador) || availableAgentes.find(a => a.email === o.email_creador)?.nombre || o.email_creador;
      map.set(n, (map.get(n) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name: name.length > 20 ? name.substring(0, 20) + '...' : name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filteredOfertas, availableAgentes]);

  const potentialValue = useMemo(() => {
    const byProp = new Map<number, number>();
    filteredOfertas.filter(o => o.id_esquema_pago_seleccionado && o.precio && o.id_propiedad).forEach(o => {
      const cur = byProp.get(o.id_propiedad!) || 0;
      if (o.precio! > cur) byProp.set(o.id_propiedad!, o.precio!);
    });
    return Array.from(byProp.values()).reduce((s, v) => s + v, 0);
  }, [filteredOfertas]);

  const soldOffers = useMemo(() => filteredOfertas.filter(o => o.estatus_disponibilidad === 5), [filteredOfertas]);
  const soldValue = useMemo(() => {
    const byProp = new Map<number, number>();
    soldOffers.filter(o => o.precio && o.id_propiedad).forEach(o => {
      const cur = byProp.get(o.id_propiedad!) || 0;
      if (o.precio! > cur) byProp.set(o.id_propiedad!, o.precio!);
    });
    return Array.from(byProp.values()).reduce((s, v) => s + v, 0);
  }, [soldOffers]);

  // MultiSelectFilter adapters
  const agenteOptions = availableAgentes.map(a => a.nombre || a.email);
  const agenteNameToEmail = new Map<string, string>();
  availableAgentes.forEach(a => agenteNameToEmail.set(a.nombre || a.email, a.email));
  const selectedAgenteNames = selectedAgentes.map(email => availableAgentes.find(a => a.email === email)?.nombre || email);

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
            {(isSuperAdmin || isInmobiliaria) && availableAgentes.length > 0 && (
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

            <div className="min-w-[160px]">
              <label className="text-sm font-medium mb-1 block">Tipo de Oferta</label>
              <Select value={selectedTipoOferta} onValueChange={setSelectedTipoOferta}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="propiedad">Propiedades</SelectItem>
                  <SelectItem value="producto">Productos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(selectedInmobiliaria !== 'all' || selectedAgentes.length > 0 || selectedProyectos.length > 0 || selectedTipoOferta !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => { setSelectedInmobiliaria('all'); setSelectedAgentes([]); setSelectedProyectos([]); setSelectedTipoOferta('all'); }} className="text-xs h-10">
                <X className="h-3 w-3 mr-1" />
                Limpiar filtros
              </Button>
            )}
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
                <p className="text-xs text-muted-foreground">Últimos 3 meses</p>
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
