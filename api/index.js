// src/server/app.ts
import express from "express";
import cookieParser from "cookie-parser";
import path2 from "path";
import { fileURLToPath } from "url";

// src/server/routes.ts
import { Router } from "express";
import crypto2 from "node:crypto";

// src/server/validation.ts
import { z } from "zod";
var createMeetingSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120, "Title cannot exceed 120 characters"),
  hostName: z.string().trim().min(2, "Host name must be at least 2 characters").max(60, "Host name cannot exceed 60 characters"),
  teamLabel: z.string().trim().max(60).optional().default("Dream FC"),
  maxParticipants: z.number().int().min(2).max(50).optional().default(25),
  boardPermissionMode: z.enum(["coach_only", "open_collaboration", "host_assigned"]).optional().default("coach_only"),
  lobbyEnabled: z.boolean().optional().default(false),
  allowChat: z.boolean().optional().default(true),
  allowLocalFallback: z.boolean().optional().default(false)
});
var joinMeetingSchema = z.object({
  code: z.string().trim().min(3, "Meeting code or ID must be at least 3 characters").max(64),
  passcode: z.string().trim().min(3, "Passcode must be at least 3 characters").max(64),
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters").max(60),
  role: z.enum(["player", "collaborator", "analyst"]).optional().default("player")
});
var boardOperationSchema = z.object({
  type: z.enum([
    "move_player",
    "move_ball",
    "set_formation",
    "add_path",
    "set_paths",
    "reorder_paths",
    "delete_path",
    "clear_paths",
    "reset_board",
    "simulate_play",
    "simulate_pause",
    "simulate_resume",
    "simulate_reset"
  ]),
  payload: z.record(z.string(), z.any()),
  clientRevision: z.number().int().nonnegative().optional()
});
var moderationSchema = z.object({
  action: z.enum(["admit", "deny", "remove", "mute", "unmute", "grant_board_edit", "revoke_board_edit"]),
  targetParticipantId: z.string().min(1)
});
var chatMessageSchema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty").max(500, "Message cannot exceed 500 characters"),
  senderName: z.string().trim().min(1).max(60).optional(),
  senderId: z.string().min(1).optional()
});
var savedTacticSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(100),
  formation_type: z.string().max(20).default("4-3-3"),
  field_type: z.string().max(30).default("full_pitch"),
  board_state: z.record(z.string(), z.any()),
  notes: z.string().max(1e3).optional()
});
var privacyDeletionSchema = z.object({
  email: z.string().trim().email("Valid email required for deletion request confirmation"),
  reason: z.string().max(500).optional(),
  confirmConsent: z.boolean().refine((val) => val === true, "Explicit deletion confirmation required")
});
var contactSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  email: z.string().trim().email("Valid email required"),
  category: z.string().max(40).default("technical"),
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(100),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(1e3),
  honeypot: z.string().max(0, "Bot detected").optional().or(z.literal(""))
});

// src/server/crypto.ts
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
async function hashPasscode(passcode) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(passcode, salt);
}
async function verifyPasscode(passcode, hash) {
  try {
    const raw = (passcode || "").trim();
    if (!raw) return false;
    if (await bcrypt.compare(raw, hash)) return true;
    if (await bcrypt.compare(raw.toUpperCase(), hash)) return true;
    if (!raw.toUpperCase().startsWith("TACTIC-")) {
      if (await bcrypt.compare(`TACTIC-${raw.toUpperCase()}`, hash)) return true;
    } else {
      const stripped = raw.replace(/^TACTIC-/i, "").trim();
      if (stripped && await bcrypt.compare(stripped, hash)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
function generateMeetingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let randomPart = "";
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    randomPart += chars[bytes[i] % chars.length];
  }
  return `DFC-${randomPart}`;
}
function generatePasscode() {
  const num = crypto.randomInt(1e3, 9999);
  return `TACTIC-${num}`;
}
function generateSessionIdentifier() {
  return crypto.randomBytes(32).toString("hex");
}
function sanitizeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// src/server/livekit.ts
import { AccessToken } from "livekit-server-sdk";
async function generateLiveKitToken({
  roomName,
  participantId,
  participantName,
  isHost,
  canPublish
}) {
  const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
  const apiSecret = process.env.LIVEKIT_API_SECRET || "secret";
  const serverUrl = process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || "wss://dev.livekit.cloud";
  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantId,
    name: participantName,
    ttl: "2h"
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isHost
  });
  const token = await at.toJwt();
  return { token, serverUrl };
}

// src/server/store.ts
import fs from "node:fs";
import path from "node:path";
var DFC_STORE_FILE = path.join(process.platform === "win32" ? process.cwd() : "/tmp", "dfc_meetings_store.json");
var MeetingStore = class {
  constructor() {
    this.meetings = /* @__PURE__ */ new Map();
    // key: id
    this.meetingsByCode = /* @__PURE__ */ new Map();
    // code -> id
    this.participants = /* @__PURE__ */ new Map();
    // key: id
    this.boards = /* @__PURE__ */ new Map();
    // key: meeting_id
    this.messages = /* @__PURE__ */ new Map();
    // key: meeting_id
    this.savedTactics = /* @__PURE__ */ new Map();
    // key: owner_user_id
    this.deletionRequests = /* @__PURE__ */ new Map();
    // SSE client connections: meeting_id -> Set<Response>
    this.sseClients = /* @__PURE__ */ new Map();
    this.syncFromDisk();
  }
  syncFromDisk() {
    try {
      if (fs.existsSync(DFC_STORE_FILE)) {
        const raw = fs.readFileSync(DFC_STORE_FILE, "utf-8");
        const data = JSON.parse(raw);
        if (Array.isArray(data.meetings)) {
          data.meetings.forEach((m) => {
            this.meetings.set(m.id, m);
            this.meetingsByCode.set(m.code, m.id);
          });
        }
        if (Array.isArray(data.boards)) {
          data.boards.forEach((b) => {
            this.boards.set(b.meeting_id, b);
          });
        }
        if (Array.isArray(data.participants)) {
          data.participants.forEach((p) => {
            this.participants.set(p.id, p);
          });
        }
      }
    } catch {
    }
  }
  syncToDisk() {
    try {
      const payload = {
        meetings: Array.from(this.meetings.values()),
        boards: Array.from(this.boards.values()),
        participants: Array.from(this.participants.values())
      };
      fs.writeFileSync(DFC_STORE_FILE, JSON.stringify(payload), "utf-8");
    } catch {
    }
  }
  // Register an SSE client
  addSseClient(meetingId, res) {
    if (!this.sseClients.has(meetingId)) {
      this.sseClients.set(meetingId, /* @__PURE__ */ new Set());
    }
    this.sseClients.get(meetingId).add(res);
  }
  // Remove an SSE client
  removeSseClient(meetingId, res) {
    const clients = this.sseClients.get(meetingId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.sseClients.delete(meetingId);
      }
    }
  }
  // Broadcast event to meeting participants
  broadcastToMeeting(meetingId, event, data) {
    const clients = this.sseClients.get(meetingId);
    if (!clients) return;
    const payload = `event: ${event}
data: ${JSON.stringify(data)}

`;
    clients.forEach((client) => {
      try {
        client.write(payload);
      } catch {
        clients.delete(client);
      }
    });
  }
  // Get active participants for a meeting
  getMeetingParticipants(meetingId) {
    const list = [];
    this.participants.forEach((p) => {
      if (p.meeting_id === meetingId && p.admission_status !== "removed") {
        list.push(p);
      }
    });
    return list;
  }
  // Find participant by session identifier
  getParticipantBySession(sessionIdentifier) {
    for (const p of this.participants.values()) {
      if (p.session_identifier === sessionIdentifier) {
        return p;
      }
    }
    return null;
  }
};
var store = new MeetingStore();

