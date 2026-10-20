import { z } from 'zod';

export const createMeetingSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120, 'Title cannot exceed 120 characters'),
  hostName: z.string().trim().min(2, 'Host name must be at least 2 characters').max(60, 'Host name cannot exceed 60 characters'),
  teamLabel: z.string().trim().max(60).optional().default('Dream FC'),
  maxParticipants: z.number().int().min(2).max(50).optional().default(25),
  boardPermissionMode: z.enum(['coach_only', 'open_collaboration', 'host_assigned']).optional().default('coach_only'),
  lobbyEnabled: z.boolean().optional().default(false),
  allowChat: z.boolean().optional().default(true),
});

export const joinMeetingSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,64}$/, 'Invalid meeting code or ID format'),
  passcode: z.string().trim().min(4, 'Passcode must be at least 4 characters').max(64),
  displayName: z.string().trim().min(2, 'Display name must be at least 2 characters').max(60),
  role: z.enum(['player', 'collaborator', 'analyst']).optional().default('player'),
});

export const boardOperationSchema = z.object({
  type: z.enum(['move_player', 'move_ball', 'set_formation', 'add_path', 'clear_paths', 'reset_board']),
  payload: z.record(z.string(), z.any()),
  clientRevision: z.number().int().nonnegative().optional(),
});

export const moderationSchema = z.object({
  action: z.enum(['admit', 'deny', 'remove', 'mute', 'unmute', 'grant_board_edit', 'revoke_board_edit']),
  targetParticipantId: z.string().min(1),
});

export const chatMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(500, 'Message cannot exceed 500 characters'),
  senderName: z.string().trim().min(1).max(60).optional(),
  senderId: z.string().min(1).optional(),
});

export const savedTacticSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(100),
  formation_type: z.string().max(20).default('4-3-3'),
  field_type: z.string().max(30).default('full_pitch'),
  board_state: z.record(z.string(), z.any()),
  notes: z.string().max(1000).optional(),
});

export const privacyDeletionSchema = z.object({
  email: z.string().trim().email('Valid email required for deletion request confirmation'),
  reason: z.string().max(500).optional(),
  confirmConsent: z.boolean().refine((val) => val === true, 'Explicit deletion confirmation required'),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  email: z.string().trim().email('Valid email required'),
  category: z.string().max(40).default('technical'),
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(100),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(1000),
  honeypot: z.string().max(0, 'Bot detected').optional().or(z.literal('')),
});
