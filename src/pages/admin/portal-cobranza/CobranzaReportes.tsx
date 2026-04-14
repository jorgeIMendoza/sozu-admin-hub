import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  BarChart3, DollarSign, Package, Search, Loader2, FileSpreadsheet, Download,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface FiltroConfig {
  nombre: string;
  label: string;
  tipo: string;
}

interface Reporte {
  id: number;
  nombre: string;
  descripcion: string | null;
  filtros_configuracion: FiltroConfig[];
  nombre_archivo: string;
  activo: boolean;
  prendido: boolean;
  id_submenu: number;
}

interface ReporteCategory {
  key: string;
  label: string;
  icon: React.ElementType;
  submenuPath: string;
  reportes: Reporte[];
}

const CATEGORY_CONFIG: { key: string; label: string; icon: React.ElementType; submenuPath: string }[] = [
  { key: 'financiero', label: 'Financiero', icon: DollarSign, submenuPath: '/admin/reportes/finanzas' },
  { key: 'inventario', label: 'Inventario', icon: Package, submenuPath: '/admin/reportes/inventarios' },
];

export default function CobranzaReportes() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Fetch all submenus for report categories
  const { data: submenuMap = {}, isLoading: subLoading } = useQuery({
    queryKey: ['reportes-submenus-cobranza'],
    queryFn: async () => {
      const paths = CATEGORY_CONFIG.map(c => c.submenuPath);
      const { data } = await supabase
        .from('submenus')
        .select('id, vista_front_end')
        .in('vista_front_end', paths);
      const map: Record<string, number> = {};
      (data || []).forEach(s => { map[s.vista_front_end] = s.id; });
      return map;
    },
  });

  // Fetch all reports across categories
  const submenuIds = Object.values(submenuMap);
  const { data: allReportes = [], isLoading: repLoading } = useQuery({
    queryKey: ['reportes-all-cobranza', submenuIds],
    queryFn: async () => {
      if (submenuIds.length === 0) return [];
      const { data, error } = await supabase
        .from('reportes')
        .select('id, nombre, descripcion, filtros_configuracion, nombre_archivo, activo, prendido, id_submenu')
        .in('id_submenu', submenuIds)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return (data || []).map(r => ({
        ...r,
        filtros_configuracion: (r.filtros_configuracion || []) as unknown as FiltroConfig[],
      })) as Reporte[];
    },
    enabled: submenuIds.length > 0,
  });

  // Group reports by category
  const categories: ReporteCategory[] = useMemo(() => {
    return CATEGORY_CONFIG.map(cfg => {
      const submenuId = submenuMap[cfg.submenuPath];
      const reportes = allReportes.filter(r => r.id_submenu === submenuId);
      return { ...cfg, reportes };
    }).filter(c => c.reportes.length > 0);
  }, [allReportes, submenuMap]);

  // Filter
  const filteredCategories = useMemo(() => {
    let cats = categories;
    if (activeCategory) {
      cats = cats.filter(c => c.key === activeCategory);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      cats = cats.map(c => ({
        ...c,
        reportes: c.reportes.filter(r =>
          r.nombre.toLowerCase().includes(term) ||
          (r.descripcion && r.descripcion.toLowerCase().includes(term))
        ),
      })).filter(c => c.reportes.length > 0);
    }
    return cats;
  }, [categories, activeCategory, searchTerm]);

  const totalReportes = categories.reduce((s, c) => s + c.reportes.length, 0);

  const handleOpenReport = (reporte: Reporte) => {
    if (!reporte.prendido) return;
    navigate(`/admin/reportes/ver/${reporte.id}?return=/admin/portal-cobranza/reportes`);
  };

  const isLoading = subLoading || repLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Centro de Reportes</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Genera y exporta reportes ejecutivos, financieros y operativos · {totalReportes} reportes disponibles
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(activeCategory === cat.key ? null : cat.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 h-[34px] rounded-lg border text-[13px] font-medium transition-colors',
              activeCategory === cat.key
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            <cat.icon className="w-3.5 h-3.5" />
            {cat.label}
            <span className="text-[11px] opacity-70">({cat.reportes.length})</span>
          </button>
        ))}
        {searchTerm && (
          <div className="ml-auto relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar reporte..."
              className="pl-9 h-[34px] text-[13px]"
            />
          </div>
        )}
        {!searchTerm && (
          <button
            onClick={() => setSearchTerm(' ')}
            className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <Search className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Report Sections */}
      {filteredCategories.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-[14px] font-medium">No se encontraron reportes</p>
          <p className="text-[13px]">Intenta con otro término de búsqueda</p>
        </div>
      ) : (
        filteredCategories.map(cat => (
          <div key={cat.key} className="space-y-3">
            {/* Section header (only if no active filter) */}
            {!activeCategory && (
              <div className="flex items-center gap-2">
                <cat.icon className="w-4 h-4 text-primary" />
                <h2 className="text-[14px] font-semibold text-foreground">{cat.label}</h2>
                <span className="text-[12px] text-muted-foreground">({cat.reportes.length})</span>
              </div>
            )}

            {/* Cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cat.reportes.map(reporte => (
                <div
                  key={reporte.id}
                  onClick={() => handleOpenReport(reporte)}
                  className={cn(
                    'bg-card rounded-xl border border-border p-5 transition-all',
                    reporte.prendido
                      ? 'cursor-pointer hover:shadow-md hover:border-primary/40'
                      : 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[14px] font-semibold text-foreground leading-snug">
                        {reporte.nombre}
                      </h3>
                      {reporte.prendido && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-success/10 text-success border-success/20 shrink-0">
                          En vivo
                        </Badge>
                      )}
                    </div>
                    {reporte.descripcion && (
                      <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">
                        {reporte.descripcion}
                      </p>
                    )}
                    {!reporte.prendido && (
                      <p className="text-[11px] text-warning font-medium">Reporte apagado</p>
                    )}
                  </div>

                  {reporte.prendido && (
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
                      <button
                        onClick={e => { e.stopPropagation(); handleOpenReport(reporte); }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <Download className="w-3 h-3" /> Excel
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleOpenReport(reporte); }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <Download className="w-3 h-3" /> PDF
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