// src/constants/formations.ts
var FORMATIONS = {
  "4-3-3": {
    name: "4-3-3",
    label: "4-3-3 Attacking",
    positions: [
      { role: "GK", number: 1, name: "Ederson", x: 0, z: 40 },
      { role: "LB", number: 3, name: "Gvardiol", x: -22, z: 27 },
      { role: "CB", number: 4, name: "Dias", x: -8, z: 29 },
      { role: "CB", number: 5, name: "Stones", x: 8, z: 29 },
      { role: "RB", number: 2, name: "Walker", x: 22, z: 27 },
      { role: "DM", number: 16, name: "Rodri", x: 0, z: 18 },
      { role: "CM", number: 17, name: "De Bruyne", x: -12, z: 10 },
      { role: "CM", number: 20, name: "Bernardo", x: 12, z: 10 },
      { role: "LW", number: 10, name: "Grealish", x: -21, z: 2 },
      { role: "ST", number: 9, name: "Haaland", x: 0, z: -2 },
      { role: "RW", number: 47, name: "Foden", x: 21, z: 2 }
    ]
  },
  "4-4-2": {
    name: "4-4-2",
    label: "4-4-2 Classic Flat",
    positions: [
      { role: "GK", number: 1, name: "Ederson", x: 0, z: 40 },
      { role: "LB", number: 3, name: "Gvardiol", x: -22, z: 27 },
      { role: "CB", number: 4, name: "Dias", x: -8, z: 29 },
      { role: "CB", number: 5, name: "Stones", x: 8, z: 29 },
      { role: "RB", number: 2, name: "Walker", x: 22, z: 27 },
      { role: "LM", number: 10, name: "Grealish", x: -21, z: 14 },
      { role: "CM", number: 16, name: "Rodri", x: -7, z: 15 },
      { role: "CM", number: 17, name: "De Bruyne", x: 7, z: 15 },
      { role: "RM", number: 47, name: "Foden", x: 21, z: 14 },
      { role: "ST", number: 9, name: "Haaland", x: -6, z: 1 },
      { role: "ST", number: 19, name: "Alvarez", x: 6, z: 1 }
    ]
  },
  "4-2-3-1": {
    name: "4-2-3-1",
    label: "4-2-3-1 Modern Pivot",
    positions: [
      { role: "GK", number: 1, name: "Ederson", x: 0, z: 40 },
      { role: "LB", number: 3, name: "Gvardiol", x: -22, z: 27 },
      { role: "CB", number: 4, name: "Dias", x: -8, z: 29 },
      { role: "CB", number: 5, name: "Stones", x: 8, z: 29 },
      { role: "RB", number: 2, name: "Walker", x: 22, z: 27 },
      { role: "DM", number: 16, name: "Rodri", x: -8, z: 19 },
      { role: "DM", number: 8, name: "Kovacic", x: 8, z: 19 },
      { role: "LAM", number: 10, name: "Grealish", x: -18, z: 8 },
      { role: "CAM", number: 17, name: "De Bruyne", x: 0, z: 7 },
      { role: "RAM", number: 47, name: "Foden", x: 18, z: 8 },
      { role: "ST", number: 9, name: "Haaland", x: 0, z: -2 }
    ]
  },
  "3-5-2": {
    name: "3-5-2",
    label: "3-5-2 Wing-Backs",
    positions: [
      { role: "GK", number: 1, name: "Ederson", x: 0, z: 40 },
      { role: "CB", number: 6, name: "Ake", x: -14, z: 29 },
      { role: "CB", number: 4, name: "Dias", x: 0, z: 30 },
      { role: "CB", number: 5, name: "Stones", x: 14, z: 29 },
      { role: "LWB", number: 3, name: "Gvardiol", x: -24, z: 16 },
      { role: "CM", number: 16, name: "Rodri", x: -7, z: 17 },
      { role: "CM", number: 20, name: "Bernardo", x: 7, z: 17 },
      { role: "CAM", number: 17, name: "De Bruyne", x: 0, z: 8 },
      { role: "RWB", number: 2, name: "Walker", x: 24, z: 16 },
      { role: "ST", number: 9, name: "Haaland", x: -6, z: 0 },
      { role: "ST", number: 19, name: "Alvarez", x: 6, z: 0 }
    ]
  },
  "3-4-3": {
    name: "3-4-3",
    label: "3-4-3 Total Football",
    positions: [
      { role: "GK", number: 1, name: "Ederson", x: 0, z: 40 },
      { role: "CB", number: 6, name: "Ake", x: -14, z: 29 },
      { role: "CB", number: 4, name: "Dias", x: 0, z: 30 },
      { role: "CB", number: 5, name: "Stones", x: 14, z: 29 },
      { role: "LM", number: 11, name: "Doku", x: -23, z: 14 },
      { role: "CM", number: 16, name: "Rodri", x: -7, z: 16 },
      { role: "CM", number: 17, name: "De Bruyne", x: 7, z: 16 },
      { role: "RM", number: 20, name: "Bernardo", x: 23, z: 14 },
      { role: "LW", number: 10, name: "Grealish", x: -18, z: 2 },
      { role: "ST", number: 9, name: "Haaland", x: 0, z: -3 },
      { role: "RW", number: 47, name: "Foden", x: 18, z: 2 }
    ]
  },
  "4-1-4-1": {
    name: "4-1-4-1",
    label: "4-1-4-1 High Control",
    positions: [
      { role: "GK", number: 1, name: "Ederson", x: 0, z: 40 },
      { role: "LB", number: 3, name: "Gvardiol", x: -22, z: 27 },
      { role: "CB", number: 4, name: "Dias", x: -8, z: 29 },
      { role: "CB", number: 5, name: "Stones", x: 8, z: 29 },
      { role: "RB", number: 2, name: "Walker", x: 22, z: 27 },
      { role: "DM", number: 16, name: "Rodri", x: 0, z: 21 },
      { role: "LM", number: 10, name: "Grealish", x: -21, z: 11 },
      { role: "CM", number: 17, name: "De Bruyne", x: -8, z: 11 },
      { role: "CM", number: 20, name: "Bernardo", x: 8, z: 11 },
      { role: "RM", number: 47, name: "Foden", x: 21, z: 11 },
      { role: "ST", number: 9, name: "Haaland", x: 0, z: -2 }
    ]
  },
  "5-3-2": {
    name: "5-3-2",
    label: "5-3-2 Low Block & Counter",
    positions: [
      { role: "GK", number: 1, name: "Ederson", x: 0, z: 40 },
      { role: "LWB", number: 3, name: "Gvardiol", x: -24, z: 24 },
      { role: "CB", number: 6, name: "Ake", x: -13, z: 29 },
      { role: "CB", number: 4, name: "Dias", x: 0, z: 30 },
      { role: "CB", number: 5, name: "Stones", x: 13, z: 29 },
      { role: "RWB", number: 2, name: "Walker", x: 24, z: 24 },
      { role: "CM", number: 8, name: "Kovacic", x: -11, z: 15 },
      { role: "DM", number: 16, name: "Rodri", x: 0, z: 17 },
      { role: "CM", number: 17, name: "De Bruyne", x: 11, z: 15 },
      { role: "ST", number: 9, name: "Haaland", x: -6, z: 3 },
      { role: "ST", number: 19, name: "Alvarez", x: 6, z: 3 }
    ]
  }
};

