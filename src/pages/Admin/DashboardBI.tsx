import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { WashingProgram, OutOfProgramWashing, TruckInfo, TruckStatus, ShiftType } from '../../types';
import { format, subDays, parseISO } from 'date-fns';
import { calculateBacklogMetrics } from '../../data/backlogCatalog';
import { 
  TrendingUp, 
  Activity, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Truck, 
  Layers,
  ArrowUpRight,
  Info,
  RefreshCw,
  Award,
  User,
  Wrench,
  Search,
  CheckCircle,
  XCircle
} from 'lucide-react';

const getDefaultShift = (): ShiftType => {
  const hour = new Date().getHours();
  return (hour >= 8 && hour < 20) ? 'T39' : 'T44';
};

export default function DashboardBI() {
  const [loading, setLoading] = useState(true);
  const [washingPrograms, setWashingPrograms] = useState<WashingProgram[]>([]);
  const [outOfProgramWashings, setOutOfProgramWashings] = useState<OutOfProgramWashing[]>([]);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const [trucks, setTrucks] = useState<TruckInfo[]>([]);
  const [currentTime, setCurrentTime] = useState<string>(format(new Date(), 'HH:mm:ss'));
  const [lastUpdated, setLastUpdated] = useState<string>(format(new Date(), 'HH:mm:ss'));
  const [hoveredPoint, setHoveredPoint] = useState<{ name: string; value: number; x: number; y: number } | null>(null);

  // Filter Selectors for Dashboard active viewing
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedShift, setSelectedShift] = useState<ShiftType>(getDefaultShift());
  const [hasSetDefaultShift, setHasSetDefaultShift] = useState(false);

  // Dynamically set default shift based on recent activity or active programming
  useEffect(() => {
    if (washingPrograms.length > 0 && !hasSetDefaultShift) {
      const detectActiveShift = (programs: WashingProgram[]): ShiftType => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        
        // 1. Try to find the latest program that has actually been worked/activated (status !== 'Pendiente') up to today
        const workedPrograms = programs.filter(p => p.status !== 'Pendiente' && p.date <= todayStr);
        if (workedPrograms.length > 0) {
          const sorted = [...workedPrograms].sort((a, b) => {
            if (a.date !== b.date) {
              return b.date.localeCompare(a.date);
            }
            return b.shift.localeCompare(a.shift);
          });
          return sorted[0].shift;
        }
        
        // 2. Try to find the latest scheduled program up to today
        const scheduledPrograms = programs.filter(p => p.date <= todayStr);
        if (scheduledPrograms.length > 0) {
          const sorted = [...scheduledPrograms].sort((a, b) => {
            if (a.date !== b.date) {
              return b.date.localeCompare(a.date);
            }
            return b.shift.localeCompare(a.shift);
          });
          return sorted[0].shift;
        }
        
        return getDefaultShift();
      };

      const activeShift = detectActiveShift(washingPrograms);
      setSelectedShift(activeShift);
      setHasSetDefaultShift(true);
    }
  }, [washingPrograms, hasSetDefaultShift]);

  // Clock ticks every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(format(new Date(), 'HH:mm:ss'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Set up real-time firebase listeners
  useEffect(() => {
    setLoading(true);

    const unsubPrograms = onSnapshot(
      query(collection(db, 'washingPrograms')),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WashingProgram));
        setWashingPrograms(data);
        setLastUpdated(format(new Date(), 'HH:mm:ss'));
        setLoading(false);
      },
      (err) => console.error("Error loading programs:", err)
    );

    const unsubOutOfProgram = onSnapshot(
      query(collection(db, 'outOfProgramWashings')),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OutOfProgramWashing));
        setOutOfProgramWashings(data);
        setLastUpdated(format(new Date(), 'HH:mm:ss'));
      },
      (err) => console.error("Error loading out-of-program:", err)
    );

    const unsubTrucks = onSnapshot(
      query(collection(db, 'trucks')),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TruckInfo));
        setTrucks(data);
        setLastUpdated(format(new Date(), 'HH:mm:ss'));
      },
      (err) => console.error("Error loading trucks:", err)
    );

    const unsubHistory = onSnapshot(
      query(collection(db, 'truckStatusHistory')),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setStatusHistory(data);
        setLastUpdated(format(new Date(), 'HH:mm:ss'));
      },
      (err) => console.error("Error loading status history:", err)
    );

    // Auto-refresh every 60 seconds as requested
    const intervalFallback = setInterval(() => {
      setLastUpdated(format(new Date(), 'HH:mm:ss'));
    }, 60000);

    return () => {
      unsubPrograms();
      unsubOutOfProgram();
      unsubTrucks();
      unsubHistory();
      clearInterval(intervalFallback);
    };
  }, []);

  // Helper matching existing logic
  const getProgramStructures = (p: WashingProgram) => {
    const isChecklist = p.controlType === 'checklist' || (p.items && p.items.length > 0);
    let programmed = 0;
    let completed = 0;

    if (isChecklist) {
      programmed = p.items?.length || p.programmedQuantity || 0;
      if (p.status === 'Completo' || p.status === 'Cerrado') {
        completed = programmed;
      } else if (p.status === 'No realizado') {
        completed = 0;
      } else {
        completed = p.items?.filter(item => item.done).length ?? p.completedCount ?? 0;
      }
    } else {
      programmed = p.programmedQuantity || 0;
      if (p.status === 'Completo' || p.status === 'Cerrado') {
        completed = programmed;
      } else if (p.status === 'No realizado') {
        completed = 0;
      } else {
        completed = p.completedCount ?? 0;
      }
    }

    completed = Math.max(0, Math.min(programmed, completed));
    const pending = Math.max(0, programmed - completed);

    return { programmed, completed, pending };
  };

  const currentMonthPrefix = useMemo(() => format(new Date(), 'yyyy-MM'), []);

  // Dynamic Backlog metrics calculation (100% automated)
  const backlogStats = useMemo(() => {
    return calculateBacklogMetrics(washingPrograms);
  }, [washingPrograms]);

  // Extract supervisor / operator info for Header for active Date/Shift
  const headerOperationDetails = useMemo(() => {
    const dayProgs = washingPrograms.filter(
      p => p.date === selectedDate && p.shift === selectedShift && p.status !== 'PLANIFICADO'
    );

    const supervisors = Array.from(new Set(dayProgs.map(p => p.createdBy).filter(Boolean)));
    const operators = Array.from(new Set(dayProgs.map(p => {
      if (p.washingOperator === 'REEMPLAZO' && p.replacementOperatorName) {
        return `${p.replacementOperatorName} (R)`;
      }
      return p.washingOperator;
    }).filter(Boolean)));

    return {
      supervisor: supervisors.length > 0 ? supervisors.join(', ') : 'Sin encargado',
      operator: operators.length > 0 ? operators.join(', ') : 'Sin operador asignado'
    };
  }, [washingPrograms, selectedDate, selectedShift]);

  // Dynamic fleet list for active Date/Shift
  const activeFleet = useMemo(() => {
    // CM95 & CM97 are always permanent
    const permanent = ['CM95', 'CM97'];
    
    // Find active replacement trucks for selected date/shift
    const dayProgs = washingPrograms.filter(
      p => p.date === selectedDate && p.shift === selectedShift && p.status !== 'PLANIFICADO'
    );
    const replacementTags = new Set<string>();
    dayProgs.forEach(p => {
      if (p.truck === 'REEMPLAZO' && p.replacementTruckTag) {
        replacementTags.add(p.replacementTruckTag.toUpperCase());
      }
    });

    const list = [...permanent, ...Array.from(replacementTags)];
    
    // Lookup status in truckStatusHistory
    const historyId = `${selectedDate}_${selectedShift}`;
    const record = statusHistory.find(h => h.id === historyId);

    return list.map(code => {
      const savedInfo = record?.trucks?.find((t: any) => t.code === code);
      if (savedInfo) {
        return {
          code,
          status: savedInfo.status as TruckStatus,
          entryHour: savedInfo.entryHour,
          reason: savedInfo.reason,
          observation: savedInfo.observation
        };
      }
      // If not registered yet, default to "Sin Registrar"
      return {
        code,
        status: 'Sin Registrar' as TruckStatus
      };
    });
  }, [washingPrograms, statusHistory, selectedDate, selectedShift]);

  // Find current day/shift operation status in statusHistory
  const currentDayOperation = useMemo(() => {
    const historyId = `${selectedDate}_${selectedShift}`;
    const record = statusHistory.find(h => h.id === historyId);
    if (record) {
      let statusValue = record.operationStatus || 'En ejecución';
      if (statusValue === 'Operativa') {
        statusValue = 'En ejecución';
      } else if (statusValue === 'Suspendida') {
        const oldReason = record.suspensionReason || '';
        if (oldReason.toLowerCase().includes('camión') || oldReason.toLowerCase().includes('camion')) {
          statusValue = 'Suspendido por falta de camión';
        } else if (oldReason.toLowerCase().includes('clima') || oldReason.toLowerCase().includes('climática')) {
          statusValue = 'Suspendido por condiciones climáticas';
        } else {
          statusValue = 'Suspendido por contingencia operacional';
        }
      }
      return {
        status: statusValue,
        observation: record.suspensionObservation || ''
      };
    }
    return {
      status: 'En ejecución',
      observation: ''
    };
  }, [statusHistory, selectedDate, selectedShift]);

  const stats = useMemo(() => {
    // CRITICAL REQUIREMENT: Filter out all 'PLANIFICADO' programs for adherence/compliance KPIs
    const activePrograms = washingPrograms.filter(p => p.status !== 'PLANIFICADO');

    // 1. Selected day stats (Entire Day for Avance Diario)
    const todayPrograms = activePrograms.filter(p => p.date === selectedDate);
    let todayProgrammed = 0;
    let todayCompleted = 0;
    let todayPending = 0;

    todayPrograms.forEach(p => {
      const { programmed, completed, pending } = getProgramStructures(p);
      todayProgrammed += programmed;
      todayCompleted += completed;
      todayPending += pending;
    });

    const todayCompliance = todayProgrammed > 0 
      ? Math.round((todayCompleted / todayProgrammed) * 100) 
      : 0;

    // 2. Monthly stats
    const monthlyPrograms = activePrograms.filter(p => p.date && p.date.startsWith(currentMonthPrefix));
    let monthProgrammed = 0;
    let monthCompleted = 0;
    let monthPending = 0;

    monthlyPrograms.forEach(p => {
      const { programmed, completed, pending } = getProgramStructures(p);
      monthProgrammed += programmed;
      monthCompleted += completed;
      monthPending += pending;
    });

    const monthCompliance = monthProgrammed > 0 
      ? Math.round((monthCompleted / monthProgrammed) * 100) 
      : 0;

    // 3. Out of program stats
    const todayOOP = outOfProgramWashings.filter(w => w.date === selectedDate && w.shift === selectedShift).length;
    const monthOOP = outOfProgramWashings.filter(w => w.date && w.date.startsWith(currentMonthPrefix)).length;

    // 4. Line Chart SVG Data: Evolution of the last 30 days
    const last30DaysRaw = [];
    let maxDailyCompleted = 0;
    for (let i = 29; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dStr = format(d, 'yyyy-MM-dd');
      const dLabel = format(d, 'dd/MM');

      const dayPrograms = activePrograms.filter(p => p.date === dStr);
      let dayCompleted = 0;
      dayPrograms.forEach(p => {
        const { completed } = getProgramStructures(p);
        dayCompleted += completed;
      });

      if (dayCompleted > maxDailyCompleted) {
        maxDailyCompleted = dayCompleted;
      }

      last30DaysRaw.push({
        dateStr: dStr,
        label: dLabel,
        value: dayCompleted
      });
    }

    // 5. Bar Chart: Advance by Area (Current Month)
    const areas = [
      'Equipos críticos CS',
      'Interior planta CS',
      'Equipos críticos en periferia',
      'Lavado periferia'
    ] as const;

    let maxAreaValue = 0;
    const areaChartData = areas.map(area => {
      const areaPrograms = monthlyPrograms.filter(p => p.areaName === area);
      let prog = 0;
      let comp = 0;

      areaPrograms.forEach(p => {
        const { programmed, completed } = getProgramStructures(p);
        prog += programmed;
        comp += completed;
      });

      const maxVal = Math.max(prog, comp);
      if (maxVal > maxAreaValue) {
        maxAreaValue = maxVal;
      }

      return {
        areaMatch: area,
        area: area.replace('Equipos críticos ', 'Eq. Críticos ').replace('en periferia', 'Perif.'),
        programmed: prog,
        completed: comp
      };
    });

    // 6. Table Summary: Last 8 days with activity
    const summaryTableMap: Record<string, { date: string, programmed: number, completed: number, pending: number, oop: number }> = {};
    
    activePrograms.forEach(p => {
      if (!p.date) return;
      const { programmed, completed, pending } = getProgramStructures(p);
      if (!summaryTableMap[p.date]) {
        summaryTableMap[p.date] = { date: p.date, programmed: 0, completed: 0, pending: 0, oop: 0 };
      }
      summaryTableMap[p.date].programmed += programmed;
      summaryTableMap[p.date].completed += completed;
      summaryTableMap[p.date].pending += pending;
    });

    outOfProgramWashings.forEach(w => {
      if (!w.date) return;
      if (!summaryTableMap[w.date]) {
        summaryTableMap[w.date] = { date: w.date, programmed: 0, completed: 0, pending: 0, oop: 0 };
      }
      summaryTableMap[w.date].oop += 1;
    });

    const summaryTableData = Object.values(summaryTableMap)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
      .map(row => {
        const pct = row.programmed > 0 ? Math.round((row.completed / row.programmed) * 100) : 0;
        return {
          ...row,
          compliance: pct
        };
      });

    return {
      todayProgrammed,
      todayCompleted,
      todayPending,
      todayCompliance,
      monthProgrammed,
      monthCompleted,
      monthPending,
      monthCompliance,
      todayOOP,
      monthOOP,
      last30DaysRaw,
      maxDailyCompleted: maxDailyCompleted || 1,
      areaChartData,
      maxAreaValue: maxAreaValue || 1,
      summaryTableData
    };
  }, [washingPrograms, outOfProgramWashings, selectedDate, selectedShift, currentMonthPrefix]);

  const getStatusColor = (status: TruckStatus) => {
    switch (status) {
      case 'Disponible':
      case 'En servicio':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Fuera de servicio':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      case 'En taller':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'Sin Registrar':
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  const getStatusText = (status: TruckStatus) => {
    if (status === 'Disponible' || status === 'En servicio') return 'DISPONIBLE';
    if (status === 'Fuera de servicio') return 'MANTENCIÓN';
    if (status === 'En taller') return 'EN TALLER';
    return 'SIN REGISTRAR';
  };

  // Render SVG points of evolution line chart
  const lineChartPoints = useMemo(() => {
    const width = 500;
    const height = 120;
    const paddingLeft = 20;
    const paddingRight = 20;
    const paddingTop = 15;
    const paddingBottom = 15;

    const usableWidth = width - paddingLeft - paddingRight;
    const usableHeight = height - paddingTop - paddingBottom;

    const points = stats.last30DaysRaw.map((day, idx) => {
      const x = paddingLeft + (idx / 29) * usableWidth;
      const y = height - paddingBottom - (day.value / stats.maxDailyCompleted) * usableHeight;
      return { x, y, ...day };
    });

    const pathData = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    const areaPathData = points.length > 0
      ? `${pathData} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
      : '';

    return { points, pathData, areaPathData, width, height, paddingLeft, paddingBottom };
  }, [stats.last30DaysRaw, stats.maxDailyCompleted]);

  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#0b0f19] text-slate-100">
        <Activity className="h-10 w-10 animate-spin text-orange-500 mb-4" />
        <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">Sincronizando con Servidores SQM...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0b0f19] text-slate-100 p-6 flex flex-col justify-between font-sans selection:bg-orange-500/30 selection:text-white">
      {/* HEADER SECTION */}
      <header className="flex flex-col md:flex-row items-center justify-between border-b border-slate-800/80 pb-4 mb-4 gap-4">
        <div className="flex items-center gap-4">
          <img 
            src="/logo-sqm.png" 
            alt="SQM Logo" 
            className="h-12 w-12 object-contain filter drop-shadow-[0_2px_10px_rgba(255,255,255,0.05)]"
            referrerPolicy="no-referrer"
          />
          <div className="border-l border-slate-800 pl-4">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-none">
              PROGRAMA DE LAVADOS SQM
            </h1>
            <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-ping"></span>
              Dashboard Operacional v1.0
            </p>
          </div>
        </div>

        {/* Real-time selectors */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-900/40 border border-slate-800/80 p-2 rounded-2xl">
          <div className="flex items-center gap-2 px-3 border-r border-slate-800">
            <Calendar size={14} className="text-orange-500" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-black text-white focus:outline-none cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2 px-2">
            <Clock size={14} className="text-orange-500" />
            <select 
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value as ShiftType)}
              className="bg-transparent text-xs font-black text-white focus:outline-none cursor-pointer"
            >
              <option value="T39" className="bg-slate-950">T39</option>
              <option value="T44" className="bg-slate-950">T44</option>
            </select>
          </div>
        </div>

        {/* Real-time clocks / status */}
        <div className="flex items-center gap-5 bg-slate-900/60 border border-slate-800/80 px-5 py-2.5 rounded-2xl shadow-inner">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-slate-400">Hora:</span>
            <span className="text-base font-black text-white font-mono">{currentTime}</span>
          </div>
          <div className="h-5 w-px bg-slate-800"></div>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" style={{ animationDuration: '6s' }} />
            <span className="text-xs font-bold text-slate-400 uppercase">Actualizado:</span>
            <span className="text-xs font-black text-slate-300 font-mono">{lastUpdated}</span>
          </div>
        </div>
      </header>

      {/* NEW MEJORA N.º 7: EXECUTED ROLE & TIME HEADER PANELS */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 bg-slate-950/40 border border-slate-800/50 p-4 rounded-2xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/15">
            <Calendar size={16} />
          </div>
          <div>
            <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Fecha Operación</span>
            <p className="text-sm font-black text-white">{format(parseISO(selectedDate), 'dd / MMMM / yyyy')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/15">
            <User size={16} />
          </div>
          <div>
            <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Operador de Lavado</span>
            <p className="text-sm font-black text-white truncate max-w-[200px]" title={headerOperationDetails.operator}>
              {headerOperationDetails.operator}
            </p>
          </div>
        </div>
      </section>

      {/* ESTADO GENERAL DE LA OPERACIÓN */}
      <div className={`mb-5 p-5 rounded-3xl border shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300 ${
        currentDayOperation.status === 'En ejecución'
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
          : currentDayOperation.status === 'Detenido'
          ? 'bg-red-500/10 border-red-500/20 text-red-200'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-200'
      }`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-2xl shrink-0 border ${
            currentDayOperation.status === 'En ejecución'
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
              : currentDayOperation.status === 'Detenido'
              ? 'bg-red-500/15 text-red-400 border-red-500/20'
              : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
          }`}>
            {currentDayOperation.status === 'En ejecución' ? (
              <CheckCircle className="w-5 h-5 animate-pulse" />
            ) : currentDayOperation.status === 'Detenido' ? (
              <XCircle className="w-5 h-5 animate-pulse" />
            ) : (
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            )}
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Estado General del Turno</span>
            <h4 className="text-sm font-black text-white mt-0.5 flex items-center gap-2">
              <span>{currentDayOperation.status}</span>
            </h4>
            {currentDayOperation.observation && (
              <p className="text-xs text-slate-300 italic mt-0.5">
                "{currentDayOperation.observation}"
              </p>
            )}
          </div>
        </div>
        <div className={`text-[10px] font-black uppercase tracking-widest px-3.5 py-1.5 rounded-full border self-start sm:self-auto ${
          currentDayOperation.status === 'En ejecución'
            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15'
            : currentDayOperation.status === 'Detenido'
            ? 'text-red-400 bg-red-500/10 border-red-500/15'
            : 'text-amber-400 bg-amber-500/10 border-amber-500/15'
        }`}>
          {currentDayOperation.status === 'En ejecución' ? '🟢 OPERANDO NORMAL' : '🔴 OPERACIÓN DETENIDA/SUSPENDIDA'}
        </div>
      </div>

      {/* KPI GRID WITH DYNAMIC BACKLOG */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-5 shrink-0">
        {/* KPI 1: Cumplimiento de Hoy */}
        <div className="relative overflow-hidden bg-slate-900/80 border border-slate-800/60 rounded-3xl p-6 shadow-xl flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-extrabold tracking-widest text-slate-400 uppercase">AVANCE DIARIO</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black tracking-tighter text-white font-mono">{stats.todayCompliance}%</span>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full flex items-center gap-0.5">
                <ArrowUpRight size={10} /> Día
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-400 pt-1">
              <div>Prog: <span className="font-bold text-slate-200 font-mono text-sm">{stats.todayProgrammed}</span></div>
              <div className="w-1 h-1 bg-slate-700 rounded-full"></div>
              <div>Real: <span className="font-bold text-emerald-400 font-mono text-sm">{stats.todayCompleted}</span></div>
              <div className="w-1 h-1 bg-slate-700 rounded-full"></div>
              <div>Pend: <span className="font-bold text-orange-400 font-mono text-sm">{stats.todayPending}</span></div>
            </div>
          </div>
          {/* Circular Progress Indicator */}
          <div className="relative w-20 h-20 shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <circle
                className="text-slate-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                cx="18"
                cy="18"
                r="15.9155"
              />
              <circle
                className="text-emerald-500 transition-all duration-1000 ease-out"
                strokeDasharray={`${stats.todayCompliance}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                cx="18"
                cy="18"
                r="15.9155"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
          </div>
        </div>

        {/* KPI 2: Cumplimiento Mensual */}
        <div className="relative overflow-hidden bg-slate-900/80 border border-slate-800/60 rounded-3xl p-6 shadow-xl flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-extrabold tracking-widest text-slate-400 uppercase">ACUMULADO MES</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black tracking-tighter text-white font-mono">{stats.monthCompliance}%</span>
              <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-full flex items-center gap-0.5">
                <ArrowUpRight size={10} /> Mensual
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-400 pt-1">
              <div>Prog: <span className="font-bold text-slate-200 font-mono text-sm">{stats.monthProgrammed}</span></div>
              <div className="w-1 h-1 bg-slate-700 rounded-full"></div>
              <div>Real: <span className="font-bold text-sky-400 font-mono text-sm">{stats.monthCompleted}</span></div>
              <div className="w-1 h-1 bg-slate-700 rounded-full"></div>
              <div>Pend: <span className="font-bold text-orange-400 font-mono text-sm">{stats.monthPending}</span></div>
            </div>
          </div>
          {/* Circular Progress Indicator */}
          <div className="relative w-20 h-20 shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <circle
                className="text-slate-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                cx="18"
                cy="18"
                r="15.9155"
              />
              <circle
                className="text-sky-400 transition-all duration-1000 ease-out"
                strokeDasharray={`${stats.monthCompliance}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                cx="18"
                cy="18"
                r="15.9155"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Award className="w-7 h-7 text-sky-400" />
            </div>
          </div>
        </div>

        {/* NEW MEJORA N.º 8: KPI 3: Backlog Operacional Inteligente */}
        <div className="relative overflow-hidden bg-slate-900/80 border border-slate-800/60 rounded-3xl p-6 shadow-xl flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-extrabold tracking-widest text-slate-400 uppercase">BACKLOG OPERACIONAL</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black tracking-tighter text-fuchsia-400 font-mono">{Math.round(backlogStats.percentage)}%</span>
              <span className="text-[10px] font-bold text-fuchsia-400 bg-fuchsia-500/10 px-2.5 py-0.5 rounded-full flex items-center gap-0.5">
                <CheckCircle size={10} /> Avance
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-400 pt-1">
              <div>Total por lavar: <span className="font-bold text-slate-200 font-mono text-sm">{backlogStats.total}</span></div>
              <div className="w-1 h-1 bg-slate-700 rounded-full"></div>
              <div>Lavadas: <span className="font-bold text-fuchsia-400 font-mono text-sm">{backlogStats.recovered}</span></div>
              <div className="w-1 h-1 bg-slate-700 rounded-full"></div>
              <div>Pendientes: <span className="font-bold text-orange-400 font-mono text-sm">{backlogStats.pending}</span></div>
            </div>
          </div>
          {/* Circular Progress Indicator */}
          <div className="relative w-20 h-20 shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <circle
                className="text-slate-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                cx="18"
                cy="18"
                r="15.9155"
              />
              <circle
                className="text-fuchsia-500 transition-all duration-1000 ease-out"
                strokeDasharray={`${backlogStats.percentage}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                cx="18"
                cy="18"
                r="15.9155"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Activity className="w-7 h-7 text-fuchsia-400 animate-pulse" />
            </div>
          </div>
        </div>

        {/* KPI 4: Fuera de Programa */}
        <div className="relative overflow-hidden bg-slate-900/80 border border-slate-800/60 rounded-3xl p-6 shadow-xl flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs font-extrabold tracking-widest text-slate-400 uppercase">FUERA DE PROGRAMA</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black tracking-tighter text-orange-500 font-mono">{stats.todayOOP}</span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registros</span>
            </div>
            <div className="text-xs font-semibold text-slate-400 pt-1">
              Acumulado del mes actual: <span className="font-black text-orange-400 text-sm font-mono ml-1">{stats.monthOOP}</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center bg-orange-500/10 border border-orange-500/10 rounded-2xl p-4 shrink-0 w-20 h-20 opacity-90">
            <AlertTriangle className="w-8 h-8 text-orange-500 animate-pulse" />
            <span className="text-[10px] font-black text-orange-400 uppercase tracking-wider mt-1">Alertas</span>
          </div>
        </div>
      </div>

      {/* MID SECTION: CHARTS & TRUCK STATUSES */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 mb-5 flex-1 min-h-0">
        {/* Left Column: Trucks Operational Status - MEJORA N.º 7: ESTADO EN TALLER & REEMPLAZO AUTOMATIZADO */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800/60 rounded-3xl p-5 flex flex-col justify-between shadow-xl xl:h-full">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Truck className="w-5 h-5 text-orange-500" />
              <h2 className="text-xs font-black tracking-widest text-slate-200 uppercase">ESTADO DE FLOTA DIARIA</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
              {activeFleet.map((truck) => {
                const status = truck.status;
                const showWorkshopDetails = status === 'En taller' && (truck.entryHour || truck.reason || truck.observation);
                
                return (
                  <div 
                    key={truck.code} 
                    className="bg-slate-950/60 border border-slate-800/40 p-3 rounded-2xl flex flex-col gap-2 shadow-sm transition-all duration-300 hover:border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-slate-200 text-xs tracking-tight select-none">
                          {truck.code}
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-white">Camión de Lavado</h4>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Módulos DDEE</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${status === 'Disponible' || status === 'En servicio' ? 'bg-emerald-500 animate-pulse' : status === 'En taller' ? 'bg-amber-500 animate-pulse' : status === 'Sin Registrar' ? 'bg-slate-500' : 'bg-rose-500'}`}></span>
                        <span className={`text-[9px] font-black tracking-wider px-2.5 py-1 rounded-full ${getStatusColor(status)}`}>
                          {getStatusText(status)}
                        </span>
                      </div>
                    </div>

                    {/* EN TALLER DETAIL BOX */}
                    {showWorkshopDetails && (
                      <div className="mt-1 bg-slate-900/80 border border-amber-500/25 p-2 rounded-xl text-[10px] space-y-1 text-slate-300">
                        <div className="flex items-center justify-between text-[9px] font-black text-amber-400 uppercase tracking-wider">
                          <span className="flex items-center gap-1"><Wrench size={10} /> DETALLE TALLER</span>
                          {truck.entryHour && <span>Ingreso: {truck.entryHour}</span>}
                        </div>
                        {truck.reason && <p className="font-extrabold text-slate-200">Motivo: <span className="font-medium text-slate-300">{truck.reason}</span></p>}
                        {truck.observation && <p className="leading-relaxed italic text-slate-400 font-medium">Obs: "{truck.observation}"</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-start gap-2 bg-slate-950/30 p-2.5 rounded-xl">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[10px] leading-relaxed text-slate-400 font-medium">
              Los estados de camiones se administran en tiempo real por el equipo de patio SQM.
            </p>
          </div>
        </div>

        {/* Middle-Right Column: Custom Area Bar Chart */}
        <div className="bg-slate-900/80 border border-slate-800/60 rounded-3xl p-5 flex flex-col justify-between shadow-xl">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <Calendar className="w-5 h-5 text-sky-400" />
            <h2 className="text-xs font-black tracking-widest text-slate-200 uppercase">AVANCE POR ÁREAS (MES)</h2>
          </div>

          <div className="flex-1 flex flex-col justify-between space-y-3.5">
            {stats.areaChartData.map((row, idx) => {
              const maxVal = Math.max(row.programmed, row.completed);
              const complianceRate = row.programmed > 0 ? Math.round((row.completed / row.programmed) * 100) : 0;
              
              return (
                <div key={idx} className="bg-slate-950/40 border border-slate-800/30 p-2.5 rounded-2xl">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-[10px] font-black text-slate-300 truncate tracking-wide max-w-[160px]" title={row.areaMatch}>
                      {row.areaMatch}
                    </span>
                    <span className="text-[10px] font-black font-mono text-sky-400">{complianceRate}%</span>
                  </div>

                  {/* Horizontal Bar visualization */}
                  <div className="relative w-full h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-800 flex items-center">
                    {/* Programmed block (gray background bar) */}
                    <div 
                      className="absolute left-0 top-0 h-full bg-slate-800 rounded-full"
                      style={{ width: `${Math.min(100, stats.maxAreaValue > 0 ? (row.programmed / stats.maxAreaValue) * 100 : 0)}%` }}
                    />
                    {/* Realized bar (overlapping glowing cyan) */}
                    <div 
                      className="absolute left-0 top-0 h-full bg-cyan-500 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.4)] transition-all duration-500"
                      style={{ width: `${Math.min(100, stats.maxAreaValue > 0 ? (row.completed / stats.maxAreaValue) * 100 : 0)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-bold">
                    <span>Prog: <strong className="text-slate-400 font-mono">{row.programmed}</strong></span>
                    <span>Realizado: <strong className="text-cyan-400 font-mono">{row.completed}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column (1x span): Line Chart SVG (30 Days Evolution) - Secondary Supporting Graph */}
        <div className="bg-slate-900/80 border border-slate-800/60 rounded-3xl p-5 flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xs font-black tracking-widest text-slate-200 uppercase">TENDENCIA</h2>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-950 px-2.5 py-1 rounded-lg">Realizado</span>
          </div>

          <div className="flex-1 w-full relative min-h-[220px] flex flex-col justify-center">
            {/* SVG implementation for maximum performance with zero NPM deps */}
            <svg 
              viewBox={`0 0 ${lineChartPoints.width} ${lineChartPoints.height}`} 
              className="w-full h-full overflow-visible"
            >
              <defs>
                <linearGradient id="svgGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Help lines */}
              <line x1="20" y1="15" x2="480" y2="15" stroke="#1e293b" strokeDasharray="3,3" strokeWidth="0.5" />
              <line x1="20" y1="60" x2="480" y2="60" stroke="#1e293b" strokeDasharray="3,3" strokeWidth="0.5" />
              <line x1="20" y1="105" x2="480" y2="105" stroke="#1e293b" strokeWidth="0.5" />

              {/* Gradient Area under line */}
              <path d={lineChartPoints.areaPathData} fill="url(#svgGradient)" />

              {/* Foreground stroke line */}
              <path 
                d={lineChartPoints.pathData} 
                fill="none" 
                stroke="#10b981" 
                strokeWidth="2.5" 
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Interactive nodes */}
              {lineChartPoints.points.map((pt, i) => (
                <g key={i}>
                  <circle 
                    cx={pt.x} 
                    cy={pt.y} 
                    r="3.5" 
                    fill="#10b981" 
                    className="hover:scale-[1.8] hover:fill-white cursor-pointer transition-transform duration-300"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredPoint({
                        name: pt.label,
                        value: pt.value,
                        x: pt.x,
                        y: pt.y - 12
                      });
                    }}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                </g>
              ))}

              {/* Hover Tooltip Overlay in SVG */}
              {hoveredPoint && (
                <g>
                  {/* Tooltip Card background */}
                  <rect 
                    x={Math.max(10, Math.min(lineChartPoints.width - 95, hoveredPoint.x - 42))} 
                    y={Math.max(2, hoveredPoint.y - 25)} 
                    width="85" 
                    height="20" 
                    rx="4" 
                    fill="#1e293b" 
                    stroke="#10b981" 
                    strokeWidth="0.75" 
                  />
                  <text 
                    x={Math.max(52, Math.min(lineChartPoints.width - 53, hoveredPoint.x))} 
                    y={Math.max(15, hoveredPoint.y - 11)} 
                    textAnchor="middle" 
                    fill="#fff" 
                    fontSize="8" 
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {hoveredPoint.name}: {hoveredPoint.value} lav.
                  </text>
                </g>
              )}
            </svg>

            {/* X-axis days markers */}
            <div className="flex justify-between text-[9px] text-slate-500 font-extrabold px-5 mt-2 select-none">
              <span>{stats.last30DaysRaw[0]?.label}</span>
              <span>{stats.last30DaysRaw[14]?.label}</span>
              <span className="text-emerald-400 font-black">{stats.last30DaysRaw[29]?.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: DETAILED SUMMARY TABLE */}
      <div className="bg-slate-900/80 border border-slate-800/60 rounded-3xl p-5 shadow-xl shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-orange-500" />
            <h2 className="text-xs font-black tracking-widest text-slate-200 uppercase">HISTORIAL OPERACIONAL RECIENTE</h2>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Registros históricos de los últimos 8 días</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 text-slate-400 font-extrabold text-[10px] uppercase tracking-wider">
                <th className="pb-3 pl-3">Fecha</th>
                <th className="pb-3 text-center">Programado (DDEE)</th>
                <th className="pb-3 text-center">Realizado (DDEE)</th>
                <th className="pb-3 text-center">Pendiente (DDEE)</th>
                <th className="pb-3 text-center">Fuera de Programa</th>
                <th className="pb-3 text-right pr-3">Cumplimiento %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-xs font-bold text-slate-300">
              {stats.summaryTableData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-500">Sin datos operacionales registrados</td>
                </tr>
              ) : (
                stats.summaryTableData.map((row) => (
                  <tr key={row.date} className="hover:bg-slate-950/40 transition-colors">
                    <td className="py-3 pl-3 text-white font-mono">{format(parseISO(row.date), 'dd/MM/yyyy')}</td>
                    <td className="py-3 text-center font-mono text-slate-400">{row.programmed}</td>
                    <td className="py-3 text-center font-mono text-emerald-400">{row.completed}</td>
                    <td className="py-3 text-center font-mono text-orange-400">{row.pending}</td>
                    <td className="py-3 text-center font-mono">
                      {row.oop > 0 ? (
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/25 px-2 py-0.5 rounded-full text-[10px] font-extrabold">
                          {row.oop} Trabajos
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-3 text-right pr-3 font-mono">
                      <div className="flex items-center justify-end gap-2.5">
                        <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden shrink-0 hidden sm:block">
                          <div 
                            className={`h-full rounded-full ${row.compliance >= 80 ? 'bg-emerald-500' : row.compliance >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${Math.min(100, row.compliance)}%` }}
                          />
                        </div>
                        <span className={`text-sm font-black ${row.compliance >= 80 ? 'text-emerald-400' : row.compliance >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {row.compliance}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
