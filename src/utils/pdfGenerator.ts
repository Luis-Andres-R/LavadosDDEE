import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { WashingProgram, OperationalReading, TruckOperatingHours, SHIFT_CONFIG, TruckStatusHistory, INITIAL_TRUCKS } from '../types';
import { format, differenceInDays, parseISO } from 'date-fns';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export const generatePDFReport = async (
  data: WashingProgram[], 
  type: string, 
  range: { start: string, end: string }, 
  readings: OperationalReading[] = [],
  opHours: TruckOperatingHours[] = [],
  statusHistory: TruckStatusHistory[] = []
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(37, 99, 235); // Blue 600
  doc.rect(0, 10, pageWidth, 25, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('PROGRAMA DE LAVADOS SQM', 15, 24);
  
  doc.setFontSize(9);
  doc.text('Control de Lavados DDEE', 15, 30);
  
  doc.setFontSize(8);
  doc.text(`TIPO: ${type.toUpperCase()}`, pageWidth - 15, 18, { align: 'right' });
  doc.text(`PERIODO: ${range.start} AL ${range.end}`, pageWidth - 15, 23, { align: 'right' });
  doc.text(`GENERADO: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - 15, 28, { align: 'right' });

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

  data.forEach(p => {
    const { programmed, completed, pending } = getProgramStructures(p);
    totalEstructurasProgramadas += programmed;
    totalEstructurasRealizadas += completed;
    totalEstructurasPendientes += pending;
  });

  const percentageCumplimiento = totalEstructurasProgramadas > 0 
    ? ((totalEstructurasRealizadas / totalEstructurasProgramadas) * 100).toFixed(1) 
    : "0.0";

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text('Resumen Ejecutivo (Estructuras / Equipos)', 15, 65);
  
  doc.setFontSize(9);
  const stats = [
    [`Total Estructuras Programadas: ${totalEstructurasProgramadas}`, `Estructuras Realizadas: ${totalEstructurasRealizadas}`],
    [`Estructuras Pendientes: ${totalEstructurasPendientes}`, `Cumplimiento Oficial: ${percentageCumplimiento}%`]
  ];
  
  stats.forEach((row, i) => {
    doc.text(row[0], 15, 75 + i * 6);
    doc.text(row[1], 75, 75 + i * 6);
  });

  // Table
  const tableData = data.map(p => {
    let observation = '-';
    if (p.status === 'No realizado') {
      observation = `${p.notPerformedDetectedAt || ''} ${p.notPerformedDetail || ''}`;
    } else if (p.reason) {
      observation = p.reason;
    }

    return [
      p.date,
      p.line,
      p.washingName,
      p.programmedQuantity,
      p.status === 'Completo' || p.status === 'Cerrado' ? p.programmedQuantity : (p.completedCount || 0),
      p.status,
      p.washingOperator || '-',
      p.truck || '-',
      observation.length > 40 ? observation.substring(0, 37) + '...' : observation
    ];
  });

  doc.autoTable({
    startY: 95,
    head: [['Fecha', 'Línea', 'Tramo', 'Cant.', 'Real.', 'Estado', 'Operador', 'Camión', 'Nota/Incidencia']],
    body: tableData,
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    styles: { fontSize: 6, cellPadding: 2 }
  });

  // OPERATIONAL HOURS SECTION
  let currentY = (doc as any).lastAutoTable.finalY + 15;
  if (currentY > 260) { doc.addPage(); currentY = 20; }

  doc.setTextColor(37, 99, 235);
  doc.setFontSize(14);
  doc.text('Resumen de Horas Operativas por Camión', 15, currentY);

  // Group operational hours specifically for CM95, CM97, CM10, CM49. CM58 excluded.
  const finalTruckSummary: Record<string, { expected: number, operational: number, deducted: number, reasons: string[] }> = {};
  const validTrucks = ['CM95', 'CM97', 'CM10', 'CM49'];
  
  validTrucks.forEach(truck => {
    finalTruckSummary[truck] = { expected: 0, operational: 0, deducted: 0, reasons: [] };
  });

  const getDatesInRange = (startStr: string, endStr: string) => {
    const dates: string[] = [];
    try {
      const current = new Date(startStr + 'T12:00:00');
      const end = new Date(endStr + 'T12:00:00');
      while (current <= end) {
        dates.push(format(current, 'yyyy-MM-dd'));
        current.setDate(current.getDate() + 1);
      }
    } catch (err) {
      console.error(err);
    }
    if (dates.length === 0) {
      dates.push(startStr);
    }
    return dates;
  };

  const uniqueDates = getDatesInRange(range.start, range.end);

  uniqueDates.forEach(date => {
    validTrucks.forEach(truck => {
      finalTruckSummary[truck].expected += 24; // Each calendar day counts as 24 expected hours

      // Check if status is "Fuera de servicio" during this day
      const statusRecord = statusHistory.find(h => h.date === date && h.shift === 'T39') || statusHistory.find(h => h.date === date);
      const truckStatus = statusRecord?.trucks?.find(t => t.code === truck)?.status;

      if (truckStatus === 'Fuera de servicio') {
        // Fuera de servicio -> 0 operational hours, 24 deducted hours
        finalTruckSummary[truck].deducted += 24;
        const label = 'Fuera de servicio';
        if (!finalTruckSummary[truck].reasons.includes(label)) {
          finalTruckSummary[truck].reasons.push(label);
        }
      } else {
        // Operativo (En servicio, Disponible, or empty status / default) -> 24 operational hours, 0 deducted
        finalTruckSummary[truck].operational += 24;
        // Optionally grab failure reason if any was registered in operating hours log
        const failure = opHours.find(h => h.date === date && h.truck === truck);
        if (failure && failure.reason) {
          if (!finalTruckSummary[truck].reasons.includes(failure.reason)) {
            finalTruckSummary[truck].reasons.push(failure.reason);
          }
        }
      }
    });
  });

  const opHoursTable = Object.entries(finalTruckSummary).map(([truck, stats]) => [
    truck,
    stats.expected.toFixed(1),
    stats.operational.toFixed(1),
    stats.deducted.toFixed(1),
    `${stats.expected > 0 ? ((stats.operational / stats.expected) * 100).toFixed(1) : '100.0'}%`,
    stats.reasons.join(', ') || 'Sin Novedad'
  ]);

  doc.autoTable({
    startY: currentY + 8,
    head: [['Camión', 'Horas Esperadas', 'Horas Operativas', 'Descontadas', 'Disponibilidad %', 'Principales Motivos']],
    body: opHoursTable,
    headStyles: { fillColor: [15, 23, 42] },
    styles: { fontSize: 7, cellPadding: 2 }
  });

  // TRUCK STATUS SECTION
  if (statusHistory.length > 0) {
    let finalY = (doc as any).lastAutoTable.finalY + 15;
    if (finalY > 240) { doc.addPage(); finalY = 20; }

    doc.setTextColor(37, 99, 235);
    doc.setFontSize(14);
    doc.text('Estado de Camiones (Resumen)', 15, finalY);

    // Summary Table
    const summary: Record<string, Record<string, number>> = {};
    INITIAL_TRUCKS.forEach(code => {
      summary[code] = { 'En servicio': 0, 'Disponible': 0, 'Fuera de servicio': 0 };
    });

    statusHistory.forEach(h => {
      h.trucks.forEach(t => {
        if (summary[t.code]) {
          summary[t.code][t.status] = (summary[t.code][t.status] || 0) + 1;
        }
      });
    });

    const statusSummaryTable = Object.entries(summary).map(([truck, counts]) => [
      truck,
      `${counts['En servicio']} turnos`,
      `${counts['Disponible']} turnos`,
      `${counts['Fuera de servicio']} turnos`
    ]);

    doc.autoTable({
      startY: finalY + 8,
      head: [['Camión', 'En Servicio', 'Disponible', 'Fuera de Servicio']],
      body: statusSummaryTable,
      headStyles: { fillColor: [100, 116, 139] },
      styles: { fontSize: 8, cellPadding: 2 }
    });

    // Legend
    finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Leyenda: SERV = En servicio (✅), DIPS = Disponible (🟠), F/S = Fuera de servicio (❌)', 15, finalY);

    // Detail Table
    finalY = finalY + 10;
    if (finalY > 240) { doc.addPage(); finalY = 20; }

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('Detalle Histórico de Estados', 15, finalY);

    const getStatusAbbr = (s: string) => {
        switch(s) {
            case 'En servicio': return 'SERV';
            case 'Disponible': return 'DIPS';
            case 'Fuera de servicio': return 'F/S';
            default: return '-';
        }
    };

    const statusDetailTable = statusHistory.map(h => [
      h.date, 
      h.shift,
      ...(INITIAL_TRUCKS.map(code => getStatusAbbr(h.trucks.find(t => t.code === code)?.status || '-')))
    ]);

    doc.autoTable({
      startY: finalY + 5,
      head: [['Fecha', 'Turno', ...INITIAL_TRUCKS]],
      body: statusDetailTable,
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 7, cellPadding: 1.5, halign: 'center' },
      columnStyles: { 0: { halign: 'left' }, 1: { halign: 'center' } }
    });
  }

  // Operational Readings Section
  if (readings.length > 0) {
    let finalY = (doc as any).lastAutoTable.finalY + 15;
    if (finalY > 240) { doc.addPage(); finalY = 20; }

    doc.setTextColor(37, 99, 235);
    doc.setFontSize(14);
    doc.text('Registro de Temperaturas y Conductividad', 15, finalY);
    
    const readingsTable = readings.map(r => {
      const tkeReading = r.readings.TKE || r.readings.TKD || { us: 0, temperature: 0, level: 0 };
      const truckTankStr = r.readings.truckTank && r.readings.truckTank.us ? `${r.readings.truckTank.us} / ${r.readings.truckTank.temperature} / ${r.readings.truckTank.level}%` : '-';
      return [
        r.date, r.shift, r.truck,
        `${r.readings.TKA.us} / ${r.readings.TKA.temperature} / ${r.readings.TKA.level}%`,
        `${r.readings.TKC.us} / ${r.readings.TKC.temperature} / ${r.readings.TKC.level}%`,
        `${tkeReading.us} / ${tkeReading.temperature} / ${tkeReading.level}%`,
        `${r.readings.potableWater.us} / ${r.readings.potableWater.temperature} / ${r.readings.potableWater.level}%`,
        truckTankStr
      ];
    });

    doc.autoTable({
      startY: finalY + 8,
      head: [['Fecha', 'Turno', 'Camión', 'TKA (uS/T/%)', 'TKC (uS/T/%)', 'TKE (uS/T/%)', 'Potable (uS/T/%)', 'Est. Camión (uS/T/%)']],
      body: readingsTable,
      headStyles: { fillColor: [51, 65, 85] },
      styles: { fontSize: 6, cellPadding: 1.5 }
    });
  }

  const fileName = `reporte_lavados_${range.start}_${range.end}`;
  doc.save(`${fileName}.pdf`);
};