// src/server/supabase.ts
import { createClient } from "@supabase/supabase-js";
var supabaseClient = null;
var tablesVerified = null;
function cleanSupabaseUrl(rawUrl) {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.includes("YOUR_SUPABASE_PROJECT_ID")) return null;
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  }
}
function cleanKey(rawKey) {
  if (!rawKey) return null;
  const trimmed = rawKey.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed || trimmed.includes("YOUR_SUPABASE_")) return null;
  return trimmed;
}
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const url = cleanSupabaseUrl(rawUrl);
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const key = cleanKey(rawKey);
  if (!url || !key) {
    return null;
  }
  try {
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    return supabaseClient;
  } catch (err) {
    console.warn("[Supabase] Failed to initialize Supabase client:", err);
    return null;
  }
}
async function verifySupabaseTables() {
  const client = getSupabase();
  if (!client) {
    return { ok: false, message: "Supabase credentials not configured in environment" };
  }
  try {
    const { data, error } = await client.from("meetings").select("id").limit(1);
    if (error) {
      tablesVerified = false;
      return { ok: false, message: `Table error: ${error.message} (code: ${error.code})` };
    }
    tablesVerified = true;
    return { ok: true, message: "Supabase meetings table verified and ready" };
  } catch (err) {
    tablesVerified = false;
    return { ok: false, message: `Connection error: ${err.message}` };
  }
}
var isSupabaseConfigured = () => {
  return getSupabase() !== null;
};

