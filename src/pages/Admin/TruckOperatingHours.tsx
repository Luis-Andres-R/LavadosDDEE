import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, onSnapshot, where, getDocs, orderBy } from 'firebase/firestore';
import { TruckOperatingHours, INITIAL_TRUCKS, WashingProgram } from '../../types';
import { Calendar, Filter, Clock, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';

export default function TruckOperatingHoursManager() {
  const [opHours, setOpHours] = useState<TruckOperatingHours[]>([]);
  const [programs, setPrograms] = useState<WashingProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'month' | 'range'>('month');
  const [filters, setFilters] = useState({
    month: format(new Date(), 'MM'),
    year: format(new Date(), 'yyyy'),
    startDate: format(new Date(), 'yyyy-MM-01'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    truck: 'Todos'
  });

  useEffect(() => {
    setLoading(true);
    let dateStart = filters.startDate;
    let dateEnd = filters.endDate;

    if (filterMode === 'month') {
        dateStart = `${filters.year}-${filters.month}-01`;
        const lastDay = new Date(parseInt(filters.year), parseInt(filters.month), 0).getDate();
        dateEnd = `${filters.year}-${filters.month}-${lastDay}`;
    }

    // Get all programs for the period to know which trucks were active
    const qPrograms = query(
      collection(db, 'washingPrograms'),
      where('date', '>=', dateStart),
      where('date', '<=', dateEnd)
    );

    // Get all registered failures
    const qHours = query(
      collection(db, 'truckOperatingHours'),
      where('date', '>=', dateStart),
      where('date', '<=', dateEnd),
      orderBy('date', 'desc')
    );

    const unsubHours = onSnapshot(qHours, (snap) => {
      setOpHours(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckOperatingHours)));
    });

    const fetchPrograms = async () => {
      const snap = await getDocs(qPrograms);
      setPrograms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WashingProgram)));
      setLoading(false);
    };

    fetchPrograms();
    return () => unsubHours();
  }, [filters.month, filters.year, filters.startDate, filters.endDate, filterMode]);

  // Calculate Summary
  const getSummary = () => {
    const summary: Record<string, { theoretical: number, operational: number, deducted: number, failures: number }> = {};
    
    // Identified unique (Date, Shift, Truck) active in the period
    const activeTruckShifts = new Set(programs.map(p => `${p.date}_${p.shift}_${p.truck}`));
    
    activeTruckShifts.forEach(key => {
        const [date, shift, truckRaw] = (key as string).split('_');
        const truck = (truckRaw === 'undefined' || !truckRaw || truckRaw === 'null') ? 'Sin camión asignado' : truckRaw;
        
        if (filters.truck !== 'Todos' && truck !== filters.truck) return;

        if (!summary[truck]) {
            summary[truck] = { theoretical: 0, operational: 0, deducted: 0, failures: 0 };
        }

        // Each record represents a 12-hour shift assignment
        summary[truck].theoretical += 12;
        
        const failure = opHours.find(h => h.date === date && h.shift === shift && h.truck === truckRaw);
        if (failure) {
            summary[truck].operational += failure.operationalHours;
            summary[truck].deducted += failure.deductedHours;
            summary[truck].failures += 1;
        } else {
            summary[truck].operational += 12;
        }
    });

    return Object.entries(summary).map(([truck, stats]) => ({
        truck,
        ...stats,
        availability: (stats.operational / stats.theoretical) * 100
    })).sort((a, b) => a.truck.localeCompare(b.truck));
  };

  const summaryData = getSummary();

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-100 flex flex-wrap items-end gap-4">
        <div className="w-full mb-2 flex gap-4">
            <button 
                onClick={() => setFilterMode('month')}
                className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${filterMode === 'month' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400'}`}
            >
                Por Mes
            </button>
            <button 
                onClick={() => setFilterMode('range')}
                className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${filterMode === 'range' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400'}`}
            >
                Rango de Fechas
            </button>
        </div>

        {filterMode === 'month' ? (
            <>
                <div className="flex-1 min-w-[150px]">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Mes</label>
                <select 
                    value={filters.month}
                    onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
                >
                    {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                        <option key={m} value={m}>{format(new Date(2024, parseInt(m)-1), 'MMMM')}</option>
                    ))}
                </select>
                </div>
                <div className="flex-1 min-w-[100px]">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Año</label>
                <select 
                    value={filters.year}
                    onChange={e => setFilters(f => ({ ...f, year: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
                >
                    {['2024', '2025', '2026'].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                </div>
            </>
        ) : (
            <>
                <div className="flex-1 min-w-[150px]">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Desde</label>
                    <input 
                        type="date"
                        value={filters.startDate}
                        onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
                    />
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Hasta</label>
                    <input 
                        type="date"
                        value={filters.endDate}
                        onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
                    />
                </div>
            </>
        )}
        
        <div className="flex-1 min-w-[150px]">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Camión</label>
          <select 
            value={filters.truck}
            onChange={e => setFilters(f => ({ ...f, truck: e.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
          >
            <option value="Todos">Todos los Camiones</option>
            {INITIAL_TRUCKS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Clock className="animate-spin text-blue-500 mr-3" />
          <span className="text-sm font-bold text-slate-500">Calculando disponibilidad...</span>
        </div>
      ) : (
        <>
          {/* Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {summaryData.map(item => (
                <div key={item.truck} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:border-blue-200 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-blue-50 px-3 py-1 rounded-xl">
                            <span className="text-xs font-black text-blue-600">{item.truck}</span>
                        </div>
                        <TrendingUp size={18} className={item.availability >= 90 ? 'text-emerald-500' : 'text-amber-500'} />
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Disponibilidad</p>
                                <p className={`text-2xl font-black tracking-tighter ${item.availability >= 90 ? 'text-slate-900' : 'text-amber-600'}`}>
                                    {item.availability.toFixed(1)}%
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descuento</p>
                                <p className="text-sm font-black text-red-500">-{item.deducted.toFixed(1)}h</p>
                            </div>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-1000 ${
                                    item.availability >= 90 ? 'bg-emerald-500' : 
                                    item.availability >= 70 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${item.availability}%` }}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                            <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Esperadas</p>
                                <p className="text-xs font-bold text-slate-700">{item.theoretical}h</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Operativas</p>
                                <p className="text-xs font-bold text-slate-700">{item.operational.toFixed(1)}h</p>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
          </div>

          {/* Details Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">Incidencias y Fallas</h3>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">Detalle de horas descontadas</p>
                </div>
                <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-amber-50 text-amber-500">
                    <AlertTriangle size={20} />
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-slate-50/50">
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Fecha / Turno</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Camión</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Detección</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Horas Trabajadas</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Motivo</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Detalle</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {opHours.filter(h => filters.truck === 'Todos' || h.truck === filters.truck).length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm italic">
                                    No se registran fallas para este periodo.
                                </td>
                            </tr>
                        ) : (
                            opHours
                                .filter(h => filters.truck === 'Todos' || h.truck === filters.truck)
                                .map(h => (
                                    <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-black text-slate-900">{h.date}</p>
                                            <p className="text-[10px] font-bold text-blue-500 uppercase">{h.shift}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-bold text-slate-700">
                                                {(!h.truck || h.truck === 'undefined') ? 'Sin camión asignado' : h.truck}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-slate-600">{h.failureDetectedAt}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-slate-900">{h.operationalHours}h</span>
                                                <span className="text-[10px] font-bold text-red-400">(-{h.deductedHours}h)</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-slate-700">{h.reason}</td>
                                        <td className="px-6 py-4 max-w-xs">
                                            <p className="text-xs text-slate-500 leading-relaxed truncate hover:text-clip hover:whitespace-normal transition-all cursor-help">
                                                {h.detail}
                                            </p>
                                        </td>
                                    </tr>
                                ))
                        )}
                    </tbody>
                </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
