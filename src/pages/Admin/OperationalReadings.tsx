import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore';
import { OperationalReading, TruckInfo, WASHING_OPERATORS } from '../../types';
import { Calendar, Filter, Download, Search, Thermometer, Droplets, Gauge } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function OperationalReadings() {
  const [readings, setReadings] = useState<OperationalReading[]>([]);
  const [trucks, setTrucks] = useState<TruckInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateStart: '',
    dateEnd: '',
    shift: 'Todos',
    truck: 'Todos',
    operator: 'Todos'
  });

  useEffect(() => {
    let q = query(collection(db, 'operationalReadings'), orderBy('date', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OperationalReading));
      setReadings(data);
      setLoading(false);
    });

    const fetchTrucks = async () => {
        const tSnap = await getDocs(collection(db, 'trucks'));
        setTrucks(tSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckInfo)));
    };
    fetchTrucks();

    return () => unsubscribe();
  }, []);

  const filteredReadings = readings.filter(r => {
    if (filters.dateStart && r.date < filters.dateStart) return false;
    if (filters.dateEnd && r.date > filters.dateEnd) return false;
    if (filters.shift !== 'Todos' && r.shift !== filters.shift) return false;
    if (filters.truck !== 'Todos' && r.truck !== filters.truck) return false;
    if (filters.operator !== 'Todos' && r.washingOperator !== filters.operator) return false;
    return true;
  });

  const exportCSV = () => {
    const headers = [
      'Fecha', 'Turno', 'Operador', 'Camion',
      'TKA uS', 'TKA T', 'TKA Nivel',
      'TKC uS', 'TKC T', 'TKC Nivel',
      'TKE uS', 'TKE T', 'TKE Nivel',
      'Potable uS', 'Potable T', 'Potable Nivel',
      'Camion uS', 'Camion T', 'Camion Nivel'
    ];

    const rows = filteredReadings.map(r => {
      const tkeReading = r.readings.TKE || r.readings.TKD || { us: 0, temperature: 0, level: 0 };
      const truckTankReading = r.readings.truckTank || { us: '', temperature: '', level: '' };
      return [
        r.date, r.shift, r.washingOperator, r.truck,
        r.readings.TKA.us, r.readings.TKA.temperature, r.readings.TKA.level,
        r.readings.TKC.us, r.readings.TKC.temperature, r.readings.TKC.level,
        tkeReading.us, tkeReading.temperature, tkeReading.level,
        r.readings.potableWater.us, r.readings.potableWater.temperature, r.readings.potableWater.level,
        truckTankReading.us || '-', truckTankReading.temperature || '-', truckTankReading.level || '-'
      ];
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `lecturas_operacionales_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Filters */}
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
                <div className="bg-slate-900 p-2.5 rounded-xl text-white">
                    <Filter size={20} />
                </div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Filtros Avanzados</h3>
            </div>
            <button 
                onClick={exportCSV}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
            >
                <Download size={18} />
                Exportar CSV
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Desde</label>
            <input 
              type="date" 
              value={filters.dateStart}
              onChange={e => setFilters(f => ({ ...f, dateStart: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Hasta</label>
            <input 
              type="date" 
              value={filters.dateEnd}
              onChange={e => setFilters(f => ({ ...f, dateEnd: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Turno</label>
            <select 
              value={filters.shift}
              onChange={e => setFilters(f => ({ ...f, shift: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
            >
              <option value="Todos">Todos</option>
              <option value="T39">T39</option>
              <option value="T44">T44</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Camión</label>
            <select 
              value={filters.truck}
              onChange={e => setFilters(f => ({ ...f, truck: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
            >
              <option value="Todos">Todos</option>
              {trucks.map(t => <option key={t.id} value={t.code}>{t.code}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Operador</label>
            <select 
              value={filters.operator}
              onChange={e => setFilters(f => ({ ...f, operator: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-bold text-slate-700 outline-hidden focus:bg-white focus:border-blue-500"
            >
              <option value="Todos">Todos</option>
              {WASHING_OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">Fecha / Turno</th>
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest border-b border-slate-800">Operador / Camión</th>
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest border-b border-slate-800 bg-slate-800/50">TKA (uS-T-%)</th>
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest border-b border-slate-800 bg-slate-800/60">TKC (uS-T-%)</th>
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest border-b border-slate-800 bg-slate-800/50">TKE (uS-T-%)</th>
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest border-b border-slate-800 bg-slate-800/60">Agua Pot. (uS-T-%)</th>
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest border-b border-slate-800 bg-slate-800/50">Camión (uS-T-%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando datos...</td>
                </tr>
              ) : filteredReadings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No hay lecturas registradas</td>
                </tr>
              ) : (
                filteredReadings.map((r) => {
                  const tkeReading = r.readings.TKE || r.readings.TKD;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-6">
                        <p className="text-sm font-black text-slate-900">{format(new Date(r.date + 'T12:00:00'), 'dd MMM, yy', { locale: es })}</p>
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">{r.shift}</p>
                      </td>
                      <td className="px-6 py-6">
                          <p className="text-xs font-bold text-slate-700">{r.displayOperatorName || r.washingOperator}</p>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{r.displayTruckName || r.truck}</p>
                      </td>
                      <td className="px-6 py-6 bg-slate-50/30">
                          <ReadingBadge reading={r.readings.TKA} />
                      </td>
                      <td className="px-6 py-6 bg-slate-50/60">
                           <ReadingBadge reading={r.readings.TKC} />
                      </td>
                      <td className="px-6 py-6 bg-slate-50/30">
                           <ReadingBadge reading={tkeReading} />
                      </td>
                      <td className="px-6 py-6 bg-slate-50/60">
                           <ReadingBadge reading={r.readings.potableWater} />
                      </td>
                      <td className="px-6 py-6 bg-slate-50/30">
                           <ReadingBadge reading={r.readings.truckTank} isTruck />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReadingBadge({ reading, isTruck = false }: { reading: any, isTruck?: boolean }) {
    if (!reading || reading.us === '' || reading.us === undefined) {
        return <span className="text-[10px] text-slate-400/80 font-mono font-bold italic">{isTruck ? 'Sin Camión' : 'S/R'}</span>;
    }
    return (
        <div className="flex flex-col gap-1 font-mono">
            <div className="flex items-center justify-between gap-4">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">uS:</span>
                <span className="text-[11px] font-black text-slate-900">{reading.us}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Temp:</span>
                <span className="text-[11px] font-black text-emerald-600 italic">{reading.temperature}°</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Nivel:</span>
                <span className="text-[11px] font-black text-blue-600">{reading.level}%</span>
            </div>
        </div>
    );
}
