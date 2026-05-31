export interface ChecklistItemTemplate {
  itemName: string;
  order: number;
  active: boolean;
}

export interface WashingTemplate {
  areaName: 'Equipos críticos CS' | 'Interior planta CS' | 'Equipos críticos en periferia' | 'Lavado periferia';
  packageName: string;
  controlType: 'checklist' | 'cantidad';
  quantity?: number;
  items?: ChecklistItemTemplate[];
}

export const INITIAL_WASHING_TEMPLATES: WashingTemplate[] = [
  // AREA 1: Equipos críticos CS
  {
    areaName: 'Equipos críticos CS',
    packageName: 'SW28 a PTS',
    controlType: 'checklist',
    items: [
      { itemName: 'Muffas NPT1', order: 1, active: true },
      { itemName: 'Desconectadores Pta granulación', order: 2, active: true },
      { itemName: 'Muffas Pta granulación', order: 3, active: true },
      { itemName: 'SS/EE mochila control/Inventario', order: 4, active: true },
      { itemName: 'Desconectador y SS/EE casino', order: 5, active: true },
      { itemName: 'Desconectadores estruct. 34', order: 6, active: true },
      { itemName: 'Desconectadores y SS/EE Termofusión', order: 7, active: true },
      { itemName: 'Desconectadores Pta secado', order: 8, active: true },
      { itemName: 'Allduty Pta secado', order: 9, active: true },
      { itemName: 'Reconectador Pta secado', order: 10, active: true },
      { itemName: 'Desconectadores Filtro', order: 11, active: true },
      { itemName: 'Reconectadores Pta Filtro', order: 12, active: true },
      { itemName: 'SS/EE Pta Filtro', order: 13, active: true },
      { itemName: 'Desconectadores Límite zona', order: 14, active: true }
    ]
  },
  {
    areaName: 'Equipos críticos CS',
    packageName: 'SWT 28A a PTA NPT4',
    controlType: 'checklist',
    items: [
      { itemName: 'Desconectadores fusible', order: 1, active: true },
      { itemName: 'Muffas NPT4 y NPT 2', order: 2, active: true }
    ]
  },
  {
    areaName: 'Equipos críticos CS',
    packageName: 'SW#26 a Los Ríos',
    controlType: 'checklist',
    items: [
      { itemName: 'SS/EE Encarpadora', order: 1, active: true },
      { itemName: 'Transformador garita', order: 2, active: true },
      { itemName: 'Transformador cancha CS4 y desconectador', order: 3, active: true },
      { itemName: 'Transformador Romana frente NPT 3', order: 4, active: true },
      { itemName: 'Desconectadores Romana frente NPT 3', order: 5, active: true }
    ]
  },
  {
    areaName: 'Equipos críticos CS',
    packageName: 'Patio 600 a Sala de Grupo',
    controlType: 'checklist',
    items: [
      { itemName: 'Patio 600', order: 1, active: true },
      { itemName: 'Equipo de medida NPT3', order: 2, active: true },
      { itemName: 'Allduti', order: 3, active: true },
      { itemName: 'Desconectadores PTA Osmosis', order: 4, active: true },
      { itemName: 'Reconectador NPT 3', order: 5, active: true },
      { itemName: 'Desconectadores NPT 3', order: 6, active: true },
      { itemName: 'Reconectador Área 7000', order: 7, active: true },
      { itemName: 'Desconectadores Área 7000', order: 8, active: true },
      { itemName: 'S/E Pta. Piloto', order: 9, active: true },
      { itemName: 'Desconectadores Área 9000', order: 10, active: true },
      { itemName: 'Reconectador Área 9000', order: 11, active: true },
      { itemName: 'Muffas sala de grupo', order: 12, active: true },
      { itemName: 'Recco. Pozas los perros', order: 13, active: true },
      { itemName: 'Equipo de medida NPT3 Pozas los perros', order: 14, active: true },
      { itemName: 'Allduti Pozas los perros', order: 15, active: true },
      { itemName: 'Transformador Pozas los perros', order: 16, active: true }
    ]
  },
  {
    areaName: 'Equipos críticos CS',
    packageName: 'Patio 600 a DTP',
    controlType: 'checklist',
    items: [
      { itemName: 'Equipo medida', order: 1, active: true },
      { itemName: 'SS/EE Planta gas', order: 2, active: true },
      { itemName: 'Allduti', order: 3, active: true },
      { itemName: 'Allduti Poza los perros', order: 4, active: true },
      { itemName: 'Muffas DTP', order: 5, active: true },
      { itemName: 'Desconectadores', order: 6, active: true },
      { itemName: 'SS/EE Planta prilado', order: 7, active: true },
      { itemName: 'Desconectadores', order: 8, active: true },
      { itemName: 'SS/EE CIO', order: 9, active: true },
      { itemName: 'Desconectadores', order: 10, active: true },
      { itemName: 'Muffas Secado 3 y 4', order: 11, active: true },
      { itemName: 'SS/EE Romana nueva', order: 12, active: true },
      { itemName: 'Transformador tipo mochila', order: 13, active: true },
      { itemName: 'SS/EE Pta Korda', order: 14, active: true }
    ]
  },
  {
    areaName: 'Equipos críticos CS',
    packageName: 'L33 kV SW26 derivación encarpadora',
    controlType: 'cantidad',
    quantity: 9
  },
  {
    areaName: 'Equipos críticos CS',
    packageName: 'L33 kV sector pozas 1 a 10 y S/E',
    controlType: 'cantidad',
    quantity: 31
  },
  {
    areaName: 'Equipos críticos CS',
    packageName: 'L23 kV derivación NPT3 a pozas K',
    controlType: 'cantidad',
    quantity: 23
  },

  // AREA 2: Interior planta CS
  { areaName: 'Interior planta CS', packageName: 'L 23 kV Patio 600 a Pta. DTP', controlType: 'cantidad', quantity: 18 },
  { areaName: 'Interior planta CS', packageName: 'L 23 kV Patio 600 - NPT3 - sala grupos', controlType: 'cantidad', quantity: 21 },
  { areaName: 'Interior planta CS', packageName: 'L 33 kV Swt 28A Poste 1 a 28 CFCS - NPT4', controlType: 'cantidad', quantity: 27 },
  { areaName: 'Interior planta CS', packageName: 'L 33 kV Atmosf Poste 37 a Secado 1-2', controlType: 'cantidad', quantity: 14 },
  { areaName: 'Interior planta CS', packageName: 'L 33 kV Atmosf Deriv. a S/E enfriadera - ampl. Cristal', controlType: 'cantidad', quantity: 5 },
  { areaName: 'Interior planta CS', packageName: 'L 23 kV Secado 3-4 a sala grupo', controlType: 'cantidad', quantity: 18 },
  { areaName: 'Interior planta CS', packageName: 'L 23 kV Plt. Korda a Romana Nueva', controlType: 'cantidad', quantity: 14 },
  { areaName: 'Interior planta CS', packageName: 'Línea 33 kV SW26 poste 25 al 48', controlType: 'cantidad', quantity: 25 },
  { areaName: 'Interior planta CS', packageName: 'L 33 kV Swt 26 poste 1 a poste 24 CFCS - Romana NPT3 Pla 1', controlType: 'cantidad', quantity: 22 },
  { areaName: 'Interior planta CS', packageName: 'L 23 kV Derivación Copec', controlType: 'cantidad', quantity: 9 },
  { areaName: 'Interior planta CS', packageName: 'L 23 kV Respaldo DTP', controlType: 'cantidad', quantity: 9 },
  { areaName: 'Interior planta CS', packageName: 'L 23 kV Sala NPT2 a Pozas B1, B2 y C', controlType: 'cantidad', quantity: 57 },
  { areaName: 'Interior planta CS', packageName: 'Línea 23 kV Poza fluente a Pta. TAS C.S', controlType: 'cantidad', quantity: 11 },
  { areaName: 'Interior planta CS', packageName: 'Derivación Pta. TAS C.S', controlType: 'cantidad', quantity: 9 },
  { areaName: 'Interior planta CS', packageName: 'L 33 kV SWT 28 a S/E PTS', controlType: 'cantidad', quantity: 37 },
  { areaName: 'Interior planta CS', packageName: 'L 33 kV Atmosf Derivación a S/E Granulación', controlType: 'cantidad', quantity: 4 },
  { areaName: 'Interior planta CS', packageName: 'L 33 kV Atmosf Derivación a S/E NPT1', controlType: 'cantidad', quantity: 3 },
  { areaName: 'Interior planta CS', packageName: 'S/E 110 kV C.S. y M.E.I.', controlType: 'cantidad', quantity: 2 },

  // AREA 3: Equipos críticos en periferia
  {
    areaName: 'Equipos críticos en periferia',
    packageName: 'L23 kV El Toco',
    controlType: 'checklist',
    items: [
      { itemName: 'Desconectador M1', order: 1, active: true },
      { itemName: 'Reconectador E1', order: 2, active: true },
      { itemName: 'Compacto de medida', order: 3, active: true },
      { itemName: 'Desconectador M2', order: 4, active: true },
      { itemName: 'Transformador M2', order: 5, active: true },
      { itemName: 'Desconectador P. 03', order: 6, active: true },
      { itemName: 'Transformador Toco Sur', order: 7, active: true },
      { itemName: 'Desconectador P. 08', order: 8, active: true },
      { itemName: 'Reconectador P 8.1', order: 9, active: true },
      { itemName: 'Desconectador P 8.1', order: 10, active: true },
      { itemName: 'Transformador P 8.1', order: 11, active: true },
      { itemName: 'Desconectador T.N. COP', order: 12, active: true },
      { itemName: 'Desconectador P. 157', order: 13, active: true },
      { itemName: 'Transformador T.N Barrio Cívico', order: 14, active: true }
    ]
  },
  {
    areaName: 'Equipos críticos en periferia',
    packageName: 'L23 kV desde M.E.I.',
    controlType: 'checklist',
    items: [
      { itemName: 'Reconectador general', order: 1, active: true },
      { itemName: 'Alduti', order: 2, active: true },
      { itemName: 'Desconectador piscina', order: 3, active: true },
      { itemName: 'Transformador piscina', order: 4, active: true },
      { itemName: 'Desconectador intermedio', order: 5, active: true },
      { itemName: 'SW #27', order: 6, active: true },
      { itemName: 'SW #29 nuevo', order: 7, active: true },
      { itemName: 'Desconectador Arranque Ramaditas', order: 8, active: true },
      { itemName: 'Desconectador recinto Vergara', order: 9, active: true },
      { itemName: 'S/E recinto Vergara', order: 10, active: true },
      { itemName: 'Desconectador SW #44', order: 11, active: true },
      { itemName: 'SW Pta yodo', order: 12, active: true }
    ]
  },
  {
    areaName: 'Equipos críticos en periferia',
    packageName: 'Línea 23 kV La Cruz a Patio 600',
    controlType: 'checklist',
    items: [
      { itemName: 'Reconectador Noja', order: 1, active: true },
      { itemName: 'Desconectador Pta. TAS', order: 2, active: true },
      { itemName: 'Transformador Pta. TAS', order: 3, active: true },
      { itemName: 'Desconectador Patio 600', order: 4, active: true }
    ]
  },
  {
    areaName: 'Equipos críticos en periferia',
    packageName: 'Línea 23 kV Conv. - Patio 700 + Anillo',
    controlType: 'checklist',
    items: [
      { itemName: 'Alduti 89 E1', order: 1, active: true },
      { itemName: 'Patio 700', order: 2, active: true },
      { itemName: 'Desconectador BBA 101 - 103', order: 3, active: true },
      { itemName: 'Desconectador 01 anillo', order: 4, active: true },
      { itemName: 'Reconectador anillo', order: 5, active: true },
      { itemName: 'Desconectador 02 anillo', order: 6, active: true }
    ]
  },
  {
    areaName: 'Equipos críticos en periferia',
    packageName: 'Línea 33 kV Aducción Ríos',
    controlType: 'checklist',
    items: [
      { itemName: 'Desconectador garita R-5', order: 1, active: true },
      { itemName: 'Transformador garita R-5', order: 2, active: true },
      { itemName: 'SW #25', order: 3, active: true },
      { itemName: 'Desconectador río M.E.', order: 4, active: true },
      { itemName: 'Transformador río M.E.', order: 5, active: true },
      { itemName: 'Desconectador río C.S.', order: 6, active: true },
      { itemName: 'Transformador río C.S.', order: 7, active: true },
      { itemName: 'Desconectador río Vergara', order: 8, active: true },
      { itemName: 'Transformador río Vergara', order: 9, active: true }
    ]
  },

  // AREA 4: Lavado periferia
  { areaName: 'Lavado periferia', packageName: 'L 33 kV Re conectador MEI a Est. 10', controlType: 'cantidad', quantity: 10 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV MEI Est. 61 a Est. 118 remate', controlType: 'cantidad', quantity: 59 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV MEI SWT 29A a 28A', controlType: 'cantidad', quantity: 34 },
  { areaName: 'Lavado periferia', packageName: 'EX - 110 kV Poste 33 a 65', controlType: 'cantidad', quantity: 33 },
  { areaName: 'Lavado periferia', packageName: 'EX - 110 kV Poste 66 a 88', controlType: 'cantidad', quantity: 23 },
  { areaName: 'Lavado periferia', packageName: 'EX - 110 kV Poste 89 a 121', controlType: 'cantidad', quantity: 32 },
  { areaName: 'Lavado periferia', packageName: 'EX - 110 kV Poste 122 a 164', controlType: 'cantidad', quantity: 42 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV MEI Est. 11 a Est. 60', controlType: 'cantidad', quantity: 49 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV Switch 29, 1 al 25', controlType: 'cantidad', quantity: 25 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV Alimentador Poza 0 y TK10', controlType: 'cantidad', quantity: 20 },
  { areaName: 'Lavado periferia', packageName: 'L 110 kV 1 a 21 MEI', controlType: 'cantidad', quantity: 21 },
  { areaName: 'Lavado periferia', packageName: 'Línea 6,6 kV sector ripio P.V.', controlType: 'cantidad', quantity: 27 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV S/E 11 A a S/E IODO 1-2', controlType: 'cantidad', quantity: 24 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV SW 31 a R. Vergara', controlType: 'cantidad', quantity: 38 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV 89E1 a NPT2', controlType: 'cantidad', quantity: 52 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV Patio 700 a Prilado', controlType: 'cantidad', quantity: 59 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV 1 a 29 MEI', controlType: 'cantidad', quantity: 29 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV 89E1 + Patio 700', controlType: 'cantidad', quantity: 1 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV SW 44 a S/E 11A', controlType: 'cantidad', quantity: 11 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV S/E Mina a S/E Calentadores', controlType: 'cantidad', quantity: 17 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV SW 30 a R. Vergara', controlType: 'cantidad', quantity: 39 },
  { areaName: 'Lavado periferia', packageName: 'L 6,6 kV sector botadero PDV Etapa 1', controlType: 'cantidad', quantity: 70 },
  { areaName: 'Lavado periferia', packageName: 'L 6,6 kV sector botadero PDV Etapa 2', controlType: 'cantidad', quantity: 60 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV Derivación S/E Campamento M.E.', controlType: 'cantidad', quantity: 11 },
  { areaName: 'Lavado periferia', packageName: 'L 6,6 kV Laboratorio y servicio', controlType: 'cantidad', quantity: 29 },
  { areaName: 'Lavado periferia', packageName: 'L 6,6 kV Garita P.D.V. a antena Entel P.D.V.', controlType: 'cantidad', quantity: 22 },
  { areaName: 'Lavado periferia', packageName: 'L 6,6 kV esmalte antena a sector zanjas PDV', controlType: 'cantidad', quantity: 69 },
  { areaName: 'Lavado periferia', packageName: 'Nueva L 33 kV alimentador R. Vergara', controlType: 'cantidad', quantity: 27 },
  { areaName: 'Lavado periferia', packageName: 'L 6,6 kV sector zanja PDV', controlType: 'cantidad', quantity: 71 },
  { areaName: 'Lavado periferia', packageName: 'Línea 23 kV Tap off La Cruz a Patio 600 Etapa 1', controlType: 'cantidad', quantity: 38 },
  { areaName: 'Lavado periferia', packageName: 'Línea 220 kV Torre 1 a 13', controlType: 'cantidad', quantity: 13 },
  { areaName: 'Lavado periferia', packageName: 'Línea 220 kV Torre 14 a 23', controlType: 'cantidad', quantity: 10 },
  { areaName: 'Lavado periferia', packageName: 'S/E 220 a 110 kV', controlType: 'cantidad', quantity: 2 },
  { areaName: 'Lavado periferia', packageName: 'SQM CS 1 a 32', controlType: 'cantidad', quantity: 32 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV Swt 26 poste 44 a río C.S.', controlType: 'cantidad', quantity: 74 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV Sw #25 a río M.E.', controlType: 'cantidad', quantity: 74 },
  { areaName: 'Lavado periferia', packageName: 'Línea 23 kV Tap off La Cruz a Patio 600 Etapa 2', controlType: 'cantidad', quantity: 39 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV Poste 9 a COPS P.B.', controlType: 'cantidad', quantity: 77 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV Poste 1 a pozas solares y neutralizadora P.B.', controlType: 'cantidad', quantity: 57 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV sector contaminado y booster P.B.', controlType: 'cantidad', quantity: 19 },
  { areaName: 'Lavado periferia', packageName: 'Arranque a S/E C.S. 110 kV', controlType: 'cantidad', quantity: 3 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV Sw #25 a río C.S.', controlType: 'cantidad', quantity: 91 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV Toco Sur', controlType: 'cantidad', quantity: 58 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV 01 - 43 Toco Sur', controlType: 'cantidad', quantity: 43 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV 01 - 56 Toco Norte', controlType: 'cantidad', quantity: 56 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV 57 - 113 Toco Norte', controlType: 'cantidad', quantity: 56 },
  { areaName: 'Lavado periferia', packageName: 'L 23 kV 114 - 168 Toco Norte', controlType: 'cantidad', quantity: 54 },
  { areaName: 'Lavado periferia', packageName: 'L 33 kV Arranque electrolinera', controlType: 'cantidad', quantity: 7 }
];
