import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { WashingProgram, OperationalReading, TruckOperatingHours, SHIFT_CONFIG, TruckStatusHistory, INITIAL_TRUCKS, OutOfProgramWashing } from '../types';
import { format, differenceInDays, parseISO } from 'date-fns';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

const loadLogoImage = (url: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

export const generatePDFReport = async (
  data: WashingProgram[], 
  type: string, 
  range: { start: string, end: string }, 
  readings: OperationalReading[] = [],
  opHours: TruckOperatingHours[] = [],
  statusHistory: TruckStatusHistory[] = [],
  outOfPrograms: OutOfProgramWashing[] = []
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Load SQM logo dynamically
  const logoImg = await loadLogoImage('/logo-sqm.png');

  // Header - Clean Executive Design
  if (logoImg) {
    doc.addImage(logoImg, 'PNG', 15, 10, 12, 12);
  }

  // Vertical Divider Line next to the logo
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.setLineWidth(0.5);
  doc.line(31, 10, 31, 23);

  // Left Title and Subtitle Block in clean Title Case
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Programa de Lavados SQM', 34, 14);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text('Control de Lavados DDEE', 34, 18);

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // Slate 400
  doc.text('Reporte de Gestión y Eficiencia Operativa', 34, 21.5);

  // Right Side Metadata
  doc.setTextColor(148, 163, 184); // Slate 400
  doc.setFontSize(7);
  doc.text('GENERADO EL', pageWidth - 15, 12, { align: 'right' });
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.setFontSize(8);
  doc.text(format(new Date(), 'dd/MM/yyyy HH:mm'), pageWidth - 15, 15.5, { align: 'right' });

  doc.setTextColor(148, 163, 184); // Slate 400
  doc.setFontSize(7);
  doc.text('PERIODO', pageWidth - 15, 19.5, { align: 'right' });
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.setFontSize(8);
  doc.text(`${range.start} AL ${range.end}`, pageWidth - 15, 23, { align: 'right' });

  // Elegant Underline dividing Header from Content
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.setLineWidth(0.5);
  doc.line(15, 27, pageWidth - 15, 27);

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

  let tableStartY = 95;
  const suspendedDays = (statusHistory || []).filter(h => h.operationStatus === 'Suspendida');
  if (suspendedDays.length > 0) {
    doc.setTextColor(217, 119, 6); // Amber-600
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Jornadas Suspendidas en el Periodo:', 15, 95);
    
    let offset = 0;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85); // Slate 700
    suspendedDays.forEach((sd) => {
      const lineText = `- Fecha: ${sd.date} | Turno: ${sd.shift} | Motivo: ${sd.suspensionReason}${sd.suspensionObservation ? ` (${sd.suspensionObservation})` : ''}`;
      doc.text(lineText, 17, 100 + offset);
      offset += 4.5;
    });
    tableStartY = 103 + offset;
  }

  doc.autoTable({
    startY: tableStartY,
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

  // Group operational hours specifically for CM95, CM97 and REEMPLAZOs (12 hours per day, 07:00-19:00)
  const finalTruckSummary: Record<string, { expected: number, operational: number, deducted: number, reasons: string[] }> = {};
  
  const replacementTags = new Set<string>();
  data.forEach(p => {
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
      let dayExpected = 12;
      let dayDeducted = 0;
      let dayOperational = 12;

      if (truck === 'CM95' || truck === 'CM97') {
        // Check if status is "Fuera de servicio" during this day
        const statusRecord = statusHistory.find(h => h.date === date && h.shift === 'T39') || statusHistory.find(h => h.date === date);
        const truckStatus = statusRecord?.trucks?.find(t => t.code === truck)?.status;

        if (truckStatus === 'Fuera de servicio') {
          dayExpected = 12;
          dayDeducted = 12;
          dayOperational = 0;
          const label = 'Fuera de servicio';
          if (!finalTruckSummary[truck].reasons.includes(label)) {
            finalTruckSummary[truck].reasons.push(label);
          }
        } else {
          // Check if there are failure hours logged in operatingHours
          const failure = opHours.find(h => h.date === date && h.truck === truck);
          if (failure) {
            dayDeducted = Number(failure.deductedHours) || 0;
            dayOperational = Math.max(0, 12 - dayDeducted);
            if (failure.reason && !finalTruckSummary[truck].reasons.includes(failure.reason)) {
              finalTruckSummary[truck].reasons.push(failure.reason);
            }
          }
        }
      } else {
        // It's a REEMPLAZO truck!
        // We check if it is active/registered as in service on this date.
        const hasActiveWork = data.some(p => p.date === date && p.truck === 'REEMPLAZO' && p.replacementTruckTag?.toUpperCase() === truck && p.status !== 'No realizado') ||
                             outOfPrograms.some(w => w.date === date && w.truck === 'REEMPLAZO' && w.replacementTruckTag?.toUpperCase() === truck && w.status !== 'No realizado');

        if (hasActiveWork) {
          dayExpected = 12;
          const failure = opHours.find(h => h.date === date && (h.truck === truck || h.replacementTruckTag?.toUpperCase() === truck));
          if (failure) {
            dayDeducted = Number(failure.deductedHours) || 0;
            dayOperational = Math.max(0, 12 - dayDeducted);
            if (failure.reason && !finalTruckSummary[truck].reasons.includes(failure.reason)) {
              finalTruckSummary[truck].reasons.push(failure.reason);
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

      finalTruckSummary[truck].expected += dayExpected;
      finalTruckSummary[truck].operational += dayOperational;
      finalTruckSummary[truck].deducted += dayDeducted;
    });
  });

  const opHoursTable = Object.entries(finalTruckSummary)
    .filter(([_, stats]) => stats.expected > 0)
    .map(([truck, stats]) => [
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
      const isSuspendedDay = statusHistory?.some(
        h => h.date === r.date && h.shift === r.shift && h.operationStatus === 'Suspendida'
      );
      if (isSuspendedDay) {
        return [
          r.date, r.shift, r.truck,
          '—', '—', '—', '—', '—'
        ];
      }
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