// src/server/routes.ts
var apiRouter = Router();
function getSessionParticipant(req) {
  const sessionId = req.cookies?.dfc_session || req.headers["x-session-id"];
  if (!sessionId) return null;
  return store.getParticipantBySession(sessionId);
}
apiRouter.post("/meetings", async (req, res) => {
  try {
    const parseResult = createMeetingSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid meeting parameters", details: parseResult.error.format() });
      return;
    }
    const {
      title,
      hostName,
      teamLabel,
      maxParticipants,
      boardPermissionMode,
      lobbyEnabled,
      allowChat,
      allowLocalFallback
    } = parseResult.data;
    const meetingId = crypto2.randomUUID();
    const code = generateMeetingCode();
    const passcode = generatePasscode();
    const accessSecretHash = await hashPasscode(passcode);
    const hostUserId = crypto2.randomUUID();
    const hostSessionId = generateSessionIdentifier();
    const meetingRecord = {
      id: meetingId,
      code,
      title,
      host_user_id: hostUserId,
      team_label: teamLabel,
      status: "active",
      access_secret_hash: accessSecretHash,
      max_participants: maxParticipants,
      board_permission_mode: boardPermissionMode,
      allow_chat: allowChat,
      lobby_enabled: lobbyEnabled,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      started_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const initialBoardState = {
      formation: "4-3-3",
      field_type: "full_pitch",
      home_players: FORMATIONS["4-3-3"].positions.map((p, idx) => ({
        id: `home_${idx + 1}`,
        number: p.number,
        name: p.name,
        role: p.role,
        team: "home",
        position: { x: p.x, z: p.z }
      })),
      away_players: FORMATIONS["4-3-3"].positions.map((p, idx) => ({
        id: `away_${idx + 1}`,
        number: idx + 1,
        name: `Away ${idx + 1}`,
        role: p.role,
        team: "away",
        position: { x: -p.x, z: -p.z }
      })),
      ball: { x: 0, z: 0 },
      paths: [],
      notes: [
        "1. Maintain compact 4-3-3 shape during opponent build-up",
        "2. Overload right half-space to isolate winger",
        "3. Immediate counter-press within 5 seconds of loss"
      ]
    };
    const boardRecord = {
      id: crypto2.randomUUID(),
      meeting_id: meetingId,
      board_state: initialBoardState,
      revision: 1,
      updated_by: hostUserId,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const hostParticipantId = crypto2.randomUUID();
    const hostParticipant = {
      id: hostParticipantId,
      meeting_id: meetingId,
      authenticated_user_id: hostUserId,
      session_identifier: hostSessionId,
      display_name: hostName,
      role: "host",
      admission_status: "admitted",
      is_muted: false,
      can_edit_board: true,
      joined_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_seen_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    store.meetings.set(meetingId, meetingRecord);
    store.meetingsByCode.set(code, meetingId);
    store.boards.set(meetingId, boardRecord);
    store.participants.set(hostParticipantId, hostParticipant);
    store.messages.set(meetingId, []);
    store.syncToDisk();
    const supabase = getSupabase();
    let supabasePersisted = false;
    let supabaseErrorMsg = null;
    if (supabase) {
      try {
        console.log(`[Meeting Create] Attempting to persist meeting "${code}" to Supabase database...`);
        const { error: mErr } = await supabase.from("meetings").insert({
          id: meetingId,
          code,
          title,
          host_user_id: null,
          // Allow guest/coach creation without auth.users FK violation
          team_label: teamLabel,
          status: "active",
          access_secret_hash: accessSecretHash,
          max_participants: maxParticipants,
          board_permission_mode: boardPermissionMode,
          allow_chat: allowChat,
          lobby_enabled: lobbyEnabled
        });
        if (mErr) {
          supabaseErrorMsg = mErr.message;
          console.error("[Supabase DB Diagnostic] Meetings table insert failed:", mErr.message, "(code:", mErr.code, ")");
          if (mErr.message.includes("schema cache") || mErr.code === "PGRST205") {
            console.error('[Supabase DB Diagnostic] Table "public.meetings" is not created in Supabase yet. Run migrations/000_complete_supabase_setup.sql in your Supabase SQL editor.');
          }
        } else {
          supabasePersisted = true;
          console.log(`[Supabase DB Diagnostic] Meeting "${code}" (${meetingId}) successfully saved to Supabase.`);
        }
        const { error: bErr } = await supabase.from("tactical_boards").insert({
          id: boardRecord.id,
          meeting_id: meetingId,
          board_state: initialBoardState,
          revision: 1,
          updated_by: null
        });
        if (bErr && !supabaseErrorMsg) {
          console.warn("[Supabase DB Diagnostic] Tactical boards insert warning:", bErr.message);
        }
        const { error: pErr } = await supabase.from("meeting_participants").insert({
          id: hostParticipantId,
          meeting_id: meetingId,
          authenticated_user_id: null,
          session_identifier: hostSessionId,
          display_name: hostName,
          role: "host",
          admission_status: "admitted",
          is_muted: false,
          can_edit_board: true
        });
        if (pErr && !supabaseErrorMsg) {
          console.warn("[Supabase DB Diagnostic] Meeting participants insert warning:", pErr.message);
        }
      } catch (dbErr) {
        supabaseErrorMsg = dbErr?.message || "Database connection error";
        console.warn("[Supabase DB Diagnostic] Persistence error:", dbErr?.message);
      }
    } else {
      console.log(`[Meeting Create] Supabase not configured. Meeting "${code}" stored in server memory & disk.`);
    }
    if (supabase && !supabasePersisted && !allowLocalFallback && process.env.NODE_ENV !== "test" && process.env.ALLOW_LOCAL_FALLBACK !== "true") {
      const isMissingTable = supabaseErrorMsg?.includes("schema cache") || supabaseErrorMsg?.includes("PGRST205");
      res.status(503).json({
        error: isMissingTable ? "Database schema migration required: table 'public.meetings' not found in Supabase (PGRST205)." : `Failed to persist meeting to database: ${supabaseErrorMsg}`,
        code: isMissingTable ? "DATABASE_MIGRATION_REQUIRED" : "DATABASE_PERSISTENCE_FAILED",
        details: isMissingTable ? "The canonical database table 'public.meetings' does not exist yet. Please execute migrations/000_complete_supabase_setup.sql in your Supabase SQL editor to create the schema." : supabaseErrorMsg,
        sqlFile: "migrations/000_complete_supabase_setup.sql",
        supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
        canFallbackToLocal: true
      });
      return;
    }
    res.cookie("dfc_session", hostSessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1e3
      // 8 hours
    });
    res.status(201).json({
      success: true,
      meeting: {
        id: meetingId,
        code,
        title,
        passcode,
        // One-time display for host
        boardPermissionMode,
        maxParticipants
      },
      participant: {
        id: hostParticipantId,
        displayName: hostName,
        role: "host",
        canEditBoard: true
      },
      sessionId: hostSessionId,
      persistence: {
        database: supabasePersisted,
        memory: true,
        disk: true,
        localOnly: !supabasePersisted,
        warning: !supabasePersisted ? "DATABASE_MIGRATION_REQUIRED" : null,
        note: !supabasePersisted ? "Session running in server memory/disk mode. Run migrations/000_complete_supabase_setup.sql in your Supabase SQL editor for cloud persistence." : null
      }
    });
  } catch (err) {
    console.error("[API /meetings] Error during meeting creation:", err);
    res.status(500).json({
      error: err?.message || "Failed to create meeting",
      details: String(err?.stack || err)
    });
  }
});
apiRouter.post("/meetings/join", async (req, res) => {
  try {
    const parseResult = joinMeetingSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Invalid join credentials", details: parseResult.error.format() });
      return;
    }
    const { code: inputCode, passcode, displayName, role } = parseResult.data;
    const rawTrimmed = inputCode.trim();
    const upperTrimmed = rawTrimmed.toUpperCase().replace(/\s+/g, "");
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTrimmed);
    const normalizedUuid = isUuid ? rawTrimmed.toLowerCase() : null;
    const codeCandidates = [upperTrimmed];
    if (upperTrimmed.startsWith("DFC-")) {
      codeCandidates.push(upperTrimmed.replace(/^DFC-/, ""));
    } else if (upperTrimmed.startsWith("DFC") && upperTrimmed.length > 3) {
      const suffix = upperTrimmed.substring(3).replace(/^-+/, "");
      codeCandidates.push(suffix);
      codeCandidates.push(`DFC-${suffix}`);
    } else if (/^[A-Z0-9]{4}$/.test(upperTrimmed)) {
      codeCandidates.push(`DFC-${upperTrimmed}`);
    }
    console.log(`[Meeting Join] Incoming join request: code="${rawTrimmed}", displayName="${displayName}", role="${role || "player"}"`);
    const supabase = getSupabase();
    let meetingId = null;
    let meeting = null;
    if (supabase) {
      try {
        let query = supabase.from("meetings").select("*");
        if (normalizedUuid) {
          query = query.eq("id", normalizedUuid);
        } else {
          query = query.in("code", codeCandidates);
        }
        const { data: dbMeeting, error: dbErr } = await query.maybeSingle();
        if (dbMeeting) {
          meetingId = dbMeeting.id;
          meeting = dbMeeting;
          store.meetings.set(dbMeeting.id, dbMeeting);
          store.meetingsByCode.set(dbMeeting.code, dbMeeting.id);
          store.syncToDisk();
          console.log(`[Meeting Join] Found meeting in Supabase database: id="${dbMeeting.id}", code="${dbMeeting.code}", status="${dbMeeting.status}"`);
          const { data: dbBoard } = await supabase.from("tactical_boards").select("*").eq("meeting_id", dbMeeting.id).maybeSingle();
          if (dbBoard) {
            store.boards.set(dbMeeting.id, dbBoard);
          }
        } else if (dbErr) {
          console.warn("[Meeting Join] Supabase query notice:", dbErr.message);
        }
      } catch (dbErr) {
        console.warn("[Meeting Join] Supabase lookup error:", dbErr?.message);
      }
    }
    if (!meeting) {
      const findInMemory = () => {
        for (const cand of codeCandidates) {
          if (store.meetingsByCode.has(cand)) {
            meetingId = store.meetingsByCode.get(cand);
            meeting = store.meetings.get(meetingId);
            if (meeting) return true;
          }
        }
        if (normalizedUuid && store.meetings.has(normalizedUuid)) {
          meetingId = normalizedUuid;
          meeting = store.meetings.get(normalizedUuid);
          if (meeting) return true;
        }
        for (const m of store.meetings.values()) {
          const mCode = m.code ? m.code.toUpperCase() : "";
          if (codeCandidates.includes(mCode) || codeCandidates.some((c) => mCode.endsWith(c) || c.endsWith(mCode)) || normalizedUuid && m.id.toLowerCase() === normalizedUuid) {
            meetingId = m.id;
            meeting = m;
            return true;
          }
        }
        return false;
      };
      if (!findInMemory()) {
        store.syncFromDisk();
        findInMemory();
      }
      if (meeting) {
        console.log(`[Meeting Join] Found meeting in server memory store: id="${meeting.id}", code="${meeting.code}", status="${meeting.status}"`);
      }
    }
    if (!meeting || !meetingId) {
      console.warn(`[Meeting Join] Failed: No session found for input="${rawTrimmed}". Searched candidates:`, codeCandidates);
      res.status(404).json({
        error: "Meeting not found. Please verify the squad code (e.g. DFC-HRZX) or confirm the coach has launched the briefing.",
        code: "MEETING_NOT_FOUND",
        searched: codeCandidates
      });
      return;
    }
    if (meeting.status === "ended") {
      console.warn(`[Meeting Join] Rejected: Session "${meeting.code}" has already ended.`);
      res.status(410).json({ error: "This tactical session has already ended.", code: "MEETING_ENDED" });
      return;
    }
    if (meeting.status === "locked") {
      console.warn(`[Meeting Join] Rejected: Session "${meeting.code}" is locked by coach.`);
      res.status(423).json({ error: "This strategy room is currently locked by the coach.", code: "MEETING_LOCKED" });
      return;
    }
    const isPasscodeValid = await verifyPasscode(passcode, meeting.access_secret_hash);
    if (!isPasscodeValid) {
      console.warn(`[Meeting Join] Rejected: Incorrect passcode for session "${meeting.code}".`);
      res.status(401).json({ error: "Incorrect passcode. Please check and try again.", code: "INVALID_PASSCODE" });
      return;
    }
    const activeParticipants = store.getMeetingParticipants(meetingId);
    if (activeParticipants.length >= meeting.max_participants) {
      console.warn(`[Meeting Join] Rejected: Session "${meeting.code}" is at maximum capacity.`);
      res.status(429).json({ error: "Meeting is full. Maximum participant capacity reached.", code: "MEETING_FULL" });
      return;
    }
    const sessionId = generateSessionIdentifier();
    const participantId = crypto2.randomUUID();
    const admissionStatus = meeting.lobby_enabled ? "waiting_lobby" : "admitted";
    const participant = {
      id: participantId,
      meeting_id: meetingId,
      session_identifier: sessionId,
      display_name: displayName,
      role: role === "collaborator" ? "collaborator" : "player",
      admission_status: admissionStatus,
      is_muted: false,
      can_edit_board: meeting.board_permission_mode === "open_collaboration",
      joined_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_seen_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    store.participants.set(participantId, participant);
    store.syncToDisk();
    if (supabase) {
      try {
        await supabase.from("meeting_participants").insert({
          id: participantId,
          meeting_id: meetingId,
          authenticated_user_id: null,
          session_identifier: sessionId,
          display_name: displayName,
          role: participant.role,
          admission_status: admissionStatus,
          is_muted: false,
          can_edit_board: participant.can_edit_board
        });
      } catch (pErr) {
        console.warn("[Supabase] Warning writing participant:", pErr?.message);
      }
    }
    res.cookie("dfc_session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1e3
    });
    let existingParticipants = store.getMeetingParticipants(meetingId).map((p) => ({
      id: p.id,
      name: p.display_name,
      role: p.role === "host" ? "Head Coach" : p.role,
      isMuted: p.is_muted,
      isSpeaking: false,
      canEditBoard: p.can_edit_board,
      avatarColor: p.role === "host" ? "bg-[#a3e635] text-slate-950" : "bg-blue-600 text-white"
    }));
    if (existingParticipants.length <= 1 && supabase) {
      try {
        const { data: dbParticipants } = await supabase.from("meeting_participants").select("*").eq("meeting_id", meetingId);
        if (dbParticipants && dbParticipants.length > 0) {
          existingParticipants = dbParticipants.map((p) => ({
            id: p.id,
            name: p.display_name,
            role: p.role === "host" ? "Head Coach" : p.role,
            isMuted: p.is_muted,
            isSpeaking: false,
            canEditBoard: p.can_edit_board,
            avatarColor: p.role === "host" ? "bg-[#a3e635] text-slate-950" : "bg-blue-600 text-white"
          }));
        }
      } catch (e) {
        console.warn("[Supabase] Warning reading participants:", e?.message);
      }
    }
    store.broadcastToMeeting(meetingId, "participant_joined", {
      id: participantId,
      displayName,
      role: participant.role,
      admissionStatus,
      isMuted: false
    });
    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        code: meeting.code,
        title: meeting.title,
        status: meeting.status,
        allowChat: meeting.allow_chat,
        boardPermissionMode: meeting.board_permission_mode,
        hostName: existingParticipants.find((p) => p.role === "Head Coach")?.name || "Head Coach",
        participants: existingParticipants
      },
      participant: {
        id: participantId,
        displayName,
        role: participant.role,
        admissionStatus,
        canEditBoard: participant.can_edit_board
      },
      sessionId
    });
  } catch (err) {
    console.error("[API /meetings/join] Error during join:", err);
    res.status(500).json({ error: err?.message || "Failed to join meeting" });
  }
});
apiRouter.get("/meetings/:meetingId", async (req, res) => {
  const meetingId = req.params.meetingId;
  let meeting = store.meetings.get(meetingId);
  if (!meeting) {
    const foundId = store.meetingsByCode.get(meetingId);
    if (foundId) {
      meeting = store.meetings.get(foundId);
    }
  }
  const supabase = getSupabase();
  if (!meeting && supabase) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meetingId);
      let query = supabase.from("meetings").select("*");
      if (isUuid) {
        query = query.eq("id", meetingId.toLowerCase());
      } else {
        const upperCode = meetingId.toUpperCase().trim();
        query = query.in("code", [
          upperCode,
          upperCode.startsWith("DFC-") ? upperCode.replace(/^DFC-/, "") : `DFC-${upperCode}`
        ]);
      }
      const { data: dbMeeting } = await query.maybeSingle();
      if (dbMeeting) {
        meeting = dbMeeting;
        store.meetings.set(dbMeeting.id, dbMeeting);
        store.meetingsByCode.set(dbMeeting.code, dbMeeting.id);
      }
    } catch (e) {
      console.warn("[Supabase] GET /meetings/:id lookup notice:", e?.message);
    }
  }
  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }
  let participants = store.getMeetingParticipants(meeting.id).map((p) => ({
    id: p.id,
    name: p.display_name,
    role: p.role === "host" ? "Head Coach" : p.role,
    admissionStatus: p.admission_status,
    isMuted: p.is_muted,
    canEditBoard: p.can_edit_board
  }));
  if (supabase) {
    try {
      const { data: dbParticipants } = await supabase.from("meeting_participants").select("*").eq("meeting_id", meeting.id);
      if (dbParticipants && dbParticipants.length > 0) {
        const participantMap = /* @__PURE__ */ new Map();
        dbParticipants.forEach((p) => {
          participantMap.set(p.id, {
            id: p.id,
            name: p.display_name,
            role: p.role === "host" ? "Head Coach" : p.role,
            admissionStatus: p.admission_status,
            isMuted: p.is_muted,
            canEditBoard: p.can_edit_board
          });
        });
        participants.forEach((p) => {
          participantMap.set(p.id, p);
        });
        participants = Array.from(participantMap.values());
      }
    } catch {
    }
  }
  res.json({
    id: meeting.id,
    code: meeting.code,
    title: meeting.title,
    status: meeting.status,
    boardPermissionMode: meeting.board_permission_mode,
    allowChat: meeting.allow_chat,
    hostName: participants.find((p) => p.role === "Head Coach")?.name || "Head Coach",
    participants
  });
});
apiRouter.post("/meetings/:meetingId/token", async (req, res) => {
  const meetingId = req.params.meetingId;
  const participant = getSessionParticipant(req);
  let participantId = participant?.id;
  let participantName = participant?.display_name;
  let isHost = participant?.role === "host";
  let canPublish = true;
  if (participant) {
    if (participant.meeting_id !== meetingId) {
      res.status(403).json({ error: "Unauthorized: participant does not belong to this meeting" });
      return;
    }
    canPublish = isHost || !participant.is_muted;
  } else {
    participantId = req.body?.participantId || req.headers["x-participant-id"] || crypto2.randomUUID();
    participantName = req.body?.participantName || req.headers["x-participant-name"] || "Squad Member";
    isHost = req.body?.isHost === true;
  }
  let meeting = store.meetings.get(meetingId);
  if (!meeting) {
    const foundId = store.meetingsByCode.get(meetingId);
    if (foundId) {
      meeting = store.meetings.get(foundId);
    }
  }
  const supabase = getSupabase();
  if (!meeting && supabase) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meetingId);
      let query = supabase.from("meetings").select("*");
      if (isUuid) {
        query = query.eq("id", meetingId.toLowerCase());
      } else {
        const upperCode = meetingId.toUpperCase();
        query = query.in("code", [
          upperCode,
          upperCode.startsWith("DFC-") ? upperCode.replace(/^DFC-/, "") : `DFC-${upperCode}`
        ]);
      }
      const { data: dbMeeting } = await query.maybeSingle();
      if (dbMeeting) {
        meeting = dbMeeting;
        store.meetings.set(dbMeeting.id, dbMeeting);
        store.meetingsByCode.set(dbMeeting.code, dbMeeting.id);
      }
    } catch (e) {
      console.warn("[Supabase] Lookup notice for meeting token:", e?.message);
    }
  }
  if (meeting && meeting.status === "ended") {
    res.status(410).json({ error: "Meeting has ended" });
    return;
  }
  const meetingCode = req.body?.meetingCode;
  const normalizedCode = meeting?.code ? meeting.code.toUpperCase().trim() : meetingCode ? String(meetingCode).toUpperCase().trim() : meetingId.toUpperCase().trim();
  const roomName = `meeting_${normalizedCode}`;
  try {
    const { token, serverUrl } = await generateLiveKitToken({
      roomName,
      participantId: participantId || crypto2.randomUUID(),
      participantName: participantName || "Squad Member",
      isHost,
      canPublish
    });
    res.json({ token, serverUrl, roomName });
  } catch (err) {
    console.error("[API /token] Error generating token:", err);
    res.status(500).json({ error: "Failed to generate media token" });
  }
});
apiRouter.post("/meetings/:meetingId/signal", (req, res) => {
  const meetingId = req.params.meetingId;
  const { targetParticipantId, senderId, senderName, signal } = req.body || {};
  store.broadcastToMeeting(meetingId, "webrtc_signal", {
    targetParticipantId,
    senderId,
    senderName,
    signal
  });
  res.json({ success: true });
});
apiRouter.post("/meetings/:meetingId/leave", (req, res) => {
  const meetingId = req.params.meetingId;
  const participantId = req.body?.participantId || req.headers["x-participant-id"];
  const participantName = req.body?.participantName || "Squad Member";
  if (participantId) {
    store.participants.delete(participantId);
  }
  store.broadcastToMeeting(meetingId, "participant_left", {
    id: participantId,
    name: participantName
  });
  res.json({ success: true });
});
apiRouter.get("/meetings/:meetingId/board", async (req, res) => {
  const meetingId = req.params.meetingId;
  let board = store.boards.get(meetingId);
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: dbBoard } = await supabase.from("tactical_boards").select("*").eq("meeting_id", meetingId).maybeSingle();
      if (dbBoard && (!board || dbBoard.revision >= (board.revision || 1))) {
        board = dbBoard;
        store.boards.set(meetingId, dbBoard);
      }
    } catch {
    }
  }
  if (!board) {
    res.status(404).json({ error: "Tactical board not found" });
    return;
  }
  res.json({
    revision: board.revision,
    boardState: board.board_state,
    updatedAt: board.updated_at
  });
});
apiRouter.post(["/meetings/:meetingId/board/operations", "/meetings/:meetingId/operations"], async (req, res) => {
  const participant = getSessionParticipant(req);
  if (!participant || participant.meeting_id !== req.params.meetingId) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }
  const meeting = store.meetings.get(participant.meeting_id);
  if (!meeting || meeting.status === "ended") {
    res.status(410).json({ error: "Meeting has ended" });
    return;
  }
  const canEdit = participant.role === "host" || participant.can_edit_board || meeting.board_permission_mode === "open_collaboration";
  if (!canEdit) {
    res.status(403).json({ error: "Permission denied: Board editing restricted to coach." });
    return;
  }
  const rawBody = req.body?.operation ? req.body.operation : req.body;
  const parseResult = boardOperationSchema.safeParse(rawBody);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid board operation payload", details: parseResult.error.format() });
    return;
  }
  const board = store.boards.get(participant.meeting_id);
  if (!board) {
    res.status(404).json({ error: "Board not found" });
    return;
  }
  const { type, payload } = parseResult.data;
  const typedPayload = payload;
  if (type === "move_player") {
    const { id, position } = typedPayload;
    if (id && position) {
      const isHome = id.startsWith("home_");
      const playerList = isHome ? board.board_state.home_players : board.board_state.away_players;
      const player = playerList?.find((p) => p.id === id);
      if (player) {
        player.position = { x: position.x, z: position.z };
      }
    }
  } else if (type === "move_ball") {
    if (typedPayload.position) {
      board.board_state.ball = { x: typedPayload.position.x, z: typedPayload.position.z };
    }
  } else if (type === "set_formation") {
    const fName = typedPayload.formation;
    const template = FORMATIONS[fName];
    if (template && fName) {
      board.board_state.formation = fName;
      board.board_state.home_players = template.positions.map((p, idx) => ({
        id: `home_${idx + 1}`,
        number: p.number,
        name: p.name,
        role: p.role,
        team: "home",
        position: { x: p.x, z: p.z }
      }));
    }
  } else if (type === "add_path") {
    if (!board.board_state.paths) board.board_state.paths = [];
    board.board_state.paths.push(typedPayload.path);
  } else if (type === "set_paths") {
    board.board_state.paths = Array.isArray(typedPayload.paths) ? typedPayload.paths : [];
  } else if (type === "reorder_paths") {
    if (Array.isArray(typedPayload.paths)) {
      board.board_state.paths = typedPayload.paths;
    }
  } else if (type === "delete_path") {
    if (board.board_state.paths && typedPayload.pathId) {
      board.board_state.paths = board.board_state.paths.filter((p) => p.id !== typedPayload.pathId);
    }
  } else if (type === "clear_paths") {
    board.board_state.paths = [];
  } else if (type === "reset_board") {
    if (typedPayload.boardState) {
      board.board_state = typedPayload.boardState;
    }
  } else if (type === "simulate_play" || type === "simulate_pause" || type === "simulate_resume" || type === "simulate_reset") {
    if (typedPayload.boardState) {
      board.board_state = typedPayload.boardState;
    }
  }
  board.revision += 1;
  board.updated_by = participant.authenticated_user_id || participant.id;
  board.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("tactical_boards").update({
        board_state: board.board_state,
        revision: board.revision,
        updated_at: board.updated_at
      }).eq("meeting_id", meeting.id);
    } catch (e) {
      console.warn("[Supabase] Warning updating tactical board:", e?.message);
    }
  }
  store.broadcastToMeeting(meeting.id, "board_updated", {
    revision: board.revision,
    boardState: board.board_state,
    updatedBy: participant.display_name
  });
  res.json({
    success: true,
    revision: board.revision,
    boardState: board.board_state
  });
});
apiRouter.get("/meetings/:meetingId/board/events", (req, res) => {
  const meetingId = req.params.meetingId;
  const meeting = store.meetings.get(meetingId);
  if (!meeting) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const currentBoard = store.boards.get(meetingId);
  res.write(
    `event: connected
data: ${JSON.stringify({
      meetingId,
      revision: currentBoard?.revision ?? 1,
      boardState: currentBoard?.board_state
    })}

`
  );
  store.addSseClient(meetingId, res);
  const interval = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(interval);
    }
  }, 15e3);
  req.on("close", () => {
    clearInterval(interval);
    store.removeSseClient(meetingId, res);
  });
});
apiRouter.post("/meetings/:meetingId/participants/:participantId/moderation", (req, res) => {
  const caller = getSessionParticipant(req);
  if (!caller || caller.meeting_id !== req.params.meetingId || caller.role !== "host") {
    res.status(403).json({ error: "Forbidden: host authorization required" });
    return;
  }
  const parseResult = moderationSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid moderation action", details: parseResult.error.format() });
    return;
  }
  const { action } = parseResult.data;
  const target = store.participants.get(req.params.participantId);
  if (!target || target.meeting_id !== req.params.meetingId) {
    res.status(404).json({ error: "Target participant not found in this meeting" });
    return;
  }
  switch (action) {
    case "admit":
      target.admission_status = "admitted";
      break;
    case "deny":
      target.admission_status = "denied";
      break;
    case "remove":
      target.admission_status = "removed";
      break;
    case "mute":
      target.is_muted = true;
      break;
    case "unmute":
      target.is_muted = false;
      break;
    case "grant_board_edit":
      target.can_edit_board = true;
      break;
    case "revoke_board_edit":
      target.can_edit_board = false;
      break;
  }
  store.broadcastToMeeting(req.params.meetingId, "moderation_event", {
    targetId: target.id,
    action,
    isMuted: target.is_muted,
    canEditBoard: target.can_edit_board,
    admissionStatus: target.admission_status
  });
  res.json({ success: true, target });
});
apiRouter.post("/meetings/:meetingId/lock", (req, res) => {
  const caller = getSessionParticipant(req);
  if (!caller || caller.meeting_id !== req.params.meetingId || caller.role !== "host") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const meeting = store.meetings.get(req.params.meetingId);
  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }
  meeting.status = meeting.status === "locked" ? "active" : "locked";
  store.broadcastToMeeting(meeting.id, "meeting_locked", { status: meeting.status });
  res.json({ success: true, status: meeting.status });
});
apiRouter.post("/meetings/:meetingId/end", (req, res) => {
  const caller = getSessionParticipant(req);
  if (!caller || caller.meeting_id !== req.params.meetingId || caller.role !== "host") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const meeting = store.meetings.get(req.params.meetingId);
  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }
  meeting.status = "ended";
  meeting.ended_at = (/* @__PURE__ */ new Date()).toISOString();
  store.broadcastToMeeting(meeting.id, "meeting_ended", { message: "The host coach has ended this tactical briefing." });
  res.json({ success: true });
});
apiRouter.get("/meetings/:meetingId/messages", async (req, res) => {
  const meetingId = req.params.meetingId;
  const memoryMessages = store.messages.get(meetingId) || [];
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase.from("meeting_messages").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: true });
      if (!error && data && data.length > 0) {
        const formatted = data.map((m) => ({
          id: m.id,
          meeting_id: m.meeting_id,
          sender_participant_id: m.sender_participant_id,
          sender_name: m.sender_name,
          message: m.message,
          created_at: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""
        }));
        const ids = new Set(formatted.map((f) => f.id));
        for (const mm of memoryMessages) {
          if (!ids.has(mm.id)) {
            formatted.push(mm);
          }
        }
        res.json(formatted);
        return;
      }
    } catch (dbErr) {
      console.warn("[Supabase] Warning reading meeting_messages:", dbErr?.message);
    }
  }
  res.json(memoryMessages);
});
apiRouter.post("/meetings/:meetingId/messages", async (req, res) => {
  const parseResult = chatMessageSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid message", details: parseResult.error.format() });
    return;
  }
  const participant = getSessionParticipant(req);
  const finalSenderName = participant?.display_name || parseResult.data.senderName || req.body?.senderName || req.headers["x-participant-name"] || "Squad Member";
  const finalSenderId = participant?.id || parseResult.data.senderId || req.body?.senderId || req.headers["x-participant-id"] || crypto2.randomUUID();
  const messageRecord = {
    id: crypto2.randomUUID(),
    meeting_id: req.params.meetingId,
    sender_participant_id: finalSenderId,
    sender_name: finalSenderName,
    message: sanitizeHtml(parseResult.data.message),
    created_at: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };
  const list = store.messages.get(req.params.meetingId) || [];
  list.push(messageRecord);
  store.messages.set(req.params.meetingId, list);
  store.broadcastToMeeting(req.params.meetingId, "chat_message", messageRecord);
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("meeting_messages").insert({
        id: messageRecord.id,
        meeting_id: req.params.meetingId,
        sender_participant_id: null,
        // Allow guest chat without FK violation
        sender_name: messageRecord.sender_name,
        message: messageRecord.message
      });
    } catch (dbErr) {
      console.warn("[Supabase] Warning persisting chat message:", dbErr?.message);
    }
  }
  res.json({ success: true, message: messageRecord });
});
apiRouter.get("/saved-tactics", (req, res) => {
  const caller = getSessionParticipant(req);
  const userId = caller?.authenticated_user_id || "default_coach";
  const tactics = store.savedTactics.get(userId) || [];
  res.json(tactics);
});
apiRouter.post("/saved-tactics", (req, res) => {
  const caller = getSessionParticipant(req);
  const userId = caller?.authenticated_user_id || "default_coach";
  const parseResult = savedTacticSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid saved tactic payload", details: parseResult.error.format() });
    return;
  }
  const { title, formation_type, field_type, board_state, notes } = parseResult.data;
  const tacticRecord = {
    id: crypto2.randomUUID(),
    owner_user_id: userId,
    title,
    field_type,
    formation_type,
    board_state,
    notes,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const list = store.savedTactics.get(userId) || [];
  list.push(tacticRecord);
  store.savedTactics.set(userId, list);
  res.status(201).json({ success: true, tactic: tacticRecord });
});
apiRouter.delete("/saved-tactics/:id", (req, res) => {
  const caller = getSessionParticipant(req);
  const userId = caller?.authenticated_user_id || "default_coach";
  const list = store.savedTactics.get(userId) || [];
  const filtered = list.filter((t) => t.id !== req.params.id);
  store.savedTactics.set(userId, filtered);
  res.json({ success: true });
});
apiRouter.post("/privacy/delete-request", (req, res) => {
  const parseResult = privacyDeletionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request", details: parseResult.error.format() });
    return;
  }
  const { email, reason } = parseResult.data;
  const requestId = "DEL-" + crypto2.randomInt(1e5, 999999);
  store.deletionRequests.set(requestId, {
    email,
    date: (/* @__PURE__ */ new Date()).toISOString(),
    reason
  });
  res.json({
    success: true,
    requestId,
    message: "Your data deletion request has been registered. All personal identifiers, meeting records, and cached credentials associated with this email will be purged in accordance with our data retention schedule within 30 days."
  });
});
apiRouter.post("/contact", (req, res) => {
  const parseResult = contactSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid contact form data", details: parseResult.error.format() });
    return;
  }
  const { name, email, category, subject, message, honeypot } = parseResult.data;
  if (honeypot && honeypot.length > 0) {
    res.status(400).json({ error: "Spam detected" });
    return;
  }
  const ticketId = "DFC-TICKET-" + crypto2.randomInt(1e4, 99999);
  console.log(`[Dream FC Support] New inquiry ${ticketId} from ${name} (${email}) - Category: ${category}`);
  res.json({
    success: true,
    ticketId,
    message: "Your inquiry has been routed to tactical support. We will respond within 1 business day."
  });
});

