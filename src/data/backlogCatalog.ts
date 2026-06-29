export const BACKLOG_STRUCTURES = [
  'Muffas NPT1',
  'Desconectadores Pta granulación',
  'Muffas Pta granulación',
  'SS/EE mochila control/Inventario',
  'Desconectador y SS/EE casino',
  'Desconectadores estruct. 34',
  'Desconectadores y SS/EE Termofusión',
  'Desconectadores Pta secado',
  'Allduty Pta secado',
  'Reconectador Pta secado',
  'Desconectadores Filtro',
  'Reconectadores Pta Filtro',
  'SS/EE Pta Filtro',
  'Desconectadores Límite zona',
  'Desconectadores fusible',
  'Muffas NPT4 y NPT 2',
  'SS/EE Encarpadora',
  'Transformador garita',
  'Transformador cancha CS4 y desconectador',
  'Transformador Romana frente NPT 3',
  'Desconectadores Romana frente NPT 3',
  'Patio 600',
  'Equipo de medida NPT3',
  'Allduti',
  'Desconectadores PTA Osmosis',
  'Reconectador NPT 3',
  'Desconectadores NPT 3',
  'Reconectador Área 7000',
  'Desconectadores Área 7000',
  'S/E Pta. Piloto',
  'Desconectadores Área 9000',
  'Reconectador Área 9000',
  'Muffas sala de grupo',
  'Recco. Pozas los perros',
  'Equipo de medida NPT3 Pozas los perros',
  'Allduti Pozas los perros',
  'Transformador Pozas los perros'
];

export interface BacklogMetrics {
  total: number;
  recovered: number;
  pending: number;
  percentage: number;
  recoveredNames: string[];
}

/**
 * Dynamically computes Backlog metrics from the history of washing programs.
 * A backlog structure counts as recovered if it was washed correctly (marked as done) in any checklist program.
 */
export function calculateBacklogMetrics(programs: any[]): BacklogMetrics {
  const total = BACKLOG_STRUCTURES.length;
  const recoveredSet = new Set<string>();

  programs.forEach(program => {
    // We check programs that have checklist items
    if (program.controlType === 'checklist' && Array.isArray(program.items)) {
      program.items.forEach((item: any) => {
        if (item.done && BACKLOG_STRUCTURES.includes(item.itemName)) {
          recoveredSet.add(item.itemName);
        }
      });
    }
  });

  const recovered = recoveredSet.size;
  const pending = Math.max(0, total - recovered);
  const percentage = total > 0 ? (recovered / total) * 100 : 0;

  return {
    total,
    recovered,
    pending,
    percentage,
    recoveredNames: Array.from(recoveredSet)
  };
}
