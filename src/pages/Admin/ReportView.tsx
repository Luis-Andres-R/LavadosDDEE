import React, { useEffect, useState, useMemo } from 'react';
import { WashingProgram, OperationalReading, TruckOperatingHours, TruckStatusHistory, INITIAL_TRUCKS, OutOfProgramWashing } from '../../types';
import { format } from 'date-fns';
import { generatePDFReport } from '../../utils/pdfGenerator';
import { FileDown, Printer, X, CheckCircle2, AlertCircle, Clock, Thermometer, Truck, Loader2, AlertTriangle, PlayCircle } from 'lucide-react';

interface ReportData {
  programs: WashingProgram[];
  readings: OperationalReading[];
  opHours: TruckOperatingHours[];
  statusHistory: TruckStatusHistory[];
  outOfPrograms?: OutOfProgramWashing[];
  type: string;
  range: { start: string, end: string };
  selectedShift?: string;
}

export default function ReportView() {
  const [data, setData] = useState<ReportData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [waterHoveredIdx, setWaterHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const rawData = sessionStorage.getItem('currentReportData');
    if (rawData) {
      setData(JSON.parse(rawData));
    }
  }, []);

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Clock className="mx-auto h-12 w-12 animate-spin text-blue-500 mb-4" />
          <p className="text-slate-600 font-bold">Cargando reporte...</p>
        </div>
      </div>
    );
  }

  const { programs, readings, opHours, statusHistory = [], outOfPrograms = [], type, range, selectedShift = 'Todos' } = data;

  const suspendedWorkdays = useMemo(() => {
    return (statusHistory || []).filter(h => {
      const status = h.operationStatus || 'En ejecución';
      return status !== 'En ejecución' && status !== 'Operativa';
    });
  }, [statusHistory]);

  // Helper to calculate structures/equipments for a WashingProgram based on checklist/cantidad
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

  // Official Program calculations (Structures/equipments bases)
  let totalEstructurasProgramadas = 0;
  let totalEstructurasRealizadas = 0;
  let totalEstructurasPendientes = 0;

  programs.filter(p => p.status !== 'PLANIFICADO').forEach(p => {
    const { programmed, completed, pending } = getProgramStructures(p);
    totalEstructurasProgramadas += programmed;
    totalEstructurasRealizadas += completed;
    totalEstructurasPendientes += pending;
  });

  const percentageCumplimiento = totalEstructurasProgramadas > 0 
    ? ((totalEstructurasRealizadas / totalEstructurasProgramadas) * 100).toFixed(1) 
    : "0.0";

  // Out of program stats
  const oopStats = {
    totalRecords: outOfPrograms.length,
    totalQuantity: outOfPrograms.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0),
    completed: outOfPrograms.filter(w => w.status === 'Realizado').length,
    pending: outOfPrograms.filter(w => w.status === 'Pendiente' || w.status === 'Programado').length,
    failed: outOfPrograms.filter(w => w.status === 'No realizado').length,
  };

  // Grouped operational hours for CM95, CM97 and REEMPLAZO trucks (12 hours per day, 07:00-19:00)
  const getOpHoursSummary = () => {
    const summary: Record<string, { expected: number, operational: number, deducted: number, reasons: string[] }> = {};
    
    const replacementTags = new Set<string>();
    programs.forEach(p => {
      if (p.truck === 'REEMPLAZO' && p.replacementTruckTag) {
        replacementTags.add(p.replacementTruckTag.toUpperCase());
      }
    });
    outOfPrograms.forEach(w => {
      if (w.truck === 'REEMPLAZO' && w.replacementTruckTag) {
        replacementTags.add(w.replacementTruckTag.toUpperCase());
      }
    });

    const validTrucks = ['CM95', 'CM97', ...Array.from(replacementTags)];
    
    validTrucks.forEach(truck => {
      summary[truck] = { expected: 0, operational: 0, deducted: 0, reasons: [] };
    });

    const getDatesInRange = (startStr: string, endStr: string) => {
      const dates: string[] = [];
      try {
        let current = new Date(startStr + 'T12:00:00');
        const end = new Date(endStr + 'T12:00:00');
        while (current <= end) {
          dates.push(format(current, 'yyyy-MM-dd'));
          current.setDate(current.getDate() + 1);
        }
      } catch (err) {
        console.error("Error calculating date range:", err);
      }
      if (dates.length === 0) {
        dates.push(startStr);
      }
      return dates;
    };

    const uniqueDates = getDatesInRange(range.start, range.end);

    uniqueDates.forEach(date => {
      validTrucks.forEach(truck => {
        let dayExpected = 12;
        let dayDeducted = 0;
        let dayOperational = 12;

        if (truck === 'CM95' || truck === 'CM97') {
          // Check if status is "Fuera de servicio" or "En taller" during this day
          const statusRecord = statusHistory.find(h => h.date === date && h.shift === 'T39') || statusHistory.find(h => h.date === date);
          const truckStatus = statusRecord?.trucks?.find(t => t.code === truck)?.status;

          if (truckStatus === 'Fuera de servicio') {
            dayExpected = 12;
            dayDeducted = 12;
            dayOperational = 0;
            const label = 'Fuera de servicio';
            if (!summary[truck].reasons.includes(label)) {
              summary[truck].reasons.push(label);
            }
          } else if (truckStatus === 'En taller') {
            dayExpected = 12;
            dayDeducted = 12;
            dayOperational = 0;
            const label = 'En taller';
            if (!summary[truck].reasons.includes(label)) {
              summary[truck].reasons.push(label);
            }
          } else if (truckStatus === 'Sin Registrar') {
            // "Sin Registrar" doesn't penalize during the turn
            dayExpected = 12;
            dayDeducted = 0;
            dayOperational = 12;
          } else {
            // Check if there are failure hours logged in operatingHours
            const failure = opHours.find(h => h.date === date && h.truck === truck);
            if (failure) {
              dayDeducted = Number(failure.deductedHours) || 0;
              dayOperational = Math.max(0, 12 - dayDeducted);
              if (failure.reason && !summary[truck].reasons.includes(failure.reason)) {
                summary[truck].reasons.push(failure.reason);
              }
            }
          }
        } else {
          // It's a REEMPLAZO truck!
          // We check if it is active/registered as in service on this date.
          const hasActiveWork = programs.some(p => p.date === date && p.truck === 'REEMPLAZO' && p.replacementTruckTag?.toUpperCase() === truck && p.status !== 'No realizado') ||
                               outOfPrograms.some(w => w.date === date && w.truck === 'REEMPLAZO' && w.replacementTruckTag?.toUpperCase() === truck && w.status !== 'No realizado');

          if (hasActiveWork) {
            dayExpected = 12;
            const failure = opHours.find(h => h.date === date && (h.truck === truck || h.replacementTruckTag?.toUpperCase() === truck));
            if (failure) {
              dayDeducted = Number(failure.deductedHours) || 0;
              dayOperational = Math.max(0, 12 - dayDeducted);
              if (failure.reason && !summary[truck].reasons.includes(failure.reason)) {
                summary[truck].reasons.push(failure.reason);
              }
            } else {
              dayOperational = 12;
              dayDeducted = 0;
            }
          } else {
            dayExpected = 0;
            dayOperational = 0;
            dayDeducted = 0;
          }
        }

        summary[truck].expected += dayExpected;
        summary[truck].operational += dayOperational;
        summary[truck].deducted += dayDeducted;
      });
    });

    return Object.entries(summary)
      .filter(([_, s]) => s.expected > 0)
      .map(([truck, s]) => ({
        truck,
        ...s,
        availability: s.expected > 0 ? (s.operational / s.expected) * 100 : 100
      })).sort((a, b) => a.truck.localeCompare(b.truck));
  };

  // Status Summary for official trucks only
  const getStatusSummary = () => {
    const summary: Record<string, Record<string, number>> = {};
    const validTrucks = ['CM95', 'CM97'];
    validTrucks.forEach(code => {
      summary[code] = { 'En servicio': 0, 'Disponible': 0, 'Fuera de servicio': 0, 'En taller': 0, 'Sin Registrar': 0 };
    });

    statusHistory.forEach(h => {
      h.trucks.forEach(t => {
        if (summary[t.code]) {
          summary[t.code][t.status] = (summary[t.code][t.status] || 0) + 1;
        }
      });
    });

    return Object.entries(summary).map(([code, counts]) => ({
      code,
      ...counts
    }));
  };

  const getStatusDisplay = (s: string) => {
    switch (s) {
      case 'En servicio': return { text: 'SERV', icon: '✅', color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' };
      case 'Disponible': return { text: 'DISP', icon: '🟠', color: 'bg-amber-50 text-amber-700', border: 'border-amber-200' };
      case 'Fuera de servicio': return { text: 'F/S', icon: '❌', color: 'bg-red-50 text-red-700', border: 'border-red-200' };
      case 'En taller': return { text: 'TALL', icon: '🔧', color: 'bg-orange-50 text-orange-700', border: 'border-orange-200' };
      case 'Sin Registrar': return { text: 'S/REG', icon: '⚪', color: 'bg-slate-50 text-slate-400', border: 'border-slate-200' };
      default: return { text: '-', icon: '', color: 'bg-slate-50 text-slate-400', border: 'border-slate-100' };
    }
  };

  // Group programs by Date for Range report
  const getDailyDetails = () => {
    const dailyMap: Record<string, {
      date: string;
      programs: WashingProgram[];
      outOfPrograms: OutOfProgramWashing[];
    }> = {};

    const getDatesInRange = (startStr: string, endStr: string) => {
      const dates: string[] = [];
      try {
        let current = new Date(startStr + 'T12:00:00');
        const end = new Date(endStr + 'T12:00:00');
        while (current <= end) {
          dates.push(format(current, 'yyyy-MM-dd'));
          current.setDate(current.getDate() + 1);
        }
      } catch (err) {
        console.error(err);
      }
      if (dates.length === 0) { dates.push(startStr); }
      return dates;
    };

    const dates = getDatesInRange(range.start, range.end);
    dates.forEach(d => {
      dailyMap[d] = { date: d, programs: [], outOfPrograms: [] };
    });

    programs.forEach(p => {
      if (dailyMap[p.date]) {
        dailyMap[p.date].programs.push(p);
      }
    });

    outOfPrograms.forEach(oop => {
      if (dailyMap[oop.date]) {
        dailyMap[oop.date].outOfPrograms.push(oop);
      }
    });

    return Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  };

  const truckSummary = getOpHoursSummary();
  const statusTableSummary = getStatusSummary();

  // PREPARACIÓN DE DATOS PARA GRÁFICOS DE AGUA Y ESTANQUES
  const getDatesRangeArrayByReport = (start: string, end: string) => {
    const dates: string[] = [];
    try {
      let curr = new Date(start + 'T12:00:00');
      const last = new Date(end + 'T12:00:00');
      while (curr <= last) {
        dates.push(format(curr, 'yyyy-MM-dd'));
        curr.setDate(curr.getDate() + 1);
      }
    } catch (err) {
      console.error(err);
    }
    if (dates.length === 0) dates.push(start);
    return dates;
  };

  const chartDays = getDatesRangeArrayByReport(range.start, range.end).map(d => {
    const dayReadings = readings.filter(r => r.date === d);
    
    const getTankAvg = (tankKey: 'TKA' | 'TKC' | 'TKE' | 'potableWater' | 'truckTank') => {
      let sumUs = 0;
      let sumTemp = 0;
      let count = 0;
      
      dayReadings.forEach(r => {
        const isSuspendedDay = statusHistory?.some(
          h => h.date === r.date && h.shift === r.shift && h.operationStatus !== 'En ejecución' && h.operationStatus !== 'Operativa'
        );
        if (isSuspendedDay) return;

        let tankReading: any = null;
        if (tankKey === 'TKA') tankReading = r.readings.TKA;
        else if (tankKey === 'TKC') tankReading = r.readings.TKC;
        else if (tankKey === 'TKE') tankReading = r.readings.TKE || r.readings.TKD;
        else if (tankKey === 'potableWater') tankReading = r.readings.potableWater;
        else if (tankKey === 'truckTank') tankReading = r.readings.truckTank;
        
        if (tankReading && tankReading.us !== undefined && tankReading.us !== null && tankReading.us !== '') {
          sumUs += parseFloat(tankReading.us) || 0;
          sumTemp += parseFloat(tankReading.temperature) || 0;
          count++;
        }
      });

      return {
        us: count > 0 ? Math.round(sumUs / count) : null,
        temp: count > 0 ? parseFloat((sumTemp / count).toFixed(1)) : null,
        has: count > 0
      };
    };

    const TKA = getTankAvg('TKA');
    const TKC = getTankAvg('TKC');
    const TKE = getTankAvg('TKE');
    const potableWater = getTankAvg('potableWater');
    const truckTank = getTankAvg('truckTank');

    return {
      date: d,
      hasData: TKA.has || TKC.has || TKE.has || potableWater.has || truckTank.has,
      tanks: { TKA, TKC, TKE, potableWater, truckTank }
    };
  });

  const showTruck = chartDays.some(d => d.tanks.truckTank.has);

  const industrialSeries = [
    { key: 'TKA' as const, label: 'TKA', color: '#1d4ed8' }, 
    { key: 'TKC' as const, label: 'TKC', color: '#e04f00' }, 
    { key: 'TKE' as const, label: 'TKE', color: '#8b5cf6' }, 
    ...(showTruck ? [{ key: 'truckTank' as const, label: 'Camión', color: '#4f46e5' }] : []) 
  ];

  const potableSeries = [
    { key: 'potableWater' as const, label: 'Agua Potable', color: '#0d9488' } 
  ];

  const allIndustrialUs = chartDays.flatMap(d => [
    d.tanks.TKA.us,
    d.tanks.TKC.us,
    d.tanks.TKE.us,
    d.tanks.truckTank.us
  ]).filter((v): v is number => v !== null);
  const maxIndustrialUs = allIndustrialUs.length > 0 ? Math.max(...allIndustrialUs, 100) : 100;

  const allPotableUs = chartDays.flatMap(d => [
    d.tanks.potableWater.us
  ]).filter((v): v is number => v !== null);
  const maxPotableUs = allPotableUs.length > 0 ? Math.max(...allPotableUs, 100) : 100;

  const allIndustrialTemp = chartDays.flatMap(d => [
    d.tanks.TKA.temp,
    d.tanks.TKC.temp,
    d.tanks.TKE.temp,
    d.tanks.truckTank.temp
  ]).filter((v): v is number => v !== null);
  const maxIndustrialTemp = allIndustrialTemp.length > 0 ? Math.max(...allIndustrialTemp, 40) : 40;

  const allPotableTemp = chartDays.flatMap(d => [
    d.tanks.potableWater.temp
  ]).filter((v): v is number => v !== null);
  const maxPotableTemp = allPotableTemp.length > 0 ? Math.max(...allPotableTemp, 40) : 40;

  const renderWaterChart = (
    title: string, 
    subtitle: string,
    seriesList: any[], 
    maxVal: number, 
    valueType: 'us' | 'temp',
    unit: string,
    gridSteps: number[] = [0, 0.25, 0.5, 0.75, 1]
  ) => {
    const localPlotWidth = 290;
    const localPlotHeight = 110;
    const localPadLeft = 45;
    const localPadRight = 15;
    const localPadTop = 15;
    const localPadBottom = 25;
    const localTotalW = localPlotWidth + localPadLeft + localPadRight;
    const localTotalH = localPlotHeight + localPadTop + localPadBottom;
    const localBinW = localPlotWidth / chartDays.length;

    return (
      <div className="bg-white p-4 rounded-2xl border border-slate-150 relative shadow-xs flex flex-col justify-between">
        <div className="flex justify-between items-start mb-2 border-b border-slate-50 pb-1">
          <div>
            <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{title}</h5>
            <p className="text-[8px] text-slate-400 font-bold uppercase">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center justify-end text-[8px] font-extrabold uppercase">
            {seriesList.map(ser => (
              <div key={ser.key} className="flex items-center gap-1">
                <span className="w-2.5 h-1 rounded-sm" style={{ backgroundColor: ser.color }} />
                <span className="text-slate-500 text-[8px]">{ser.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-2">
          <svg viewBox={`0 0 ${localTotalW} ${localTotalH}`} className="w-full h-auto overflow-visible select-none">
            {/* Grid lines */}
            {gridSteps.map((r, i) => {
              const y = localPadTop + localPlotHeight * r;
              const labelVal = Math.round(maxVal * (1 - r));
              return (
                <g key={i}>
                  <line 
                    x1={localPadLeft} 
                    y1={y} 
                    x2={localPadLeft + localPlotWidth} 
                    y2={y} 
                    stroke="#f8fafc" 
                    strokeWidth="1" 
                    strokeDasharray="3 3"
                  />
                  <text x={localPadLeft - 8} y={y + 3} textAnchor="end" className="fill-slate-400 text-[7px] font-mono font-bold">
                    {labelVal}{unit}
                  </text>
                </g>
              );
            })}

            {/* Bottom axis line */}
            <line 
              x1={localPadLeft} 
              y1={localPadTop + localPlotHeight} 
              x2={localPadLeft + localPlotWidth} 
              y2={localPadTop + localPlotHeight} 
              stroke="#cbd5e1" 
              strokeWidth="1.2" 
            />

            {/* Lines paths for each series */}
            {seriesList.map(ser => {
              const linePts: {x: number, y: number}[] = [];
              chartDays.forEach((day, idx) => {
                const dObj = day.tanks[ser.key];
                const val = valueType === 'us' ? dObj.us : dObj.temp;
                if (dObj.has && val !== null) {
                  const x = localPadLeft + (idx * localBinW) + localBinW / 2;
                  const y = localPadTop + localPlotHeight - (val / maxVal) * localPlotHeight;
                  linePts.push({ x, y });
                }
              });

              let linePathStr = "";
              linePts.forEach((pt, idx) => {
                if (idx === 0) linePathStr += `M ${pt.x} ${pt.y}`;
                else linePathStr += ` L ${pt.x} ${pt.y}`;
              });

              return (
                <g key={ser.key}>
                  {linePathStr && (
                    <path 
                      d={linePathStr} 
                      fill="none" 
                      stroke={ser.color} 
                      strokeWidth="1.8" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                    />
                  )}
                  {linePts.map((pt, pIdx) => (
                    <circle 
                      key={pIdx}
                      cx={pt.x} 
                      cy={pt.y} 
                      r="2.2" 
                      fill={ser.color} 
                      stroke="#ffffff" 
                      strokeWidth="1"
                    />
                  ))}
                </g>
              );
            })}

            {/* Hover tracker logic */}
            {waterHoveredIdx !== null && waterHoveredIdx >= 0 && waterHoveredIdx < chartDays.length && (
              <line
                x1={localPadLeft + (waterHoveredIdx * localBinW) + localBinW / 2}
                y1={localPadTop}
                x2={localPadLeft + (waterHoveredIdx * localBinW) + localBinW / 2}
                y2={localPadTop + localPlotHeight}
                stroke="#94a3b8"
                strokeWidth="0.8"
                strokeDasharray="2"
              />
            )}

            {/* Date and interactive overlay */}
            {chartDays.map((day, idx) => {
              const x_center = localPadLeft + (idx * localBinW) + localBinW / 2;
              const isHovered = waterHoveredIdx === idx;
              return (
                <g key={idx}>
                  <text 
                    x={x_center} 
                    y={localPadTop + localPlotHeight + 12} 
                    textAnchor="middle" 
                    className={`text-[7px] font-mono font-black ${isHovered ? 'fill-slate-900 font-bold' : 'fill-slate-400'}`}
                  >
                    {day.date.substring(5)}
                  </text>
                  <rect 
                    x={localPadLeft + (idx * localBinW)} 
                    y={localPadTop} 
                    width={localBinW} 
                    height={localPlotHeight + localPadBottom} 
                    fill="transparent" 
                    className="cursor-pointer"
                    onMouseEnter={() => setWaterHoveredIdx(idx)}
                    onMouseLeave={() => setWaterHoveredIdx(null)}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Tabla resumen con los datos utilizados para construir el gráfico */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-[7px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">Datos del Gráfico</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[8px] border-collapse bg-slate-50/50 rounded-lg overflow-hidden border border-slate-150">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                  <th className="py-1 px-1.5 text-left font-bold font-mono">Fecha</th>
                  {seriesList.map(ser => (
                    <th key={ser.key} className="py-1 px-1.5 text-right font-bold" style={{ color: ser.color }}>
                      {ser.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold font-mono">
                {chartDays.map((day, dIdx) => {
                  const hasAnyValue = seriesList.some(ser => {
                    const dObj = day.tanks[ser.key];
                    const val = valueType === 'us' ? dObj.us : dObj.temp;
                    return dObj.has && val !== null;
                  });

                  if (!hasAnyValue) return null;

                  return (
                    <tr key={dIdx} className="hover:bg-slate-100/30">
                      <td className="py-1 px-1.5 text-slate-500">{day.date}</td>
                      {seriesList.map(ser => {
                        const dObj = day.tanks[ser.key];
                        const val = valueType === 'us' ? dObj.us : dObj.temp;
                        return (
                          <td key={ser.key} className="py-1 px-1.5 text-right text-slate-800">
                            {val !== null ? `${val} ${unit}` : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const handlePrint = () => window.print();

  const handleDownloadPDF = async () => {
    if (!data) return;
    setIsGenerating(true);
    try {
      await generatePDFReport(
        data.programs,
        data.type,
        data.range,
        data.readings,
        data.opHours,
        data.statusHistory,
        data.outOfPrograms
      );
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error al generar el PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-8 max-w-5xl mx-auto print:p-0 print:bg-white">
      {/* Action Bar - Hidden on print */}
      <div className="fixed bottom-8 right-8 flex gap-3 print:hidden z-50">
        <button onClick={handlePrint} className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold shadow-2xl hover:bg-slate-800 transition-all">
          <Printer size={20} />
          Obtener reporte
        </button>
        <button onClick={() => window.close()} className="flex items-center gap-2 bg-white text-slate-500 border border-slate-200 px-6 py-3 rounded-2xl font-bold shadow-sm hover:bg-slate-50 transition-all">
          <X size={20} />
          Cerrar
        </button>
      </div>

      <div id="report-content" className="bg-white p-12 rounded-[2.5rem] border border-slate-200 shadow-xl print:border-none print:shadow-none print:p-0">

        {/* Brand Header */}
        <div className="flex border-b border-slate-200 pb-4 mb-6 items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/logo-sqm.png"
              alt="SQM Logo"
              className="h-11 w-11 object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="border-l-2 border-slate-200 pl-4">
              <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight">Programa de Lavados SQM</h1>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Control de Lavados DDEE</p>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Reporte de Gestión y Eficiencia Operativa</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Generado el</p>
            <p className="text-xs font-bold text-slate-700 mt-1 font-mono">{format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
          </div>
        </div>

        {/* Report Meta Info */}
        <div className="grid grid-cols-3 gap-6 mb-10 bg-slate-50 p-6 rounded-3xl border border-slate-100">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Tipo de Reporte</p>
            <p className="text-base font-black text-slate-900 capitalize">Reporte {type === 'diario' ? 'Diario' : 'por Rango de Fechas'}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Turno Evaluado</p>
            <p className="text-base font-black text-slate-900">{selectedShift === 'Todos' ? 'Todos los Turnos (T39/T44)' : `Turno ${selectedShift}`}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Periodo Evaluado</p>
            <p className="text-base font-black text-slate-900 font-mono">{range.start} al {range.end}</p>
          </div>
        </div>

             {/* HOJA 1: RESUMEN EJECUTIVO (PÁGINA PRINCIPAL) */}
        <div className="print:break-after-page mb-14 pb-8 border-b border-slate-200 print:mb-0 print:pb-0 print:border-none">
          <div className="flex items-center gap-2 mb-6 pb-2 border-b-2 border-indigo-600">
            <CheckCircle2 className="text-indigo-600 shrink-0" size={24} />
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">INFORMACIÓN SOCIA DE ADHERENCIA Y KPI OPERATIVOS</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Hoja Ejecutiva General &bull; SQM Control DDEE</p>
            </div>
          </div>

          {/* JORNADA SUSPENDIDA HEADER ALERT (Diario) */}
          {type === 'diario' && suspendedWorkdays.length > 0 && (
            <div className="mb-6 bg-amber-50 border border-amber-300 text-amber-900 px-6 py-4 rounded-3xl shadow-sm flex items-center justify-between gap-4 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-600 shrink-0">
                  <AlertTriangle className="w-5 h-5 animate-bounce" style={{ animationDuration: '3s' }} />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-800">Jornada Suspendida</h4>
                  <p className="text-[11px] text-slate-700 font-bold mt-0.5">
                    Motivo: <span className="text-slate-900 font-black">{suspendedWorkdays[0].suspensionReason}</span>
                    {suspendedWorkdays[0].suspensionObservation && (
                      <span className="text-slate-500 italic ml-2">({suspendedWorkdays[0].suspensionObservation})</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
                Sin Operación
              </div>
            </div>
          )}

          {/* RESUMEN DE JORNADAS SUSPENDIDAS (Rango de Fechas) */}
          {type !== 'diario' && suspendedWorkdays.length > 0 && (
            <div className="mb-6 border border-amber-200 bg-amber-50/20 p-5 rounded-3xl">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="text-amber-500 shrink-0" size={16} />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-800">Resumen de Jornadas Suspendidas en el Periodo</h4>
              </div>
              <div className="overflow-hidden border border-amber-150 rounded-2xl bg-white">
                <table className="w-full text-[9px] text-center border-collapse">
                  <thead>
                    <tr className="bg-amber-500/10 text-amber-800 font-mono font-black uppercase">
                      <th className="p-2 text-left pl-4">Fecha</th>
                      <th className="p-2">Turno</th>
                      <th className="p-2">Motivo Principal</th>
                      <th className="p-2 text-right pr-4">Observaciones/Detalles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100 font-bold text-slate-700">
                    {suspendedWorkdays.map((s, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/10">
                        <td className="p-2 text-left font-mono pl-4">{s.date}</td>
                        <td className="p-2 text-amber-700 font-mono">{s.shift}</td>
                        <td className="p-2 text-slate-900">{s.suspensionReason}</td>
                        <td className="p-2 text-right pr-4 text-slate-500 italic font-medium">{s.suspensionObservation || 'Sin observaciones'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Indicators Row */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="border border-slate-150 p-4 rounded-2xl bg-slate-50/50 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">PROGRAMADOS</p>
              <p className="text-2xl font-black text-slate-900">{totalEstructurasProgramadas}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Estructuras oficiales</p>
            </div>

            <div className="border border-emerald-100 p-4 rounded-2xl bg-emerald-50/15 text-center">
              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-1">CUMPLIMIENTO</p>
              <p className="text-2xl font-black text-emerald-600">{percentageCumplimiento}%</p>
              <p className="text-[9px] text-emerald-500 font-bold uppercase mt-1">
                {totalEstructurasRealizadas} real. / {totalEstructurasPendientes} pend.
              </p>
            </div>

            <div className="border border-indigo-100 p-4 rounded-2xl bg-indigo-50/15 text-center font-bold">
              <p className="text-[9px] font-black text-indigo-505 uppercase tracking-wider mb-1">EXTRA-PROGRAMA</p>
              <p className="text-2xl font-black text-indigo-600">{oopStats.totalRecords}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                {oopStats.totalQuantity} tramos lavados
              </p>
            </div>

            {(() => {
              const avg = truckSummary.length > 0
                ? (truckSummary.reduce((acc, t) => acc + t.availability, 0) / truckSummary.length).toFixed(1)
                : "100.0";
              const val = parseFloat(avg);
              const colorClass = val >= 90 ? 'border-emerald-100 bg-emerald-50/15 text-emerald-600' : val >= 70 ? 'border-amber-100 bg-amber-50/15 text-amber-600' : 'border-rose-100 bg-rose-50/15 text-rose-600';
              const textClass = val >= 90 ? 'text-emerald-600' : val >= 70 ? 'text-amber-600' : 'text-rose-600';
              return (
                <div className={`border p-4 rounded-2xl text-center ${colorClass}`}>
                  <p className="text-[9px] font-black uppercase tracking-wider mb-1">DISPO. CAMIONES</p>
                  <p className={`text-2xl font-black ${textClass}`}>{avg}%</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Promedio flota</p>
                </div>
              );
            })()}
          </div>

          <div className="space-y-8">
            {/* 1. Evolución Diaria de Cumplimiento (if range) */}
            {type !== 'diario' && (
              <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                  <div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                      Tendencia Diaria de Cumplimiento Oficial (%)
                    </h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Progreso cronológico: estructuras planificadas vs realizadas</p>
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-4 items-center text-[9px] font-black uppercase tracking-wider">
                    <div className="flex items-center gap-1 text-slate-500">
                      <span className="w-2.5 h-2.5 bg-slate-200 rounded-sm inline-block"></span>
                      <span>Programadas</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500">
                      <span className="w-2.5 h-2.5 bg-emerald-300 rounded-sm inline-block"></span>
                      <span>Realizadas</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500">
                      <span className="w-5 h-0.5 bg-indigo-500 inline-block"></span>
                      <span className="text-indigo-600">% Adherencia</span>
                    </div>
                  </div>
                </div>

                {(() => {
                  // Helper to extract dates for charting
                  const getDatesForChart = () => {
                    const dates: string[] = [];
                    try {
                      let current = new Date(range.start + 'T12:00:00');
                      const end = new Date(range.end + 'T12:00:00');
                      while (current <= end) {
                        dates.push(format(current, 'yyyy-MM-dd'));
                        current.setDate(current.getDate() + 1);
                      }
                    } catch (err) {
                      console.error(err);
                    }
                    if (dates.length === 0) {
                      dates.push(range.start);
                    }
                    return dates;
                  };

                  const chartData = getDatesForChart().map(d => {
                    let programmed = 0;
                    let completed = 0;
                    programs.forEach(p => {
                      if (p.date === d) {
                        const stats = getProgramStructures(p);
                        programmed += stats.programmed;
                        completed += stats.completed;
                      }
                    });
                    const completionRate = programmed > 0 ? Math.round((completed / programmed) * 100) : 0;
                    return {
                      date: d,
                      programmed,
                      completed,
                      completionRate
                    };
                  });

                  const plotWidth = 700;
                  const plotHeight = 110;
                  const padLeft = 35;
                  const padRight = 35;
                  const padTop = 15;
                  const padBottom = 20;
                  
                  const maxVal = Math.max(...chartData.map(d => Math.max(d.programmed, d.completed, 5)));
                  const N = chartData.length;
                  const binWidth = N > 0 ? plotWidth / N : 0;
                  
                  let linePath = "";
                  const points: {x: number, y: number, d: any, idx: number}[] = [];
                  
                  chartData.forEach((day, index) => {
                    const x_center = padLeft + (index * binWidth) + binWidth / 2;
                    const yRate = padTop + plotHeight - (day.completionRate / 100) * plotHeight;
                    points.push({ x: x_center, y: yRate, d: day, idx: index });
                    if (index === 0) {
                      linePath += `M ${x_center} ${yRate}`;
                    } else {
                      linePath += ` L ${x_center} ${yRate}`;
                    }
                  });
                  
                  return (
                    <div className="relative">
                      <svg viewBox="0 0 800 150" className="w-full h-auto overflow-visible select-none">
                        {/* Grid Lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((p, gIdx) => {
                          const y = padTop + plotHeight - p * plotHeight;
                          return (
                            <g key={gIdx} className="opacity-40">
                              <line 
                                x1={padLeft} 
                                y1={y} 
                                x2={padLeft + plotWidth} 
                                y2={y} 
                                stroke="#cbd5e1" 
                                strokeWidth="1" 
                                strokeDasharray="3 3" 
                              />
                              {/* Left Label */}
                              <text 
                                x={padLeft - 6} 
                                y={y + 3} 
                                textAnchor="end" 
                                className="text-[8px] font-mono font-black fill-slate-400"
                              >
                                {Math.round(p * maxVal)}
                              </text>
                              {/* Right Label */}
                              <text 
                                x={padLeft + plotWidth + 6} 
                                y={y + 3} 
                                textAnchor="start" 
                                className="text-[8px] font-mono font-black fill-indigo-400"
                              >
                                {Math.round(p * 100)}%
                              </text>
                            </g>
                          );
                        })}

                        {/* Custom Bars and Hover Regions */}
                        {chartData.map((day, index) => {
                          const binWidthVal = binWidth;
                          const x_center = padLeft + (index * binWidthVal) + binWidthVal / 2;
                          const w = Math.max(3, Math.min(10, binWidthVal * 0.25));
                          
                          const hProg = (day.programmed / maxVal) * plotHeight;
                          const yProg = padTop + plotHeight - hProg;
                          
                          const hComp = (day.completed / maxVal) * plotHeight;
                          const yComp = padTop + plotHeight - hComp;

                          const isHovered = hoveredIndex === index;

                          return (
                            <g key={index}>
                              {/* Programed Bar */}
                              <rect 
                                x={x_center - w - 1} 
                                y={yProg} 
                                width={w} 
                                height={Math.max(1, hProg)} 
                                fill={isHovered ? "#94a3b8" : "#cbd5e1"} 
                                className="transition-colors duration-200"
                                rx="1"
                              />
                              {/* Completed Bar */}
                              <rect 
                                x={x_center + 1} 
                                y={yComp} 
                                width={w} 
                                height={Math.max(1, hComp)} 
                                fill={isHovered ? "#059669" : "#34d399"} 
                                className="transition-colors duration-200"
                                rx="1"
                              />

                              {/* X Axis Label */}
                              <text 
                                x={x_center} 
                                y={padTop + plotHeight + 11} 
                                textAnchor="middle" 
                                className={`text-[8px] font-mono font-black transition-colors duration-200 ${isHovered ? "fill-slate-800 font-extrabold" : "fill-slate-400"}`}
                              >
                                {day.date.substring(5)}
                              </text>

                              {/* Invisible Hover Area */}
                              <rect 
                                x={padLeft + (index * binWidthVal)} 
                                y={padTop - 5} 
                                width={binWidthVal} 
                                height={plotHeight + 25} 
                                fill="transparent" 
                                className="cursor-pointer"
                                onMouseEnter={() => setHoveredIndex(index)}
                                onMouseLeave={() => setHoveredIndex(null)}
                              />
                            </g>
                          );
                        })}

                        {/* Connection Rate Line */}
                        {linePath && (
                          <path 
                            d={linePath} 
                            fill="none" 
                            stroke="#6366f1" 
                            strokeWidth="2.2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                          />
                        )}

                        {/* Completion Rate Circles */}
                        {points.map((pt, pIdx) => {
                          const isHovered = hoveredIndex === pt.idx;
                          return (
                            <g key={pIdx}>
                              <circle 
                                cx={pt.x} 
                                cy={pt.y} 
                                r={isHovered ? "4.5" : "3"} 
                                fill="#4f46e5" 
                                stroke="#ffffff" 
                                strokeWidth="1.2" 
                                className="transition-all duration-200"
                              />
                            </g>
                          );
                        })}
                      </svg>

                      {/* Tooltip */}
                      {hoveredIndex !== null && (
                        <div 
                          className="absolute bg-slate-900/95 text-white p-2.5 rounded-xl border border-slate-700 shadow-xl text-left pointer-events-none z-10 font-sans"
                          style={{
                            left: `${Math.min(85, Math.max(15, ((padLeft + (hoveredIndex * binWidth) + binWidth / 2) / 800) * 100))}%`,
                            top: "0px",
                            transform: "translate(-50%, 0)"
                          }}
                        >
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 font-mono">
                            Día: {chartData[hoveredIndex].date}
                          </p>
                          <div className="space-y-0.5 text-[10px] font-bold font-mono">
                            <p className="flex justify-between gap-4">
                              <span className="text-slate-300">Prog:</span> 
                              <span className="text-white">{chartData[hoveredIndex].programmed} est.</span>
                            </p>
                            <p className="flex justify-between gap-4">
                              <span className="text-emerald-400">Real:</span> 
                              <span className="text-emerald-300">{chartData[hoveredIndex].completed} est.</span>
                            </p>
                            <p className="flex justify-between gap-4 border-t border-slate-700 pt-0.5 mt-0.5 font-black">
                              <span className="text-indigo-400 font-sans">Avance:</span> 
                              <span className="text-indigo-300 font-sans">{chartData[hoveredIndex].completionRate}%</span>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 2. Condiciones de Agua y Estanques con Separación visual por escala */}
            {readings && readings.length > 0 && (
              <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-xs relative">
                <div className="mb-4 border-b border-slate-200 pb-2 flex items-center gap-1.5">
                  <Thermometer className="text-indigo-650 shrink-0" size={18} />
                  <div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Comportamiento e Historial de Estanques</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Trazabilidad de conductividad (uS) y temperatura (°C). Agua Potable separada para evitar distorsión de escala.</p>
                  </div>
                </div>

                {/* Grilla de gráficos side-by-side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-2">
                  {/* 2.1 Conductividad Estanques Industriales */}
                  {renderWaterChart(
                    "Conductividad: Estanques Industriales/Camión",
                    "Conductividad (uS) – TKA, TKC, TKE, Camión",
                    industrialSeries,
                    maxIndustrialUs,
                    "us",
                    "µS"
                  )}

                  {/* 2.2 Conductividad Agua Potable */}
                  {renderWaterChart(
                    "Conductividad: Agua Potable SQM",
                    "Conductividad (uS) – Red potable SQM",
                    potableSeries,
                    maxPotableUs,
                    "us",
                    "µS"
                  )}

                  {/* 2.3 Temperatura Estanques Industriales */}
                  {renderWaterChart(
                    "Temperatura: Estanques Industriales/Camión",
                    "Temperatura (°C) – TKA, TKC, TKE, Camión",
                    industrialSeries,
                    maxIndustrialTemp,
                    "temp",
                    "°C"
                  )}

                  {/* 2.4 Temperatura Agua Potable */}
                  {renderWaterChart(
                    "Temperatura: Agua Potable SQM",
                    "Temperatura (°C) – Red potable SQM",
                    potableSeries,
                    maxPotableTemp,
                    "temp",
                    "°C"
                  )}
                </div>

                {/* Resumen de Niveles de Agua (%) para Hoja 1 */}
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Resumen de Niveles de Agua (%) Registrados</p>
                  <table className="w-full text-[9px] border-collapse bg-slate-50/30 rounded-xl overflow-hidden border border-slate-200 text-center">
                    <thead>
                      <tr className="bg-slate-900 text-white font-mono uppercase">
                        <th className="p-2 text-left border-r border-slate-800">Fecha</th>
                        <th className="p-2 border-r border-slate-800">Turno</th>
                        <th className="p-2 border-r border-slate-800">TKA Nivel</th>
                        <th className="p-2 border-r border-slate-800">TKC Nivel</th>
                        <th className="p-2 border-r border-slate-800">TKE Nivel</th>
                        <th className="p-2 border-r border-slate-800">Agua Pot. Nivel</th>
                        <th className="p-2">Nivel Camión</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono font-bold">
                      {readings.map((r, idx) => {
                        const tkeReading = r.readings.TKE || r.readings.TKD;
                        const truckReading = r.readings.truckTank;
                        const isSuspendedDay = statusHistory?.some(
                          h => h.date === r.date && h.shift === r.shift && h.operationStatus !== 'En ejecución' && h.operationStatus !== 'Operativa'
                        );
                        return (
                          <tr key={idx} className="hover:bg-slate-100/40 bg-white">
                            <td className="p-2 border-r border-slate-100 text-left text-slate-700">{r.date}</td>
                            <td className="p-2 border-r border-slate-100 text-blue-600">{r.shift}</td>
                            <td className="p-2 border-r border-slate-100 text-slate-800">
                              {isSuspendedDay ? '—' : (r.readings.TKA?.level ?? '-')}
                              {!isSuspendedDay && r.readings.TKA?.level !== undefined && r.readings.TKA?.level !== '' && '%'}
                            </td>
                            <td className="p-2 border-r border-slate-100 text-slate-800">
                              {isSuspendedDay ? '—' : (r.readings.TKC?.level ?? '-')}
                              {!isSuspendedDay && r.readings.TKC?.level !== undefined && r.readings.TKC?.level !== '' && '%'}
                            </td>
                            <td className="p-2 border-r border-slate-100 text-slate-800">
                              {isSuspendedDay ? '—' : (tkeReading?.level ?? '-')}
                              {!isSuspendedDay && tkeReading?.level !== undefined && tkeReading?.level !== '' && '%'}
                            </td>
                            <td className="p-2 border-r border-slate-100 text-slate-800">
                              {isSuspendedDay ? '—' : (r.readings.potableWater?.level ?? '-')}
                              {!isSuspendedDay && r.readings.potableWater?.level !== undefined && r.readings.potableWater?.level !== '' && '%'}
                            </td>
                            <td className="p-2 text-indigo-700 font-black">
                              {isSuspendedDay ? '—' : (truckReading?.level ? `${truckReading.level}%` : '-')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SALTO DE PÁGINA OBLIGATORIO PARA DETALES EN PDF E IMPRESIÓN */}
        <div className="print:break-after-page mb-14" />

        {/* DETALLE COMPLETO DEL REPORTE (PÁGINAS DE DETALLE COMPLETO) */}
        <div className="space-y-12">
          
          {/* SECCIÓN 1: DETALLE DE EJECUCIÓN PROGRAMA OFICIAL */}
          <section className="print:break-inside-avoid">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
              <CheckCircle2 className="text-indigo-600 shrink-0" size={20} />
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">1. DETALLE DEL PROGRAMA OFICIAL PLANIFICADO</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Desglose secuencial de lavados oficiales realizados, parciales y pendientes</p>
              </div>
            </div>

            <table className="w-full text-[11px] border-collapse bg-white border border-slate-200">
              <thead>
                <tr className="bg-slate-900 text-white font-mono uppercase text-left">
                  <th className="p-3 border border-slate-800">Fecha</th>
                  <th className="p-3 border border-slate-800">Línea</th>
                  <th className="p-3 border border-slate-800">Tramo / Equipamiento</th>
                  <th className="p-3 text-center border border-slate-800">Asig.</th>
                  <th className="p-3 text-center border border-slate-800">Real.</th>
                  <th className="p-3 border border-slate-800">Estado</th>
                  <th className="p-3 border border-slate-800">Operador / Camión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-705">
                {programs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 italic">No se registraron lavados del programa oficial para el período evaluado.</td>
                  </tr>
                ) : (
                  programs.map((p, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      <td className="p-3 border border-slate-100 font-mono font-bold text-slate-500">{p.date}</td>
                      <td className="p-3 border border-slate-100 font-black text-slate-800">{p.line}</td>
                      <td className="p-3 border border-slate-100 font-semibold">{p.washingName}</td>
                      <td className="p-3 border border-slate-100 text-center font-bold text-slate-400">{p.programmedQuantity}</td>
                      <td className="p-3 border border-slate-100 text-center font-black text-slate-900">{p.status === 'Completo' ? p.programmedQuantity : (p.completedCount || 0)}</td>
                      <td className="p-3 border border-slate-100">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase inline-block ${
                          p.status === 'Completo' ? 'bg-emerald-50 text-emerald-600' : 
                          p.status === 'Parcial' ? 'bg-amber-50 text-amber-500' : 
                          p.status === 'Pendiente' ? 'bg-blue-50 text-blue-500' : 'bg-red-50 text-red-500'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3 border border-slate-100 text-[10px] text-slate-600">
                        <p className="font-bold text-slate-800">{p.washingOperator || '-'}</p>
                        <p className="text-[9px] font-black text-indigo-600 uppercase font-mono">{p.truck || 'S/I'}</p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

        {/* SECTION 2: ACTIVIDADES PENDIENTES */}
        <section className="mb-14">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
            <AlertTriangle className="text-rose-500 shrink-0" size={22} />
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">2. Detalle de Actividades Pendientes</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tareas que no fueron completadas ni reportadas en su totalidad</p>
            </div>
          </div>

          <table className="w-full text-[11px] border-collapse bg-white border border-slate-150">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="p-3 text-left border-r border-slate-200">Fecha</th>
                <th className="p-3 text-left border-r border-slate-200">Línea</th>
                <th className="p-3 text-left border-r border-slate-200">Tramo / Nombre</th>
                <th className="p-3 text-center border-r border-slate-200">Prog.</th>
                <th className="p-3 text-center border-r border-slate-200">Avance</th>
                <th className="p-3 text-left">Motivo / Operador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {programs.filter(p => p.status === 'Pendiente' || p.status === 'Parcial').length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 italic">No existen actividades pendientes en el periodo actual. ¡100% de ejecución!</td>
                </tr>
              ) : (
                programs.filter(p => p.status === 'Pendiente' || p.status === 'Parcial').map((p, index) => (
                  <tr key={index} className="hover:bg-slate-50/50">
                    <td className="p-3 border-r border-slate-100 text-slate-600 font-mono">{p.date}</td>
                    <td className="p-3 border-r border-slate-100 font-bold text-amber-600">{p.line}</td>
                    <td className="p-3 border-r border-slate-100">{p.washingName}</td>
                    <td className="p-3 border-r border-slate-100 text-center font-bold text-slate-400">{p.programmedQuantity}</td>
                    <td className="p-3 border-r border-slate-100 text-center font-black text-amber-600">{p.completedCount || 0} de {p.programmedQuantity}</td>
                    <td className="p-3 text-slate-600">
                      <p className="font-semibold">{p.washingOperator || 'Sin operador asignado'}</p>
                      <p className="text-[10px] text-slate-400 italic">"Pospuesto a falta de condiciones o tiempo"</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* SECTION 3: LAVADOS FUERA DE PROGRAMA */}
        <section className="mb-14">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
            <PlayCircle className="text-indigo-600 shrink-0" size={22} />
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">3. Trabajos Fuera de Programa Registrados</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lavados eventuales realizados por contingencias que NO restan adherencia al programa planificado</p>
            </div>
          </div>

          {/* OOP Stats Row */}
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="border border-indigo-150 p-4 rounded-2xl bg-indigo-50/10 text-center">
              <p className="text-[9px] font-black text-indigo-400 uppercase">Eventos Totales</p>
              <p className="text-2xl font-black text-indigo-600 mt-1">{oopStats.totalRecords} incidentes</p>
            </div>
            <div className="border border-emerald-150 p-4 rounded-2xl bg-emerald-50/10 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase">Tramos Lavados Eventualmente</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{oopStats.totalQuantity} tramos</p>
            </div>
            <div className="border border-slate-200 p-4 rounded-2xl bg-slate-50 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase">Estado General de Atención</p>
              <p className="text-xs font-black text-slate-700 mt-1 leading-snug">
                <span className="text-emerald-600">{oopStats.completed} Realizados</span> &bull; <span className="text-indigo-500">{oopStats.pending} Pendientes</span>
              </p>
            </div>
          </div>

          <table className="w-full text-[11px] border-collapse bg-white">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="p-3 text-left border border-slate-700">Fecha / Hora</th>
                <th className="p-3 text-left border border-slate-700">Línea / Lugar</th>
                <th className="p-3 text-left border border-slate-700">Descripción / Trabajo</th>
                <th className="p-3 text-center border border-slate-700">Cantidad</th>
                <th className="p-3 text-left border border-slate-700">Motivo de Emergencia</th>
                <th className="p-3 text-center border border-slate-700">Estado</th>
                <th className="p-3 text-left border border-slate-700">Atendido por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {outOfPrograms.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">No se registraron lavados eventuales ni actividades fuera de programa en este periodo.</td>
                </tr>
              ) : (
                outOfPrograms.map((item, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                    <td className="p-3 border border-slate-100 font-mono text-slate-500 text-[10px]">
                      <p className="font-bold">{item.date}</p>
                      <p>{item.detectionTime} hrs ({item.shift})</p>
                    </td>
                    <td className="p-3 border border-slate-100 font-bold text-slate-700">{item.areaLocation}</td>
                    <td className="p-3 border border-slate-100 max-w-[150px] truncate" title={item.description}>{item.description}</td>
                    <td className="p-3 border border-slate-100 text-center font-black text-indigo-600">{item.quantity}</td>
                    <td className="p-3 border border-slate-100 text-rose-600 font-bold uppercase text-[9px] tracking-wider">{item.reason}</td>
                    <td className="p-3 border border-slate-100 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                        item.status === 'Realizado' ? 'bg-emerald-50 text-emerald-600' :
                        item.status === 'Pendiente' ? 'bg-amber-50 text-amber-500' : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="p-3 border border-slate-100 text-[10px] text-slate-600">
                      <p className="font-bold text-slate-800">{item.washingOperator || item.createdBy || 'Operador'}</p>
                      <p className="text-[9px] text-slate-400 font-mono uppercase">{item.truck || '-'}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* SECTION 4: DISPONIBILIDAD Y HORAS OPERATIVAS */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
            <Truck className="text-blue-600 shrink-0" size={22} />
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">4. Disponibilidad y Horas Operativas de Camiones</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cálculos autorizados sobre camiones operativos CM95, CM97 y REEMPLAZOS.</p>
            </div>
          </div>

          {/* VISUAL CHART OF OPERATIONAL HOURS */}
          <div className="mb-10 bg-slate-50 p-8 rounded-[2rem] border border-slate-200">
            <h4 className="text-xs font-black text-indigo-700 uppercase tracking-widest mb-6">Visualización Gráfica de Disponibilidad (%)</h4>
            
            <div className="space-y-6">
              {truckSummary.map((t) => {
                const isExcellent = t.availability >= 90;
                const isAcceptable = t.availability >= 70;
                const color = isExcellent ? 'bg-emerald-500 text-emerald-700' : isAcceptable ? 'bg-amber-500 text-amber-700' : 'bg-red-500 text-red-700';
                const progressBg = isExcellent ? 'bg-emerald-100' : isAcceptable ? 'bg-amber-100' : 'bg-red-100';

                return (
                  <div key={t.truck} className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-sm font-mono">{t.truck}</span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                          isExcellent ? 'bg-emerald-50 text-emerald-600' : isAcceptable ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {t.availability.toFixed(1)}% Disp
                        </span>
                      </div>
                      <span className="font-mono text-slate-500 font-bold">
                        {t.operational.toFixed(1)} hrs Real / {t.expected.toFixed(1)} hrs Esperadas
                      </span>
                    </div>
                    {/* SVG/CSS Horizontal Bar Chart */}
                    <div className="w-full bg-slate-200/80 rounded-full h-3 overflow-hidden shadow-xs relative">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${isExcellent ? 'bg-emerald-500' : isAcceptable ? 'bg-amber-500' : 'bg-red-500'}`} 
                        style={{ width: `${Math.min(t.availability, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="p-3 text-left border border-slate-700">Camión</th>
                <th className="p-3 text-center border border-slate-700">Horas Esperadas</th>
                <th className="p-3 text-center border border-slate-700">Horas Operativas</th>
                <th className="p-3 text-center border border-slate-700">Horas Descontadas (Fallas)</th>
                <th className="p-3 text-center border border-slate-700">Disponibilidad %</th>
                <th className="p-3 text-left border border-slate-700">Observaciones Generales de la Flota</th>
              </tr>
            </thead>
            <tbody>
              {truckSummary.map((t, idx) => (
                <tr key={idx} className="border-b border-slate-150 font-medium">
                  <td className="p-3 font-black text-slate-900 font-mono text-sm">{t.truck}</td>
                  <td className="p-3 text-center font-mono text-slate-605">{t.expected.toFixed(1)}h</td>
                  <td className="p-3 text-center font-black font-mono text-slate-800 bg-slate-50/50">{t.operational.toFixed(1)}h</td>
                  <td className="p-3 text-center text-red-500 font-extrabold font-mono hover:bg-slate-50/30">-{t.deducted.toFixed(1)}h</td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-1 rounded-lg font-black font-mono text-xs ${
                      t.availability >= 90 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                      t.availability >= 70 ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-red-50 text-red-600 border border-red-100'
                    }`}>
                      {t.availability.toFixed(1)}%
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 italic text-[10px]">
                    {t.reasons.join(', ') || 'Operación regular en servicio'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[9px] text-slate-400 uppercase font-black tracking-wider">Nota: Todos los cálculos de disponibilidad se fundamentan en una jornada regular asignada de 12 horas teóricas por turno.</p>
        </section>

        {/* SECTION 5: DETALLE SEPARADO POR DÍA */}
        {type !== 'diario' && (
          <section className="mb-14">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
              <Clock className="text-indigo-600 shrink-0" size={22} />
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">5. Detalle Consolidado Separado por Día</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Desglose cronológico de lavados planificados y extraordinarios en el periodo</p>
              </div>
            </div>

            <div className="space-y-6">
              {(() => {
                const dailyData = getDailyDetails();
                return dailyData.map((day, dIdx) => (
                  <div key={dIdx} className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <h3 className="text-sm font-black text-slate-850 font-mono mb-4 border-b border-slate-200 pb-2 flex justify-between">
                      <span>FECHA: {day.date}</span>
                      <span className="text-[10px] text-indigo-600 font-bold uppercase">
                        {day.programs.length} Prog. / {day.outOfPrograms.length} Fuera de Prog.
                      </span>
                    </h3>

                    {day.programs.length === 0 && day.outOfPrograms.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Sin registros de lavado cargados para esta fecha.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px]">
                        {/* Programs */}
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Lavados del Programa</h4>
                          {day.programs.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">No planificados</p>
                          ) : (
                            <div className="space-y-1.5">
                              {day.programs.map((p, pIdx) => (
                                <div key={pIdx} className="bg-white p-2.5 rounded-xl border border-slate-150 flex justify-between items-center shadow-xs">
                                  <div>
                                    <p className="font-bold text-slate-800 truncate max-w-[170px]">{p.washingName}</p>
                                    <p className="text-[9px] text-slate-405 font-mono">{p.line} &bull; {p.washingOperator || 'S/O'}</p>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded-md font-black uppercase tracking-wider text-[8px] shrink-0 ${
                                    p.status === 'Completo' ? 'bg-emerald-50 text-emerald-600' :
                                    p.status === 'Parcial' ? 'bg-amber-50 text-amber-505' : 'bg-red-50 text-red-500'
                                  }`}>
                                    {p.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Out of programs */}
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Fuera de Programa (Eventuales)</h4>
                          {day.outOfPrograms.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">No registrados</p>
                          ) : (
                            <div className="space-y-1.5">
                              {day.outOfPrograms.map((oop, oIdx) => (
                                <div key={oIdx} className="bg-white p-2.5 rounded-xl border border-slate-150 flex justify-between items-center shadow-xs">
                                  <div>
                                    <p className="font-bold text-slate-805 truncate max-w-[170px]">{oop.areaLocation}</p>
                                    <p className="text-[9px] text-indigo-600 font-bold uppercase">{oop.reason}</p>
                                  </div>
                                  <span className="font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[9px] font-black shrink-0">
                                    {oop.quantity} Tramos
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          </section>
        )}

        {/* SECTION 7: CONDICIONES DE AGUA Y ESTANQUES */}
        {data.readings && data.readings.length > 0 && (
          <section className="mb-14">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
              <Thermometer className="text-blue-600 shrink-0" size={22} />
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">7. Condiciones de Agua y Estanques</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Trazabilidad operativa de conductividad (uS) y temperatura (°C) por estanque</p>
              </div>
            </div>

            {/* Consolidated Charts Card with SVG */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative mb-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-2">
                {/* 2.1 Conductividad Estanques Industriales */}
                {renderWaterChart(
                  "Conductividad: Estanques Industriales/Camión",
                  "Conductividad (uS) – TKA, TKC, TKE, Camión",
                  industrialSeries,
                  maxIndustrialUs,
                  "us",
                  "µS"
                )}

                {/* 2.2 Conductividad Agua Potable */}
                {renderWaterChart(
                  "Conductividad: Agua Potable SQM",
                  "Conductividad (uS) – Red potable SQM",
                  potableSeries,
                  maxPotableUs,
                  "us",
                  "µS"
                )}

                {/* 2.3 Temperatura Estanques Industriales */}
                {renderWaterChart(
                  "Temperatura: Estanques Industriales/Camión",
                  "Temperatura (°C) – TKA, TKC, TKE, Camión",
                  industrialSeries,
                  maxIndustrialTemp,
                  "temp",
                  "°C"
                )}

                {/* 2.4 Temperatura Agua Potable */}
                {renderWaterChart(
                  "Temperatura: Agua Potable SQM",
                  "Temperatura (°C) – Red potable SQM",
                  potableSeries,
                  maxPotableTemp,
                  "temp",
                  "°C"
                )}
              </div>
            </div>

            {/* Level % Display Table (retrocompatible and exhaustive) */}
            <div className="mt-8">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest">Detalle de Niveles de Agua (%) Registrados</p>
              <table className="w-full text-[10px] border-collapse bg-white rounded-xl overflow-hidden border border-slate-200">
                <thead>
                  <tr className="bg-slate-900 text-white font-mono uppercase text-center">
                    <th className="p-3 text-left border-r border-slate-800">Fecha</th>
                    <th className="p-3 border-r border-slate-800">Turno</th>
                    <th className="p-3 border-r border-slate-800">Camión</th>
                    <th className="p-3 border-r border-slate-800 bg-slate-800/10">TKA Nivel</th>
                    <th className="p-3 border-r border-slate-800 bg-slate-800/20">TKC Nivel</th>
                    <th className="p-3 border-r border-slate-800 bg-slate-800/10">TKE Nivel</th>
                    <th className="p-3 border-r border-slate-800 bg-slate-800/20">Agua Pot. Nivel</th>
                    <th className="p-3 bg-slate-800/10">Nivel Camión</th>
                  </tr>
                </thead>
                <tbody>
                  {data.readings.map((r, idx) => {
                    const tkeReading = r.readings.TKE || r.readings.TKD;
                    const truckReading = r.readings.truckTank;
                    const isSuspendedDay = statusHistory?.some(
                      h => h.date === r.date && h.shift === r.shift && h.operationStatus !== 'En ejecución' && h.operationStatus !== 'Operativa'
                    );
                    return (
                      <tr key={idx} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors bg-white font-mono text-center">
                        <td className="p-3 border-r border-slate-100 text-left font-bold text-slate-700">{r.date}</td>
                        <td className="p-3 border-r border-slate-100 font-bold text-blue-600">{r.shift}</td>
                        <td className="p-3 border-r border-slate-100 font-bold text-slate-500">{r.truck}</td>
                        <td className="p-3 border-r border-slate-100 font-black text-slate-800 bg-slate-50/20">
                          {isSuspendedDay ? '—' : (r.readings.TKA?.level ?? '-')}
                          {!isSuspendedDay && r.readings.TKA?.level !== undefined && r.readings.TKA?.level !== '' && '%'}
                        </td>
                        <td className="p-3 border-r border-slate-100 font-black text-slate-800 bg-slate-50/40">
                          {isSuspendedDay ? '—' : (r.readings.TKC?.level ?? '-')}
                          {!isSuspendedDay && r.readings.TKC?.level !== undefined && r.readings.TKC?.level !== '' && '%'}
                        </td>
                        <td className="p-3 border-r border-slate-100 font-black text-slate-800 bg-slate-50/20">
                          {isSuspendedDay ? '—' : (tkeReading?.level ?? '-')}
                          {!isSuspendedDay && tkeReading?.level !== undefined && tkeReading?.level !== '' && '%'}
                        </td>
                        <td className="p-3 border-r border-slate-100 font-black text-slate-800 bg-slate-50/40">
                          {isSuspendedDay ? '—' : (r.readings.potableWater?.level ?? '-')}
                          {!isSuspendedDay && r.readings.potableWater?.level !== undefined && r.readings.potableWater?.level !== '' && '%'}
                        </td>
                        <td className="p-3 font-black text-indigo-700 bg-slate-50/20">
                          {isSuspendedDay ? '—' : (truckReading?.level ? `${truckReading.level}%` : '-')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* SECTION 6: HISTÓRICO DE ESTADO DE CAMIONES */}
        <section className="mb-12">
          {statusHistory.length > 0 && (
            <>
              <p className="text-[10px] font-black text-slate-400 uppercase mb-3 ml-1 tracking-widest">Detalle de Estados Registrados por Turno</p>
              <table className="w-full text-[10px] border-collapse bg-white rounded-xl overflow-hidden border border-slate-200">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-3 text-left border-r border-slate-800">Fecha</th>
                    <th className="p-3 text-center border-r border-slate-800">Turno</th>
                    <th className="p-3 text-center border-r border-slate-800">CM95</th>
                    <th className="p-3 text-center border-slate-850">CM97</th>
                  </tr>
                </thead>
                <tbody>
                  {statusHistory.map((h, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors bg-white font-medium">
                      <td className="p-3 border-r border-slate-100 font-bold text-slate-700">{h.date}</td>
                      <td className="p-3 border-r border-slate-100 text-center font-black text-blue-600">{h.shift}</td>
                      {['CM95', 'CM97'].map(code => {
                        const s = h.trucks.find(t => t.code === code)?.status || '-';
                        const display = getStatusDisplay(s);
                        return (
                          <td key={code} className={`p-2 border-r border-slate-100 last:border-r-0 text-center transition-colors ${display.color}`}>
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              <span className="text-xs">{display.icon}</span>
                              <span className="font-black text-[9px] tracking-tighter">{display.text}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        </div>

        {/* Brand Footer */}
        <div className="mt-20 pt-8 border-t border-slate-200 text-center">
          <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-[0.2em] leading-loose">
            PROGRAMA DE LAVADOS SQM<br />
            Control de Lavados DDEE - Informe técnico oficial de adherencia operativa y disponibilidad de activos mecánicos.
          </p>
        </div>
      </div>
    </div>
  );
}
