import { formatCurrency, formatDate, PromiseStatusBadge } from '@/components/cobranza/StatusBadges';
import { mockAccounts } from '@/data/cobranza/mockData';
import { ActiveFilterBanner } from '@/components/cobranza/ActiveFilterBanner';
import type { PaymentPromise, PromiseStatus } from '@/types/cobranza';
import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Handshake, Search, X, CheckCircle2, RotateCcw, Eye, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PromesasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<PromiseStatus | 'all'>(() => (searchParams.get('estatus') as PromiseStatus) || 'all');
  const [selectedPromise, setSelectedPromise] = useState<any>(null);

  const clearAllFilters = useCallback(() => {
    setStatusFilter('all');
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const promises = useMemo(() => {
    const all = mockAccounts.filter(a => a.activePromise).map(a => ({ ...a.activePromise!, account: a }));
    const historical = [
      { id: 'prom-h1', accountId: mockAccounts[2].id, promiseDate: '2026-03-10', amount: 116667, channel: 'llamada' as const, notes: 'Promesa cumplida a tiempo', registeredBy: 'Luz Ochoa', status: 'cumplida' as PromiseStatus, createdAt: '2026-03-05', account: mockAccounts[2] },
      { id: 'prom-h2', accountId: mockAccounts[8].id, promiseDate: '2026-03-01', amount: 87500, channel: 'email' as const, notes: 'No se recibió pago en la fecha indicada', registeredBy: 'Tomás Peterson', status: 'vencida' as PromiseStatus, createdAt: '2026-02-25', account: mockAccounts[8] },
      { id: 'prom-h3', accountId: mockAccounts[15].id, promiseDate: '2026-03-15', amount: 75000, channel: 'whatsapp' as const, notes: 'Cliente pagó parcialmente, se registró como cumplida', registeredBy: 'Luz Ochoa', status: 'cumplida' as PromiseStatus, createdAt: '2026-03-10', account: mockAccounts[15] },
      { id: 'prom-h4', accountId: mockAccounts[22].id, promiseDate: '2026-02-28', amount: 95000, channel: 'llamada' as const, notes: 'Vencida sin pago, se escaló a seguimiento intensivo', registeredBy: 'Tomás Peterson', status: 'vencida' as PromiseStatus, createdAt: '2026-02-20', account: mockAccounts[22] },
      { id: 'prom-h5', accountId: mockAccounts[30].id, promiseDate: '2026-03-20', amount: 68000, channel: 'email' as const, notes: 'Promesa cancelada por solicitud del cliente', registeredBy: 'Luz Ochoa', status: 'cancelada' as PromiseStatus, createdAt: '2026-03-12', account: mockAccounts[30] },
      { id: 'prom-h6', accountId: mockAccounts[45].id, promiseDate: '2026-03-18', amount: 42000, channel: 'llamada' as const, notes: 'Promesa cumplida con 2 días de retraso', registeredBy: 'Tomás Peterson', status: 'cumplida' as PromiseStatus, createdAt: '2026-03-08', account: mockAccounts[45] },
    ];
    const combined = [...all, ...historical];
    if (statusFilter === 'all') return combined;
    return combined.filter(p => p.status === statusFilter);
  }, [statusFilter]);

  const stats = {
    activas: mockAccounts.filter(a => a.activePromise).map(a => a.activePromise!).concat([]).filter(p => p.status === 'activa').length + mockAccounts.filter(a => a.activePromise?.status === 'activa').length > 0 ? mockAccounts.filter(a => a.activePromise).length : 0,
    cumplidas: promises.filter(p => p.status === 'cumplida').length,
    vencidas: promises.filter(p => p.status === 'vencida').length,
  };

  // Recalc stats from unfiltered data
  const allPromises = useMemo(() => {
    const all = mockAccounts.filter(a => a.activePromise).map(a => ({ ...a.activePromise!, account: a }));
    const historical = [
      { status: 'cumplida' }, { status: 'vencida' }, { status: 'cumplida' }, { status: 'vencida' }, { status: 'cancelada' }, { status: 'cumplida' },
    ];
    return [...all, ...historical];
  }, []);

  const globalStats = {
    activas: allPromises.filter(p => p.status === 'activa').length,
    cumplidas: allPromises.filter(p => p.status === 'cumplida').length,
    vencidas: allPromises.filter(p => p.status === 'vencida').length,
  };

  return (
    <div className="flex h-full -m-5">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-3 space-y-3">
          <div>
            <h1 className="sozu-page-title">Promesas de Pago</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Registro y seguimiento de compromisos</p>
          </div>
          <ActiveFilterBanner onClear={clearAllFilters} />
          <div className="flex items-center gap-3">
            <StatPill label="Activas" value={globalStats.activas} dotColor="bg-info" />
            <StatPill label="Cumplidas" value={globalStats.cumplidas} dotColor="bg-success" />
            <StatPill label="Vencidas" value={globalStats.vencidas} dotColor="bg-danger" />
            <div className="flex-1" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="sozu-filter-select">
              <option value="all">Todas</option>
              <option value="activa">Activas</option>
              <option value="cumplida">Cumplidas</option>
              <option value="vencida">Vencidas</option>
              <option value="cancelada">Canceladas</option>
            </select>
            {statusFilter !== 'all' && (
              <button onClick={clearAllFilters}
                className="h-[38px] px-3 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg flex items-center gap-1.5 transition-colors duration-100">
                <X className="w-3.5 h-3.5" strokeWidth={1.75} /> Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {promises.length === 0 ? (
            <div className="text-center py-16">
              <Handshake className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground mb-1">No se encontraron promesas con estos filtros</p>
              <button onClick={clearAllFilters} className="text-[13px] text-primary hover:underline">Limpiar filtros</button>
            </div>
          ) : (
          <table className="w-full text-sm">
            <thead className="sozu-thead">
              <tr>
                <th>Cliente</th>
                <th>Proyecto</th>
                <th>Fecha Promesa</th>
                <th className="text-center">Monto</th>
                <th>Canal</th>
                <th>Registró</th>
                <th className="text-center">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {promises.map(p => (
                <tr
                  key={p.id}
                  className={`sozu-table-row h-[52px] ${selectedPromise?.id === p.id ? 'bg-primary-muted' : ''}`}
                  onClick={() => setSelectedPromise(p)}
                >
                  <td className="px-4 text-[13px] font-medium text-foreground">{p.account.client.name}</td>
                  <td className="px-4 text-[13px] text-muted-foreground">{p.account.project.name}</td>
                  <td className="px-4 text-[13px] text-foreground tabular-nums">{formatDate(p.promiseDate)}</td>
                  <td className="px-4 text-center text-[13px] font-semibold text-foreground tabular-nums">{formatCurrency(p.amount)}</td>
                  <td className="px-4 text-[13px] text-muted-foreground capitalize">{p.channel.replace('_', ' ')}</td>
                  <td className="px-4 text-[13px] text-muted-foreground">{p.registeredBy}</td>
                  <td className="px-4 text-center"><PromiseStatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedPromise && (
        <div className="w-[380px] shrink-0 bg-card border-l border-border flex flex-col animate-slide-in-right">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h3 className="text-[14px] font-semibold text-foreground">Detalle de Promesa</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedPromise(null)}>
              <X className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <PromiseStatusBadge status={selectedPromise.status} />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <InfoItem label="Cliente" value={selectedPromise.account.client.name} />
              <InfoItem label="Proyecto" value={selectedPromise.account.project.name} />
              <InfoItem label="Monto" value={formatCurrency(selectedPromise.amount)} />
              <InfoItem label="Fecha Promesa" value={formatDate(selectedPromise.promiseDate)} />
              <InfoItem label="Canal" value={selectedPromise.channel} />
              <InfoItem label="Registró" value={selectedPromise.registeredBy} />
              <InfoItem label="Creada" value={formatDate(selectedPromise.createdAt)} />
              <InfoItem label="Cuenta" value={selectedPromise.accountId} />
            </div>
            {selectedPromise.notes && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Notas</p>
                <p className="text-[13px] text-muted-foreground">{selectedPromise.notes}</p>
              </div>
            )}
            <div className="pt-1 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Acciones</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium bg-success-bg hover:bg-success/10 text-success transition-colors duration-100">
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Marcar cumplida
                </button>
                <button className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium bg-muted hover:bg-border text-foreground transition-colors duration-100">
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} /> Reprogramar
                </button>
                <button className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium bg-muted hover:bg-border text-foreground transition-colors duration-100">
                  <Eye className="w-3.5 h-3.5" strokeWidth={1.75} /> Abrir cuenta
                </button>
                <button className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium bg-danger-bg hover:bg-danger/10 text-danger transition-colors duration-100">
                  <X className="w-3.5 h-3.5" strokeWidth={1.75} /> Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, dotColor }: { label: string; value: number; dotColor: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border text-[12px]">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-[13px] font-medium text-foreground">{value}</p>
    </div>
  );
}
