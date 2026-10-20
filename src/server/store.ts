import { Response } from 'express';
import {
  MeetingRecord,
  MeetingParticipantRecord,
  TacticalBoardRecord,
  MeetingMessageRecord,
  SavedTacticRecord,
} from '../types/database';

import fs from 'node:fs';
import path from 'node:path';

const DFC_STORE_FILE = path.join(process.platform === 'win32' ? process.cwd() : '/tmp', 'dfc_meetings_store.json');

export class MeetingStore {
  public meetings = new Map<string, MeetingRecord>(); // key: id
  public meetingsByCode = new Map<string, string>(); // code -> id
  public participants = new Map<string, MeetingParticipantRecord>(); // key: id
  public boards = new Map<string, TacticalBoardRecord>(); // key: meeting_id
  public messages = new Map<string, MeetingMessageRecord[]>(); // key: meeting_id
  public savedTactics = new Map<string, SavedTacticRecord[]>(); // key: owner_user_id
  public deletionRequests = new Map<string, { email: string; date: string; reason?: string }>();

  constructor() {
    this.syncFromDisk();
  }

  public syncFromDisk() {
    try {
      if (fs.existsSync(DFC_STORE_FILE)) {
        const raw = fs.readFileSync(DFC_STORE_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.meetings)) {
          data.meetings.forEach((m: MeetingRecord) => {
            this.meetings.set(m.id, m);
            this.meetingsByCode.set(m.code, m.id);
          });
        }
        if (Array.isArray(data.boards)) {
          data.boards.forEach((b: TacticalBoardRecord) => {
            this.boards.set(b.meeting_id, b);
          });
        }
        if (Array.isArray(data.participants)) {
          data.participants.forEach((p: MeetingParticipantRecord) => {
            this.participants.set(p.id, p);
          });
        }
      }
    } catch {}
  }

  public syncToDisk() {
    try {
      const payload = {
        meetings: Array.from(this.meetings.values()),
        boards: Array.from(this.boards.values()),
        participants: Array.from(this.participants.values()),
      };
      fs.writeFileSync(DFC_STORE_FILE, JSON.stringify(payload), 'utf-8');
    } catch {}
  }

  // SSE client connections: meeting_id -> Set<Response>
  private sseClients = new Map<string, Set<Response>>();

  // Register an SSE client
  public addSseClient(meetingId: string, res: Response) {
    if (!this.sseClients.has(meetingId)) {
      this.sseClients.set(meetingId, new Set());
    }
    this.sseClients.get(meetingId)!.add(res);
  }

  // Remove an SSE client
  public removeSseClient(meetingId: string, res: Response) {
    const clients = this.sseClients.get(meetingId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.sseClients.delete(meetingId);
      }
    }
  }

  // Broadcast event to meeting participants
  public broadcastToMeeting(meetingId: string, event: string, data: any) {
    const clients = this.sseClients.get(meetingId);
    if (!clients) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    clients.forEach((client) => {
      try {
        client.write(payload);
      } catch {
        clients.delete(client);
      }
    });
  }

  // Get active participants for a meeting
  public getMeetingParticipants(meetingId: string): MeetingParticipantRecord[] {
    const list: MeetingParticipantRecord[] = [];
    this.participants.forEach((p) => {
      if (p.meeting_id === meetingId && p.admission_status !== 'removed') {
        list.push(p);
      }
    });
    return list;
  }

  // Find participant by session identifier
  public getParticipantBySession(sessionIdentifier: string): MeetingParticipantRecord | null {
    for (const p of this.participants.values()) {
      if (p.session_identifier === sessionIdentifier) {
        return p;
      }
    }
    return null;
  }
}

export const store = new MeetingStore();
