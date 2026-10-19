import { FormationTemplate, FormationType } from '../types/tactics';

// Pitch coordinates:
// X: -28 (left touchline) to +28 (right touchline)
// Z: -45 (top goal) to +45 (bottom goal)
// Center circle at (0, 0)

export const FORMATIONS: Record<FormationType, FormationTemplate> = {
  '4-3-3': {
    name: '4-3-3',
    label: '4-3-3 Attacking',
    positions: [
      { role: 'GK', number: 1, name: 'Ederson', x: 0, z: 40 },
      { role: 'LB', number: 3, name: 'Gvardiol', x: -22, z: 27 },
      { role: 'CB', number: 4, name: 'Dias', x: -8, z: 29 },
      { role: 'CB', number: 5, name: 'Stones', x: 8, z: 29 },
      { role: 'RB', number: 2, name: 'Walker', x: 22, z: 27 },
      { role: 'DM', number: 16, name: 'Rodri', x: 0, z: 18 },
      { role: 'CM', number: 17, name: 'De Bruyne', x: -12, z: 10 },
      { role: 'CM', number: 20, name: 'Bernardo', x: 12, z: 10 },
      { role: 'LW', number: 10, name: 'Grealish', x: -21, z: 2 },
      { role: 'ST', number: 9, name: 'Haaland', x: 0, z: -2 },
      { role: 'RW', number: 47, name: 'Foden', x: 21, z: 2 },
    ],
  },
  '4-4-2': {
    name: '4-4-2',
    label: '4-4-2 Classic Flat',
    positions: [
      { role: 'GK', number: 1, name: 'Ederson', x: 0, z: 40 },
      { role: 'LB', number: 3, name: 'Gvardiol', x: -22, z: 27 },
      { role: 'CB', number: 4, name: 'Dias', x: -8, z: 29 },
      { role: 'CB', number: 5, name: 'Stones', x: 8, z: 29 },
      { role: 'RB', number: 2, name: 'Walker', x: 22, z: 27 },
      { role: 'LM', number: 10, name: 'Grealish', x: -21, z: 14 },
      { role: 'CM', number: 16, name: 'Rodri', x: -7, z: 15 },
      { role: 'CM', number: 17, name: 'De Bruyne', x: 7, z: 15 },
      { role: 'RM', number: 47, name: 'Foden', x: 21, z: 14 },
      { role: 'ST', number: 9, name: 'Haaland', x: -6, z: 1 },
      { role: 'ST', number: 19, name: 'Alvarez', x: 6, z: 1 },
    ],
  },
  '4-2-3-1': {
    name: '4-2-3-1',
    label: '4-2-3-1 Modern Pivot',
    positions: [
      { role: 'GK', number: 1, name: 'Ederson', x: 0, z: 40 },
      { role: 'LB', number: 3, name: 'Gvardiol', x: -22, z: 27 },
      { role: 'CB', number: 4, name: 'Dias', x: -8, z: 29 },
      { role: 'CB', number: 5, name: 'Stones', x: 8, z: 29 },
      { role: 'RB', number: 2, name: 'Walker', x: 22, z: 27 },
      { role: 'DM', number: 16, name: 'Rodri', x: -8, z: 19 },
      { role: 'DM', number: 8, name: 'Kovacic', x: 8, z: 19 },
      { role: 'LAM', number: 10, name: 'Grealish', x: -18, z: 8 },
      { role: 'CAM', number: 17, name: 'De Bruyne', x: 0, z: 7 },
      { role: 'RAM', number: 47, name: 'Foden', x: 18, z: 8 },
      { role: 'ST', number: 9, name: 'Haaland', x: 0, z: -2 },
    ],
  },
  '3-5-2': {
    name: '3-5-2',
    label: '3-5-2 Wing-Backs',
    positions: [
      { role: 'GK', number: 1, name: 'Ederson', x: 0, z: 40 },
      { role: 'CB', number: 6, name: 'Ake', x: -14, z: 29 },
      { role: 'CB', number: 4, name: 'Dias', x: 0, z: 30 },
      { role: 'CB', number: 5, name: 'Stones', x: 14, z: 29 },
      { role: 'LWB', number: 3, name: 'Gvardiol', x: -24, z: 16 },
      { role: 'CM', number: 16, name: 'Rodri', x: -7, z: 17 },
      { role: 'CM', number: 20, name: 'Bernardo', x: 7, z: 17 },
      { role: 'CAM', number: 17, name: 'De Bruyne', x: 0, z: 8 },
      { role: 'RWB', number: 2, name: 'Walker', x: 24, z: 16 },
      { role: 'ST', number: 9, name: 'Haaland', x: -6, z: 0 },
      { role: 'ST', number: 19, name: 'Alvarez', x: 6, z: 0 },
    ],
  },
  '3-4-3': {
    name: '3-4-3',
    label: '3-4-3 Total Football',
    positions: [
      { role: 'GK', number: 1, name: 'Ederson', x: 0, z: 40 },
      { role: 'CB', number: 6, name: 'Ake', x: -14, z: 29 },
      { role: 'CB', number: 4, name: 'Dias', x: 0, z: 30 },
      { role: 'CB', number: 5, name: 'Stones', x: 14, z: 29 },
      { role: 'LM', number: 11, name: 'Doku', x: -23, z: 14 },
      { role: 'CM', number: 16, name: 'Rodri', x: -7, z: 16 },
      { role: 'CM', number: 17, name: 'De Bruyne', x: 7, z: 16 },
      { role: 'RM', number: 20, name: 'Bernardo', x: 23, z: 14 },
      { role: 'LW', number: 10, name: 'Grealish', x: -18, z: 2 },
      { role: 'ST', number: 9, name: 'Haaland', x: 0, z: -3 },
      { role: 'RW', number: 47, name: 'Foden', x: 18, z: 2 },
    ],
  },
  '4-1-4-1': {
    name: '4-1-4-1',
    label: '4-1-4-1 High Control',
    positions: [
      { role: 'GK', number: 1, name: 'Ederson', x: 0, z: 40 },
      { role: 'LB', number: 3, name: 'Gvardiol', x: -22, z: 27 },
      { role: 'CB', number: 4, name: 'Dias', x: -8, z: 29 },
      { role: 'CB', number: 5, name: 'Stones', x: 8, z: 29 },
      { role: 'RB', number: 2, name: 'Walker', x: 22, z: 27 },
      { role: 'DM', number: 16, name: 'Rodri', x: 0, z: 21 },
      { role: 'LM', number: 10, name: 'Grealish', x: -21, z: 11 },
      { role: 'CM', number: 17, name: 'De Bruyne', x: -8, z: 11 },
      { role: 'CM', number: 20, name: 'Bernardo', x: 8, z: 11 },
      { role: 'RM', number: 47, name: 'Foden', x: 21, z: 11 },
      { role: 'ST', number: 9, name: 'Haaland', x: 0, z: -2 },
    ],
  },
  '5-3-2': {
    name: '5-3-2',
    label: '5-3-2 Low Block & Counter',
    positions: [
      { role: 'GK', number: 1, name: 'Ederson', x: 0, z: 40 },
      { role: 'LWB', number: 3, name: 'Gvardiol', x: -24, z: 24 },
      { role: 'CB', number: 6, name: 'Ake', x: -13, z: 29 },
      { role: 'CB', number: 4, name: 'Dias', x: 0, z: 30 },
      { role: 'CB', number: 5, name: 'Stones', x: 13, z: 29 },
      { role: 'RWB', number: 2, name: 'Walker', x: 24, z: 24 },
      { role: 'CM', number: 8, name: 'Kovacic', x: -11, z: 15 },
      { role: 'DM', number: 16, name: 'Rodri', x: 0, z: 17 },
      { role: 'CM', number: 17, name: 'De Bruyne', x: 11, z: 15 },
      { role: 'ST', number: 9, name: 'Haaland', x: -6, z: 3 },
      { role: 'ST', number: 19, name: 'Alvarez', x: 6, z: 3 },
    ],
  },
};

// Generates Away team mirrored across the halfway line (Z inverted)
export const getAwayFormation = (formation: FormationType) => {
  const base = FORMATIONS[formation];
  const awayNames = [
    { role: 'GK', number: 1, name: 'Courtois' },
    { role: 'LB', number: 23, name: 'Mendy' },
    { role: 'CB', number: 22, name: 'Rudiger' },
    { role: 'CB', number: 3, name: 'Militao' },
    { role: 'RB', number: 2, name: 'Carvajal' },
    { role: 'DM', number: 18, name: 'Tchouameni' },
    { role: 'CM', number: 15, name: 'Valverde' },
    { role: 'CM', number: 8, name: 'Kroos' },
    { role: 'LW', number: 7, name: 'Vinicius Jr' },
    { role: 'ST', number: 9, name: 'Mbappe' },
    { role: 'RW', number: 11, name: 'Rodrygo' },
  ];

  return base.positions.map((pos, idx) => ({
    role: pos.role,
    number: awayNames[idx]?.number ?? (idx + 1),
    name: awayNames[idx]?.name ?? `Away ${idx + 1}`,
    x: -pos.x, // mirrored across pitch
    z: -pos.z, // opposite half
  }));
};
