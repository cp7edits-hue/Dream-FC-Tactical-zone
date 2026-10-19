export type TeamType = 'home' | 'away';

export interface PlayerPosition {
  x: number; // Pitch X: -34 to +34 (standard ~68m width)
  z: number; // Pitch Z: -52.5 to +52.5 (standard ~105m length)
}

export interface Player {
  id: string;
  number: number;
  name: string;
  role: string; // e.g. GK, CB, LB, RB, DM, CM, RW, LW, ST
  team: TeamType;
  position: PlayerPosition;
}

export type FormationType = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2' | '3-4-3' | '4-1-4-1' | '5-3-2';

export interface FormationTemplate {
  name: FormationType;
  label: string;
  positions: {
    role: string;
    number: number;
    name: string;
    x: number;
    z: number;
  }[];
}

export type TacticalPathType = 'pass' | 'run' | 'press' | 'zone';

export interface TacticalPath {
  id: string;
  type: TacticalPathType;
  points: PlayerPosition[]; // starting and ending or control points
  color?: string;
  label?: string;
}

export type CameraPreset = 'broadcast' | 'overhead' | 'attacking' | 'defending' | 'free';

export interface TacticalDrill {
  id: string;
  title: string;
  description: string;
  formation: FormationType;
  paths: TacticalPath[];
  ballPosition: PlayerPosition;
  notes: string;
}

export interface MeetingParticipant {
  id: string;
  name: string;
  role: string;
  isMuted: boolean;
  isSpeaking: boolean;
  avatarColor: string;
}

export interface MeetingSession {
  id: string;
  code: string;
  passcode: string;
  title: string;
  hostName: string;
  createdAt: string;
  participants: MeetingParticipant[];
  notes: string[];
  isMicActive: boolean;
}
