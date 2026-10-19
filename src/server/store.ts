import { Response } from 'express';
import {
  MeetingRecord,
  MeetingParticipantRecord,
  TacticalBoardRecord,
  MeetingMessageRecord,
  SavedTacticRecord,
} from '../types/database';

export class MeetingStore {
  public meetings = new Map<string, MeetingRecord>(); // key: id
  public meetingsByCode = new Map<string, string>(); // code -> id
  public participants = new Map<string, MeetingParticipantRecord>(); // key: id
  public boards = new Map<string, TacticalBoardRecord>(); // key: meeting_id
  public messages = new Map<string, MeetingMessageRecord[]>(); // key: meeting_id
  public savedTactics = new Map<string, SavedTacticRecord[]>(); // key: owner_user_id
  public deletionRequests = new Map<string, { email: string; date: string; reason?: string }>();

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