// src/server/app.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
function createApp() {
  const app2 = express();
  app2.use(express.json({ limit: "1mb" }));
  app2.use(cookieParser());
  app2.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(self), microphone=(self), display-capture=(self)"
    );
    next();
  });
  try {
    const publicPath = path2.resolve(process.cwd(), "public");
    app2.use(express.static(publicPath));
  } catch {
  }
  app2.use("/api", apiRouter);
  app2.use(apiRouter);
  const healthHandler = async (_req, res) => {
    let dbStatus = { configured: false, ready: false };
    try {
      if (isSupabaseConfigured()) {
        const verify = await verifySupabaseTables();
        dbStatus = {
          configured: true,
          ready: verify.ok,
          message: verify.message,
          migrationFile: "migrations/000_complete_supabase_setup.sql"
        };
      }
    } catch (e) {
      dbStatus = { configured: true, ready: false, error: e?.message };
    }
    res.json({
      status: "ok",
      service: "Dream FC Tactical Zone API",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      platform: process.env.VERCEL ? "vercel-serverless" : "node-server",
      database: dbStatus
    });
  };
  app2.get("/api/health", healthHandler);
  app2.get("/health", healthHandler);
  app2.all(["/api/*", "/meetings", "/meetings/*"], (_req, res) => {
    res.status(404).json({ error: "API endpoint not found", code: "ENDPOINT_NOT_FOUND" });
  });
  app2.use((err, _req, res, _next) => {
    console.error("[Express Global Error]:", err);
    res.status(err.status || 500).json({
      error: err?.message || "Internal server error occurred",
      code: err?.code || "INTERNAL_SERVER_ERROR",
      status: err?.status || 500
    });
  });
  return app2;
}
var app = createApp();
var app_default = app;

