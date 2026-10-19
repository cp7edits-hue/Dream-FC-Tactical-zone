import { TacticalDrill } from '../types/tactics';

export const PRESET_DRILLS: TacticalDrill[] = [
  {
    id: 'opening_master',
    title: 'Match Tactical Zone Blueprint',
    description: 'The master setup shown in Dream FC Tactical Zone: midfield pivot ball circulation with dual wing penetration.',
    formation: '4-3-3',
    ballPosition: { x: 0, z: 0 },
    notes: 'Rodri controls the center circle; De Bruyne releases Foden on the right half-space while Grealish holds touchline width.',
    paths: [
      {
        id: 'p1',
        type: 'pass',
        points: [
          { x: 0, z: 18 },
          { x: 12, z: 10 },
        ],
        color: '#ffffff',
        label: 'Pivot to Half-Space',
      },
      {
        id: 'p2',
        type: 'pass',
        points: [
          { x: 12, z: 10 },
          { x: 0, z: -2 },
        ],
        color: '#a3e635',
        label: 'Through Ball',
      },
      {
        id: 'p3',
        type: 'run',
        points: [
          { x: 22, z: 27 },
          { x: 26, z: 15 },
          { x: 24, z: 0 },
        ],
        color: '#a3e635',
        label: 'Overlap Run',
      },
      {
        id: 'p4',
        type: 'run',
        points: [
          { x: 21, z: 2 },
          { x: 14, z: -8 },
          { x: 4, z: -16 },
        ],
        color: '#ffffff',
        label: 'Inverted Cut',
      },
      {
        id: 'p5',
        type: 'press',
        points: [
          { x: -12, z: 10 },
          { x: -5, z: 2 },
        ],
        color: '#38bdf8',
        label: 'Support Angle',
      },
    ],
  },
  {
    id: 'counter_press',
    title: 'Gegenpressing High Trap',
    description: 'Aggressive 3-man chokehold to win possession in the final third within 5 seconds.',
    formation: '4-2-3-1',
    ballPosition: { x: 8, z: -15 },
    notes: 'Trigger press as soon as the opponent plays inward to the center back.',
    paths: [
      {
        id: 'cp1',
        type: 'press',
        points: [
          { x: 0, z: -2 },
          { x: 6, z: -12 },
        ],
        color: '#ef4444',
        label: 'Front Press',
      },
      {
        id: 'cp2',
        type: 'press',
        points: [
          { x: 18, z: 8 },
          { x: 12, z: -10 },
        ],
        color: '#ef4444',
        label: 'Cut Passing Lane',
      },
      {
        id: 'cp3',
        type: 'run',
        points: [
          { x: 0, z: 7 },
          { x: 4, z: -4 },
        ],
        color: '#a3e635',
        label: 'Second Ball Sweep',
      },
    ],
  },
  {
    id: 'box_overload',
    title: 'Tiki-Taka 3rd Man Cutback',
    description: 'Rapid triangular combinations drawing out the center back to expose the near-post pocket.',
    formation: '3-4-3',
    ballPosition: { x: -21, z: 14 },
    notes: 'Wide overload pulls opponent back-line wide, opening half-space for late midfield arrival.',
    paths: [
      {
        id: 'bo1',
        type: 'pass',
        points: [
          { x: -21, z: 14 },
          { x: -18, z: 2 },
        ],
        color: '#ffffff',
      },
      {
        id: 'bo2',
        type: 'pass',
        points: [
          { x: -18, z: 2 },
          { x: -7, z: 16 },
        ],
        color: '#ffffff',
      },
      {
        id: 'bo3',
        type: 'pass',
        points: [
          { x: -7, z: 16 },
          { x: 0, z: -14 },
        ],
        color: '#a3e635',
      },
      {
        id: 'bo4',
        type: 'run',
        points: [
          { x: 0, z: -3 },
          { x: 2, z: -20 },
        ],
        color: '#a3e635',
      },
    ],
  },
];