// api/serverless.ts
function handler(req, res) {
  return new Promise((resolve) => {
    try {
      if (req && req.url) {
        let rawUrl = req.url;
        if (rawUrl.includes("__path=")) {
          const match = rawUrl.match(/[?&]__path=([^&#]+)/);
          if (match && match[1]) {
            const subpath = decodeURIComponent(match[1]);
            req.url = subpath.startsWith("/") ? `/api${subpath}` : `/api/${subpath}`;
          }
        } else if (req.query?.__path) {
          const p = Array.isArray(req.query.__path) ? req.query.__path.join("/") : req.query.__path;
          req.url = p.startsWith("/") ? `/api${p}` : `/api/${p}`;
        } else if (req.query?.slug) {
          const p = Array.isArray(req.query.slug) ? req.query.slug.join("/") : req.query.slug;
          req.url = p.startsWith("/") ? `/api${p}` : `/api/${p}`;
        } else if (req.headers?.["x-matched-path"] && typeof req.headers["x-matched-path"] === "string") {
          req.url = req.headers["x-matched-path"];
        }
        if (req.url && !req.url.startsWith("/")) {
          req.url = `/${req.url}`;
        }
      }
      res.on("finish", () => resolve(true));
      res.on("close", () => resolve(true));
      res.on("error", (err) => {
        console.error("[Vercel Serverless Error] res stream error:", err);
        resolve(true);
      });
      app_default(req, res);
    } catch (handlerErr) {
      console.error("[Vercel Serverless Error] Uncaught handler error:", handlerErr);
      if (!res.headersSent) {
        res.status(500).json({
          error: handlerErr?.message || "Serverless invocation error",
          code: "SERVERLESS_FUNCTION_ERROR",
          details: String(handlerErr?.stack || handlerErr)
        });
      }
      resolve(true);
    }
  });
}
export {
  handler as default
};
