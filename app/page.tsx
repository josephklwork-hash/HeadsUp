"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { GAME_CONFIG, BASE_SB, BASE_BB } from './gameConfig';
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

import { MultiplayerHost } from "./multiplayerHost";
import { MultiplayerJoiner } from "./multiplayerJoiner";
import type { HostState, GameAction } from "./multiplayerHost";
import DailyVideoCall from './components/DailyVideoCall';

export const dynamic = 'force-dynamic';  // ← THIS LINE

/* ---------- types ---------- */

type Role = "student" | "professional";

type Screen =
  | "role"
  | "studentProfile"
  | "studentLogin"
  | "oauthProfileCompletion"
  | "dashboard"
  | "professionalDashboard"
  | "editProfile"
  | "connections"
  | "about"
  | "game";

type Seat = "top" | "bottom";

type Card = {
  rank: string;
  suit: string;
};

type Street = 0 | 3 | 4 | 5;
type StreetName = "Preflop" | "Flop" | "Turn" | "River";

type GameState = {
  stacks: { top: number; bottom: number };
  bets: { top: number; bottom: number }; // chips currently in front (this street)
  pot: number; // chips already pulled into pot from prior streets
};

type HandStatus = "playing" | "ended";
type HandEndReason = "fold" | "showdown" | null;

type HandResult = {
  status: HandStatus;
  winner: Seat | "tie" | null;
  reason: HandEndReason;
  message: string;
  potWon: number;
};

type ActionLogItem = {
  id: string;
  sequence: number;
  street: StreetName;
  seat: Seat;
  text: string;
};

type HandLogSnapshot = {
  handNo: number;
  dealer: Seat;
  endedStreet: Street;
  endedBoard: Card[];
  log: ActionLogItem[];

  heroPos: "SB" | "BB";
  oppPos: "SB" | "BB";

  heroCards: [Card, Card];
  oppCards: [Card, Card];

  // true only if player actually showed / was required to show
  heroShown: boolean;
  oppShown: boolean;

  heroStartStack: number;
  oppStartStack: number;

  // Hand ranks for display in history
  heroHandRank: string | null;
  oppHandRank: string | null;
  
  // Best 5-card hands
  heroBest5?: Card[];
  oppBest5?: Card[];
  heroHandDesc?: string;
  oppHandDesc?: string;
};

type AuthoritativeState = {
  street: Street;
  toAct: Seat;

  actionLog: ActionLogItem[];
  handResult: HandResult;

  gameOver: boolean;
  endedBoardSnapshot: Street;

  lastAggressor: Seat | null;
  actionsThisStreet: number;
  lastToActAfterAggro: Seat | null;
  sawCallThisStreet: boolean;
  lastRaiseSize: number;
  checked: { top: boolean; bottom: boolean };

  showdownFirst: Seat | null;
  oppRevealed: boolean;
  youMucked: boolean;
  streetBettor: Seat | null;
  canShowTop: boolean;
  canShowBottom: boolean;
  topShowed: boolean;
  bottomShowed: boolean;
};

/* ---------- constants ---------- */

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["♠", "♥", "♦", "♣"];

// Game configuration imported from shared gameConfig.ts file
// To change game settings, edit gameConfig.ts
const STARTING_STACK_BB = GAME_CONFIG.STARTING_STACK_BB;

/* ---------- helpers ---------- */

function drawUniqueCards(count: number): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck.slice(0, count);
}

function roundToHundredth(n: number) {
  return Math.round(n * 100) / 100;
}

function formatBB(value: number | "") {
  if (value === "") return "";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function toTitleCase(str: string): string {
  if (!str) return str;
  const minorWords = ['of', 'the', 'and', 'in', 'on', 'at', 'to', 'for', 'a', 'an'];
  return str
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      // Handle hyphenated words - capitalize each part (e.g., "kim-lee" -> "Kim-Lee")
      if (word.includes('-')) {
        return word
          .split('-')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join('-');
      }
      // Always capitalize first word, otherwise check if it's a minor word
      if (index === 0 || !minorWords.includes(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

/* ============================================
   SECURITY MODULE - OWASP Best Practices
   ============================================
   This module provides:
   - Input validation & sanitization
   - Rate limiting utilities
   - Schema-based validation
   - XSS prevention
   ============================================ */

// --------------------------------------------
// RATE LIMITING CONFIGURATION
// --------------------------------------------
const RATE_LIMITS = {
  // Auth operations (prevent brute force)
  LOGIN: { maxAttempts: 5, windowMs: 60000, lockoutMs: 300000 },      // 5 attempts/min, 5min lockout
  SIGNUP: { maxAttempts: 3, windowMs: 60000, lockoutMs: 600000 },     // 3 attempts/min, 10min lockout
  PIN_JOIN: { maxAttempts: 5, windowMs: 60000, lockoutMs: 60000 },    // 5 attempts/min, 1min lockout
  
  // Data operations (prevent spam/abuse)
  GAME_CREATE: { maxAttempts: 10, windowMs: 3600000, lockoutMs: 0 },  // 10/hour (handled by SQL)
  MESSAGE_SEND: { maxAttempts: 30, windowMs: 60000, lockoutMs: 30000 }, // 30/min, 30s lockout
  CONNECTION_REQUEST: { maxAttempts: 20, windowMs: 3600000, lockoutMs: 0 }, // 20/hour
} as const;

type RateLimitKey = keyof typeof RATE_LIMITS;

// In-memory rate limit tracking (resets on page refresh - for client-side protection)
// Server-side RLS provides the real protection
const rateLimitStore: Record<string, { attempts: number; firstAttempt: number; lockedUntil: number }> = {};

/**
 * Check if an action is rate limited
 * @returns { allowed: boolean, remainingAttempts: number, retryAfter: number }
 */
function checkRateLimit(key: RateLimitKey, identifier: string = 'default'): { 
  allowed: boolean; 
  remainingAttempts: number; 
  retryAfter: number;
  message: string;
} {
  const config = RATE_LIMITS[key];
  const storeKey = `${key}:${identifier}`;
  const now = Date.now();
  
  // Initialize or get existing record
  if (!rateLimitStore[storeKey]) {
    rateLimitStore[storeKey] = { attempts: 0, firstAttempt: now, lockedUntil: 0 };
  }
  
  const record = rateLimitStore[storeKey];
  
  // Check if currently locked out
  if (record.lockedUntil > now) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfter,
      message: `Too many attempts. Please try again in ${retryAfter} seconds.`
    };
  }
  
  // Reset window if expired
  if (now - record.firstAttempt > config.windowMs) {
    record.attempts = 0;
    record.firstAttempt = now;
  }
  
  // Check if over limit
  if (record.attempts >= config.maxAttempts) {
    record.lockedUntil = now + config.lockoutMs;
    const retryAfter = Math.ceil(config.lockoutMs / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfter,
      message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`
    };
  }
  
  return {
    allowed: true,
    remainingAttempts: config.maxAttempts - record.attempts,
    retryAfter: 0,
    message: ''
  };
}

/**
 * Record an attempt for rate limiting
 */
function recordRateLimitAttempt(key: RateLimitKey, identifier: string = 'default'): void {
  const storeKey = `${key}:${identifier}`;
  if (!rateLimitStore[storeKey]) {
    rateLimitStore[storeKey] = { attempts: 0, firstAttempt: Date.now(), lockedUntil: 0 };
  }
  rateLimitStore[storeKey].attempts++;
}

/**
 * Reset rate limit (e.g., after successful login)
 */
function resetRateLimit(key: RateLimitKey, identifier: string = 'default'): void {
  const storeKey = `${key}:${identifier}`;
  delete rateLimitStore[storeKey];
}

// --------------------------------------------
// INPUT VALIDATION SCHEMAS
// --------------------------------------------
const VALIDATION_SCHEMAS = {
  email: {
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    maxLength: 254,
    minLength: 5,
    errorMessage: 'Please enter a valid email address'
  },
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: false,
    errorMessage: 'Password must be at least 8 characters with uppercase, lowercase, and number'
  },
  name: {
    pattern: /^[a-zA-Z\s'-]+$/,
    maxLength: 50,
    minLength: 1,
    errorMessage: 'Name can only contain letters, spaces, hyphens, and apostrophes'
  },
  linkedinUrl: {
    pattern: /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[\w-]+(\/)?(\?.*)?$/i,
    maxLength: 200,
    minLength: 0, // Optional
    errorMessage: 'Please enter a valid LinkedIn URL (e.g., https://linkedin.com/in/yourname)'
  },
  gamePin: {
    pattern: /^\d{4}$/,
    maxLength: 4,
    minLength: 4,
    errorMessage: 'PIN must be exactly 4 digits'
  },
  message: {
    maxLength: 2000,
    minLength: 1,
    errorMessage: 'Message must be between 1 and 2000 characters'
  },
  generalText: {
    maxLength: 200,
    minLength: 0,
    errorMessage: 'Text exceeds maximum length'
  }
} as const;

type ValidationSchemaKey = keyof typeof VALIDATION_SCHEMAS;

/**
 * Validate input against a schema
 * @returns { valid: boolean, sanitized: string, error: string }
 */
function validateInput(
  value: string, 
  schemaKey: ValidationSchemaKey,
  options?: { required?: boolean }
): { valid: boolean; sanitized: string; error: string } {
  const schema = VALIDATION_SCHEMAS[schemaKey];
  const required = options?.required ?? false;
  
  // Handle empty values
  if (!value || value.trim() === '') {
    if (required) {
      return { valid: false, sanitized: '', error: 'This field is required' };
    }
    return { valid: true, sanitized: '', error: '' };
  }
  
  // Sanitize: trim whitespace, remove null bytes, strip HTML tags
  let sanitized = value
    .trim()
    .replace(/\0/g, '')           // Remove null bytes
    .replace(/<[^>]*>/g, '')      // Strip HTML tags
    .replace(/[<>]/g, '')         // Remove remaining angle brackets
    .slice(0, schema.maxLength);  // Enforce max length
  
  // Check minimum length
  if ('minLength' in schema && sanitized.length < schema.minLength) {
    return { 
      valid: false, 
      sanitized, 
      error: schema.errorMessage 
    };
  }
  
  // Check pattern if exists
  if ('pattern' in schema && schema.pattern && !schema.pattern.test(sanitized)) {
    return { 
      valid: false, 
      sanitized, 
      error: schema.errorMessage 
    };
  }
  
  return { valid: true, sanitized, error: '' };
}

/**
 * Validate password with detailed requirements
 */
function validatePassword(password: string): { 
  valid: boolean; 
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
} {
  const errors: string[] = [];
  const schema = VALIDATION_SCHEMAS.password;
  
  if (password.length < schema.minLength) {
    errors.push(`Password must be at least ${schema.minLength} characters`);
  }
  if (password.length > schema.maxLength) {
    errors.push(`Password must be less than ${schema.maxLength} characters`);
  }
  if (schema.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (schema.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  }
  if (schema.requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain a number');
  }
  if (schema.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain a special character');
  }
  
  // Calculate strength
  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  if (errors.length === 0) {
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const isLong = password.length >= 12;
    if (hasSpecial && isLong) {
      strength = 'strong';
    } else if (hasSpecial || isLong) {
      strength = 'medium';
    } else {
      strength = 'medium';
    }
  }
  
  return { valid: errors.length === 0, errors, strength };
}

/**
 * Validate email format with strict validation
 */
function validateEmail(email: string): { valid: boolean; sanitized: string; error: string } {
  const result = validateInput(email, 'email', { required: true });
  if (!result.valid) return result;
  
  const sanitized = result.sanitized.toLowerCase();
  const [localPart, domain] = sanitized.split('@');
  
  // Require at least 3 characters before @
  if (!localPart || localPart.length < 3) {
    return { valid: false, sanitized, error: 'Please enter a valid email address' };
  }
  
  // Block common fake/test domains
  const blockedDomains = [
    'a.com', 'b.com', 'c.com', 'test.com', 'fake.com', 'example.com',
    'asdf.com', 'qwerty.com', 'temp.com', 'trash.com', 'junk.com',
    'aa.com', 'ab.com', 'abc.com', 'xyz.com', 'aaa.com', 'bbb.com',
    'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.com',
    '10minutemail.com', 'fakeinbox.com', 'trashmail.com'
  ];
  
  if (!domain || blockedDomains.includes(domain)) {
    return { valid: false, sanitized, error: 'Please use a valid email address (no temporary or fake emails)' };
  }
  
  // Require domain to have at least 4 characters (e.g., a.co)
  if (domain.length < 4) {
    return { valid: false, sanitized, error: 'Please enter a valid email address' };
  }
  
  return { valid: true, sanitized, error: '' };
}

/**
 * Sanitize and validate a profile object
 * Rejects unexpected fields (defense against mass assignment)
 */
function validateProfileData(data: Record<string, unknown>): {
  valid: boolean;
  sanitized: Record<string, string>;
  errors: Record<string, string>;
} {
  const allowedFields = ['firstName', 'lastName', 'email', 'year', 'major', 'school', 'company', 'workTitle', 'linkedinUrl'];
  const sanitized: Record<string, string> = {};
  const errors: Record<string, string> = {};
  
  // Reject unexpected fields
  for (const key of Object.keys(data)) {
    if (!allowedFields.includes(key)) {
      errors[key] = `Unexpected field: ${key}`;
    }
  }
  
  // Validate each allowed field
  const fieldValidations: Record<string, { schema: ValidationSchemaKey; required: boolean }> = {
    firstName: { schema: 'name', required: true },
    lastName: { schema: 'name', required: true },
    email: { schema: 'email', required: true },
    year: { schema: 'generalText', required: false },
    major: { schema: 'generalText', required: false },
    school: { schema: 'generalText', required: false },
    company: { schema: 'generalText', required: false },
    workTitle: { schema: 'generalText', required: false },
    linkedinUrl: { schema: 'linkedinUrl', required: false },
  };
  
  for (const [field, config] of Object.entries(fieldValidations)) {
    const value = data[field];
    if (typeof value === 'string' || value === undefined || value === null) {
      const result = validateInput(String(value || ''), config.schema, { required: config.required });
      sanitized[field] = result.sanitized;
      if (!result.valid) {
        errors[field] = result.error;
      }
    } else {
      errors[field] = 'Invalid type: expected string';
    }
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    sanitized,
    errors
  };
}

/**
 * Validate message content
 */
function validateMessage(text: string): { valid: boolean; sanitized: string; error: string } {
  if (!text || text.trim() === '') {
    return { valid: false, sanitized: '', error: 'Message cannot be empty' };
  }
  
  const result = validateInput(text, 'message', { required: true });
  
  // Additional XSS prevention for messages
  result.sanitized = result.sanitized
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/data:/gi, '');
  
  return result;
}

/* ============================================
   END SECURITY MODULE
   ============================================ */

// Helper to get sort priority for dashboard ordering
// A=0: Accept/Reject (incoming), B=1: Connected, C=2: Pending (outgoing), D=3: Connect (no relation)
function getConnectionSortPriority(
  userId: string,
  myConnections: Set<string>,
  pendingOutgoing: Set<string>,
  pendingIncoming: Map<string, { id: string; createdAt: string }>
): number {
  if (pendingIncoming.has(userId)) return 0; // A - Accept/Reject
  if (myConnections.has(userId)) return 1;   // B - Connected
  if (pendingOutgoing.has(userId)) return 2; // C - Pending
  return 3;                                   // D - Connect
}

function streetNameFromCount(street: Street): StreetName {
  if (street === 0) return "Preflop";
  if (street === 3) return "Flop";
  if (street === 4) return "Turn";
  return "River";
}

/* ---------- input validation helpers ---------- */
// NOTE: Validation functions are now in the SECURITY MODULE above (lines 157-493)
// Using: validatePassword, validateEmail, validateInput, validateProfileData, validateMessage
// Old functions (isValidLinkedInUrl, sanitizeInput, isStrongPassword) have been removed

/* ---------- simple poker evaluator (7-card) ---------- */

const RANK_TO_VALUE: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

function compareScore(a: number[], b: number[]) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function getStraightHigh(valuesUniqueDesc: number[]) {
  const vals = [...valuesUniqueDesc];
  if (vals[0] === 14) vals.push(1); // wheel

  let run = 1;
  for (let i = 0; i < vals.length - 1; i++) {
    if (vals[i] - 1 === vals[i + 1]) {
      run++;
      if (run >= 5) {
        const high = vals[i - 3];
        return high === 1 ? 5 : high;
      }
    } else {
      run = 1;
    }
  }
  return null;
}

function evaluate7(cards: Card[]) {
  const values = cards.map((c) => RANK_TO_VALUE[c.rank]).sort((a, b) => b - a);

  const counts = new Map<number, number>();
  const suits = new Map<string, number[]>();

  for (const c of cards) {
    const v = RANK_TO_VALUE[c.rank];
    counts.set(v, (counts.get(v) ?? 0) + 1);
    const arr = suits.get(c.suit) ?? [];
    arr.push(v);
    suits.set(c.suit, arr);
  }

  const groups = Array.from(counts.entries())
    .map(([v, cnt]) => ({ v, cnt }))
    .sort((a, b) => (b.cnt !== a.cnt ? b.cnt - a.cnt : b.v - a.v));

  // Flush?
  let flushSuit: string | null = null;
  let flushValsDesc: number[] = [];
  for (const [s, vals] of suits.entries()) {
    if (vals.length >= 5) {
      const sorted = vals.slice().sort((a, b) => b - a);
      if (!flushSuit || compareScore(sorted, flushValsDesc) > 0) {
        flushSuit = s;
        flushValsDesc = sorted;
      }
    }
  }

  const uniqueDesc = Array.from(new Set(values)).sort((a, b) => b - a);
  const straightHigh = getStraightHigh(uniqueDesc);

  // Straight flush
  if (flushSuit) {
    const fvUnique = Array.from(new Set(flushValsDesc)).sort((a, b) => b - a);
    const sfHigh = getStraightHigh(fvUnique);
    if (sfHigh !== null) return [8, sfHigh];
  }

  // Quads
  if (groups[0]?.cnt === 4) {
    const quad = groups[0].v;
    const kicker = uniqueDesc.find((v) => v !== quad) ?? 0;
    return [7, quad, kicker];
  }

  // Full house
  if (groups[0]?.cnt === 3) {
    const trips = groups[0].v;
    const pairCandidate = groups.find((g) => g.v !== trips && g.cnt >= 2);
    if (pairCandidate) return [6, trips, pairCandidate.v];
  }

  // Flush
  if (flushSuit) return [5, ...flushValsDesc.slice(0, 5)];

  // Straight
  if (straightHigh !== null) return [4, straightHigh];

  // Trips
  if (groups[0]?.cnt === 3) {
    const trips = groups[0].v;
    const kickers = uniqueDesc.filter((v) => v !== trips).slice(0, 2);
    return [3, trips, ...kickers];
  }

  // Two pair
  if (groups[0]?.cnt === 2) {
    const pairs = groups.filter((g) => g.cnt === 2).map((g) => g.v);
    if (pairs.length >= 2) {
      const sorted = pairs.sort((a, b) => b - a);
      const highPair = sorted[0];
      const lowPair = sorted[1];
      const kicker = uniqueDesc.find((v) => v !== highPair && v !== lowPair) ?? 0;
      return [2, highPair, lowPair, kicker];
    }
  }

  // One pair
  if (groups[0]?.cnt === 2) {
    const pair = groups[0].v;
    const kickers = uniqueDesc.filter((v) => v !== pair).slice(0, 3);
    return [1, pair, ...kickers];
  }

  // High card
  return [0, ...uniqueDesc.slice(0, 5)];
}

const VALUE_TO_NAME: Record<number, string> = {
  14: "Ace",
  13: "King",
  12: "Queen",
  11: "Jack",
  10: "Ten",
  9: "Nine",
  8: "Eight",
  7: "Seven",
  6: "Six",
  5: "Five",
  4: "Four",
  3: "Three",
  2: "Two",
};

function pluralRank(v: number) {
  const name = VALUE_TO_NAME[v] ?? String(v);
  // simple plural for poker ranks
  if (name === "Six") return "Sixes";
  return name + "s";
}

function cardStr(c: Card) {
  return `${c.rank}${c.suit}`;
}

function handDesc(score: number[]) {
  const cat = score[0];

  // score formats from your evaluator:
  // 8: [8, sfHigh]
  // 7: [7, quad, kicker]
  // 6: [6, trips, pair]
  // 5: [5, v1, v2, v3, v4, v5] (flush high cards)
  // 4: [4, straightHigh]
  // 3: [3, trips, k1, k2]
  // 2: [2, highPair, lowPair, kicker]
  // 1: [1, pair, k1, k2, k3]
  // 0: [0, h1, h2, h3, h4, h5]

  if (cat === 8) return `Straight Flush, ${VALUE_TO_NAME[score[1]]}-high`;
  if (cat === 7) return `Four of a Kind, ${pluralRank(score[1])} (kicker ${VALUE_TO_NAME[score[2]]})`;
  if (cat === 6) return `Full House, ${pluralRank(score[1])} full of ${pluralRank(score[2])}`;
  if (cat === 5) return `Flush, ${VALUE_TO_NAME[score[1]]}-high`;
  if (cat === 4) return `Straight, ${VALUE_TO_NAME[score[1]]}-high`;
  if (cat === 3) return `Three of a Kind, ${pluralRank(score[1])} (kicker ${VALUE_TO_NAME[score[2]]})`;
  if (cat === 2)
    return `Two Pair, ${pluralRank(score[1])} and ${pluralRank(score[2])} (kicker ${VALUE_TO_NAME[score[3]]})`;
  if (cat === 1) return `One Pair, ${pluralRank(score[1])} (kicker ${VALUE_TO_NAME[score[2]]})`;

  // high card
  return `High Card, ${VALUE_TO_NAME[score[1]]} (kicker ${VALUE_TO_NAME[score[2]]})`;
}

function handRankOnly(score: number[]) {
  switch (score[0]) {
    case 8: return "Straight Flush";
    case 7: return "Four of a Kind";
    case 6: return "Full House";
    case 5: return "Flush";
    case 4: return "Straight";
    case 3: return "Three of a Kind";
    case 2: return "Two Pair";
    case 1: return "One Pair";
    default: return "High Card";
  }
}

const connectButtonClass =
  "rounded-xl border border-black bg-white px-3 py-1 text-sm font-semibold text-black transition-all duration-300 hover:bg-gray-50 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(0,0,0,0.15)]";

/* ---------- UI components ---------- */

const SUIT_COLOR: Record<string, string> = {
  "♠": "text-black",
  "♥": "text-red-600",
  "♦": "text-blue-600",
  "♣": "text-green-600",
};

function CardTile({ card }: { card: Card }) {
  const colorClass = SUIT_COLOR[card.suit];
  return (
    <div className="relative h-24 w-16 rounded-xl border bg-white shadow-sm">
      <div className={`absolute left-3 top-2 text-4xl font-extrabold ${colorClass}`}>
  {card.rank}
</div>
      <div className={`absolute bottom-3 right-3 text-4xl font-bold ${colorClass}`}>
  {card.suit}
</div>
    </div>
  );
}

function renderActionText(text: string) {
  return text.split(/([♠♥♦♣])/).map((part, i) => {
    const suitClass = SUIT_COLOR[part];

    if (suitClass) {
      // Thin, crisp outline (no blur). Webkit stroke gives a continuous outline (great in Safari),
      // and 8-direction text-shadow helps fill tiny gaps on sharp tips.
      const outlineStyle: React.CSSProperties = {
        WebkitTextStroke: "0.45px #fff",
textShadow: `
  -0.45px  0px   0 #fff,
   0.45px  0px   0 #fff,
   0px   -0.45px 0 #fff,
   0px    0.45px 0 #fff,
  -0.45px -0.45px 0 #fff,
   0.45px -0.45px 0 #fff,
  -0.45px  0.45px 0 #fff,
   0.45px  0.45px 0 #fff
`,
      };

      return (
        <span key={i} className={suitClass} style={outlineStyle}>
          {part}
        </span>
      );
    }

    return <span key={i}>{part}</span>;
  });
}

function CardBack() {
  return (
    <div className="relative h-24 w-16 rounded-xl border bg-white shadow-sm">
      <div className="absolute inset-2 rounded-lg border border-dashed opacity-40" />
    </div>
  );
}

function BetChip({ amount, label }: { amount: number; label?: string }) {
  if (amount <= 0) return null;
  return (
    <div className="flex h-9 w-9 flex-col items-center justify-center rounded-full border bg-white text-black shadow-sm">
      <div className="text-[11px] font-bold leading-none tabular-nums">
        {formatBB(amount)}
      </div>
      <div className="mt-[1px] text-[9px] font-semibold leading-none opacity-70">
        BB
      </div>
    </div>
  );
}

function ConfirmModal({
  open,
  title,
  message,
  cancelText = "Go back",
  confirmText = "Confirm",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-md min-[1536px]:max-[1650px]:max-w-[350px] rounded-3xl min-[1536px]:max-[1650px]:rounded-2xl border border-gray-300 bg-gray-100 p-6 min-[1536px]:max-[1650px]:p-4 shadow-lg">
        <h3 className="mb-2 text-lg min-[1536px]:max-[1650px]:text-base font-bold text-gray-900">{title}</h3>
        <p className="mb-6 min-[1536px]:max-[1650px]:mb-4 text-sm min-[1536px]:max-[1650px]:text-xs text-gray-800">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onConfirm}
            className="rounded-2xl min-[1536px]:max-[1650px]:rounded-xl border px-4 py-2 min-[1536px]:max-[1650px]:px-3 min-[1536px]:max-[1650px]:py-1.5 text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-gray-900 transition-colors hover:bg-gray-200"
          >
            {confirmText}
          </button>
          <button
            onClick={onCancel}
            className="rounded-2xl min-[1536px]:max-[1650px]:rounded-xl border px-4 py-2 min-[1536px]:max-[1650px]:px-3 min-[1536px]:max-[1650px]:py-1.5 text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-gray-900 transition-colors hover:bg-gray-200"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ---------- main ---------- */

export default function Home() {
  const [seatedRole, setSeatedRole] = useState<Role | null>(null);

  const [handId, setHandId] = useState(0);
  const [gameSession, setGameSession] = useState(0);
  const [sbUser, setSbUser] = useState<User | null>(null);

const handNo = handId + 1; // 1-based

const SB = BASE_SB; // always 0.5
const BB = BASE_BB; // always 1

  const [auth, setAuth] = useState<AuthoritativeState>(() => ({
  street: 0,
  toAct: "bottom",

  actionLog: [],
  handResult: { status: "playing", winner: null, reason: null, message: "", potWon: 0 },

  gameOver: false,
  endedBoardSnapshot: 0,

  lastAggressor: null,
  actionsThisStreet: 0,
  lastToActAfterAggro: null,
  sawCallThisStreet: false,
  lastRaiseSize: BB,
  checked: { top: false, bottom: false },

  showdownFirst: null,
  oppRevealed: false,
  youMucked: false,
  streetBettor: null,
  canShowTop: false,
  canShowBottom: false,
  topShowed: false,
  bottomShowed: false,
}));

const street = auth.street;
const setStreet = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    street: typeof next === "function" ? next(prev.street) : next,
  }));

const toAct = auth.toAct;
const setToAct = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    toAct: typeof next === "function" ? next(prev.toAct) : next,
  }));

const actionLog = auth.actionLog;
const setActionLog = (next: any) =>
  setAuth((prev) => {
    const value = typeof next === "function" ? next(prev.actionLog) : next;
    return { ...prev, actionLog: value };
  });

const handResult = auth.handResult;
const setHandResult = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    handResult: typeof next === "function" ? next(prev.handResult) : next,
  }));

const gameOver = auth.gameOver;
const setGameOver = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    gameOver: typeof next === "function" ? next(prev.gameOver) : next,
  }));

const endedBoardSnapshot = auth.endedBoardSnapshot;
const setEndedBoardSnapshot = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    endedBoardSnapshot:
      typeof next === "function" ? next(prev.endedBoardSnapshot) : next,
  }));

const lastAggressor = auth.lastAggressor;
const setLastAggressor = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    lastAggressor: typeof next === "function" ? next(prev.lastAggressor) : next,
  }));

const actionsThisStreet = auth.actionsThisStreet;
const setActionsThisStreet = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    actionsThisStreet:
      typeof next === "function" ? next(prev.actionsThisStreet) : next,
  }));

const lastToActAfterAggro = auth.lastToActAfterAggro;
const setLastToActAfterAggro = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    lastToActAfterAggro:
      typeof next === "function" ? next(prev.lastToActAfterAggro) : next,
  }));

const sawCallThisStreet = auth.sawCallThisStreet;
const setSawCallThisStreet = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    sawCallThisStreet:
      typeof next === "function" ? next(prev.sawCallThisStreet) : next,
  }));

const lastRaiseSize = auth.lastRaiseSize;
const setLastRaiseSize = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    lastRaiseSize:
      typeof next === "function" ? next(prev.lastRaiseSize) : next,
  }));

const checked = auth.checked;
const setChecked = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    checked: typeof next === "function" ? next(prev.checked) : next,
  }));

const showdownFirst = auth.showdownFirst;
const setShowdownFirst = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    showdownFirst:
      typeof next === "function" ? next(prev.showdownFirst) : next,
  }));

const oppRevealed = auth.oppRevealed;
const setOppRevealed = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    oppRevealed: typeof next === "function" ? next(prev.oppRevealed) : next,
  }));

const youMucked = auth.youMucked;
const setYouMucked = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    youMucked: typeof next === "function" ? next(prev.youMucked) : next,
  }));

const canShowTop = auth.canShowTop;
const setCanShowTop = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    canShowTop: typeof next === "function" ? next(prev.canShowTop) : next,
  }));

const canShowBottom = auth.canShowBottom;
const setCanShowBottom = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    canShowBottom: typeof next === "function" ? next(prev.canShowBottom) : next,
  }));

const topShowed = auth.topShowed;
const setTopShowed = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    topShowed: typeof next === "function" ? next(prev.topShowed) : next,
  }));

const bottomShowed = auth.bottomShowed;
const setBottomShowed = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    bottomShowed: typeof next === "function" ? next(prev.bottomShowed) : next,
  }));

const streetBettor = auth.streetBettor;
const setStreetBettor = (next: any) =>
  setAuth((prev) => ({
    ...prev,
    streetBettor:
      typeof next === "function" ? next(prev.streetBettor) : next,
  }));

  const [dealerOffset, setDealerOffset] = useState<0 | 1>(() => Math.random() < 0.5 ? 0 : 1);

  const [betSize, setBetSize] = useState<number | "">("");

  const [game, setGame] = useState<GameState>({
    stacks: { top: STARTING_STACK_BB, bottom: STARTING_STACK_BB },
    bets: { top: 0, bottom: 0 },
    pot: 0,
  });

  const [cards, setCards] = useState<Card[] | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showFoldConfirm, setShowFoldConfirm] = useState(false);
  const [showTitleScreenConfirm, setShowTitleScreenConfirm] = useState(false);
  const [showDashboardConfirm, setShowDashboardConfirm] = useState(false);
  const [opponentQuit, setOpponentQuit] = useState(false);
  const [opponentName, setOpponentName] = useState<string | null>(null);

  const [handLogHistory, setHandLogHistory] = useState<HandLogSnapshot[]>([]);
  const [logViewOffset, setLogViewOffset] = useState(0);

  const [screen, setScreen] = useState<Screen>(() => {
  if (typeof window !== 'undefined') {
    const saved = sessionStorage.getItem('headsup_screen');
    if (saved && ['role', 'studentProfile', 'studentLogin', 'oauthProfileCompletion', 'dashboard', 'professionalDashboard', 'editProfile', 'connections', 'game'].includes(saved)) {
      return saved as Screen;
    }
  }
  return "role";
});

  const [screenHistory, setScreenHistory] = useState<Screen[]>(["role"]);

  // Save screen to sessionStorage when it changes
useEffect(() => {
  if (screen) {
    sessionStorage.setItem('headsup_screen', screen);
  }
}, [screen]);

// Track navigation history for Go back functionality
const navigateTo = (newScreen: Screen) => {
  setScreenHistory(prev => [...prev, screen]);
  setScreen(newScreen);
};

const goBack = () => {
  setScreenHistory(prev => {
    if (prev.length === 0) {
      setScreen("role");
      return ["role"];
    }
    const newHistory = [...prev];
    const previousScreen = newHistory.pop() || "role";
    setScreen(previousScreen);
    return newHistory.length === 0 ? ["role"] : newHistory;
  });
};

  const [gamePin, setGamePin] = useState<string | null>(null);
  const [joinMode, setJoinMode] = useState(false);
  const [joinPinInput, setJoinPinInput] = useState("");
  const [isGuestBrowsing, setIsGuestBrowsing] = useState(false);

// Restore and save isGuestBrowsing to sessionStorage
useEffect(() => {
  const saved = sessionStorage.getItem('headsup_isGuestBrowsing');
  if (saved === 'true') {
    setIsGuestBrowsing(true);
  }
}, []);

useEffect(() => {
  sessionStorage.setItem('headsup_isGuestBrowsing', String(isGuestBrowsing));
}, [isGuestBrowsing]);
  const [showFounderConnectModal, setShowFounderConnectModal] = useState(false);
  const [founderConnectForm, setFounderConnectForm] = useState({ name: '', email: '' });
  const [founderConnectSubmitting, setFounderConnectSubmitting] = useState(false);
  const [founderConnectSent, setFounderConnectSent] = useState(false);

// Your user ID (founder) - guests can connect with you
const FOUNDER_ID = 'cec95997-2f5d-4836-8fc0-c4978d0ca231';
  const [creatingGame, setCreatingGame] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [editProfileReturnScreen, setEditProfileReturnScreen] = useState<Screen>("role");
  const [pinLockoutUntil, setPinLockoutUntil] = useState<number | null>(null);
  const [isCreatingPin, setIsCreatingPin] = useState(false);

  const [gameId, setGameId] = useState<string | null>(null);
  const [mySeat, setMySeat] = useState<Seat>("bottom");
  const [multiplayerActive, setMultiplayerActive] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(true);
  const [savedHostState, setSavedHostState] = useState<HostState | null>(null);

  // Video call state
  const [dailyRoomUrl, setDailyRoomUrl] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [videoCallActive, setVideoCallActive] = useState(false);
  const [roomCreationError, setRoomCreationError] = useState<string | null>(null);

  // Store the multiplayer controllers
const [mpHost, setMpHost] = useState<MultiplayerHost | null>(null);
const [mpJoiner, setMpJoiner] = useState<MultiplayerJoiner | null>(null);

// Refs for accessing controllers in callbacks (avoids stale closures)
const mpHostRef = useRef<MultiplayerHost | null>(null);
const mpJoinerRef = useRef<MultiplayerJoiner | null>(null);

// Prevent rapid successive button clicks (fixes auto-check bug)
const [actionInProgress, setActionInProgress] = useState(false);

// Store the multiplayer state (received from host or from local host controller)
const [mpState, setMpState] = useState<HostState | null>(null);

    const isHost = mySeat === "bottom";
  const suppressMpRef = useRef(false);
  const mpChannelRef = useRef<any>(null);

  function applyActionFromSeat(seat: Seat, action: GameAction) {
    // remote actions must bypass local click gating
    if (handResult.status !== "playing") return;
    if (gameOverRef.current) return;

    switch (action.type) {
      case "FOLD":
        actFold(seat);
        return;
      case "CHECK":
        actCheck(seat);
        return;
      case "CALL":
        actCall(seat);
        return;
      case "BET_RAISE_TO":
        actBetRaiseTo(seat, action.to);
        return;
      default:
        return;
    }
  }

  function applyRemoteDeal(nextCards: Card[]) {
    suppressMpRef.current = true;
    setCards(nextCards);
    suppressMpRef.current = false;
  }

const [playAgainRequested, setPlayAgainRequested] = useState(false);
const [opponentWantsPlayAgain, setOpponentWantsPlayAgain] = useState(false);

const [aiEnabled, setAiEnabled] = useState(false);

useEffect(() => {
  if (gamePin) {
    setAiEnabled(false);
  }
}, [gamePin]);

// Track which hand we've already animated to prevent duplicate animations
const lastAnimatedHandRef = useRef<number>(-1);

// Card dealing animation state
const [dealtCards, setDealtCards] = useState<{
  sbCard1: boolean;
  bbCard1: boolean;
  sbCard2: boolean;
  bbCard2: boolean;
  flop1: boolean;
  flop2: boolean;
  flop3: boolean;
  turn: boolean;
  river: boolean;
}>({
  sbCard1: false,
  bbCard1: false,
  sbCard2: false,
  bbCard2: false,
  flop1: false,
  flop2: false,
  flop3: false,
  turn: false,
  river: false,
});

// Track when river animation + 1s delay is complete
const [riverAnimationComplete, setRiverAnimationComplete] = useState(false);

// Card flip animation state for reveals
const [flippedCards, setFlippedCards] = useState<{
  oppCard1: boolean;
  oppCard2: boolean;
  myCard1: boolean;
  myCard2: boolean;
}>({
  oppCard1: false,
  oppCard2: false,
  myCard1: false,
  myCard2: false,
});

// Win animation state
const [showWinAnimation, setShowWinAnimation] = useState<'hero' | 'opponent' | null>(null);
const [winAmount, setWinAmount] = useState<number>(0);

// Betting animations
const [chipsToPot, setChipsToPot] = useState<{ id: string; from: 'hero' | 'opponent'; amount: number }[]>([]);
const [actionFlashes, setActionFlashes] = useState<{ id: string; seat: 'hero' | 'opponent'; text: string }[]>([]);
const [potToWinner, setPotToWinner] = useState<{ id: string; target: 'hero' | 'opponent'; amount: number } | null>(null);
const prevActionLogLenRef = useRef(0);

// Dynamic table zoom — fits game to any screen size
const [tableScale, setTableScale] = useState(1);
useEffect(() => {
  function updateScale() {
    const ratio = window.innerWidth / 1440;
    // Square root curve: shrinks gently at small sizes instead of linearly
    const scale = Math.sqrt(ratio);
    setTableScale(Math.max(Math.min(scale, 1), 0.5));
  }
  updateScale();
  window.addEventListener('resize', updateScale);
  return () => window.removeEventListener('resize', updateScale);
}, []);

// Track which cards are visible (after dealing animation completes)
const [cardsVisible, setCardsVisible] = useState<{
  sbCard1: boolean;
  bbCard1: boolean;
  sbCard2: boolean;
  bbCard2: boolean;
}>({
  sbCard1: false,
  bbCard1: false,
  sbCard2: false,
  bbCard2: false,
});

// Trigger card dealing animations
useEffect(() => {
  // Check for cards in both local state (host) and multiplayer state (joiner)
  const hasCards = cards || (mpState?.cards);

  // Skip if we've already animated this hand
  if (lastAnimatedHandRef.current === handId) {
    return;
  }

  // Reset all animations for new hand
  setDealtCards({
    sbCard1: false,
    bbCard1: false,
    sbCard2: false,
    bbCard2: false,
    flop1: false,
    flop2: false,
    flop3: false,
    turn: false,
    river: false,
  });

  // Reset flip animations for new hand
  setFlippedCards({
    oppCard1: false,
    oppCard2: false,
    myCard1: false,
    myCard2: false,
  });

  // Reset cards visible state
  setCardsVisible({
    sbCard1: false,
    bbCard1: false,
    sbCard2: false,
    bbCard2: false,
  });

  if (!hasCards) {
    return;
  }

  // Mark this hand as animated
  lastAnimatedHandRef.current = handId;

  // Deal hole cards sequentially: SB card 1, BB card 1, SB card 2, BB card 2
  const dealHoleCards = async () => {
    // Start immediately
    setDealtCards(prev => ({ ...prev, sbCard1: true }));
    setCardsVisible(prev => ({ ...prev, sbCard1: true }));

    await new Promise(r => setTimeout(r, 100));
    setDealtCards(prev => ({ ...prev, bbCard1: true }));
    setCardsVisible(prev => ({ ...prev, bbCard1: true }));

    await new Promise(r => setTimeout(r, 100));
    setDealtCards(prev => ({ ...prev, sbCard2: true }));
    setCardsVisible(prev => ({ ...prev, sbCard2: true }));

    await new Promise(r => setTimeout(r, 100));
    setDealtCards(prev => ({ ...prev, bbCard2: true }));
    setCardsVisible(prev => ({ ...prev, bbCard2: true }));

    // After all dealing animations complete (400ms animation + slight buffer), remove animation classes
    await new Promise(r => setTimeout(r, 500));
    setDealtCards(prev => ({
      ...prev,
      sbCard1: false,
      bbCard1: false,
      sbCard2: false,
      bbCard2: false,
    }));
  };

  dealHoleCards();
}, [handId, cards, mpState?.cards]); // Trigger for both host and joiner

// Debug: Log dealtCards state changes

const [studentProfile, setStudentProfile] = useState({
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  year: "",
  major: "",
  school: "",
  company: "",
  workTitle: "",
  linkedinUrl: "",
});

const [loginEmail, setLoginEmail] = useState("");
const [loginPassword, setLoginPassword] = useState("");
const [showPassword, setShowPassword] = useState(false);
const [showLoginPassword, setShowLoginPassword] = useState(false);

const [studentMenuOpen, setStudentMenuOpen] = useState(false);
const [themeMenuOpen, setThemeMenuOpen] = useState(false);
const [selectedTheme, setSelectedTheme] = useState<string>("default");

const [otherStudents, setOtherStudents] = useState<{ id: string; firstName: string; lastName: string; year: string; major: string; school: string; linkedinUrl: string | null }[]>([]);

const [otherProfessionals, setOtherProfessionals] = useState<{ id: string; firstName: string; lastName: string; company: string; workTitle: string; school: string; linkedinUrl: string | null }[]>([]);

// Connection system state
const [myConnections, setMyConnections] = useState<Set<string>>(new Set());
const [pendingOutgoing, setPendingOutgoing] = useState<Set<string>>(new Set());
const [pendingIncoming, setPendingIncoming] = useState<Map<string, { id: string; createdAt: string }>>(new Map());

// Rejection tracking state
const [rejectionCounts, setRejectionCounts] = useState<Map<string, number>>(new Map());
const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
const [hiddenUsers, setHiddenUsers] = useState<Set<string>>(new Set());

// Reset blocked/hidden users when user changes
useEffect(() => {
  setBlockedUsers(new Set());
  setHiddenUsers(new Set());
}, [sbUser?.id]);

const [showConnectConfirm, setShowConnectConfirm] = useState(false);
const [connectConfirmUser, setConnectConfirmUser] = useState<{id: string, name: string} | null>(null);

// Messages state
const [selectedChatUser, setSelectedChatUser] = useState<{
  id: string;
  firstName: string;
  lastName: string;
  linkedinUrl: string | null;
} | null>(null);
const [messages, setMessages] = useState<{
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
}[]>([]);
const [messageInput, setMessageInput] = useState("");
const [connectedUsers, setConnectedUsers] = useState<{
  id: string;
  firstName: string;
  lastName: string;
  linkedinUrl: string | null;
}[]>([]);
const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
const [lastMessages, setLastMessages] = useState<Map<string, { text: string; createdAt: string; senderId: string }>>(new Map());

async function sendConnectionRequest(recipientId: string, recipientName: string) {
  if (!sbUser?.id) return;

  // Rate limiting handled client-side
  const rateLimitCheck = checkRateLimit('CONNECTION_REQUEST', sbUser.id);
  if (!rateLimitCheck.allowed) {
    alert(rateLimitCheck.message);
    return;
  }
  recordRateLimitAttempt('CONNECTION_REQUEST', sbUser.id);

  if (recipientId === sbUser.id) {
    alert('You cannot connect with yourself');
    return;
  }

  // Limit: 3 connection requests per 24 hours (checked against database)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('connections')
    .select('*', { count: 'exact', head: true })
    .eq('requester_id', sbUser.id)
    .gte('created_at', twentyFourHoursAgo);

  if (count !== null && count >= 3) {
    alert('You can only send 3 connection requests per day. Please try again tomorrow.');
    return;
  }
  
  // Optimistic update - show "Pending" immediately
  setPendingOutgoing(prev => new Set(prev).add(recipientId));
  
  const { error } = await supabase
    .from('connections')
    .insert({
      requester_id: sbUser.id,
      recipient_id: recipientId,
      status: 'pending',
    });
  
  if (error) {
    // Revert the optimistic update
    setPendingOutgoing(prev => {
      const next = new Set(prev);
      next.delete(recipientId);
      return next;
    });
    
    if (error.code === '23505') {
      // Actually it was already sent, so keep it as pending
      setPendingOutgoing(prev => new Set(prev).add(recipientId));
      alert('Connection request already sent!');
    } else {
      alert('Failed to send request. Please try again.');
    }
    return;
  }
  
  // Send email notification (fire and forget - don't block on this)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-connection-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        recipientId,
        senderFirstName: studentProfile.firstName,
        senderLastName: studentProfile.lastName,
      }),
    }).catch(() => {
      // Silently ignore email errors - connection was still created
    });
  } catch {
    // Silently ignore - the connection request succeeded, email is just a bonus
  }
}

async function handleConnectClick(recipientId: string, recipientName: string) {
  if (!sbUser?.id) return;
  
  // Fetch fresh rejection count from database
  const { data } = await supabase
    .from('connection_attempts')
    .select('rejection_count')
    .eq('requester_id', sbUser.id)
    .eq('recipient_id', recipientId)
    .single();
  
  const rejectionCount = data?.rejection_count || 0;
  
  if (rejectionCount >= 2) {
    setBlockedUsers(prev => new Set(prev).add(recipientId));
    return;
  }
  
  if (rejectionCount === 1) {
    setConnectConfirmUser({ id: recipientId, name: recipientName });
    setShowConnectConfirm(true);
    return;
  }
  
  sendConnectionRequest(recipientId, recipientName);
}

async function acceptConnection(odId: string, connectionId: string, odName: string) {
  if (!sbUser?.id) return;
  
  // Optimistic update
  setMyConnections(prev => new Set(prev).add(odId));
  setPendingIncoming(prev => {
    const next = new Map(prev);
    next.delete(odId);
    return next;
  });
  
  const { error } = await supabase
    .from('connections')
    .update({ status: 'accepted' })
    .eq('id', connectionId)
    .eq('recipient_id', sbUser.id); // Only recipient can accept
  
  if (error) {
    alert('Failed to accept: ' + error.message);
    return;
  }
}

async function rejectConnection(odId: string, connectionId: string, userName: string) {
  if (!sbUser?.id) return;
  
  // Check current rejection count and update
  const { data: existingAttempt } = await supabase
    .from('connection_attempts')
    .select('rejection_count')
    .eq('requester_id', odId)
    .eq('recipient_id', sbUser.id)
    .single();
  
  const currentCount = existingAttempt?.rejection_count || 0;
  const newCount = currentCount + 1;
  
  if (existingAttempt) {
    await supabase
      .from('connection_attempts')
      .update({ rejection_count: newCount })
      .eq('requester_id', odId)
      .eq('recipient_id', sbUser.id);
  } else {
    await supabase
      .from('connection_attempts')
      .insert({
        requester_id: odId,
        recipient_id: sbUser.id,
        rejection_count: 1,
      });
  }
  
  // If rejected twice, hide this user's profile card
  if (newCount >= 2) {
    setHiddenUsers(prev => new Set(prev).add(odId));
    alert(`We have hid ${userName}'s profile card permanently`);
  }
  
  // Optimistic update
  setPendingIncoming(prev => {
    const next = new Map(prev);
    next.delete(odId);
    return next;
  });
  
  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('id', connectionId)
    .eq('recipient_id', sbUser.id);
  
  if (error) {
    alert('Failed to reject: ' + error.message);
    return;
  }
}

// Video call room creation function
const createDailyRoom = async () => {
  // Rate limit: prevent creating more than 1 room per 30 seconds
  const now = Date.now();
  const timeSinceLastCreation = now - lastRoomCreationRef.current;
  if (timeSinceLastCreation < 30000) {
    const waitTime = Math.ceil((30000 - timeSinceLastCreation) / 1000);
    setRoomCreationError(`Please wait ${waitTime} seconds before creating another room`);
    return;
  }

  if (!gameId) {
    console.error('No gameId available');
    setRoomCreationError('No game ID found');
    return;
  }

  lastRoomCreationRef.current = now;
  setIsCreatingRoom(true);
  setRoomCreationError(null);

  try {
    const { data, error } = await Promise.race([
      supabase.functions.invoke('create-daily-room', { body: { gameId } }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Request timed out')), 10000))
    ]);

    if (error) {
      console.error('Edge function error:', error);
      throw error;
    }

    if (!data || !data.url) {
      console.error('Invalid response from edge function:', data);
      throw new Error('No room URL returned');
    }

    const roomUrl = data.url;
    setDailyRoomUrl(roomUrl);

    // Broadcast room URL to joiner
    if (mpChannelRef.current) {
      mpChannelRef.current.send({
        type: 'broadcast',
        event: 'mp',
        payload: {
          event: 'VIDEO_ROOM_CREATED',
          roomUrl: roomUrl,
          sender: sbUser?.id ?? 'host',
        },
      });
    }
  } catch (err: any) {
    console.error('Failed to create video room:', err);
    setRoomCreationError(err?.message || 'Failed to start video call');
  } finally {
    setIsCreatingRoom(false);
  }
};

const [savingProfile, setSavingProfile] = useState(false);

  // timers
  const opponentTimerRef = useRef<number | null>(null);
  const pendingAiOffRef = useRef(false);
  const nextHandTimerRef = useRef<number | null>(null);
  const gameOverRef = useRef(false);
  const allInCallThisHandRef = useRef(false);
  const actionLogRef = useRef<ActionLogItem[]>([]);
  const endedStreetRef = useRef<Street>(0);
  const blindsPostedRef = useRef(false);
  const lastRoomCreationRef = useRef<number>(0);
  const blindsKeyRef = useRef<string | null>(null);
  const gameRef = useRef(game);
  const streetRef = useRef<Street>(street);
  const actionSequenceRef = useRef(0);

useEffect(() => {
  gameRef.current = game;
}, [game]);

useEffect(() => {
  gameOverRef.current = gameOver;
}, [gameOver]);

useEffect(() => {
  streetRef.current = street;
}, [street]);

// Set page title
useEffect(() => {
  document.title = 'HeadsUp';
}, []);

// Watch for game status changes (for host waiting for joiner)
useEffect(() => {
  if (!gameId) return;
  if (multiplayerActive) return; // Already active, no need to watch
  if (!gamePin) return; // Not in a PIN game
  if (mySeat !== "bottom") return; // Only host needs this

  // Listen for joiner's broadcast message (primary method)
  const ch = supabase.channel(`game:${gameId}`);
  
  ch.on("broadcast", { event: "mp" }, ({ payload }: any) => {
    if (payload?.event === "JOINER_READY") {
      setMultiplayerActive(true);
      setSeatedRole((prev) => prev ?? "student");
      setScreen("game");
    }
  });
  
  ch.subscribe();

  // Also poll for game becoming active (backup)
  const interval = setInterval(async () => {
    const { data } = await supabase
      .from("games")
      .select("status")
      .eq("id", gameId)
      .single();

    if (data?.status === "active") {
      clearInterval(interval);
      setMultiplayerActive(true);
      setSeatedRole((prev) => prev ?? "student");
      setScreen("game");
    }
  }, 1000);

  return () => {
    clearInterval(interval);
    supabase.removeChannel(ch);
  };
}, [gameId, multiplayerActive, gamePin, mySeat]);

useEffect(() => {
  if (!gameId) return;
  if (!multiplayerActive) return;

  const ch = supabase.channel(`game:${gameId}`);
  mpChannelRef.current = ch;

  // Track if we've sent our info (to avoid infinite loop)
  let sentMyInfo = false;
  let hostController: MultiplayerHost | null = null;
  let joinerController: MultiplayerJoiner | null = null;

  // Set up listeners BEFORE subscribing (required for Supabase realtime)
  ch.on("broadcast", { event: "mp" }, ({ payload }: any) => {
    if (!payload) return;
    if (payload.sender === (sbUser?.id ?? (isHost ? 'host' : 'joiner'))) return;
    
    if (payload.event === "PLAYER_INFO") {
      setOpponentName(payload.name || null);
      
      if (!sentMyInfo) {
        sentMyInfo = true;
        ch.send({
          type: "broadcast",
          event: "mp",
          payload: {
            event: "PLAYER_INFO",
            name: studentProfile.firstName || null,
            sender: sbUser?.id ?? (isHost ? 'host' : 'joiner'),
          },
        });
      }
    }
    
    if (payload.event === "PLAY_AGAIN_REQUEST") {
      setOpponentWantsPlayAgain(true);
    }
    
    if (payload.event === "PLAY_AGAIN_ACCEPT") {
      setPlayAgainRequested(false);
      setOpponentWantsPlayAgain(false);
      setHandLogHistory([]);
      setLogViewOffset(0);
      
      if (isHost && mpHostRef.current) {
        mpHostRef.current.resetGame();
        setMpState(JSON.parse(JSON.stringify(mpHostRef.current.getState())));
      }
    }

    // Video room events
    if (payload.event === "VIDEO_ROOM_CREATED" && payload.roomUrl) {
      setDailyRoomUrl(payload.roomUrl);
    }

    if (payload.event === "VIDEO_CALL_ENDED") {
      setDailyRoomUrl(null);
      setVideoCallActive(false);
    }

    // HOST: Handle joiner's requests for state
    if (isHost && payload.event === "SYNC" && payload.kind === "REQUEST_SNAPSHOT") {
      if (mpHostRef.current) {
        const state = mpHostRef.current.getState();
        if (state) {
          ch.send({
            type: "broadcast",
            event: "mp",
            payload: {
              event: "HOST_STATE",
              sender: sbUser?.id ?? 'host',
              state: state,
            },
          });
        }
      }
    }
    
    // HOST: Handle joiner's actions
    if (isHost && payload.event === "ACTION" && payload.seat === "top" && mpHostRef.current) {
      mpHostRef.current.processAction(payload.seat, payload.action);
      setMpState(JSON.parse(JSON.stringify(mpHostRef.current.getState())));
    }
    
    // HOST: Handle joiner's show hand
    if (isHost && payload.event === "SHOW_HAND" && payload.seat === "top" && mpHostRef.current) {
      mpHostRef.current.showHand(payload.seat);
      setMpState(JSON.parse(JSON.stringify(mpHostRef.current.getState())));
    }
    
    // JOINER: Handle host's state updates
    if (!isHost && payload.event === "HOST_STATE" && payload.state) {
      setMpState(payload.state);
      // Save state for joiner reconnection
      sessionStorage.setItem('headsup_joinerState', JSON.stringify(payload.state));
    }
    
    // Both: Handle opponent quit
    if (payload.event === "PLAYER_QUIT") {
      setOpponentQuit(true);
    }
  });

  // Subscribe to channel
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      
      if (isHost) {
        // Send host's profile info to joiner (with delay to ensure joiner is listening)
        setTimeout(() => {
          if (!sentMyInfo) {
            sentMyInfo = true;
            ch.send({
              type: "broadcast",
              event: "mp",
              payload: {
                event: "PLAYER_INFO",
                name: studentProfile.firstName || null,
                sender: sbUser?.id ?? 'host',
              },
            });
          }
        }, 800);
        
        // HOST: Create host controller
        const host = new MultiplayerHost(
          ch, 
          sbUser?.id ?? 'host', 
          dealerOffset, 
          () => {
            // When controller processes joiner's action, update host's display
            const newState = JSON.parse(JSON.stringify(host.getState()));
            setMpState(newState);
            // Save state to sessionStorage for reconnection
            sessionStorage.setItem('headsup_hostState', JSON.stringify(newState));
          },
          () => {
            // Opponent quit
            setOpponentQuit(true);
          },
          savedHostState // Pass saved state if reconnecting
        );
        setMpHost(host);
        mpHostRef.current = host;
        
        // Only start a new hand if we don't have saved state
        if (!savedHostState) {
          host.startHand();
        }
        // Update our own display with host's state
        const initialState = JSON.parse(JSON.stringify(host.getState()));
        setMpState(initialState);
        // Save initial state
        sessionStorage.setItem('headsup_hostState', JSON.stringify(initialState));
        // Clear savedHostState after using it
        setSavedHostState(null);
        
        // Broadcast initial state multiple times to ensure joiner receives it
        const broadcastState = () => {
          const state = host.getState();
          if (state) {
            ch.send({
              type: "broadcast",
              event: "mp",
              payload: {
                event: "HOST_STATE",
                sender: sbUser?.id ?? 'host',
                state: state,
              },
            });
          }
        };
        
        broadcastState();
        setTimeout(broadcastState, 500);
        setTimeout(broadcastState, 1000);
        setTimeout(broadcastState, 2000);
        setTimeout(broadcastState, 3000);
        setTimeout(broadcastState, 5000);
        
      } else {
        // JOINER: Create joiner controller
        const joiner = new MultiplayerJoiner(
          ch, 
          sbUser?.id ?? 'joiner',
          (state: HostState) => {
            // When we receive state from host, update our display
            setMpState(state);
          },
          () => {
            // Opponent quit
            setOpponentQuit(true);
          }
        );
        setMpJoiner(joiner);
        mpJoinerRef.current = joiner;
        
        // Send joiner's profile info to host (with delay to ensure host is listening)
        setTimeout(() => {
          if (!sentMyInfo) {
            sentMyInfo = true;
            ch.send({
              type: "broadcast",
              event: "mp",
              payload: {
                event: "PLAYER_INFO",
                name: studentProfile.firstName || null,
                sender: sbUser?.id ?? 'joiner',
              },
            });
          }
        }, 800);
      }
    }
  });

  return () => {
    // Cleanup
    if (mpHostRef.current) {
      mpHostRef.current.destroy();
      setMpHost(null);
      mpHostRef.current = null;
    }
    if (mpJoinerRef.current) {
      mpJoinerRef.current.destroy();
      setMpJoiner(null);
      mpJoinerRef.current = null;
    }
    // Video cleanup
    setDailyRoomUrl(null);
    setVideoCallActive(false);
    setRoomCreationError(null);
    supabase.removeChannel(ch);
  };
}, [gameId, multiplayerActive, isHost, sbUser?.id]);

const handleOAuthSignIn = async (provider: 'google' | 'linkedin_oidc') => {
  setOauthLoading(true);
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      alert('Sign-in failed: ' + error.message);
      setOauthLoading(false);
    }
  } catch (e) {
    alert('Sign-in failed. Please try again.');
    setOauthLoading(false);
  }
};

useEffect(() => {
  let mounted = true;

  async function initAuth() {
    const { data } = await supabase.auth.getUser();
    if (!mounted) return;

    const isOAuth = data.user?.app_metadata?.provider === 'google' ||
                    data.user?.app_metadata?.provider === 'linkedin_oidc';

    // If user exists but hasn't verified email, sign them out (allow OAuth users through)
    if (data.user && !data.user.is_anonymous && !data.user.email_confirmed_at && !isOAuth) {
      await supabase.auth.signOut();
      setSbUser(null);
      return;
    }

    setSbUser(data.user ?? null);

    // Fetch profile for verified or OAuth users
    if (data.user && !data.user.is_anonymous && (data.user.email_confirmed_at || isOAuth)) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profile && mounted) {
          setStudentProfile({
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
            email: profile.email || '',
            password: '',
            year: profile.year || '',
            major: profile.major || '',
            school: profile.school || '',
            company: profile.company || '',
            workTitle: profile.work_title || '',
            linkedinUrl: profile.linkedin_url || '',
          });
          setSeatedRole(profile.role as Role);
        } else if (mounted && isOAuth) {
          // OAuth user with no profile yet — send to profile completion
          const oauthMeta = data.user.user_metadata || {};
          setStudentProfile({
            firstName: oauthMeta.full_name?.split(' ')[0] || oauthMeta.given_name || '',
            lastName: oauthMeta.full_name?.split(' ').slice(1).join(' ') || oauthMeta.family_name || '',
            email: data.user.email || '',
            password: '',
            year: '',
            major: '',
            school: '',
            company: '',
            workTitle: '',
            linkedinUrl: '',
          });
          setSeatedRole("student");
          setScreen('oauthProfileCompletion');
        }
      } catch (e) {
        // Silently ignore profile fetch errors
      }
    }
  }

  initAuth();

  const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (!mounted) return;
    setSbUser(session?.user ?? null);

    if (event === 'SIGNED_IN' && session?.user) {
      const user = session.user;

      // Skip profile redirect for anonymous users (e.g. game creation)
      if (user.is_anonymous) return;

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profile && mounted) {
          setStudentProfile({
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
            email: profile.email || '',
            password: '',
            year: profile.year || '',
            major: profile.major || '',
            school: profile.school || '',
            company: profile.company || '',
            workTitle: profile.work_title || '',
            linkedinUrl: profile.linkedin_url || '',
          });
          setSeatedRole(profile.role as Role);
          setScreen('role');
        } else if (mounted) {
          // New OAuth user — pre-fill from provider metadata
          const oauthMeta = user.user_metadata || {};
          setStudentProfile({
            firstName: oauthMeta.full_name?.split(' ')[0] || oauthMeta.given_name || '',
            lastName: oauthMeta.full_name?.split(' ').slice(1).join(' ') || oauthMeta.family_name || '',
            email: user.email || '',
            password: '',
            year: '',
            major: '',
            school: '',
            company: '',
            workTitle: '',
            linkedinUrl: '',
          });
          setSeatedRole("student");
          setScreen('oauthProfileCompletion');
        }
      } catch (e) {
        // Silently ignore
      }
    }
  });

  return () => {
    mounted = false;
    sub.subscription.unsubscribe();
  };
}, []);

// Fetch other users for dashboard
useEffect(() => {
  if (!sbUser?.id && !isGuestBrowsing) return;
  if (screen !== 'dashboard' && screen !== 'professionalDashboard') return;
  
  async function fetchProfiles() {
    // Build query - exclude own ID only if logged in
    let studentsQuery = supabase
      .from('public_profiles')
      .select('*')
      .eq('role', 'student')
      .order('created_at', { ascending: false })
      .limit(50);
    
    let professionalsQuery = supabase
      .from('public_profiles')
      .select('*')
      .eq('role', 'professional')
      .order('created_at', { ascending: false })
      .limit(50);
    
    // Exclude own profile only if logged in AND not guest browsing
    if (sbUser?.id && !isGuestBrowsing) {
      studentsQuery = studentsQuery.neq('id', sbUser.id);
      professionalsQuery = professionalsQuery.neq('id', sbUser.id);
    }
    
    const { data: students } = await studentsQuery;
    const { data: professionals } = await professionalsQuery;
    
    if (students) {
      const mappedStudents = students.map(p => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        year: p.year || '',
        major: p.major || '',
        school: p.school || '',
        linkedinUrl: p.linkedin_url || null,
      }));
      
      // Sort founder to top for guest browsing
      if (isGuestBrowsing) {
        mappedStudents.sort((a, b) => {
          if (a.id === FOUNDER_ID) return -1;
          if (b.id === FOUNDER_ID) return 1;
          return 0;
        });
      }
      
      // Deduplicate by ID
      const uniqueStudents = mappedStudents.filter((s, index, self) => 
        index === self.findIndex(t => t.id === s.id)
      );
      
      setOtherStudents(uniqueStudents);
    }
    
    if (professionals) {
      const mappedProfessionals = professionals.map(p => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        company: p.company || '',
        workTitle: p.work_title || '',
        school: p.school || '',
        linkedinUrl: p.linkedin_url || null,
      }));
      
      // Deduplicate by ID
      const uniqueProfessionals = mappedProfessionals.filter((p, index, self) => 
        index === self.findIndex(t => t.id === p.id)
      );
      
      setOtherProfessionals(uniqueProfessionals);
    }
    
    // Fetch connections (skip for guest browsing)
    if (!sbUser?.id) return;
    
    const { data: connectionsData } = await supabase
      .from('connections')
      .select('*')
      .or(`requester_id.eq.${sbUser!.id},recipient_id.eq.${sbUser!.id}`);
    
    if (connectionsData) {
      const connected = new Set<string>();
      const outgoing = new Set<string>();
      const incoming = new Map<string, { id: string; createdAt: string }>();
      
      for (const conn of connectionsData) {
        const isRequester = conn.requester_id === sbUser!.id;
        const odId = isRequester ? conn.recipient_id : conn.requester_id;
        
        if (conn.status === 'accepted') {
          connected.add(odId);
        } else if (conn.status === 'pending') {
          if (isRequester) {
            outgoing.add(odId);
          } else {
            incoming.set(odId, { id: conn.id, createdAt: conn.created_at });
          }
        }
      }
      
      setMyConnections(connected);
      setPendingOutgoing(outgoing);
      setPendingIncoming(incoming);
    }
    
    // Fetch rejection counts (where I am the requester)
    const { data: attemptsData, error: attemptsError } = await supabase
      .from('connection_attempts')
      .select('*')
      .eq('requester_id', sbUser!.id);
    
    if (attemptsData) {
      const counts = new Map<string, number>();
      const blocked = new Set<string>();
      for (const attempt of attemptsData) {
        counts.set(attempt.recipient_id, attempt.rejection_count);
        if (attempt.rejection_count >= 2) {
          blocked.add(attempt.recipient_id);
        }
      }
      setRejectionCounts(counts);
      setBlockedUsers(prev => new Set([...prev, ...blocked]));
    }
    
    // Fetch users I've rejected twice (to hide their profiles)
    const { data: rejectedData } = await supabase
      .from('connection_attempts')
      .select('requester_id, rejection_count')
      .eq('recipient_id', sbUser!.id)
      .gte('rejection_count', 2);
    
    if (rejectedData) {
      const hidden = new Set<string>();
      for (const attempt of rejectedData) {
        hidden.add(attempt.requester_id);
      }
      setHiddenUsers(prev => new Set([...prev, ...hidden]));
    }
  }
  
  fetchProfiles();
}, [sbUser?.id, screen, isGuestBrowsing]);

// Real-time subscription for connection updates
useEffect(() => {
  if (!sbUser?.id) return;
  if (screen !== 'dashboard' && screen !== 'professionalDashboard') return;
  
  const handleConnectionChange = (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      
      // For DELETE, use oldRecord; for INSERT/UPDATE, use newRecord
      const record = eventType === 'DELETE' ? oldRecord : newRecord;
      if (!record) return;
      
      const requesterId = record.requester_id as string;
      const recipientId = record.recipient_id as string;
      const recordId = record.id as string;
      const status = record.status as string;
      
      const isRequester = requesterId === sbUser.id;
      const isRecipient = recipientId === sbUser.id;
      
      // For DELETE events, payload may only have id - skip this check and refetch
      if (eventType !== 'DELETE' && !isRequester && !isRecipient) return;
      
      const odId = isRequester ? recipientId : requesterId;
      
      if (eventType === 'INSERT') {
        if (isRequester) {
          setPendingOutgoing(prev => new Set(prev).add(odId));
        } else {
          setPendingIncoming(prev => {
            const next = new Map(prev);
            next.set(odId, { id: recordId, createdAt: (record.created_at as string) || new Date().toISOString() });
            return next;
          });
        }
      } else if (eventType === 'UPDATE') {
        if (status === 'accepted') {
          setMyConnections(prev => new Set(prev).add(odId));
          setPendingOutgoing(prev => {
            const next = new Set(prev);
            next.delete(odId);
            return next;
          });
          setPendingIncoming(prev => {
            const next = new Map(prev);
            next.delete(odId);
            return next;
          });
        }
      } else if (eventType === 'DELETE') {
        // Refetch connections since DELETE payload may not include full row data
        (async () => {
          const { data: connectionsData } = await supabase
            .from('connections')
            .select('*')
            .or(`requester_id.eq.${sbUser.id},recipient_id.eq.${sbUser.id}`);
          
          const connected = new Set<string>();
          const outgoing = new Set<string>();
          const incoming = new Map<string, { id: string; createdAt: string }>();
          
          if (connectionsData) {
            for (const conn of connectionsData) {
              const isRequester = conn.requester_id === sbUser.id;
              const odId = isRequester ? conn.recipient_id : conn.requester_id;
              
              if (conn.status === 'accepted') {
                connected.add(odId);
              } else if (conn.status === 'pending') {
                if (isRequester) {
                  outgoing.add(odId);
                } else {
                  incoming.set(odId, { id: conn.id, createdAt: conn.created_at });
                }
              }
            }
          }
          
          setMyConnections(connected);
          setPendingOutgoing(outgoing);
          setPendingIncoming(incoming);
        })();
      }
    };
  
  const channel = supabase
    .channel(`connections-realtime-${sbUser.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'connections',
    }, handleConnectionChange)
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}, [sbUser?.id, screen]);

// Real-time subscription for rejection count updates
useEffect(() => {
  if (!sbUser?.id) return;
  if (screen !== 'dashboard' && screen !== 'professionalDashboard') return;
  
  const channel = supabase
    .channel(`connection-attempts-${sbUser.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'connection_attempts',
      filter: `requester_id=eq.${sbUser.id}`,
    }, (payload) => {
      const { eventType, new: newRecord } = payload;
      
      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        const record = newRecord as { recipient_id: string; rejection_count: number };
        setRejectionCounts(prev => {
          const next = new Map(prev);
          next.set(record.recipient_id, record.rejection_count);
          return next;
        });
      }
    })
    .subscribe((status) => {
    });
  
  return () => {
    supabase.removeChannel(channel);
  };
}, [sbUser?.id, screen]);

// Check for active game session on mount (reconnection logic)
useEffect(() => {
  async function checkForActiveGame() {
    try {
      const savedGameId = sessionStorage.getItem('headsup_gameId');
      const savedSeatRaw = sessionStorage.getItem('headsup_mySeat');
      const savedSeat: Seat | null = (savedSeatRaw === 'top' || savedSeatRaw === 'bottom') ? savedSeatRaw : null;
      const savedPin = sessionStorage.getItem('headsup_gamePin');
      const savedStateJson = sessionStorage.getItem('headsup_hostState');
      
      if (!savedGameId || !savedSeat) {
        setIsReconnecting(false);
        return;
      }
      
      const { data: gameRow, error } = await supabase
        .from('games')
        .select('id, pin, status')
        .eq('id', savedGameId)
        .single();
      
      if (error || !gameRow) {
        sessionStorage.removeItem('headsup_gameId');
        sessionStorage.removeItem('headsup_mySeat');
        sessionStorage.removeItem('headsup_gamePin');
        sessionStorage.removeItem('headsup_dealerOffset');
        sessionStorage.removeItem('headsup_hostState');
        sessionStorage.removeItem('headsup_handHistory');
        setIsReconnecting(false);
        return;
      }
      
      const savedDealerOffset = sessionStorage.getItem('headsup_dealerOffset');
      if (savedDealerOffset) {
        setDealerOffset(Number(savedDealerOffset) as 0 | 1);
      }
      
      // Restore host state if available
      if (savedStateJson && savedSeat === 'bottom') {
        try {
          const parsedState = JSON.parse(savedStateJson) as HostState;
          setSavedHostState(parsedState);
        } catch (e) {
          // Silently ignore parse errors
        }
      }
      
      // Restore joiner state if available (for immediate display while waiting for host)
      if (savedSeat === 'top') {
        const savedJoinerStateJson = sessionStorage.getItem('headsup_joinerState');
        if (savedJoinerStateJson) {
          try {
            const parsedState = JSON.parse(savedJoinerStateJson) as HostState;
            setMpState(parsedState);
          } catch (e) {
            // Silently ignore parse errors
          }
        }
      }
      
      // Restore hand history if available
      const savedHistoryJson = sessionStorage.getItem('headsup_handHistory');
      if (savedHistoryJson) {
        try {
          const parsedHistory = JSON.parse(savedHistoryJson);
          setHandLogHistory(parsedHistory);
        } catch (e) {
          // Silently ignore parse errors
        }
      }
      
      setGameId(savedGameId);
      setMySeat(savedSeat);
      setGamePin(savedPin);
      setSeatedRole('student');
      
      // Check if we have saved state (proves game was in progress)
      const savedJoinerStateJson = sessionStorage.getItem('headsup_joinerState');
      const hasGameInProgress = savedSeat === 'bottom' ? !!savedStateJson : !!savedJoinerStateJson;
      
      if (gameRow.status === 'active' || hasGameInProgress) {
        // Restore joiner's cached state immediately while waiting for host
        if (savedSeat === 'top' && savedJoinerStateJson) {
          try {
            const parsedState = JSON.parse(savedJoinerStateJson) as HostState;
            setMpState(parsedState);
          } catch (e) {
            // Silently ignore parse errors
          }
        }
        setMultiplayerActive(true);
        setScreen('game');
      } else if (savedSeat === 'bottom') {
        // Host waiting for joiner (no game started yet)
        setScreen('role');
      } else {
        // No valid game state, clear everything
        sessionStorage.removeItem('headsup_gameId');
        sessionStorage.removeItem('headsup_mySeat');
        sessionStorage.removeItem('headsup_gamePin');
        sessionStorage.removeItem('headsup_dealerOffset');
        sessionStorage.removeItem('headsup_hostState');
        sessionStorage.removeItem('headsup_joinerState');
        sessionStorage.removeItem('headsup_handHistory');
      }
    } catch (e) {
    } finally {
      setIsReconnecting(false);
    }
  }
  
  checkForActiveGame();
}, []);

  const dealerSeat: Seat = useMemo(() => {
  if (multiplayerActive && mpState) {
    return mpState.dealerSeat;
  }
  return ((handId + dealerOffset) % 2 === 0 ? "top" : "bottom");
}, [handId, dealerOffset, multiplayerActive, mpState]);

  const nonDealerSeat: Seat = dealerSeat === "top" ? "bottom" : "top";

  // Calculate blind notice using correct hand ID
  const effectiveHandId = multiplayerActive && mpState ? mpState.handId : handId;
  const effectiveHandNo = effectiveHandId + 1;
  const withinBlock = ((effectiveHandNo - 1) % GAME_CONFIG.BLINDS_INCREASE_EVERY_N_HANDS) + 1;
  const blindNotice = (withinBlock >= GAME_CONFIG.WARNING_STARTS_AT_HAND && withinBlock <= GAME_CONFIG.BLINDS_INCREASE_EVERY_N_HANDS)
    ? ((GAME_CONFIG.BLINDS_INCREASE_EVERY_N_HANDS + 1) - withinBlock === 1 
        ? "Blinds will change next hand" 
        : `Blinds will change in ${(GAME_CONFIG.BLINDS_INCREASE_EVERY_N_HANDS + 1) - withinBlock} hands`)
    : null;

  // Display variables - use mpState when in multiplayer, otherwise use local state
const displayGame = multiplayerActive && mpState ? mpState.game : game;
const displayToAct = multiplayerActive && mpState ? mpState.toAct : toAct;
const displayCards = multiplayerActive && mpState ? mpState.cards : cards;
const displayActionLog = multiplayerActive && mpState ? mpState.actionLog : actionLog;
const displayHandResult = multiplayerActive && mpState ? mpState.handResult : handResult;
const displayStreet = multiplayerActive && mpState ? mpState.street : street;
const displayOppRevealed = multiplayerActive && mpState ? mpState.oppRevealed : oppRevealed;
const displayYouMucked = multiplayerActive && mpState ? mpState.youMucked : youMucked;
const displayCanShowTop = multiplayerActive && mpState ? mpState.canShowTop : canShowTop;
const displayCanShowBottom = multiplayerActive && mpState ? mpState.canShowBottom : canShowBottom;
const displayTopShowed = multiplayerActive && mpState ? mpState.topShowed : topShowed;
const displayBottomShowed = multiplayerActive && mpState ? mpState.bottomShowed : bottomShowed;

  // Perspective helpers: map game seats to screen positions
  const myActualSeat = mySeat; // "bottom" for host, "top" for joiner
  const oppActualSeat: Seat = mySeat === "bottom" ? "top" : "bottom";

  // Trigger board card animations based on street
  useEffect(() => {
    if (displayStreet < 3) {
      // Clear board card animations when starting new hand
      setDealtCards(prev => ({
        ...prev,
        flop1: false,
        flop2: false,
        flop3: false,
        turn: false,
        river: false,
      }));
      return; // No board cards yet
    }

    const dealBoardCards = async () => {
      // Check if this is an all-in situation
      // Multiple checks to ensure we catch all scenarios:
      // 1. Local game ref
      // 2. Multiplayer: opponent revealed at river (both all-in)
      // 3. Multiplayer: hand ended by showdown at river (all-in runout)
      const isAllIn = allInCallThisHandRef.current ||
                      (multiplayerActive && displayStreet === 5 && displayOppRevealed) ||
                      (multiplayerActive && displayStreet === 5 && displayHandResult.status === "ended" && displayHandResult.reason === "showdown");

      // Initial delay after all-in call before runout starts (only if flop not dealt yet)
      if (isAllIn && !dealtCards.flop1) {
        await new Promise(r => setTimeout(r, 1000));
      }

      if (displayStreet >= 3 && !dealtCards.flop3) {
        // Only deal flop if not already dealt
        // All-in: 1500ms delay, Normal: 200ms delay
        await new Promise(r => setTimeout(r, isAllIn ? 1500 : 200));
        setDealtCards(prev => ({ ...prev, flop1: true }));

        await new Promise(r => setTimeout(r, 100));
        setDealtCards(prev => ({ ...prev, flop2: true }));

        await new Promise(r => setTimeout(r, 100));
        setDealtCards(prev => ({ ...prev, flop3: true }));
      }

      if (displayStreet >= 4 && !dealtCards.turn) {
        // Only deal turn if not already dealt
        // All-in: 2000ms delay, Normal: 300ms delay
        await new Promise(r => setTimeout(r, isAllIn ? 2000 : 300));
        setDealtCards(prev => ({ ...prev, turn: true }));
      }

      if (displayStreet >= 5 && !dealtCards.river) {
        // Only deal river if not already dealt
        // All-in: 3000ms delay, Normal: 300ms delay
        await new Promise(r => setTimeout(r, isAllIn ? 3000 : 300));
        setDealtCards(prev => ({ ...prev, river: true }));
      }
    };

    dealBoardCards();
  }, [displayStreet]);

  // Determine if I can show hand and if opponent showed
  const canIShow = myActualSeat === "top" ? displayCanShowTop : displayCanShowBottom;
  const didIShow = myActualSeat === "top" ? displayTopShowed : displayBottomShowed;
  const didOppShow = myActualSeat === "top" ? displayBottomShowed : displayTopShowed;

  // Add 1 second delay after river is dealt before showing win animations (only for all-in scenarios)
  useEffect(() => {
    if (dealtCards.river) {
      // Only delay if there was an all-in and call
      // Multiple checks to ensure we catch all scenarios:
      const wasAllInCall = allInCallThisHandRef.current ||
                           (multiplayerActive && displayOppRevealed && displayStreet === 5) ||
                           (multiplayerActive && displayStreet === 5 && displayHandResult.status === "ended" && displayHandResult.reason === "showdown");
      const delay = wasAllInCall ? 1000 : 0; // 1s for all-in, immediate for normal hands

      const timer = setTimeout(() => {
        setRiverAnimationComplete(true);
      }, delay);
      return () => clearTimeout(timer);
    } else {
      setRiverAnimationComplete(false);
    }
  }, [dealtCards.river, multiplayerActive, displayOppRevealed, displayStreet]);

  // Trigger win animation when hand ends AND river is dealt
  useEffect(() => {
    if (displayHandResult?.status === "ended" && displayHandResult.winner && displayHandResult.winner !== "tie") {
      // Determine if hero won (skip for ties - no win animation on split pots)
      const heroWon = displayHandResult.winner === myActualSeat;
      setShowWinAnimation(heroWon ? 'hero' : 'opponent');

      // Get win amount - use potWon from handResult (total pot won)
      const amount = displayHandResult.potWon || 0;

      setWinAmount(amount);
      // Animation will stay visible until next hand starts (status !== "ended") or game is over
    } else if (!((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver))) {
      // Only clear if not in a game over state
      setShowWinAnimation(null);
      setWinAmount(0);
    }
  }, [displayHandResult.status, displayHandResult.winner, displayHandResult.potWon, displayHandResult.message, myActualSeat, dealtCards.river, displayStreet, multiplayerActive, mpState?.gameOver, gameOver]);

  // Chip-to-pot and action flash animations triggered by new action log entries
  useEffect(() => {
    const log = displayActionLog;
    if (log.length <= prevActionLogLenRef.current) {
      prevActionLogLenRef.current = log.length;
      return;
    }

    // Only process newly added entries
    const newEntries = log.slice(prevActionLogLenRef.current);
    prevActionLogLenRef.current = log.length;

    for (const entry of newEntries) {
      const text = entry.text.toLowerCase();

      // Skip blind posts, wins, shows, splits, mucks — no animation for those
      if (/^(posts|wins|shows|split|muck)/.test(text)) continue;

      const seatIsHero = entry.seat === myActualSeat;
      const animSeat: 'hero' | 'opponent' = seatIsHero ? 'hero' : 'opponent';

      // Action flash for all actions (fold, check, call, bet, raise)
      const displayText = entry.text.replace(/\s*\(.*?\)$/, '');
      setActionFlashes(prev => [...prev, { id: entry.id, seat: animSeat, text: displayText }]);
      setTimeout(() => {
        setActionFlashes(prev => prev.filter(f => f.id !== entry.id));
      }, 2300);

      // Chip-to-pot only for bet/call/raise actions
      if (/^(calls|bets|raises)/.test(text)) {
        const amountMatch = entry.text.match(/([\d.]+)\s*bb/i);
        const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

        setChipsToPot(prev => [...prev, { id: entry.id, from: animSeat, amount }]);
        setTimeout(() => {
          setChipsToPot(prev => prev.filter(c => c.id !== entry.id));
        }, 550);
      }
    }
  }, [displayActionLog.length, myActualSeat]);

  // Pot-to-winner animation — fires when hand ends (non-all-in) or when river animation completes (all-in)
  useEffect(() => {
    if (showWinAnimation && (riverAnimationComplete || displayStreet < 5) && displayHandResult.status === "ended" && displayHandResult.potWon > 0) {
      setPotToWinner({
        id: `pot-win-${Date.now()}`,
        target: showWinAnimation,
        amount: displayHandResult.potWon,
      });
      setTimeout(() => setPotToWinner(null), 700);
    }
  }, [showWinAnimation, riverAnimationComplete, displayStreet, displayHandResult.status, displayHandResult.potWon]);

  // Refs to track previous show states
  const prevOppShowRef = useRef(false);
  const prevMyShowRef = useRef(false);

  // Trigger flip animation when opponent's cards are revealed
  useEffect(() => {
    const oppShouldShow = (
      // Required to show at showdown (only after river animation completes or if hand ended before river)
      ((riverAnimationComplete || displayStreet < 5) && displayHandResult.status === "ended" && displayHandResult.reason === "showdown" && (
        myActualSeat === "bottom"
          ? displayOppRevealed  // I'm host: oppRevealed = top showed = opponent showed
          : !displayYouMucked   // I'm joiner: youMucked = bottom mucked = opponent mucked, so !youMucked = opponent showed
      ))
      // OR opponent clicked Show Hand button
      || didOppShow
    );

    // Only trigger animation on transition from false to true
    if (oppShouldShow && !prevOppShowRef.current) {
      setFlippedCards(prev => ({ ...prev, oppCard1: true, oppCard2: true }));
      // Reset after animation completes
      setTimeout(() => {
        setFlippedCards(prev => ({ ...prev, oppCard1: false, oppCard2: false }));
      }, 500);
    }

    prevOppShowRef.current = oppShouldShow;
  }, [displayOppRevealed, displayYouMucked, didOppShow, displayHandResult, myActualSeat, riverAnimationComplete, displayStreet]);

  // Trigger flip animation when I click Show Hand
  useEffect(() => {
    // Only trigger animation on transition from false to true
    if (didIShow && !prevMyShowRef.current) {
      setFlippedCards(prev => ({ ...prev, myCard1: true, myCard2: true }));
      // Reset after animation completes
      setTimeout(() => {
        setFlippedCards(prev => ({ ...prev, myCard1: false, myCard2: false }));
      }, 500);
    }

    prevMyShowRef.current = didIShow;
  }, [didIShow]);

  // Game state from my perspective
  // During all-in animation, show stacks BEFORE pot was awarded (subtract win amount from winner)
  const isAnimatingAllIn = displayHandResult.status === "ended" && !riverAnimationComplete && displayStreet === 5;
  const myStack = displayGame.stacks[myActualSeat] - (isAnimatingAllIn && showWinAnimation === 'hero' ? winAmount : 0);
  const oppStack = displayGame.stacks[oppActualSeat] - (isAnimatingAllIn && showWinAnimation === 'opponent' ? winAmount : 0);
  const myBet = displayGame.bets[myActualSeat];
const oppBet = displayGame.bets[oppActualSeat];
  
  const amIDealer = dealerSeat === myActualSeat;
  const myPositionLabel = amIDealer ? "SB/D" : "BB";
  const oppPositionLabel = amIDealer ? "BB" : "SB/D";
  
  const myLabel = amIDealer ? "SB" : "BB";
  const oppLabel = amIDealer ? "BB" : "SB";

  // Check if it's player's turn AND not in an all-in situation where cards are revealed
  const isBottomTurn = seatedRole && displayToAct === mySeat && displayHandResult.status === "playing" && !displayOppRevealed;

  const [handStartStacks, setHandStartStacks] = useState<{ top: number; bottom: number }>({
  top: STARTING_STACK_BB,
  bottom: STARTING_STACK_BB,
});

  // 0 = current hand, 1 = previous hand, 2 = two hands ago, etc.

  function generate4DigitPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function createPinGame() {
  let user: User;

  try {
    // Try local session first (instant)
    const { data: sessionData } = await supabase.auth.getSession();

    if (sessionData?.session?.user) {
      user = sessionData.session.user;
    } else {
      // No valid session — sign out to clear stale tokens, then create fresh anonymous user
      await supabase.auth.signOut().catch(() => {});
      const { data: anonData, error: anonErr } =
        await supabase.auth.signInAnonymously();

      if (anonErr || !anonData.user) throw anonErr;
      user = anonData.user;
    }
  } catch (e) {
    alert("Could not start a guest session.");
    setCreatingGame(false);
    return;
  }

  // Rate limiting handled client-side
  const rateLimitCheck = checkRateLimit('GAME_CREATE', user.id);
  if (!rateLimitCheck.allowed) {
    alert(rateLimitCheck.message);
    setCreatingGame(false);
    return;
  }
  recordRateLimitAttempt('GAME_CREATE', user.id);

  // attempt to create a unique 4-digit PIN
  for (let attempt = 0; attempt < 5; attempt++) {
    const pin = generate4DigitPin();

    const { data: gameRow, error: gameErr } = await supabase
      .from("games")
      .insert({
        pin,
        created_by: user.id,
        status: "waiting",
      })
      .select("id,pin")
      .single();

    if (gameErr) {
      // If it's a PIN collision (unique constraint violation), try again
      if (gameErr.code === "23505") {
        continue;
      }
      // For other errors, fail immediately
      alert("Failed to create game. Please try again.");
      setCreatingGame(false);
      return;
    }

    if (!gameRow) {
      continue;
    }

    const { error: playerErr } = await supabase
      .from("game_players")
      .insert({
        game_id: gameRow.id,
        user_id: user.id,
        seat: "bottom",
      });

    if (playerErr) {
      alert("Failed to claim seat.");
      setCreatingGame(false);
      return;
    }

    setJoinMode(false);
    setJoinPinInput("");
    setGamePin(gameRow.pin);

    setGameId(gameRow.id);
    setMySeat("bottom");
    setMultiplayerActive(false);

    // Randomize dealer offset once when creating the game
    const initialDealerOffset: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    setDealerOffset(initialDealerOffset);

    // Save session for reconnection
    sessionStorage.setItem('headsup_gameId', gameRow.id);
    sessionStorage.setItem('headsup_mySeat', 'bottom');
    sessionStorage.setItem('headsup_gamePin', gameRow.pin);
    sessionStorage.setItem('headsup_dealerOffset', String(initialDealerOffset));

    // stay on title screen to show the PIN screen
    return;
  }

  alert("Failed to create game (PIN collision). Please try again.");
  setCreatingGame(false);
}

async function getOrCreateUser() {
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user) return data.user;

  // If not logged in, create an anonymous user
  const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
  if (anonErr || !anonData.user) throw anonErr ?? new Error("Anonymous sign-in failed");

  return anonData.user;
}

async function joinPinGame() {
  const pin = joinPinInput.trim();
  if (pin.length !== 4) return;
  if (creatingGame) return;

  setCreatingGame(true);

  try {
    let user: User;
    try {
      const authTimeout = <T,>(p: Promise<T>) =>
        Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 30000))]);

      // Try local session first (instant)
      const { data: sessionData } = await authTimeout(supabase.auth.getSession());

      if (sessionData?.session?.user) {
        user = sessionData.session.user;
      } else {
        // No valid session — sign out to clear stale tokens, then create fresh anonymous user
        await supabase.auth.signOut().catch(() => {});
        const { data: anonData, error: anonErr } = await authTimeout(supabase.auth.signInAnonymously());
        if (anonErr || !anonData.user) throw anonErr;
        user = anonData.user;
      }
    } catch (e) {
      alert("Could not start session. Check your internet and try again.");
      return;
    }

    const { data: gameRow, error: gameErr } = await supabase
      .from("games")
      .select("id,pin,status")
      .eq("pin", pin)
      .single();

    if (gameErr || !gameRow) {
      alert('Invalid PIN.');
      return;
    }

    const { error: playerErr } = await supabase.from("game_players").insert({
      game_id: gameRow.id,
      user_id: user.id,
      seat: "top",
    });

    if (playerErr) {
      alert("Could not join. Seat may be taken.");
      return;
    }

    await supabase.from("games").update({ status: "active" }).eq("id", gameRow.id);

    // Broadcast to host that joiner has joined
    const tempChannel = supabase.channel(`game:${gameRow.id}`);
    tempChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        const notifyHost = () => {
          tempChannel.send({
            type: "broadcast",
            event: "mp",
            payload: {
              event: "JOINER_READY",
              sender: user.id,
            },
          });
        };
        notifyHost();
        setTimeout(notifyHost, 300);
        setTimeout(notifyHost, 600);
        setTimeout(notifyHost, 1000);
      }
    });

    setJoinMode(false);
    setJoinPinInput("");
    setGamePin(gameRow.pin);
    setGameId(gameRow.id);
    setMySeat("top");
    setMultiplayerActive(true);

    sessionStorage.setItem('headsup_gameId', gameRow.id);
    sessionStorage.setItem('headsup_mySeat', 'top');
    sessionStorage.setItem('headsup_gamePin', gameRow.pin);

    clearTimers();
    setBetSize(2);
    setSeatedRole((prev) => prev ?? "student");
    setScreen("game");
  } finally {
    setCreatingGame(false);
  }
}

function clearPin() {
  setGamePin(null);
  setJoinMode(false);
  setJoinPinInput("");
  setIsCreatingPin(false);
  setCreatingGame(false);
}

function applyRemoteReset(p: {
  dealerOffset: 0 | 1;
  gameSession: number;
  handId: number;
  game: GameState;
  toAct: Seat;
  handStartStacks: { top: number; bottom: number };
  lastRaiseSize: number;
  endedBoardSnapshot: number;
  blindsPosted: boolean;
  cards: Card[] | null;
  actionLog: ActionLogItem[];
  actionSeq: number;
}) 

{


  suppressMpRef.current = true;

  clearTimers();

  gameOverRef.current = false;
  setGameOver(false);
  setPlayAgainRequested(false);
  setOpponentWantsPlayAgain(false);

  setDealerOffset(p.dealerOffset);

  setGame(p.game);
  gameRef.current = p.game;
  streetRef.current = 0;

  setCards(p.cards);

  setHandResult({ status: "playing", winner: null, reason: null, message: "", potWon: 0 });
  setStreet(0);
  setChecked({ top: false, bottom: false });
  setLastAggressor(null);
  setLastToActAfterAggro(null);
  setActionsThisStreet(0);
  setSawCallThisStreet(false);
  setStreetBettor(null);
  setShowdownFirst(null);
  setOppRevealed(false);
  setYouMucked(false);

  setBetSize(2);
  setHandLogHistory([]);
  setLogViewOffset(0);

  setGameSession(p.gameSession);
  setHandId(p.handId);
  setDealerOffset(p.dealerOffset);
  setToAct(p.toAct);
  setHandStartStacks(p.handStartStacks);
  setLastRaiseSize(p.lastRaiseSize);
  setEndedBoardSnapshot(p.endedBoardSnapshot);
  blindsPostedRef.current = p.blindsPosted;
  actionSequenceRef.current = 0;

  suppressMpRef.current = false;
  
  // Set action log after a small delay to ensure React updates
  setTimeout(() => {
    setActionLog(p.actionLog);
    actionLogRef.current = p.actionLog;
  }, 0);
}

  function clearTimers() {
    if (opponentTimerRef.current) {
      window.clearTimeout(opponentTimerRef.current);
      opponentTimerRef.current = null;
    }
    if (nextHandTimerRef.current) {
      window.clearTimeout(nextHandTimerRef.current);
      nextHandTimerRef.current = null;
    }
  }

  function triggerGameOverSequence() {
  if (gameOverRef.current) return;

  gameOverRef.current = true;
  setGameOver(true);
  clearTimers();
}

  function snapshotCurrentHandLog() {
  const endedSt = endedStreetRef.current;

  setHandLogHistory((prev) => {
    const snap: HandLogSnapshot = {
      handNo: handId,
      dealer: dealerSeat,
      endedStreet: endedSt,
      endedBoard: board.slice(0, endedSt),
      log: actionLogRef.current,

      heroPos: dealerSeat === "bottom" ? "SB" : "BB",
      oppPos: dealerSeat === "top" ? "SB" : "BB",

      heroCards:
        RANK_TO_VALUE[youC!.rank] >= RANK_TO_VALUE[youD!.rank]
          ? [youC!, youD!]
          : [youD!, youC!],

      oppCards:
        RANK_TO_VALUE[oppA!.rank] >= RANK_TO_VALUE[oppB!.rank]
          ? [oppA!, oppB!]
          : [oppB!, oppA!],

      // Decide shown vs mucked from what actually got logged
      heroShown: (() => {
        const log = actionLogRef.current;
        const mucked = log.some((it) => it.seat === "bottom" && /muck/i.test(it.text));
        const showed = log.some((it) => it.seat === "bottom" && it.text.startsWith("Shows "));
        return showed && !mucked;
      })(),
      
      oppShown: (() => {
        const log = actionLogRef.current;
        const mucked = log.some((it) => it.seat === "top" && /muck/i.test(it.text));
        const showed = log.some((it) => it.seat === "top" && it.text.startsWith("Shows "));
        return showed && !mucked;
      })(),

      heroStartStack: handStartStacks.bottom,
      oppStartStack: handStartStacks.top,

      // Calculate hand ranks if cards were shown
      heroHandRank: youC && youD && endedSt >= 3
        ? handRankOnly(evaluate7([youC, youD, ...board.slice(0, endedSt)]))
        : null,
      oppHandRank: oppA && oppB && endedSt >= 3
        ? handRankOnly(evaluate7([oppA, oppB, ...board.slice(0, endedSt)]))
        : null,
    };

    // Don't add duplicate snapshots for the same hand
    if (prev.length > 0 && prev[0]?.handNo === snap.handNo) return prev;
    return [snap, ...prev].slice(0, 30);
  });
}

    /* deal cards each hand */
  useEffect(() => {
    if (!seatedRole) {
      setCards(null);
      return;
    }

    // single-player behavior
    if (!multiplayerActive) {
      setCards(drawUniqueCards(9));
      return;
    }

  }, [seatedRole, handId, gameSession, multiplayerActive, isHost]);

  function logAction(seat: Seat, text: string, potOverride?: number) {
  const potNow =
    potOverride ??
    roundToHundredth(gameRef.current.pot + gameRef.current.bets.top + gameRef.current.bets.bottom);

  const lower = text.toLowerCase();

const shouldAppendPot =
  blindsPostedRef.current &&
  !lower.startsWith("posts") &&
  !lower.startsWith("shows") &&
  !lower.startsWith("split") &&
  !lower.startsWith("wins");

  const finalText = shouldAppendPot ? `${text} (${formatBB(potNow)}bb)` : text;

  const item: ActionLogItem = {
    id: uid(),
    sequence: actionSequenceRef.current++,
    street: streetNameFromCount(street),
    seat,
    text: finalText,
  };

  setActionLog((prev: ActionLogItem[]) => {
    const next = [...prev, item];
    actionLogRef.current = next;

    return next;
  });
}

  function resetStreetRound(nextStreet: Street) {
    setStreet(nextStreet);
setChecked({ top: false, bottom: false });
setLastAggressor(null);
setLastToActAfterAggro(null);
setActionsThisStreet(0);
setStreetBettor(null);
setSawCallThisStreet(false);
setLastRaiseSize(BB);

// HU rule: preflop first to act = dealer; postflop = non-dealer
const firstToAct = nextStreet === 0 ? dealerSeat : nonDealerSeat;
setToAct(firstToAct);

  }

  function pullBetsIntoPot() {
  setGame((prev: GameState) => {
    const next = {
      ...prev,
      pot: roundToHundredth(prev.pot + prev.bets.top + prev.bets.bottom),
      bets: { top: 0, bottom: 0 },
    };

    return next;
  });
}

  function endHand(
  winner: Seat | "tie",
  reason: HandEndReason,
  message: string,
  showdownFirstOverride: Seat | null = null
) {
  // Always kill any pending timers first (especially auto-next-hand)
  clearTimers();

  const prev = gameRef.current;
  const fullPot = roundToHundredth(prev.pot + prev.bets.top + prev.bets.bottom);

  // Compute next stacks deterministically (no setState side effects)
  let nextStacks: GameState["stacks"];

  if (winner === "tie") {
    const half = roundToHundredth(fullPot / 2);
    nextStacks = {
      top: roundToHundredth(prev.stacks.top + half),
      bottom: roundToHundredth(prev.stacks.bottom + (fullPot - half)),
    };
  } else {
    nextStacks = {
      ...prev.stacks,
      [winner]: roundToHundredth(prev.stacks[winner] + fullPot),
    } as GameState["stacks"];
  }

  // Game is over if either stack is 0 (or below due to rounding)
  const shouldEndGame = nextStacks.top <= 0 || nextStacks.bottom <= 0;

  // Mark hand ended + snapshot
  setHandResult({ status: "ended", winner, reason, message, potWon: fullPot });

  setTimeout(() => snapshotCurrentHandLog(), 0);

  // If all-in and call, delay stack update until after river animation
  const wasAllInCall = allInCallThisHandRef.current;
  const stackUpdateDelay = wasAllInCall ? 8200 : 0; // 1s + 1.7s (flop) + 2s (turn) + 3s (river) + 500ms buffer

  setTimeout(() => {
    // Commit the chip state
    setGame({
      pot: 0,
      bets: { top: 0, bottom: 0 },
      stacks: nextStacks,
    });

    // If this hand ends the match, freeze here.
    if (shouldEndGame) {
      setTimeout(() => {
        gameOverRef.current = true;
        setGameOver(true);
        clearTimers();
      }, multiplayerActive ? 150 : 0);
    }
  }, stackUpdateDelay);
}

 function startNewHand() {
    // Don't start a new hand if game is over
    if (gameOverRef.current) return;

    allInCallThisHandRef.current = false;
    actionSequenceRef.current = 0;

    setHandResult({ status: "playing", winner: null, reason: null, message: "", potWon: 0 });
    setActionLog([]);
    actionLogRef.current = [];
    setStreet(0);
    setChecked({ top: false, bottom: false });
    setLastAggressor(null);
    setLastToActAfterAggro(null);
    setActionsThisStreet(0);
    setBetSize(2);
    setStreetBettor(null);
    setShowdownFirst(null);
    setOppRevealed(false);
    setYouMucked(false);
    setCanShowTop(false);
    setCanShowBottom(false);
    setTopShowed(false);
    setBottomShowed(false);

    setSawCallThisStreet(false);

    // Clear betting animations
    setChipsToPot([]);
    setActionFlashes([]);
    setPotToWinner(null);
    prevActionLogLenRef.current = 0;

    setHandId((h) => {
      const next = h + 1;

      return next;
    });
  }

  function resetGame() {
    // reset stacks + randomize starting dealer + deal fresh hand
    clearTimers();

    gameOverRef.current = false;
    setGameOver(false);
    setPlayAgainRequested(false);

    // Only randomize dealerOffset in single-player mode
// In multiplayer, keep the existing dealerOffset that was set when creating the game
let currentDealerOffset = dealerOffset;
if (!multiplayerActive) {
  const nextDealerOffset: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
  setDealerOffset(nextDealerOffset);
  currentDealerOffset = nextDealerOffset;
}

    const freshGame: GameState = {
  stacks: { top: STARTING_STACK_BB, bottom: STARTING_STACK_BB },
  bets: { top: 0, bottom: 0 },
  pot: 0,
};

setGame(freshGame);
gameRef.current = freshGame;
streetRef.current = 0;

// host deals immediately on reset so joiner can't miss cards
const nextCards = drawUniqueCards(9);
setCards(nextCards);

    setHandResult({ status: "playing", winner: null, reason: null, message: "", potWon: 0 });
    setActionLog([]);
    actionLogRef.current = [];
    actionSequenceRef.current = 0;
    setStreet(0);
    setChecked({ top: false, bottom: false });
    setLastAggressor(null);
    setLastToActAfterAggro(null);
    setActionsThisStreet(0);
    setSawCallThisStreet(false);
    setStreetBettor(null);
    setShowdownFirst(null);
    setOppRevealed(false);
    setYouMucked(false);
    setCanShowTop(false);
    setCanShowBottom(false);
    setTopShowed(false);
    setBottomShowed(false);

    setBetSize(2);
    setHandLogHistory([]);
    setLogViewOffset(0);

    // Clear betting animations
    setChipsToPot([]);
    setActionFlashes([]);
    setPotToWinner(null);
    prevActionLogLenRef.current = 0;

    setGameSession((s: number) => {
  const next = s + 1;

  return next;
});

setHandId(0); // reset to Hand #1
blindsPostedRef.current = false;
allInCallThisHandRef.current = false;

  }

  function setBetSizeRounded(value: number | "") {
    if (value === "") {
      setBetSize("");
      return;
    }
    if (!Number.isFinite(value)) return;
    setBetSize(roundToHundredth(Math.max(0, value)));
  }

  // Determine if viewing history snapshot
  const viewingSnapshot =
    logViewOffset === 0 ? null : handLogHistory[logViewOffset - 1];

  // Raw cards from deck: [0,1] = top seat, [2,3] = bottom seat
const topRaw1 = displayCards?.[0];
const topRaw2 = displayCards?.[1];
const bottomRaw1 = displayCards?.[2];
const bottomRaw2 = displayCards?.[3];

  // Opponent cards (from my perspective)
  const oppRaw1 = mySeat === "bottom" ? topRaw1 : bottomRaw1;
  const oppRaw2 = mySeat === "bottom" ? topRaw2 : bottomRaw2;

  // My cards (from my perspective)
const youRaw1 = mySeat === "bottom" ? bottomRaw1 : topRaw1;
const youRaw2 = mySeat === "bottom" ? bottomRaw2 : topRaw2;

  const [oppA, oppB] = useMemo(() => {
    // When viewing snapshot, use snapshot's opponent cards
    if (viewingSnapshot) {
      return [viewingSnapshot.oppCards[0], viewingSnapshot.oppCards[1]] as const;
    }
    
    if (!oppRaw1 || !oppRaw2) return [undefined, undefined] as const;
    const a = RANK_TO_VALUE[oppRaw1.rank];
    const b = RANK_TO_VALUE[oppRaw2.rank];
    return a >= b ? ([oppRaw1, oppRaw2] as const) : ([oppRaw2, oppRaw1] as const);
  }, [oppRaw1, oppRaw2, viewingSnapshot]);

  const [youC, youD] = useMemo(() => {
    // When viewing snapshot, use snapshot's hero cards
    if (viewingSnapshot) {
      return [viewingSnapshot.heroCards[0], viewingSnapshot.heroCards[1]] as const;
    }
    
    if (!youRaw1 || !youRaw2) return [undefined, undefined] as const;
    const a = RANK_TO_VALUE[youRaw1.rank];
    const b = RANK_TO_VALUE[youRaw2.rank];
    return a >= b ? ([youRaw1, youRaw2] as const) : ([youRaw2, youRaw1] as const);
  }, [youRaw1, youRaw2, viewingSnapshot]);

  const board = viewingSnapshot 
    ? viewingSnapshot.endedBoard 
    : (displayCards ? displayCards.slice(4, 9) : []);
  
  // Debug: Check if joiner hasn't received state yet
  if (multiplayerActive && !isHost && !mpState) {
  }
  if (multiplayerActive && !isHost && mpState && !mpState.cards) {
  }

  // Dynamic hand rank that updates as board cards are dealt
  const heroHandRank = useMemo(() => {
  if (!youC || !youD) return null;

  // Determine how many board cards are visible based on animation state
  let visibleBoardCount = 0;
  if (dealtCards.flop3) visibleBoardCount = 3;
  if (dealtCards.turn) visibleBoardCount = 4;
  if (dealtCards.river) visibleBoardCount = 5;

  // Preflop: show hand strength with just 2 cards
  if (visibleBoardCount === 0) {
    if (youC.rank === youD.rank) {
      return `Pair of ${pluralRank(RANK_TO_VALUE[youC.rank])}`;
    } else {
      const higherCard = RANK_TO_VALUE[youC.rank] > RANK_TO_VALUE[youD.rank] ? youC : youD;
      return `High Card, ${VALUE_TO_NAME[RANK_TO_VALUE[higherCard.rank]]}`;
    }
  }

  const shownBoard = board.slice(0, visibleBoardCount);
  const score = evaluate7([youC, youD, ...shownBoard]);
  return handRankOnly(score);
}, [youC, youD, board, dealtCards.flop3, dealtCards.turn, dealtCards.river]);

  const oppHandRank = useMemo(() => {
  if (!oppA || !oppB) return null;

  // Determine how many board cards are visible based on animation state
  let visibleBoardCount = 0;
  if (dealtCards.flop3) visibleBoardCount = 3;
  if (dealtCards.turn) visibleBoardCount = 4;
  if (dealtCards.river) visibleBoardCount = 5;

  // Preflop: show hand strength with just 2 cards
  if (visibleBoardCount === 0) {
    if (oppA.rank === oppB.rank) {
      return `Pair of ${pluralRank(RANK_TO_VALUE[oppA.rank])}`;
    } else {
      const higherCard = RANK_TO_VALUE[oppA.rank] > RANK_TO_VALUE[oppB.rank] ? oppA : oppB;
      return `High Card, ${VALUE_TO_NAME[RANK_TO_VALUE[higherCard.rank]]}`;
    }
  }

  const shownBoard = board.slice(0, visibleBoardCount);
  const score = evaluate7([oppA, oppB, ...shownBoard]);
  return handRankOnly(score);
}, [oppA, oppB, board, dealtCards.flop3, dealtCards.turn, dealtCards.river]);

  const heroBest5 = useMemo(() => {
  if (!youC || !youD) return null;
  if (displayStreet === 0) return null; // only postflop
  const shownBoard = board.slice(0, displayStreet);
  return sortBest5ForDisplay(best5From7([youC, youD, ...shownBoard]));
}, [youC, youD, board, displayStreet]);

  const oppBest5 = useMemo(() => {
  if (!oppA || !oppB) return null;
  if (displayStreet === 0) return null; // only postflop
  const shownBoard = board.slice(0, displayStreet);
  return sortBest5ForDisplay(best5From7([oppA, oppB, ...shownBoard]));
}, [oppA, oppB, board, displayStreet]);

  /* post blinds at start of each hand */
useEffect(() => {
  if (!seatedRole) return;

  // Prevent double-execution for the same hand/session (can happen from clustered state updates)
  const blindsKey = `${gameSession}-${handId}`;
  if (blindsKeyRef.current === blindsKey) return;
  blindsKeyRef.current = blindsKey;

    if (!multiplayerActive) {
    setHandStartStacks(gameRef.current.stacks);
    }

    // reset per-hand state
    setHandResult({ status: "playing", winner: null, reason: null, message: "", potWon: 0 });
    allInCallThisHandRef.current = false;
    setStreet(0);
    setChecked({ top: false, bottom: false });
    setLastAggressor(null);
    setLastToActAfterAggro(null);
    setSawCallThisStreet(false);
    setActionsThisStreet(0);
    setLastRaiseSize(BB);

    const topBlind = dealerSeat === "top" ? SB : BB;
    const bottomBlind = dealerSeat === "bottom" ? SB : BB;

    if (!multiplayerActive || isHost) {
      setGame((prev: GameState) => {
        const isLevelChangeHand = handId !== 0 && handId % GAME_CONFIG.BLINDS_INCREASE_EVERY_N_HANDS === 0;
        const mult = isLevelChangeHand ? 0.75 : 1;

        const topScaled = roundToHundredth(prev.stacks.top * mult);
        const bottomScaled = roundToHundredth(prev.stacks.bottom * mult);

        // Cap blinds at available stack if short
        const actualTopBlind = Math.min(topBlind, topScaled);
        const actualBottomBlind = Math.min(bottomBlind, bottomScaled);
        
        const nextGame = {
          pot: 0,
          bets: {
            top: roundToHundredth(actualTopBlind),
            bottom: roundToHundredth(actualBottomBlind),
          },
          stacks: {
            top: roundToHundredth(Math.max(0, topScaled - actualTopBlind)),
            bottom: roundToHundredth(Math.max(0, bottomScaled - actualBottomBlind)),
          },
        };

        // Determine actual SB/BB amounts based on dealer position
        const actualSB = dealerSeat === "top" ? actualTopBlind : actualBottomBlind;
        const actualBB = dealerSeat === "top" ? actualBottomBlind : actualTopBlind;
        
        if (isHost && !suppressMpRef.current) {
  const blindItems = [
    {
      id: uid(),
      sequence: actionSequenceRef.current++,
      street: "Preflop" as StreetName,
      seat: dealerSeat,
      text: `Posts SB ${formatBB(actualSB)}bb`
    },
    {
      id: uid(),
      sequence: actionSequenceRef.current++,
      street: "Preflop" as StreetName,
      seat: nonDealerSeat,
      text: `Posts BB ${formatBB(actualBB)}bb`
    }
  ];

  // Host adds blind actions to its own log immediately BEFORE sending
  setActionLog(blindItems);
  actionLogRef.current = blindItems;
  
}

        return nextGame;
      });
    }

    // who acts first preflop = dealer
    setToAct(dealerSeat);

   setTimeout(() => {
  blindsPostedRef.current = true;

}, 0);

    setBetSize(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatedRole, handId, dealerSeat, gameSession]);

 useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (!(displayToAct === mySeat && displayHandResult.status === "playing")) return;

    const effectiveLastRaiseSize = multiplayerActive && mpState ? mpState.lastRaiseSize : lastRaiseSize;
    const facingBet = displayGame.bets[oppActualSeat] > displayGame.bets[myActualSeat];
    
    // Use same logic as bottomMinRaise calculation
    const minRaise = facingBet 
      ? roundToHundredth(displayGame.bets[oppActualSeat] + effectiveLastRaiseSize)
      : (displayStreet === 0 && displayGame.bets[myActualSeat] > 0 && displayGame.bets[oppActualSeat] > 0)
        ? roundToHundredth(Math.max(displayGame.bets[myActualSeat], displayGame.bets[oppActualSeat]) + BB)
        : BB;
    
    const isOpeningAction = displayGame.bets[myActualSeat] === 0 && displayGame.bets[oppActualSeat] === 0;
    const defaultSize = (displayStreet === 0 && isOpeningAction) ? 2 : minRaise;
    const finalSize = betSize === "" ? defaultSize : Math.max(betSize, minRaise);

    dispatchAction({ type: "BET_RAISE_TO", to: finalSize });
  }

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [displayToAct, mySeat, displayHandResult.status, betSize, displayGame, oppActualSeat, myActualSeat, multiplayerActive, mpState, lastRaiseSize, BB, displayStreet, dispatchAction]);

  function currentFacingBet(seat: Seat) {
    const other: Seat = seat === "top" ? "bottom" : "top";
    return game.bets[other] > game.bets[seat];
  }

  function amountToCall(seat: Seat) {
    const other: Seat = seat === "top" ? "bottom" : "top";
    return roundToHundredth(Math.max(0, displayGame.bets[other] - displayGame.bets[seat]));
  }
  function canCheck(seat: Seat, g: GameState = gameRef.current, st: Street = streetRef.current) {
  const other: Seat = seat === "top" ? "bottom" : "top";
  return roundToHundredth(g.bets[other]) === roundToHundredth(g.bets[seat]);
}

  function settleIfStreetComplete() {
    if (handResult.status !== "playing") return;

    const equalBets = roundToHundredth(game.bets.top) === roundToHundredth(game.bets.bottom);

    if (lastAggressor) {
      if (equalBets && lastToActAfterAggro === null) {
        pullBetsIntoPot();

        if (street < 5) {
  const nextStreet: Street = street === 0 ? 3 : street === 3 ? 4 : 5;

  // If anyone is all-in postflop, run it out to the river immediately
  const someoneAllIn = (game.stacks.top <= 0 || game.stacks.bottom <= 0);

  if (someoneAllIn) {
    // show the full board
    setStreet(5);

    // go straight to showdown
    resolveShowdown();

  } else {
    resetStreetRound(nextStreet);
  }

} else {
  // showdown (existing)
  resolveShowdown();

}

      }
      return;
    }

    const bothChecked = checked.top && checked.bottom;

// Preflop special: SB calls, BB checks => street ends immediately
const preflopCallThenCheckClosed =
  street === 0 &&
  sawCallThisStreet &&
  (checked.top || checked.bottom) &&
  equalBets;

// Postflop: either both checked, OR bet was called then the other checked (your old rule)
const postflopCallThenCheckClosed =
  street !== 0 &&
  sawCallThisStreet &&
  (checked.top || checked.bottom) &&
  actionsThisStreet >= 2;

// NEW: If a bet gets called and someone is all-in, end the street immediately (no check needed)
const allInCallClosed =
  sawCallThisStreet &&
  equalBets &&
  (game.stacks.top <= 0 || game.stacks.bottom <= 0);

if (
  (bothChecked || preflopCallThenCheckClosed || postflopCallThenCheckClosed || allInCallClosed) &&
  equalBets
) {
  pullBetsIntoPot();

  // NEW: if anyone is all-in, run it out to the river and resolve immediately
  if (game.stacks.top <= 0 || game.stacks.bottom <= 0) {
    setStreet(5);

    resolveShowdown();
    return;
  }

   setTimeout(() => {
      if (street < 5) {
        const nextStreet: Street = street === 0 ? 3 : street === 3 ? 4 : 5;
        resetStreetRound(nextStreet);
      } else {
        // River checked through (no betting): out-of-position shows first
        const noBetOnRiver = bothChecked && streetBettor === null;
        resolveShowdown(noBetOnRiver ? nonDealerSeat : null);
      }
    }, 50);
}

  }

  function resolveShowdown(showdownFirstOverride: Seat | null = null) {
  const top7 = [oppA!, oppB!, ...board] as Card[];
  const bottom7 = [youC!, youD!, ...board] as Card[];

  const topScore = evaluate7(top7);
  const bottomScore = evaluate7(bottom7);
  const cmp = compareScore(bottomScore, topScore);

  endedStreetRef.current = 5;
  setEndedBoardSnapshot(5);

  // ✅ DEFINE THESE EARLY - BEFORE logAction calls
  const topBest5 = sortBest5ForDisplay(best5From7(top7));
  const bottomBest5 = sortBest5ForDisplay(best5From7(bottom7));

  // Show order logic
  const firstToShow: Seat = (showdownFirstOverride ?? streetBettor ?? nonDealerSeat) as Seat;
  const secondToShow: Seat = firstToShow === "top" ? "bottom" : "top";
  setShowdownFirst(firstToShow);

  const winner: Seat | "tie" = cmp > 0 ? "bottom" : cmp < 0 ? "top" : "tie";

  const secondShows = winner === "tie" || winner === secondToShow;

  const topShows = firstToShow === "top" || (secondToShow === "top" && secondShows);
  const bottomShows = firstToShow === "bottom" || (secondToShow === "bottom" && secondShows);

  // Control face-up cards in the UI
  setOppRevealed(topShows);
  setYouMucked(!bottomShows);

  // NOW you can use topBest5 and bottomBest5 in logAction
  logAction(
    firstToShow,
    `Shows ${(firstToShow === "top" ? topBest5 : bottomBest5).map(cardStr).join("\u00A0")}`
  );

  if (secondShows) {
    logAction(
      secondToShow,
      `Shows ${(secondToShow === "top" ? topBest5 : bottomBest5).map(cardStr).join("\u00A0")}`
    );
  } else {
    logAction(secondToShow, secondToShow === "top" ? "Opponent mucked" : "You mucked");
  }

  const potTotal = formatBB(
    roundToHundredth(gameRef.current.pot + gameRef.current.bets.top + gameRef.current.bets.bottom)
  );

  if (winner === "bottom") {
    logAction("bottom", `Wins ${potTotal} BB ${bottomBest5.map(cardStr).join("\u00A0")}`);
    endHand("bottom", "showdown", `You win ${potTotal} BB`);
    return;
  }

  if (winner === "top") {
    logAction("top", `Wins ${potTotal} BB ${topBest5.map(cardStr).join("\u00A0")}`);
    endHand("top", "showdown", `Opponent wins ${potTotal} BB`);
    return;
  }

  const halfPot = formatBB(
    roundToHundredth(
      (gameRef.current.pot + gameRef.current.bets.top + gameRef.current.bets.bottom) / 2
    )
  );

  logAction("bottom", `Split pot ${halfPot} BB ${bottomBest5.map(cardStr).join("\u00A0")}`);
  endHand("tie", "showdown", `Split pot ${halfPot} BB`);
}

  function best5From7(all: Card[]) {
  let bestScore: number[] | null = null;
  let bestHand: Card[] = [];

  for (let a = 0; a < all.length - 4; a++) {
    for (let b = a + 1; b < all.length - 3; b++) {
      for (let c = b + 1; c < all.length - 2; c++) {
        for (let d = c + 1; d < all.length - 1; d++) {
          for (let e = d + 1; e < all.length; e++) {
            const hand = [all[a], all[b], all[c], all[d], all[e]];
            const score = evaluate7(hand);
            if (!bestScore || compareScore(score, bestScore) > 0) {
              bestScore = score;
              bestHand = hand;
            }
          }
        }
      }
    }
  }

  return bestHand;
}

function sortBest5ForDisplay(cards: Card[]) {
  const score = evaluate7(cards);
  const cat = score[0];

  const groups = new Map<number, Card[]>();
  for (const c of cards) {
    const v = RANK_TO_VALUE[c.rank];
    const arr = groups.get(v) ?? [];
    arr.push(c);
    groups.set(v, arr);
  }

  const take = (v: number) => {
    const arr = groups.get(v);
    if (!arr || arr.length === 0) return null;
    const c = arr.shift()!;
    if (arr.length === 0) groups.delete(v);
    return c;
  };

  const takeAll = (v: number) => {
    const arr = groups.get(v) ?? [];
    groups.delete(v);
    return arr;
  };

  // Straight / Straight Flush: show in sequence high->low; wheel = 5-4-3-2-A
  if (cat === 4 || cat === 8) {
    const high = score[1];
    const seq =
      high === 5
        ? [5, 4, 3, 2, 14]
        : [high, high - 1, high - 2, high - 3, high - 4];

    return seq.map((v) => take(v)!).filter(Boolean) as Card[];
  }

  // Quads
  if (cat === 7) {
    const quad = score[1];
    const kicker = score[2];
    return [...takeAll(quad), take(kicker)!].filter(Boolean) as Card[];
  }

  // Full House
  if (cat === 6) {
    const trips = score[1];
    const pair = score[2];
    return [...takeAll(trips), ...takeAll(pair)].filter(Boolean) as Card[];
  }

  // Flush (show high->low from score)
  if (cat === 5) {
    const vals = score.slice(1, 6);
    return vals.map((v) => take(v)!).filter(Boolean) as Card[];
  }

  // Trips
  if (cat === 3) {
    const trips = score[1];
    const kickers = score.slice(2);
    return [...takeAll(trips), ...kickers.map((v) => take(v)!)].filter(Boolean) as Card[];
  }

  // Two Pair
  if (cat === 2) {
    const highPair = score[1];
    const lowPair = score[2];
    const kicker = score[3];
    return [...takeAll(highPair), ...takeAll(lowPair), take(kicker)!].filter(Boolean) as Card[];
  }

  // One Pair
  if (cat === 1) {
    const pair = score[1];
    const kickers = score.slice(2);
    return [...takeAll(pair), ...kickers.map((v) => take(v)!)].filter(Boolean) as Card[];
  }

  // High Card
  const vals = score.slice(1, 6);
  return vals.map((v) => take(v)!).filter(Boolean) as Card[];
}

function cards5Str(cards5: Card[]) {
  return cards5.map(cardStr).join(" ");
}

  function actFold(seat: Seat) {
    if (handResult.status !== "playing") return;

    const other: Seat = seat === "top" ? "bottom" : "top";

    logAction(seat, "Folds");
    endedStreetRef.current = street;
    setEndedBoardSnapshot(street);

    const potTotal = formatBB(
  roundToHundredth(displayGame.pot + displayGame.bets.top + displayGame.bets.bottom)
);

logAction(
  other,
  `${other === "bottom" ? "You" : "Opponent"} wins ${potTotal}bb\n(no showdown)`
);

endHand(
  other,
  "fold",
  seat === "bottom" ? "You folded." : "Opponent folded."
);

  }

  function actCheck(seat: Seat) {
  if (handResult.status !== "playing") return;
  if (!canCheck(seat)) return;

  logAction(seat, "Checks");
  setChecked((prev: { top: boolean; bottom: boolean }) => ({ ...prev, [seat]: true }));
  setActionsThisStreet((n: number) => n + 1);

    if (
  street === 0 &&
  sawCallThisStreet &&
  roundToHundredth(game.bets.top) === roundToHundredth(game.bets.bottom)
) {
  return;
}

const other: Seat = seat === "top" ? "bottom" : "top";

setToAct(other);
  }

  function actCall(seat: Seat) {
  if (handResult.status !== "playing") return;

    const toCall = amountToCall(seat);
    const add = roundToHundredth(Math.min(toCall, game.stacks[seat]));

    if (add <= 0) {
      if (canCheck(seat)) actCheck(seat);
      return;
    }

  setGame((prev: GameState) => {
  const other: Seat = seat === "top" ? "bottom" : "top";

  const seatStack = prev.stacks[seat];
  const otherStack = prev.stacks[other];

  const seatBet = prev.bets[seat];
  const otherBet = prev.bets[other];

  const toCallPrev = roundToHundredth(Math.max(0, otherBet - seatBet));
  const addPrev = roundToHundredth(Math.min(toCallPrev, seatStack));

  let newSeatStack = roundToHundredth(Math.max(0, seatStack - addPrev));
  let newSeatBet = roundToHundredth(seatBet + addPrev);

  let newOtherStack = otherStack;
  let newOtherBet = otherBet;

  // If caller couldn't fully call (all-in short), cap the bettor to the matched amount
  // and refund the unmatched remainder back to the bettor's stack.
  if (addPrev < toCallPrev) {
    const refund = roundToHundredth(Math.max(0, newOtherBet - newSeatBet));
    if (refund > 0) {
      newOtherBet = roundToHundredth(newOtherBet - refund);
      newOtherStack = roundToHundredth(newOtherStack + refund);
    }
  }

  return {
    ...prev,
    stacks: {
      ...prev.stacks,
      [seat]: newSeatStack,
      [other]: newOtherStack,
    } as GameState["stacks"],
    bets: {
      ...prev.bets,
      [seat]: newSeatBet,
      [other]: newOtherBet,
    } as GameState["bets"],
  };
});

const callerWillBeAllIn = roundToHundredth(game.stacks[seat] - add) <= 0;
const bettor = streetBettor;
const bettorSeat: Seat = seat === "top" ? "bottom" : "top";
const facingBeforeCall = currentFacingBet(seat);

if (
  facingBeforeCall &&
  (callerWillBeAllIn || game.stacks[bettorSeat] <= 0)
) {
  allInCallThisHandRef.current = true;
}

if (street !== 0 && callerWillBeAllIn && bettor) {
  setShowdownFirst(bettor);

}

    logAction(
  seat,
  `Calls ${formatBB(add)}bb`,
  roundToHundredth(displayGame.pot + displayGame.bets.top + displayGame.bets.bottom + add)
);
    setSawCallThisStreet(true);
    setActionsThisStreet((n: number) => n + 1);

    if (lastToActAfterAggro === seat) {
      setLastToActAfterAggro(null);

    }

    // If this is a river call facing a bet, bettor must show first
if (street === 5 && currentFacingBet(seat)) {
  const bettor = streetBettor;
  if (bettor) {
    setShowdownFirst(bettor);
  }
}

    const other: Seat = seat === "top" ? "bottom" : "top";

    setToAct(other);
  }

  function actBetRaiseTo(seat: Seat, targetTotalBet: number) {
  if (handResult.status !== "playing") return;

  const other: Seat = seat === "top" ? "bottom" : "top";
  const mySeatBet = displayGame.bets[seat];
  const otherSeatBet = displayGame.bets[other];
  const myStack = displayGame.stacks[seat];
  const otherStack = displayGame.stacks[other];

  const isFacing = otherSeatBet > mySeatBet;

  // Calculate minimum raise according to NLHE rules:
  // - If facing a bet/raise: must raise by at least the size of the previous raise
  // - If opening (no bet): minimum is BB
  let minTarget: number;
  
  // Use the correct lastRaiseSize from multiplayer state if available
  const effectiveLastRaiseSize = multiplayerActive && mpState ? mpState.lastRaiseSize : lastRaiseSize;
  
  // Calculate blind notice using correct hand ID
  const effectiveHandId = multiplayerActive && mpState ? mpState.handId : handId;
  const effectiveHandNo = effectiveHandId + 1;
  const withinBlock = ((effectiveHandNo - 1) % GAME_CONFIG.BLINDS_INCREASE_EVERY_N_HANDS) + 1;
  let blindNotice: string | null = null;
  
  if (withinBlock >= GAME_CONFIG.WARNING_STARTS_AT_HAND && withinBlock <= GAME_CONFIG.BLINDS_INCREASE_EVERY_N_HANDS) {
    const remaining = (GAME_CONFIG.BLINDS_INCREASE_EVERY_N_HANDS + 1) - withinBlock;
    blindNotice =
      remaining === 1
        ? "Blinds will change next hand"
        : `Blinds will change in ${remaining} hands`;
  }
  
  if (isFacing) {
    // The previous raise size is stored in lastRaiseSize
    // Min raise = opponent's current bet + lastRaiseSize
    minTarget = roundToHundredth(otherSeatBet + effectiveLastRaiseSize);
  } else {
    // Opening bet: minimum is BB
    minTarget = BB;
  }

  // Maximum we can bet is our total chips
  const maxPossible = roundToHundredth(mySeatBet + myStack);
  
  // Effective maximum: opponent can only call up to their stack
  const maxEffective = roundToHundredth(Math.min(maxPossible, otherSeatBet + otherStack));

  // If we can't meet the minimum raise, we can only call or go all-in
  const canMeetMinRaise = maxEffective >= minTarget;
  
  // If opponent is all-in and we're just matching, that's a call
  const isJustCalling = isFacing && roundToHundredth(maxEffective) === roundToHundredth(otherSeatBet);
  
  if (isJustCalling) {
    actCall(seat);
    return;
  }

  // Determine final target
  let target: number;
  
  if (!canMeetMinRaise) {
    // Can't meet min raise, so go all-in
    target = maxEffective;
  } else {
    // Clamp between min and max
    target = roundToHundredth(clamp(targetTotalBet, minTarget, maxEffective));
  }

  // If somehow we end up matching opponent's bet exactly, that's a call
  if (isFacing && roundToHundredth(target) === roundToHundredth(otherSeatBet)) {
    actCall(seat);
    return;
  }

  const chipsToAdd = roundToHundredth(target - mySeatBet);
  if (chipsToAdd <= 0) return;

  // Update game state
  setGame((prev) => ({
    ...prev,
    stacks: {
      ...prev.stacks,
      [seat]: roundToHundredth(prev.stacks[seat] - chipsToAdd),
    } as GameState["stacks"],
    bets: {
      ...prev.bets,
      [seat]: target,
    } as GameState["bets"],
  }));

  // Calculate the NEW raise size for the next player
  const newRaiseSize = isFacing 
    ? roundToHundredth(target - otherSeatBet)
    : target;
  
  setLastRaiseSize(newRaiseSize);

  // Log the action
  const actionText = isFacing ? `Raises to ${formatBB(target)}bb` : `Bets ${formatBB(target)}bb`;
  logAction(seat, actionText, roundToHundredth(displayGame.pot + displayGame.bets.top + displayGame.bets.bottom + chipsToAdd));

  setStreetBettor(seat);
  setActionsThisStreet((n: number) => n + 1);
  setChecked({ top: false, bottom: false });
  setLastAggressor(seat);
  setLastToActAfterAggro(other);
  setToAct(other);
}

    type GameAction =
    | { type: "FOLD" }
    | { type: "CHECK" }
    | { type: "CALL" }
    | { type: "BET_RAISE_TO"; to: number };

  function dispatchAction(action: GameAction) {
  // Prevent rapid successive clicks (fixes auto-check bug from double-clicking)
  if (actionInProgress) {
    return;
  }

  // Set flag to prevent additional clicks for 300ms
  setActionInProgress(true);
  setTimeout(() => setActionInProgress(false), 300);

  // In multiplayer mode, use the controllers
  if (multiplayerActive && mpState) {
    const seat: Seat = mySeat;

    if (mpState.handResult.status !== "playing") {
      return;
    }
    if (mpState.toAct !== seat) {
      return;
    }

    if (isHost && mpHost) {
      // HOST: Process action directly
      mpHost.processAction(seat, action);
      // Update our display
      const newState = JSON.parse(JSON.stringify(mpHost.getState()));
      setMpState(newState);
      // Save state for reconnection
      sessionStorage.setItem('headsup_hostState', JSON.stringify(newState));
    } else if (mpChannelRef.current) {
      // JOINER: Send action to host directly via channel
      mpChannelRef.current.send({
        type: "broadcast",
        event: "mp",
        payload: {
          event: "ACTION",
          seat,
          action,
          sender: sbUser?.id ?? 'joiner',
        },
      });
    }
    return;
  }
  
  // Single-player mode (keep your existing logic)
  if (handResult.status !== "playing") return;
  if (gameOverRef.current) return;
  if (toAct !== mySeat) return;
  
  switch (action.type) {
    case "FOLD":
      actFold(mySeat);
      return;
    case "CHECK":
      actCheck(mySeat);
      return;
    case "CALL":
      actCall(mySeat);
      return;
    case "BET_RAISE_TO":
      actBetRaiseTo(mySeat, action.to);
      return;
  }
}

  /* ---------- opponent random behavior ---------- */

  function pickOpponentBetSize(st: Street) {
    const g = gameRef.current;
    const potNow = roundToHundredth(g.pot + g.bets.top + g.bets.bottom);


    if (st === 0) {
      const options = [2.5, 3, 4, 5];
      return options[Math.floor(Math.random() * options.length)];
    }

    const fractions = [0.33, 0.5, 0.75];
    const f = fractions[Math.floor(Math.random() * fractions.length)];
    const desiredAdd = roundToHundredth(potNow * f);

    return roundToHundredth(game.bets.top + desiredAdd);
  }

  function opponentAct() {
  if (multiplayerActive) return;

  if (handResult.status !== "playing") return;
  if (toAct !== "top") return;

  const tooMany = actionsThisStreet >= 4;
  const st = street;

  // Use latest game state (avoids stale reads that caused illegal "Checks")
  const g = gameRef.current;
  if (streetRef.current === 0 && (g.bets.top === 0 || g.bets.bottom === 0)) return;

 const callAmt = roundToHundredth(Math.max(0, g.bets.bottom - g.bets.top));
  const facing = callAmt > 0;

  // If not facing a bet, opponent may check or bet
  if (!facing) {
 
  const r = Math.random();
  if (tooMany || r < 0.62) {
    actCheck("top");
    return;
  }

  actBetRaiseTo("top", pickOpponentBetSize(st));
  return;
}

  // Facing a bet: opponent must fold / call / raise (NO checking)
  const potNow = roundToHundredth(g.pot + g.bets.top + g.bets.bottom);
  const pressure = potNow > 0 ? clamp(callAmt / potNow, 0, 1) : 0.25;

  const foldP = clamp(0.12 + pressure * 0.35, 0.05, 0.55);
  const raiseP = tooMany ? 0 : clamp(0.18 - pressure * 0.1, 0.06, 0.22);

  const r = Math.random();
  if (r < foldP) {
    actFold("top");
    return;
  }

  if (r < foldP + raiseP) {
    const curr = g.bets.top;
    const otherBet = g.bets.bottom;

    const minRaiseTo = roundToHundredth(otherBet + lastRaiseSize);
    const target = pickOpponentBetSize(st);

    actBetRaiseTo("top", Math.max(target, minRaiseTo));
    return;
  }

  actCall("top");
}

  // opponent takes 6 seconds per decision
  useEffect(() => {
    if (!seatedRole) return;
    if (handResult.status !== "playing") return;
    if (toAct !== "top") return;
    if (!aiEnabled || gamePin) return;

    if (opponentTimerRef.current) window.clearTimeout(opponentTimerRef.current);
opponentTimerRef.current = window.setTimeout(() => {
  opponentAct();

  // If AI was toggled OFF mid-opponent-turn, let this be the last action,
  // then force AI OFF.
  if (pendingAiOffRef.current) {
    pendingAiOffRef.current = false;
    setAiEnabled(false);
  }
}, 6000);
 
    return () => {
      if (opponentTimerRef.current) window.clearTimeout(opponentTimerRef.current);
      opponentTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [toAct, handResult.status, street, seatedRole, game.bets.top, game.bets.bottom, aiEnabled]);

  // settle / advance street
  useEffect(() => {
    if (!seatedRole) return;
    if (multiplayerActive) return; // Host controller handles this in multiplayer
    if (handResult.status !== "playing") return;
    settleIfStreetComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    game.bets.top,
    game.bets.bottom,
    checked.top,
    checked.bottom,
    lastAggressor,
    lastToActAfterAggro,
  ]);

  useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      setLogViewOffset((prev) =>
        Math.min(prev + 1, handLogHistory.length)
      );
    }

    if (e.key === "ArrowRight") {
      setLogViewOffset((prev) =>
        Math.max(prev - 1, 0)
      );
    }
  }

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [handLogHistory.length]);

// Capture hand history snapshot when hand ends in multiplayer
useEffect(() => {
  if (!multiplayerActive || !mpState) return;
  if (mpState.handResult.status !== "ended") return;
  
  // Extract cards from perspective
  const myCards = mySeat === "bottom" 
    ? [displayCards?.[2], displayCards?.[3]]
    : [displayCards?.[0], displayCards?.[1]];
  
  const oppCards = mySeat === "bottom"
    ? [displayCards?.[0], displayCards?.[1]]
    : [displayCards?.[2], displayCards?.[3]];
  
  if (!myCards[0] || !myCards[1] || !oppCards[0] || !oppCards[1]) return;
  
  // Calculate best 5-card hands if hand went to showdown
  let heroBest5: Card[] | undefined;
  let oppBest5: Card[] | undefined;
  let heroHandDesc: string | undefined;
  let oppHandDesc: string | undefined;
  
  if (mpState.street >= 3 && mpState.handResult.reason === "showdown") {
    const finalBoard = board.slice(0, mpState.street);
    const hero7 = [myCards[0], myCards[1], ...finalBoard];
    const opp7 = [oppCards[0], oppCards[1], ...finalBoard];
    
    heroBest5 = sortBest5ForDisplay(best5From7(hero7));
    oppBest5 = sortBest5ForDisplay(best5From7(opp7));
    
    const heroScore = evaluate7(hero7);
    const oppScore = evaluate7(opp7);
    
    heroHandDesc = handDesc(heroScore);
    oppHandDesc = handDesc(oppScore);
  }
  
  // Determine if hero and opponent showed by checking action log
  const heroShown = (() => {
    // You ALWAYS see your own cards in hand history (for review purposes)
    return true;
  })();
  
  // oppRevealed is from host's perspective (host = bottom, so oppRevealed = top showed)
  // If I'm top (joiner), then oppRevealed means I showed, not opponent
  // If I'm bottom (host), then oppRevealed means opponent showed
  const oppShown = (
    // At showdown, check if opponent was required to show
    (mpState.handResult.reason === "showdown" && (
      mySeat === "bottom" 
        ? mpState.oppRevealed  // I'm host: oppRevealed = top showed = opponent showed
        : !mpState.youMucked   // I'm joiner: youMucked = bottom mucked = opponent mucked, so !youMucked = opponent showed
    ))
    // OR if opponent clicked Show Hand button
    || (mySeat === "bottom" ? mpState.topShowed : mpState.bottomShowed)
  );
  
  const snap: HandLogSnapshot = {
    handNo: mpState.handId,
    dealer: mpState.dealerSeat,
    endedStreet: mpState.street,
    endedBoard: board.slice(0, mpState.street),
    log: mpState.actionLog,
    
    heroPos: mpState.dealerSeat === mySeat ? "SB" : "BB",
    oppPos: mpState.dealerSeat === mySeat ? "BB" : "SB",
    
    heroCards: RANK_TO_VALUE[myCards[0].rank] >= RANK_TO_VALUE[myCards[1].rank]
      ? [myCards[0], myCards[1]]
      : [myCards[1], myCards[0]],
    
    oppCards: RANK_TO_VALUE[oppCards[0].rank] >= RANK_TO_VALUE[oppCards[1].rank]
      ? [oppCards[0], oppCards[1]]
      : [oppCards[1], oppCards[0]],
    
    heroShown,
    oppShown,
    
    heroStartStack: mpState.handStartStacks[mySeat],
    oppStartStack: mpState.handStartStacks[mySeat === "bottom" ? "top" : "bottom"],

    heroHandRank: heroHandDesc ? handRankOnly(evaluate7([myCards[0], myCards[1], ...board.slice(0, mpState.street)])) : null,
    oppHandRank: oppHandDesc ? handRankOnly(evaluate7([oppCards[0], oppCards[1], ...board.slice(0, mpState.street)])) : null,

    heroBest5,
    oppBest5,
    heroHandDesc,
    oppHandDesc,
  };
  
  setHandLogHistory((prev) => {
    // Update existing snapshot if it exists for this hand (to capture show actions), otherwise add new one
    if (prev.length > 0 && prev[0]?.handNo === snap.handNo) {
      // Only update if the action log actually changed (has more actions)
      const prevActionCount = prev[0].log.length;
      const newActionCount = snap.log.length;
      
      if (newActionCount > prevActionCount) {
        // Replace the first (most recent) snapshot with updated version that includes new actions
        const newHistory = [snap, ...prev.slice(1)];
        sessionStorage.setItem('headsup_handHistory', JSON.stringify(newHistory));
        return newHistory;
      }
      // No change in action count, don't update
      return prev;
    }
    const newHistory = [snap, ...prev].slice(0, 30);
    sessionStorage.setItem('headsup_handHistory', JSON.stringify(newHistory));
    return newHistory;
  });
}, [mpState?.handResult.status, mpState?.actionLog?.length, multiplayerActive, mySeat, displayCards, board]);

// auto next hand 5 seconds after hand ends
useEffect(() => {
  const currentHandResult = multiplayerActive && mpState ? mpState.handResult : handResult;
  
  if (currentHandResult.status !== "ended") return;

  // Snapshot hand history when hand ends (for both host and joiner)
  if (multiplayerActive && mpState && cards) {
    // Create snapshot from mpState
    const endedSt = mpState.street;
    const board = cards.slice(4, 9);
    
    const myCards = mySeat === "bottom" ? [cards[2], cards[3]] : [cards[0], cards[1]];
    const oppCards = mySeat === "bottom" ? [cards[0], cards[1]] : [cards[2], cards[3]];
    
    const snap: HandLogSnapshot = {
      handNo: mpState.handId,
      dealer: mpState.dealerSeat,
      endedStreet: endedSt,
      endedBoard: board.slice(0, endedSt),
      log: mpState.actionLog,
      heroPos: (mpState.dealerSeat === mySeat ? "SB" : "BB") as "SB" | "BB",
      oppPos: (mpState.dealerSeat === mySeat ? "BB" : "SB") as "SB" | "BB",
      heroCards: myCards.sort((a, b) => RANK_TO_VALUE[b.rank] - RANK_TO_VALUE[a.rank]) as [Card, Card],
      oppCards: oppCards.sort((a, b) => RANK_TO_VALUE[b.rank] - RANK_TO_VALUE[a.rank]) as [Card, Card],
      heroShown: true,
      oppShown: mpState.oppRevealed,
      heroStartStack: mpState.handStartStacks[mySeat],
      oppStartStack: mpState.handStartStacks[mySeat === "bottom" ? "top" : "bottom"],
      heroHandRank: endedSt >= 3 ? handRankOnly(evaluate7([...myCards, ...board.slice(0, endedSt)])) : null,
      oppHandRank: endedSt >= 3 ? handRankOnly(evaluate7([...oppCards, ...board.slice(0, endedSt)])) : null,
    };
    
    setHandLogHistory((prev: HandLogSnapshot[]) => {
      // Don't add duplicate snapshots for the same hand
if (prev.length > 0 && prev[0]?.handNo === snap.handNo) return prev;
return [snap, ...prev].slice(0, 30);
    });
  } else if (!multiplayerActive) {
    // Single player snapshot (existing logic)
    setTimeout(() => snapshotCurrentHandLog(), 0);
  }

 // Check for game over from multiplayer state or local state
  const effectiveGameOver = (multiplayerActive && mpState) ? mpState.gameOver : gameOver;
  
  if (effectiveGameOver || gameOverRef.current) {
    if (nextHandTimerRef.current) {
      window.clearTimeout(nextHandTimerRef.current);
      nextHandTimerRef.current = null;
    }
    return;
  }

  // Only host starts the next hand in multiplayer
  if (multiplayerActive && !isHost) return;

  if (nextHandTimerRef.current) window.clearTimeout(nextHandTimerRef.current);

  // For all-in situations, delay longer to allow for board animation + win animations
  // Normal: 8s, All-in: 15s (1s + 1.5s + 2s + 3s board + 1s pause + time to see result)
  const wasAllIn = allInCallThisHandRef.current ||
                   (multiplayerActive && mpState && mpState.oppRevealed && mpState.street === 5);
  const nextHandDelay = wasAllIn ? 15000 : 8000;

 nextHandTimerRef.current = window.setTimeout(() => {
  if (multiplayerActive && isHost && mpHost) {
    // Check one more time before starting
    const currentState = mpHost.getState();
    if (!currentState) return;

    if (currentState.game.stacks.top > 0 && currentState.game.stacks.bottom > 0) {
      mpHost.startHand();
      const newState = JSON.parse(JSON.stringify(mpHost.getState()));
      setMpState(newState);
      // Save state for reconnection
      sessionStorage.setItem('headsup_hostState', JSON.stringify(newState));
    }
    return;
  }

  if (!multiplayerActive) {
    startNewHand();
  }
}, nextHandDelay);


  return () => {
    if (nextHandTimerRef.current) {
      window.clearTimeout(nextHandTimerRef.current);
      nextHandTimerRef.current = null;
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [multiplayerActive, isHost, mpHost, mpState?.handResult.status, handResult.status, mySeat, cards]);

// Always clear betSize when it becomes our turn or when street/betting changes
useEffect(() => {
  if (displayToAct !== mySeat) return;
  if (displayHandResult.status !== "playing") return;
  
  // Clear input box on every turn
  setBetSize("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [displayToAct, mySeat, displayStreet, displayGame.bets.top, displayGame.bets.bottom]);

/* ---------- connections / messages hooks ---------- */

// Fetch connected users and unread counts
useEffect(() => {
  if (!sbUser?.id) return;
  if (screen !== 'connections' && screen !== 'dashboard' && screen !== 'professionalDashboard') return;
  
  // Clear selected chat user when not on connections screen
  if (screen !== 'connections') {
    setSelectedChatUser(null);
  }
  
  async function fetchConnectedUsers() {
    const { data: connectionsData } = await supabase
      .from('connections')
      .select('*')
      .or(`requester_id.eq.${sbUser!.id},recipient_id.eq.${sbUser!.id}`)
      .eq('status', 'accepted');
    
    if (!connectionsData || connectionsData.length === 0) {
      setConnectedUsers([]);
      return;
    }
    
    const otherUserIds = connectionsData.map(conn => 
      conn.requester_id === sbUser!.id ? conn.recipient_id : conn.requester_id
    );
    
    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, first_name, last_name, linkedin_url')
      .in('id', otherUserIds);
    
    if (profiles) {
      setConnectedUsers(profiles.map(p => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        linkedinUrl: p.linkedin_url,
      })));
    }
    
    // Fetch last message and unread count for each connection
    const lastMsgs = new Map<string, { text: string; createdAt: string; senderId: string }>();
    const unreadMap = new Map<string, number>();
    
    for (const odId of otherUserIds) {
      // Get last message in conversation
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${sbUser!.id},recipient_id.eq.${odId}),and(sender_id.eq.${odId},recipient_id.eq.${sbUser!.id})`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (lastMsg) {
        lastMsgs.set(odId, {
          text: lastMsg.text,
          createdAt: lastMsg.created_at,
          senderId: lastMsg.sender_id,
        });
      }
      
      // Count unread messages (messages from them that we haven't "read")
      // For now, we'll consider messages unread if they're from the other person
      // and the conversation isn't currently selected
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('sender_id', odId)
        .eq('recipient_id', sbUser!.id)
        .eq('read', false);
      
      if (count && count > 0) {
        unreadMap.set(odId, count);
      }
    }
    
    setLastMessages(lastMsgs);
    setUnreadCounts(unreadMap);
  }
  
  fetchConnectedUsers();
}, [sbUser?.id, screen]);

// Real-time subscription for new messages (updates badge in real-time)
useEffect(() => {
  if (!sbUser?.id) return;
  if (screen !== 'connections' && screen !== 'dashboard' && screen !== 'professionalDashboard') return;
  
  const channel = supabase
    .channel(`new-messages-${sbUser.id}-${screen}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `recipient_id=eq.${sbUser.id}`,
    }, (payload) => {
      const m = payload.new as any;
      
      // Only increment unread if this conversation isn't currently open
      if (selectedChatUser?.id !== m.sender_id) {
        setUnreadCounts(prev => {
          const next = new Map(prev);
          const current = next.get(m.sender_id) || 0;
          next.set(m.sender_id, current + 1);
          return next;
        });
        
        // Update last message
        setLastMessages(prev => {
          const next = new Map(prev);
          next.set(m.sender_id, {
            text: m.text,
            createdAt: m.created_at,
            senderId: m.sender_id,
          });
          return next;
        });
      }
    })
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}, [sbUser?.id, screen, selectedChatUser?.id]);

// Fetch messages when a chat is selected
useEffect(() => {
  if (!sbUser?.id || !selectedChatUser) return;
  if (screen !== 'connections') return;
  
  async function fetchMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${sbUser!.id},recipient_id.eq.${selectedChatUser!.id}),and(sender_id.eq.${selectedChatUser!.id},recipient_id.eq.${sbUser!.id})`)
      .order('created_at', { ascending: true });
    
    if (data) {
      setMessages(data.map(m => ({
        id: m.id,
        senderId: m.sender_id,
        text: m.text,
        createdAt: m.created_at,
      })));
    }
    
    // Mark messages as read when opening conversation
    const { data: updateData, error: updateError } = await supabase
      .from('messages')
      .update({ read: true })
      .eq('sender_id', selectedChatUser!.id)
      .eq('recipient_id', sbUser!.id)
      .select();
    
    if (updateError) {
    }
    
    // Clear unread count for this user immediately in UI
    setUnreadCounts(prev => {
      const next = new Map(prev);
      next.delete(selectedChatUser!.id);
      return next;
    });
  }
  
  fetchMessages();
  
  // Scroll to bottom after messages load
  setTimeout(() => {
    const messagesContainer = document.querySelector('[data-messages-container]');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, 200);
  
  // Subscribe to new messages
  const channel = supabase
    .channel(`messages-${sbUser.id}-${selectedChatUser.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
    }, (payload) => {
      const m = payload.new as any;
      if ((m.sender_id === sbUser!.id && m.recipient_id === selectedChatUser!.id) ||
          (m.sender_id === selectedChatUser!.id && m.recipient_id === sbUser!.id)) {
        setMessages(prev => {
          if (prev.some(msg => msg.id === m.id)) return prev;
          return [...prev, {
            id: m.id,
            senderId: m.sender_id,
            text: m.text,
            createdAt: m.created_at,
          }];
        });
        
        // Update last message for this conversation
        setLastMessages(prev => {
          const next = new Map(prev);
          next.set(selectedChatUser.id, {
            text: m.text,
            createdAt: m.created_at,
            senderId: m.sender_id,
          });
          return next;
        });
        
        // Mark as read immediately since chat is open
        if (m.sender_id === selectedChatUser.id) {
          supabase
            .from('messages')
            .update({ read: true })
            .eq('id', m.id)
            .then(() => {
              // Also clear unread count for this user in UI
              setUnreadCounts(prev => {
                const next = new Map(prev);
                next.delete(selectedChatUser.id);
                return next;
              });
            });
        }
      }
    })
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}, [sbUser?.id, selectedChatUser?.id, screen]);

async function sendMessage() {
  if (!sbUser?.id || !selectedChatUser) return;
  
  // === INPUT VALIDATION ===
  const messageValidation = validateMessage(messageInput);
  if (!messageValidation.valid) {
    alert(messageValidation.error);
    return;
  }
  
  // Rate limiting handled client-side
  const rateLimitCheck = checkRateLimit('MESSAGE_SEND', sbUser.id);
  if (!rateLimitCheck.allowed) {
    alert(rateLimitCheck.message);
    return;
  }
  recordRateLimitAttempt('MESSAGE_SEND', sbUser.id);
  
  const { error } = await supabase
    .from('messages')
    .insert({
      sender_id: sbUser.id,
      recipient_id: selectedChatUser.id,
      text: messageValidation.sanitized,
      read: false,
    });
  
  if (error) {
    if (error.code === '42501') {
      alert('You can only message your connections.');
    } else {
      alert('Failed to send message. Please try again.');
    }
    return;
  }
  
  setMessageInput("");
}

// Scroll to bottom when you send a message
useEffect(() => {
  if (messages.length === 0) return;
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.senderId === sbUser?.id) {
    const messagesContainer = document.querySelector('[data-messages-container]');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }
}, [messages, sbUser?.id]);

/* ---------- loading screen while reconnecting ---------- */

if (isReconnecting) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-4">HeadsUp</h1>
        <div className="text-white/70">Loading...</div>
      </div>
    </main>
  );
}

/* ---------- title screen ---------- */

if (screen === "role") {

  const baseButton = selectedTheme === "notebook"
    ? "w-full px-6 font-caveat text-xl font-bold transition-all duration-200 relative"
    : "w-full rounded-3xl border border-white/20 text-white px-6 font-semibold transition-all duration-300 hover:bg-white hover:border-white hover:text-black hover:scale-[1.02] hover:shadow-[0_20px_50px_rgba(255,255,255,0.1)] active:scale-[0.98]";

  const titleBusy = creatingGame || isCreatingPin;
  const disabledLinkClass = "opacity-40 cursor-not-allowed pointer-events-none";

const createGame = async () => {
  if (creatingGame) return;

  setCreatingGame(true);
  try {
    clearTimers();
    setJoinMode(false);
    setJoinPinInput("");

    await createPinGame();
  } finally {
    setCreatingGame(false);
  }
};

const joinGame = () => {
  if (isCreatingPin) return;

  clearTimers();
  setGamePin(null);
  setJoinMode(true);
  setJoinPinInput("");
};

  const clearPin = () => {
  setGamePin(null);
  setJoinMode(false);
  setJoinPinInput("");
};

  return (
    <main className={`relative flex min-h-screen items-center justify-center px-6 overflow-hidden ${
      selectedTheme === "notebook"
        ? "bg-[#f5f1e8]"
        : "bg-gradient-to-br from-gray-900 via-black to-gray-900"
    }`} style={selectedTheme === "notebook" ? {
      backgroundImage: `
        repeating-linear-gradient(
          0deg,
          transparent,
          transparent 31px,
          rgba(0,0,0,0.08) 31px,
          rgba(0,0,0,0.08) 33px
        ),
        linear-gradient(90deg, rgba(255,100,100,0.15) 0px, transparent 2px),
        linear-gradient(90deg, rgba(100,100,255,0.15) 60px, transparent 2px)
      `,
      backgroundSize: '100% 33px, 100% 100%, 100% 100%'
    } : {}}>

    {/* Professional theme background elements */}
    {selectedTheme === "default" && (
      <>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-shift"></div>
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }}></div>
      </>
    )}

    {/* Notebook texture overlay */}
    {selectedTheme === "notebook" && (
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23noise)\' /%3E%3C/svg%3E")',
      }} />
    )}

    <div
  className={`absolute top-6 right-6 flex items-center gap-4 z-10 ${
    selectedTheme === "default" ? "animate-fade-in" : ""
  } ${titleBusy ? "opacity-30 pointer-events-none" : ""}`}
>
 {studentProfile.firstName && studentProfile.lastName && !gamePin ? (
  <>
    <div className="relative">
      <button
        type="button"
        onClick={() => setStudentMenuOpen((o) => !o)}
        className="text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-white underline opacity-90 hover:opacity-100"
      >
        {studentProfile.firstName} {studentProfile.lastName}
      </button>

      {studentMenuOpen && (
        <div className="absolute right-0 mt-2 w-40 min-[1536px]:max-[1650px]:w-32 rounded-xl min-[1536px]:max-[1650px]:rounded-lg border bg-white shadow-md">
          <button
            type="button"
            onClick={() => {
              setStudentMenuOpen(false);
              setEditProfileReturnScreen("role");
              setScreen("editProfile");
            }}
            className="w-full flex items-center px-4 py-2 min-[1536px]:max-[1650px]:px-3 min-[1536px]:max-[1650px]:py-1.5 text-left text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-black hover:bg-gray-100"
          >
            Edit Profile
          </button>
          <button
            type="button"
            onClick={() => {
              setStudentMenuOpen(false);
              resetGame();
              setOtherStudents([]);
              setOtherProfessionals([]);
              setStudentProfile({
                firstName: "",
                lastName: "",
                email: "",
                password: "",
                year: "",
                major: "",
                school: "",
                company: "",
                workTitle: "",
                linkedinUrl: "",
              });
              setSeatedRole(null);
              setScreen("role");
            }}
            className="w-full flex items-center px-4 py-2 min-[1536px]:max-[1650px]:px-3 min-[1536px]:max-[1650px]:py-1.5 text-left text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-black hover:bg-gray-100"
          >
            Log out
          </button>
        </div>
      )}
    </div>

    {!gamePin && (
  <>
    <button
      type="button"
      onClick={() =>
        setScreen(
          seatedRole === "professional"
            ? "professionalDashboard"
            : "dashboard"
        )
      }
      className={`text-sm min-[1536px]:max-[1650px]:text-xs font-semibold ${
        selectedTheme === "notebook"
          ? "font-caveat text-lg text-gray-800 hover:text-[#2563eb] no-underline"
          : "text-white underline opacity-80 hover:opacity-100"
      }`}
    >
      Dashboard
    </button>
    <button
      type="button"
      onClick={() => {
        setIsGuestBrowsing(true);
        navigateTo("dashboard");
      }}
      className={`text-sm min-[1536px]:max-[1650px]:text-xs font-semibold ${
        selectedTheme === "notebook"
          ? "font-caveat text-lg text-gray-800 hover:text-[#dc2626] no-underline"
          : "text-white underline opacity-80 hover:opacity-100"
      }`}
    >
      Explore
    </button>
  </>
)}

  </>
) : (
  !gamePin ? (
    <>
      <button
        type="button"
        onClick={() => {
          clearTimers();
          navigateTo("studentLogin");
        }}
        className={`text-sm min-[1536px]:max-[1650px]:text-xs font-semibold ${
          selectedTheme === "notebook"
            ? "font-caveat text-lg text-gray-800 hover:text-[#2563eb] no-underline"
            : "text-white underline opacity-80 hover:opacity-100"
        }`}
      >
        Log in
      </button>

      <button
        type="button"
        onClick={() => {
          clearTimers();

          setOtherStudents([]);
          setOtherProfessionals([]);

          setSeatedRole(null);
          navigateTo("studentProfile");
        }}
        className={`text-sm min-[1536px]:max-[1650px]:text-xs font-semibold ${
          selectedTheme === "notebook"
            ? "font-caveat text-lg text-gray-800 hover:text-[#16a34a] no-underline"
            : "text-white underline opacity-80 hover:opacity-100"
        }`}
      >
        Sign up
      </button>

      <button
        type="button"
        onClick={() => {
          setIsGuestBrowsing(true);
          navigateTo("dashboard");
        }}
        className={`text-sm min-[1536px]:max-[1650px]:text-xs font-semibold ${
          selectedTheme === "notebook"
            ? "font-caveat text-lg text-gray-800 hover:text-[#dc2626] no-underline"
            : "text-white underline opacity-80 hover:opacity-100"
        }`}
      >
        Explore
      </button>

      <button
        type="button"
        onClick={() => {
          clearTimers();
          navigateTo("about");
        }}
        className={`text-sm min-[1536px]:max-[1650px]:text-xs font-semibold ${
          selectedTheme === "notebook"
            ? "font-caveat text-lg text-gray-800 hover:text-[#ea580c] no-underline"
            : "text-white underline opacity-80 hover:opacity-100"
        }`}
      >
        About
      </button>

      {/* THEME BUTTON - Temporarily hidden, notebook theme code preserved below */}
      {/* <div className="relative">
        <button
          type="button"
          onClick={() => setThemeMenuOpen((o) => !o)}
          className={`text-sm min-[1536px]:max-[1650px]:text-xs font-semibold ${
            selectedTheme === "notebook"
              ? "font-caveat text-lg text-gray-800 hover:text-[#9333ea] no-underline"
              : "text-white underline opacity-80 hover:opacity-100"
          }`}
        >
          Theme
        </button>

        {themeMenuOpen && (
          <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-white shadow-lg z-10">
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                Select Theme
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedTheme("default");
                  setThemeMenuOpen(false);
                }}
                className={`w-full flex flex-col items-start px-3 py-2.5 text-left rounded-lg hover:bg-gray-100 ${
                  selectedTheme === "default" ? "bg-gray-100" : ""
                }`}
              >
                <span className="text-sm font-semibold text-black">Default</span>
                <span className="text-xs text-gray-500">Simple black & white</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedTheme("notebook");
                  setThemeMenuOpen(false);
                }}
                className={`w-full flex flex-col items-start px-3 py-2.5 text-left rounded-lg hover:bg-gray-100 ${
                  selectedTheme === "notebook" ? "bg-gray-100" : ""
                }`}
              >
                <span className="text-sm font-semibold text-black">Notebook</span>
                <span className="text-xs text-gray-500">Hand-drawn infographic style</span>
              </button>
            </div>
          </div>
        )}
      </div> */}
    </>
  ) : null
)}

</div>

      <div className="w-full max-w-xl min-[1536px]:max-[1650px]:max-w-[450px] flex flex-col relative z-10">
        {selectedTheme === "notebook" && (
          <>
            {/* Hand-drawn arrow pointing to title */}
            <div className="absolute -left-32 top-8 text-[#2563eb] opacity-70 rotate-[-5deg]">
              <svg width="80" height="60" viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 30 Q 40 25, 60 28 L 55 20 M 60 28 L 52 32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              </svg>
              <span className="text-xs font-caveat block -mt-2 ml-2">Check this out!</span>
            </div>

            {/* Coffee cup doodle */}
            <div className="absolute -right-28 top-12 text-[#dc2626] opacity-60 rotate-[8deg]">
              <svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 15 Q 8 12, 10 10 L 30 10 Q 32 12, 32 15 L 30 35 Q 30 38, 27 40 L 13 40 Q 10 38, 10 35 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M32 20 L 36 20 Q 38 20, 38 23 L 38 27 Q 38 30, 36 30 L 32 30" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M12 45 L 28 45" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
          </>
        )}

        <h1 className={`mb-3 min-[1536px]:max-[1650px]:mb-2 text-center font-bold relative ${
          selectedTheme === "notebook"
            ? "text-6xl min-[1536px]:max-[1650px]:text-5xl font-permanent-marker text-[#1e40af] transform -rotate-1"
            : "text-5xl min-[1536px]:max-[1650px]:text-4xl text-white tracking-tight animate-slide-up"
        }`}>
          {selectedTheme === "notebook" && (
            <span className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-64 h-3 bg-yellow-200 opacity-40 -rotate-1 -z-10"></span>
          )}
          HeadsUp
        </h1>

        <p className={`mb-12 min-[1536px]:max-[1650px]:mb-8 text-center relative ${
          selectedTheme === "notebook"
            ? "text-lg min-[1536px]:max-[1650px]:text-base font-caveat text-gray-700 leading-relaxed px-8"
            : "text-base min-[1536px]:max-[1650px]:text-sm text-white/60 leading-relaxed max-w-md mx-auto animate-slide-up-delay-1"
        }`}>
          {selectedTheme === "notebook" ? (
            <>
              <span className="inline-block transform -rotate-1">Making coffee chats more</span>
              <br />
              <span className="inline-block transform rotate-1">memorable & engaging through</span>
              <br />
              <span className="inline-block">structured interaction</span>
            </>
          ) : (
            "Making coffee chats more memorable and engaging through structured interaction."
          )}
        </p>

      <div className="h-[220px] min-[1536px]:max-[1650px]:h-[180px] flex flex-col justify-start">

    {/* CREATE GAME PIN VIEW */}
{gamePin && !joinMode && (
  <div className="flex flex-col items-center gap-6 relative">
    {selectedTheme === "notebook" && (
      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-[#dc2626] font-caveat text-sm rotate-[-3deg]">
        Share this PIN! ↓
      </div>
    )}
    <div className={`${
      selectedTheme === "notebook"
        ? "text-3xl font-permanent-marker text-[#2563eb] px-8 py-4 relative"
        : "text-lg min-[1536px]:max-[1650px]:text-sm font-semibold tabular-nums text-white"
    }`} style={selectedTheme === "notebook" ? {
      background: 'rgba(191, 219, 254, 0.3)',
      border: '4px solid #2563eb',
      borderRadius: '12px 18px 15px 20px',
      boxShadow: '4px 4px 0px rgba(37, 99, 235, 0.2)'
    } : {}}>
      {selectedTheme === "notebook" ? (
        <>
          <span className="text-lg font-caveat block mb-1 text-gray-700">Game PIN:</span>
          <span className="font-bold tracking-wider">{gamePin}</span>
        </>
      ) : (
        <>Game PIN: <span className="font-bold">{gamePin}</span></>
      )}
    </div>

    <button
      onClick={clearPin}
      className={`${baseButton} ${
        selectedTheme === "notebook"
          ? "py-4 text-xl text-gray-700 hover:scale-105 transform rotate-[1deg]"
          : "py-4 min-[1536px]:max-[1650px]:py-3 text-base min-[1536px]:max-[1650px]:text-xs"
      } max-w-sm min-[1536px]:max-[1650px]:max-w-[280px]`}
      style={selectedTheme === "notebook" ? {
        background: 'rgba(229, 229, 229, 0.5)',
        border: '2px solid #6b7280',
        borderRadius: '10px 15px 12px 16px',
        boxShadow: '2px 3px 0px rgba(107, 114, 128, 0.2)'
      } : {}}
    >
      Back
    </button>
  </div>
)}

  {/* JOIN GAME INPUT VIEW */}
  {!gamePin && joinMode && (
    <div className="flex flex-col items-center gap-6 relative">
      {selectedTheme === "notebook" && (
        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-[#16a34a] font-caveat text-sm rotate-[2deg]">
          Enter the 4-digit PIN ↓
        </div>
      )}
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        value={joinPinInput}
        onChange={(e) =>
          setJoinPinInput(e.target.value.replace(/\D/g, ""))
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" && joinPinInput.length === 4) {
            joinPinGame();
          }
        }}
        placeholder={selectedTheme === "notebook" ? "- - - -" : "Enter Game PIN"}
        className={`w-full max-w-xs min-[1536px]:max-[1650px]:max-w-[224px] px-4 py-3 min-[1536px]:max-[1650px]:px-3 min-[1536px]:max-[1650px]:py-2 text-center tracking-widest tabular-nums ${
          selectedTheme === "notebook"
            ? "text-3xl font-permanent-marker text-[#dc2626] placeholder:text-[#dc2626]/30 bg-white/60"
            : "rounded-xl min-[1536px]:max-[1650px]:rounded-lg border border-white text-lg min-[1536px]:max-[1650px]:text-sm text-white placeholder:text-white/50 bg-transparent"
        }`}
        style={selectedTheme === "notebook" ? {
          border: '3px solid #dc2626',
          borderRadius: '8px 12px 10px 14px',
          boxShadow: '3px 3px 0px rgba(220, 38, 38, 0.2)'
        } : {}}
      />

      <button
  onClick={joinPinGame}
  disabled={joinPinInput.length !== 4}
  className={`${baseButton} ${
    selectedTheme === "notebook"
      ? "py-5 text-xl text-[#16a34a] hover:scale-105 transform rotate-[-1deg]"
      : "py-4 min-[1536px]:max-[1650px]:py-3 text-base min-[1536px]:max-[1650px]:text-xs"
  } max-w-sm min-[1536px]:max-[1650px]:max-w-[280px] ${
    joinPinInput.length !== 4 ? "opacity-50 pointer-events-none" : ""
  }`}
  style={selectedTheme === "notebook" ? {
    background: 'rgba(134, 239, 172, 0.3)',
    border: '3px solid #16a34a',
    borderRadius: '12px 16px 14px 18px',
    boxShadow: '3px 4px 0px rgba(22, 163, 74, 0.2)'
  } : {}}
>
  Join game
</button>

<button
  onClick={clearPin}
  className={`${baseButton} ${
    selectedTheme === "notebook"
      ? "py-4 text-xl text-gray-700 hover:scale-105 transform rotate-[1deg]"
      : "py-4 min-[1536px]:max-[1650px]:py-3 text-base min-[1536px]:max-[1650px]:text-xs"
  } max-w-sm min-[1536px]:max-[1650px]:max-w-[280px]`}
  style={selectedTheme === "notebook" ? {
    background: 'rgba(229, 229, 229, 0.5)',
    border: '2px solid #6b7280',
    borderRadius: '10px 15px 12px 16px',
    boxShadow: '2px 3px 0px rgba(107, 114, 128, 0.2)'
  } : {}}
>
  Back
</button>
    </div>
  )}

  {/* DEFAULT TITLE SCREEN BUTTONS */}
  {!gamePin && !joinMode && (
    <div className={`flex flex-col gap-5 ${selectedTheme === "default" ? "animate-slide-up-delay-2" : "gap-6"}`}>
      <button
  type="button"
  onClick={createGame}
  disabled={creatingGame}
  className={`
    ${baseButton}
    ${selectedTheme === "notebook"
      ? "py-8 text-2xl text-[#16a34a] hover:scale-105 transform rotate-[-1deg]"
      : "py-10 min-[1536px]:max-[1650px]:py-7 text-xl min-[1536px]:max-[1650px]:text-base bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-sm"
    }
    ${creatingGame
      ? "opacity-60 cursor-not-allowed pointer-events-none"
      : ""}
  `}
  style={selectedTheme === "notebook" ? {
    background: 'rgba(134, 239, 172, 0.2)',
    border: '3px solid #16a34a',
    borderRadius: '15px 20px 18px 22px',
    boxShadow: '3px 4px 0px rgba(22, 163, 74, 0.3)'
  } : {}}
>
  {creatingGame ? "Creating..." : "Create Game"}
</button>

      <button
  onClick={joinGame}
  disabled={creatingGame}
  className={`
    ${baseButton}
    ${selectedTheme === "notebook"
      ? "py-8 text-2xl text-[#dc2626] hover:scale-105 transform rotate-[1deg]"
      : "py-10 min-[1536px]:max-[1650px]:py-7 text-xl min-[1536px]:max-[1650px]:text-base bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-sm"
    }
    ${creatingGame ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}
  `}
  style={selectedTheme === "notebook" ? {
    background: 'rgba(252, 165, 165, 0.2)',
    border: '3px solid #dc2626',
    borderRadius: '18px 15px 22px 17px',
    boxShadow: '3px 4px 0px rgba(220, 38, 38, 0.3)'
  } : {}}
>
  Join Game
</button>
    </div>
  )}
</div>
      </div>

      <div className={`absolute bottom-4 left-0 right-0 flex justify-center gap-4 z-10 ${
        selectedTheme === "notebook" ? "font-caveat text-sm text-gray-400" : "text-xs text-white/30"
      }`}>
        <a href="/privacy" className="hover:underline">Privacy Policy</a>
        <span>|</span>
        <a href="/terms" className="hover:underline">Terms of Service</a>
      </div>
    </main>
  );
}


/* ---------- Sign Up setup ---------- */

if (screen === "studentProfile") {
  return (
    <main className={`relative flex min-h-screen items-center justify-center px-6 min-[1536px]:max-[1650px]:scale-[0.85] min-[1536px]:max-[1650px]:origin-center overflow-hidden ${
      selectedTheme === "notebook"
        ? "bg-[#f5f1e8]"
        : "bg-gradient-to-br from-gray-900 via-black to-gray-900"
    }`} style={selectedTheme === "notebook" ? {
      backgroundImage: `
        repeating-linear-gradient(
          0deg,
          transparent,
          transparent 31px,
          rgba(0,0,0,0.08) 31px,
          rgba(0,0,0,0.08) 33px
        ),
        linear-gradient(90deg, rgba(255,100,100,0.15) 0px, transparent 2px),
        linear-gradient(90deg, rgba(100,100,255,0.15) 60px, transparent 2px)
      `,
      backgroundSize: '100% 33px, 100% 100%, 100% 100%'
    } : {}}>

      {selectedTheme === "default" && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-shift"></div>
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}></div>
        </>
      )}

      {selectedTheme === "notebook" && (
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23noise)\' /%3E%3C/svg%3E")',
        }} />
      )}

      <div className={`w-full max-w-md relative z-10 ${selectedTheme === "default" ? "animate-slide-up" : ""}`}>
        <h1 className={`mb-6 text-center font-bold ${
          selectedTheme === "notebook"
            ? "text-4xl font-permanent-marker text-[#1e40af] transform -rotate-1"
            : "text-3xl text-white tracking-tight"
        }`}>
          {selectedTheme === "notebook" && (
            <span className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-3 bg-yellow-200 opacity-40 -rotate-1 -z-10"></span>
          )}
          Sign up
        </h1>

        <div className="flex flex-col gap-3 mb-4">
          <button
            type="button"
            disabled={oauthLoading}
            onClick={() => handleOAuthSignIn('google')}
            className={`flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              selectedTheme === "notebook"
                ? "font-caveat text-lg text-gray-700 hover:bg-blue-50"
                : "rounded-2xl border border-white/40 text-white hover:bg-white hover:text-black"
            }`}
            style={selectedTheme === "notebook" ? {
              border: '2px solid #9ca3af',
              borderRadius: '8px 12px 10px 14px',
            } : {}}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill={selectedTheme === "notebook" ? "#4285F4" : "currentColor"} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill={selectedTheme === "notebook" ? "#34A853" : "currentColor"} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill={selectedTheme === "notebook" ? "#FBBC05" : "currentColor"} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill={selectedTheme === "notebook" ? "#EA4335" : "currentColor"} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {oauthLoading ? 'Redirecting...' : 'Continue with Google'}
          </button>

          <button
            type="button"
            disabled={oauthLoading}
            onClick={() => handleOAuthSignIn('linkedin_oidc')}
            className={`flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              selectedTheme === "notebook"
                ? "font-caveat text-lg text-gray-700 hover:bg-blue-50"
                : "rounded-2xl border border-white/40 text-white hover:bg-white hover:text-black"
            }`}
            style={selectedTheme === "notebook" ? {
              border: '2px solid #9ca3af',
              borderRadius: '8px 12px 10px 14px',
            } : {}}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill={selectedTheme === "notebook" ? "#0A66C2" : "currentColor"}>
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            {oauthLoading ? 'Redirecting...' : 'Continue with LinkedIn'}
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className={`flex-1 h-px ${selectedTheme === "notebook" ? "bg-gray-300" : "bg-white/20"}`}></div>
          <span className={`text-xs ${selectedTheme === "notebook" ? "font-caveat text-sm text-gray-400" : "text-white/40"}`}>or sign up with email</span>
          <div className={`flex-1 h-px ${selectedTheme === "notebook" ? "bg-gray-300" : "bg-white/20"}`}></div>
        </div>

<fieldset disabled={creatingAccount} className={creatingAccount ? "opacity-50" : ""}>
<div className="mb-6 flex gap-3">
  <button
  type="button"
  disabled={creatingAccount}
  onClick={() => setSeatedRole("student")}
  className={`flex-1 px-4 py-3 text-sm font-semibold transition-all duration-300 ${
    selectedTheme === "notebook"
      ? `font-caveat text-lg ${seatedRole === "student" ? "bg-blue-100 text-[#2563eb]" : "text-gray-700"}`
      : `rounded-2xl border border-white/20 text-white hover:scale-[1.02] ${seatedRole === "student" ? "bg-white/10 border-white" : ""}`
  } ${
    creatingAccount ? "opacity-50 cursor-not-allowed" : selectedTheme === "default" ? "hover:bg-white hover:text-black" : "hover:bg-blue-50"
  }`}
  style={selectedTheme === "notebook" ? {
    border: seatedRole === "student" ? '2px solid #2563eb' : '2px solid #9ca3af',
    borderRadius: '8px 12px 10px 14px',
    boxShadow: seatedRole === "student" ? '2px 2px 0px rgba(37, 99, 235, 0.2)' : 'none'
  } : {}}
>
  Student
</button>

  <button
  type="button"
  disabled={creatingAccount}
  onClick={() => setSeatedRole("professional")}
  className={`flex-1 px-4 py-3 text-sm font-semibold transition-all duration-300 ${
    selectedTheme === "notebook"
      ? `font-caveat text-lg ${seatedRole === "professional" ? "bg-green-100 text-[#16a34a]" : "text-gray-700"}`
      : `rounded-2xl border border-white/20 text-white hover:scale-[1.02] ${seatedRole === "professional" ? "bg-white/10 border-white" : ""}`
  } ${
    creatingAccount ? "opacity-50 cursor-not-allowed" : selectedTheme === "default" ? "hover:bg-white hover:text-black" : "hover:bg-green-50"
  }`}
  style={selectedTheme === "notebook" ? {
    border: seatedRole === "professional" ? '2px solid #16a34a' : '2px solid #9ca3af',
    borderRadius: '10px 8px 14px 10px',
    boxShadow: seatedRole === "professional" ? '2px 2px 0px rgba(22, 163, 74, 0.2)' : 'none'
  } : {}}
>
  Professional
</button>
</div>

        <div className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="First name"
            value={studentProfile.firstName}
            onChange={(e) =>
              setStudentProfile({ ...studentProfile, firstName: e.target.value })
            }
            className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
          />

          <input
            type="text"
            placeholder="Last name"
            value={studentProfile.lastName}
            onChange={(e) =>
              setStudentProfile({ ...studentProfile, lastName: e.target.value })
            }
            className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
          />

          <input
  type="email"
  placeholder="Email"
  value={studentProfile.email}
  onChange={(e) =>
    setStudentProfile({ ...studentProfile, email: e.target.value })
  }
  className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
/>

<div className="relative">
  <input
    type={showPassword ? "text" : "password"}
    placeholder="Password"
    value={studentProfile.password}
    onChange={(e) =>
      setStudentProfile({ ...studentProfile, password: e.target.value })
    }
    className="w-full rounded-xl border border-white px-4 py-3 text-sm pr-12 text-white placeholder:text-white/50 bg-transparent"
  />
  <button
    type="button"
    onClick={() => setShowPassword(!showPassword)}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/60 hover:text-white"
  >
    {showPassword ? "Hide" : "Show"}
  </button>
</div>

{seatedRole === "student" && (
  <>
    <input
      type="text"
      placeholder="School"
      value={studentProfile.school}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, school: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />

    <input
      type="text"
      placeholder="LinkedIn URL (optional)"
      value={studentProfile.linkedinUrl}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, linkedinUrl: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />

    <select
      value={studentProfile.year}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, year: e.target.value })
      }
      className="w-full rounded-xl border border-white px-4 py-3 text-sm appearance-none bg-transparent text-white cursor-pointer"
    >
      <option value="" disabled className="bg-black text-white">Year</option>
      <option value="1" className="bg-black text-white">1</option>
      <option value="2" className="bg-black text-white">2</option>
      <option value="3" className="bg-black text-white">3</option>
      <option value="4" className="bg-black text-white">4</option>
      <option value="Other" className="bg-black text-white">Other</option>
    </select>

    <input
      type="text"
      placeholder="Major"
      value={studentProfile.major}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, major: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />
  </>
)}

{seatedRole === "professional" && (
  <>
    <input
      type="text"
      placeholder="Company"
      value={studentProfile.company || ""}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, company: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />

    <input
      type="text"
      placeholder="Work title"
      value={studentProfile.workTitle || ""}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, workTitle: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />

    <input
      type="text"
      placeholder="School"
      value={studentProfile.school || ""}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, school: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />

    <input
      type="text"
      placeholder="LinkedIn URL (optional)"
      value={studentProfile.linkedinUrl}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, linkedinUrl: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />
  </>
)}

         <button
  type="button"
  disabled={creatingAccount || !seatedRole || !studentProfile.email || !studentProfile.password || !studentProfile.firstName || !studentProfile.lastName}
  onClick={async () => {
    setCreatingAccount(true);
    
    // === EMAIL VALIDATION ===
    const emailValidation = validateEmail(studentProfile.email);
    if (!emailValidation.valid) {
      alert(emailValidation.error);
      recordRateLimitAttempt('SIGNUP');
      setCreatingAccount(false);
      return;
    }
    
    // === PASSWORD VALIDATION ===
    const passwordValidation = validatePassword(studentProfile.password);
    if (!passwordValidation.valid) {
      alert(passwordValidation.errors[0]);
      recordRateLimitAttempt('SIGNUP');
      setCreatingAccount(false);
      return;
    }
    
    // === PROFILE VALIDATION (schema-based, rejects unexpected fields) ===
    const profileValidation = validateProfileData({
      firstName: studentProfile.firstName,
      lastName: studentProfile.lastName,
      email: studentProfile.email,
      year: studentProfile.year,
      major: studentProfile.major,
      school: studentProfile.school,
      company: studentProfile.company,
      workTitle: studentProfile.workTitle,
      linkedinUrl: studentProfile.linkedinUrl,
    });
    
    if (!profileValidation.valid) {
      const firstError = Object.values(profileValidation.errors)[0];
      alert(firstError || 'Please check your input');
      recordRateLimitAttempt('SIGNUP');
      setCreatingAccount(false);
      return;
    }
    
    // Record attempt before API call
    recordRateLimitAttempt('SIGNUP');
    
    try {
      const sanitizedProfile = profileValidation.sanitized;
      
      // Create auth user (no email verification required)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailValidation.sanitized,
        password: studentProfile.password,
      });
      
      if (authError) {
        alert('Sign up failed: ' + authError.message);
        setCreatingAccount(false);
        return;
      }
      
      if (!authData.user) {
        alert('Sign up failed. Please try again.');
        setCreatingAccount(false);
        return;
      }
      
      // Create profile immediately (no email verification wait)
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: emailValidation.sanitized,
          first_name: toTitleCase(sanitizedProfile.firstName),
          last_name: toTitleCase(sanitizedProfile.lastName),
          role: seatedRole,
          year: seatedRole === 'student' ? sanitizedProfile.year : null,
          major: seatedRole === 'student' ? toTitleCase(sanitizedProfile.major) : null,
          school: sanitizedProfile.school || null,
          company: seatedRole === 'professional' ? sanitizedProfile.company : null,
          work_title: seatedRole === 'professional' ? sanitizedProfile.workTitle : null,
          linkedin_url: sanitizedProfile.linkedinUrl || null,
        });
      
      if (profileError) {
        alert('Profile creation failed. Please try again.');
        setCreatingAccount(false);
        return;
      }

      alert("Profile created successfully.");
      
      // Success - reset rate limit and update state
      resetRateLimit('SIGNUP');

      // Keep user signed in with their profile info
      setStudentProfile({
        firstName: toTitleCase(sanitizedProfile.firstName),
        lastName: toTitleCase(sanitizedProfile.lastName),
        email: emailValidation.sanitized,
        password: '',
        year: seatedRole === 'student' ? sanitizedProfile.year : '',
        major: seatedRole === 'student' ? toTitleCase(sanitizedProfile.major) : '',
        school: sanitizedProfile.school || '',
        company: seatedRole === 'professional' ? sanitizedProfile.company : '',
        workTitle: seatedRole === 'professional' ? sanitizedProfile.workTitle : '',
        linkedinUrl: sanitizedProfile.linkedinUrl || '',
      });
      
      // Navigate to title screen (user is now signed in)
      setScreen("role");
      
    } catch (e) {
      alert('Sign up failed. Please try again.');
    } finally {
      setCreatingAccount(false);
    }
  }}

  className={`mt-4 rounded-2xl border border-white text-white px-4 py-3 text-sm font-semibold transition-colors ${
    !creatingAccount && seatedRole && studentProfile.email && studentProfile.password && studentProfile.firstName && studentProfile.lastName ? "hover:bg-gray-50 hover:text-black" : "opacity-50 cursor-not-allowed"
  }`}
>
  {creatingAccount ? "Creating account..." : "Continue"}
</button>

          <button
            type="button"
            disabled={creatingAccount}
            onClick={() => {
              setStudentProfile({
                firstName: "",
                lastName: "",
                email: "",
                password: "",
                year: "",
                major: "",
                school: "",
                company: "",
                workTitle: "",
                linkedinUrl: "",
              });
              setSeatedRole(null);
              goBack();
            }}
            className={`rounded-2xl border border-white text-white px-4 py-3 text-sm font-semibold transition-colors ${creatingAccount ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 hover:text-black"}`}
          >
            Go back
          </button>
        </div>
</fieldset>
      </div>
    </main>
  );
}

/* ---------- OAuth profile completion ---------- */

if (screen === "oauthProfileCompletion") {
  return (
    <main className={`relative flex min-h-screen items-center justify-center px-6 min-[1536px]:max-[1650px]:scale-[0.85] min-[1536px]:max-[1650px]:origin-center overflow-hidden ${
      selectedTheme === "notebook"
        ? "bg-[#f5f1e8]"
        : "bg-gradient-to-br from-gray-900 via-black to-gray-900"
    }`} style={selectedTheme === "notebook" ? {
      backgroundImage: `
        repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(0,0,0,0.08) 31px, rgba(0,0,0,0.08) 33px),
        linear-gradient(90deg, rgba(255,100,100,0.15) 0px, transparent 2px),
        linear-gradient(90deg, rgba(100,100,255,0.15) 60px, transparent 2px)
      `,
      backgroundSize: '100% 33px, 100% 100%, 100% 100%'
    } : {}}>

      {selectedTheme === "default" && (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-shift" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
        </>
      )}

      {selectedTheme === "notebook" && (
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23noise)\' /%3E%3C/svg%3E")',
        }} />
      )}

      <div className={`w-full max-w-md relative z-10 ${selectedTheme === "default" ? "animate-slide-up" : ""}`}>
        <h1 className={`mb-6 text-center font-bold ${
          selectedTheme === "notebook"
            ? "text-4xl font-permanent-marker text-[#1e40af] transform -rotate-1"
            : "text-3xl text-white tracking-tight"
        }`}>
          {selectedTheme === "notebook" && (
            <span className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-48 h-3 bg-yellow-200 opacity-40 -rotate-1 -z-10"></span>
          )}
          Complete Your Profile
        </h1>

<fieldset disabled={creatingAccount} className={creatingAccount ? "opacity-50" : ""}>
<div className="mb-6 flex gap-3">
  <button
    type="button"
    disabled={creatingAccount}
    onClick={() => setSeatedRole("student")}
    className={`flex-1 px-4 py-3 text-sm font-semibold transition-all duration-300 ${
      selectedTheme === "notebook"
        ? `font-caveat text-lg ${seatedRole === "student" ? "bg-blue-100 text-[#2563eb]" : "text-gray-700"}`
        : `rounded-2xl border border-white/20 text-white hover:scale-[1.02] ${seatedRole === "student" ? "bg-white/10 border-white" : ""}`
    } ${
      creatingAccount ? "opacity-50 cursor-not-allowed" : selectedTheme === "default" ? "hover:bg-white hover:text-black" : "hover:bg-blue-50"
    }`}
    style={selectedTheme === "notebook" ? {
      border: seatedRole === "student" ? '2px solid #2563eb' : '2px solid #9ca3af',
      borderRadius: '8px 12px 10px 14px',
      boxShadow: seatedRole === "student" ? '2px 2px 0px rgba(37, 99, 235, 0.2)' : 'none'
    } : {}}
  >
    Student
  </button>

  <button
    type="button"
    disabled={creatingAccount}
    onClick={() => setSeatedRole("professional")}
    className={`flex-1 px-4 py-3 text-sm font-semibold transition-all duration-300 ${
      selectedTheme === "notebook"
        ? `font-caveat text-lg ${seatedRole === "professional" ? "bg-green-100 text-[#16a34a]" : "text-gray-700"}`
        : `rounded-2xl border border-white/20 text-white hover:scale-[1.02] ${seatedRole === "professional" ? "bg-white/10 border-white" : ""}`
    } ${
      creatingAccount ? "opacity-50 cursor-not-allowed" : selectedTheme === "default" ? "hover:bg-white hover:text-black" : "hover:bg-green-50"
    }`}
    style={selectedTheme === "notebook" ? {
      border: seatedRole === "professional" ? '2px solid #16a34a' : '2px solid #9ca3af',
      borderRadius: '8px 12px 10px 14px',
      boxShadow: seatedRole === "professional" ? '2px 2px 0px rgba(22, 163, 74, 0.2)' : 'none'
    } : {}}
  >
    Professional
  </button>
</div>

        <div className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="First name"
            value={studentProfile.firstName}
            onChange={(e) =>
              setStudentProfile({ ...studentProfile, firstName: e.target.value })
            }
            className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
          />

          <input
            type="text"
            placeholder="Last name"
            value={studentProfile.lastName}
            onChange={(e) =>
              setStudentProfile({ ...studentProfile, lastName: e.target.value })
            }
            className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
          />

{seatedRole === "student" && (
  <>
    <input
      type="text"
      placeholder="School"
      value={studentProfile.school}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, school: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />

    <input
      type="text"
      placeholder="LinkedIn URL (optional)"
      value={studentProfile.linkedinUrl}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, linkedinUrl: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />

    <select
      value={studentProfile.year}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, year: e.target.value })
      }
      className="w-full rounded-xl border border-white px-4 py-3 text-sm appearance-none bg-transparent text-white cursor-pointer"
    >
      <option value="" disabled className="bg-black text-white">Year</option>
      <option value="1" className="bg-black text-white">1</option>
      <option value="2" className="bg-black text-white">2</option>
      <option value="3" className="bg-black text-white">3</option>
      <option value="4" className="bg-black text-white">4</option>
      <option value="Other" className="bg-black text-white">Other</option>
    </select>

    <input
      type="text"
      placeholder="Major"
      value={studentProfile.major}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, major: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />
  </>
)}

{seatedRole === "professional" && (
  <>
    <input
      type="text"
      placeholder="Company"
      value={studentProfile.company || ""}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, company: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />

    <input
      type="text"
      placeholder="Work title"
      value={studentProfile.workTitle || ""}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, workTitle: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />

    <input
      type="text"
      placeholder="School"
      value={studentProfile.school || ""}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, school: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />

    <input
      type="text"
      placeholder="LinkedIn URL (optional)"
      value={studentProfile.linkedinUrl}
      onChange={(e) =>
        setStudentProfile({ ...studentProfile, linkedinUrl: e.target.value })
      }
      className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
    />
  </>
)}

          <button
            type="button"
            disabled={creatingAccount || !seatedRole || !studentProfile.firstName || !studentProfile.lastName}
            onClick={async () => {
              if (!sbUser?.id || !seatedRole) return;
              setCreatingAccount(true);

              const profileValidation = validateProfileData({
                firstName: studentProfile.firstName,
                lastName: studentProfile.lastName,
                email: studentProfile.email,
                year: studentProfile.year,
                major: studentProfile.major,
                school: studentProfile.school,
                company: studentProfile.company,
                workTitle: studentProfile.workTitle,
                linkedinUrl: studentProfile.linkedinUrl,
              });

              if (!profileValidation.valid) {
                const firstError = Object.values(profileValidation.errors)[0];
                alert('Validation failed: ' + (firstError || 'Please check your input'));
                setCreatingAccount(false);
                return;
              }

              try {
                const sanitizedProfile = profileValidation.sanitized;

                const { error: profileError } = await supabase
                  .from('profiles')
                  .insert({
                    id: sbUser.id,
                    email: sbUser.email || studentProfile.email,
                    first_name: toTitleCase(sanitizedProfile.firstName),
                    last_name: toTitleCase(sanitizedProfile.lastName),
                    role: seatedRole,
                    year: seatedRole === 'student' ? sanitizedProfile.year : null,
                    major: seatedRole === 'student' ? toTitleCase(sanitizedProfile.major) : null,
                    school: sanitizedProfile.school || null,
                    company: seatedRole === 'professional' ? sanitizedProfile.company : null,
                    work_title: seatedRole === 'professional' ? sanitizedProfile.workTitle : null,
                    linkedin_url: sanitizedProfile.linkedinUrl || null,
                  });

                if (profileError) {
                  alert('Profile creation failed. Please try again.');
                  setCreatingAccount(false);
                  return;
                }

                setStudentProfile({
                  firstName: toTitleCase(sanitizedProfile.firstName),
                  lastName: toTitleCase(sanitizedProfile.lastName),
                  email: sbUser.email || studentProfile.email,
                  password: '',
                  year: seatedRole === 'student' ? sanitizedProfile.year : '',
                  major: seatedRole === 'student' ? toTitleCase(sanitizedProfile.major) : '',
                  school: sanitizedProfile.school || '',
                  company: seatedRole === 'professional' ? sanitizedProfile.company : '',
                  workTitle: seatedRole === 'professional' ? sanitizedProfile.workTitle : '',
                  linkedinUrl: sanitizedProfile.linkedinUrl || '',
                });

                setScreen('role');
              } catch (e) {
                alert('Profile creation failed. Please try again.');
              } finally {
                setCreatingAccount(false);
              }
            }}
            className={`rounded-2xl border border-white text-white px-4 py-3 text-sm font-semibold transition-colors ${
              !creatingAccount && seatedRole && studentProfile.firstName && studentProfile.lastName ? "hover:bg-gray-50 hover:text-black" : "opacity-50 cursor-not-allowed"
            }`}
          >
            {creatingAccount ? "Creating profile..." : "Continue"}
          </button>

          <button
            type="button"
            disabled={creatingAccount}
            onClick={async () => {
              try {
                await supabase.auth.signOut();
                setSbUser(null);
                setStudentProfile({
                  firstName: '', lastName: '', email: '', password: '',
                  year: '', major: '', school: '', company: '', workTitle: '', linkedinUrl: '',
                });
                setSeatedRole(null);
                sessionStorage.removeItem('headsup_screen');
                setScreen('role');
              } catch (e) {
                setSbUser(null);
                sessionStorage.removeItem('headsup_screen');
                setScreen('role');
              }
            }}
            className={`rounded-2xl border border-white text-white px-4 py-3 text-sm font-semibold transition-colors ${creatingAccount ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 hover:text-black"}`}
          >
            Log out
          </button>
        </div>
</fieldset>
      </div>
    </main>
  );
}

/* ---------- student login ---------- */

if (screen === "studentLogin") {
  return (
    <main className={`relative flex min-h-screen items-center justify-center px-6 min-[1536px]:max-[1650px]:scale-[0.85] min-[1536px]:max-[1650px]:origin-center overflow-hidden ${
      selectedTheme === "notebook"
        ? "bg-[#f5f1e8]"
        : "bg-gradient-to-br from-gray-900 via-black to-gray-900"
    }`} style={selectedTheme === "notebook" ? {
      backgroundImage: `
        repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(0,0,0,0.08) 31px, rgba(0,0,0,0.08) 33px),
        linear-gradient(90deg, rgba(255,100,100,0.15) 0px, transparent 2px),
        linear-gradient(90deg, rgba(100,100,255,0.15) 60px, transparent 2px)
      `,
      backgroundSize: '100% 33px, 100% 100%, 100% 100%'
    } : {}}>

      {selectedTheme === "default" && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-shift"></div>
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}></div>
        </>
      )}

      {selectedTheme === "notebook" && (
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23noise)\' /%3E%3C/svg%3E")',
        }} />
      )}

      <div className={`w-full max-w-md relative z-10 ${selectedTheme === "default" ? "animate-slide-up" : ""}`}>
        <h1 className={`mb-6 text-center font-bold ${
          selectedTheme === "notebook"
            ? "text-4xl font-permanent-marker text-[#1e40af] transform -rotate-1"
            : "text-3xl text-white tracking-tight"
        }`}>
          {selectedTheme === "notebook" && (
            <span className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-24 h-3 bg-yellow-200 opacity-40 -rotate-1 -z-10"></span>
          )}
          Log in
        </h1>

        <div className="flex flex-col gap-3 mb-4">
          <button
            type="button"
            disabled={oauthLoading}
            onClick={() => handleOAuthSignIn('google')}
            className={`flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              selectedTheme === "notebook"
                ? "font-caveat text-lg text-gray-700 hover:bg-blue-50"
                : "rounded-2xl border border-white/40 text-white hover:bg-white hover:text-black"
            }`}
            style={selectedTheme === "notebook" ? {
              border: '2px solid #9ca3af',
              borderRadius: '8px 12px 10px 14px',
            } : {}}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill={selectedTheme === "notebook" ? "#4285F4" : "currentColor"} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill={selectedTheme === "notebook" ? "#34A853" : "currentColor"} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill={selectedTheme === "notebook" ? "#FBBC05" : "currentColor"} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill={selectedTheme === "notebook" ? "#EA4335" : "currentColor"} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {oauthLoading ? 'Redirecting...' : 'Continue with Google'}
          </button>

          <button
            type="button"
            disabled={oauthLoading}
            onClick={() => handleOAuthSignIn('linkedin_oidc')}
            className={`flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              selectedTheme === "notebook"
                ? "font-caveat text-lg text-gray-700 hover:bg-blue-50"
                : "rounded-2xl border border-white/40 text-white hover:bg-white hover:text-black"
            }`}
            style={selectedTheme === "notebook" ? {
              border: '2px solid #9ca3af',
              borderRadius: '8px 12px 10px 14px',
            } : {}}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill={selectedTheme === "notebook" ? "#0A66C2" : "currentColor"}>
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            {oauthLoading ? 'Redirecting...' : 'Continue with LinkedIn'}
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className={`flex-1 h-px ${selectedTheme === "notebook" ? "bg-gray-300" : "bg-white/20"}`}></div>
          <span className={`text-xs ${selectedTheme === "notebook" ? "font-caveat text-sm text-gray-400" : "text-white/40"}`}>or</span>
          <div className={`flex-1 h-px ${selectedTheme === "notebook" ? "bg-gray-300" : "bg-white/20"}`}></div>
        </div>

        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && loginEmail && loginPassword) {
                document.getElementById('login-button')?.click();
              }
            }}
            className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
          />

          <div className="relative">
            <input
              type={showLoginPassword ? "text" : "password"}
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && loginEmail && loginPassword) {
                  document.getElementById('login-button')?.click();
                }
              }}
              className="w-full rounded-xl border border-white px-4 py-3 text-sm pr-12 text-white placeholder:text-white/50 bg-transparent"
            />
            <button
              type="button"
              onClick={() => setShowLoginPassword(!showLoginPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/60 hover:text-white"
            >
              {showLoginPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button
            type="button"
            id="login-button"
            disabled={!loginEmail || !loginPassword}
            onClick={async () => {
              // === INPUT VALIDATION ===
              const emailValidation = validateEmail(loginEmail);
              if (!emailValidation.valid) {
                alert(emailValidation.error);
                return;
              }
              
              if (!loginPassword || loginPassword.length < 1) {
                alert('Please enter your password');
                return;
              }
              
              try {
                const { data, error } = await supabase.auth.signInWithPassword({
                  email: emailValidation.sanitized,
                  password: loginPassword,
                });
                
                if (error) {
                  alert('Invalid email or password');
                  return;
                }
                
                if (!data.user) {
                  alert('Login failed. Please try again.');
                  return;
                }
                
                // Fetch profile to get role and details
                const { data: profile, error: profileError } = await supabase
                  .from('profiles')
                  .select('*')
                  .eq('id', data.user.id)
                  .single();
                
                if (profileError || !profile) {
                  alert('No account found. Please sign up first.');
                  await supabase.auth.signOut();
                  return;
                }
                
                // Update local state with profile info
                setStudentProfile({
                  firstName: profile.first_name,
                  lastName: profile.last_name,
                  email: profile.email,
                  password: '',
                  year: profile.year || '',
                  major: profile.major || '',
                  school: profile.school || '',
                  company: profile.company || '',
                  workTitle: profile.work_title || '',
                  linkedinUrl: profile.linkedin_url || '',
                });
                setSeatedRole(profile.role as Role);
                setLoginEmail('');
                setLoginPassword('');
                setScreen("role");
              } catch (e) {
                alert('Login failed. Please try again.');
              }
            }}
            className="mt-4 rounded-2xl border border-white text-white px-4 py-3 text-sm font-semibold hover:bg-gray-50 hover:text-black disabled:opacity-50"
          >
            Continue
          </button>

          <button
            type="button"
            onClick={() => {
              setLoginEmail('');
              setLoginPassword('');
              goBack();
            }}
            className="rounded-2xl border border-white text-white px-4 py-3 text-sm font-semibold hover:bg-gray-50 hover:text-black"
          >
            Go back
          </button>
        </div>
      </div>
    </main>
  );
}

/* ---------- student dashboard ---------- */

if (screen === "dashboard" && (seatedRole === "student" || isGuestBrowsing)) {
  const baseButton =
    "w-full rounded-3xl border px-6 font-semibold transition-colors duration-200 hover:bg-gray-50 hover:border-gray-300";

  return (
   <main
      className={`flex min-h-screen justify-center px-6 pt-16 min-[1536px]:max-[1650px]:scale-[0.85] min-[1536px]:max-[1650px]:origin-center ${selectedTheme === "notebook" ? "bg-[#f5f1e8]" : "bg-gradient-to-br from-gray-900 via-black to-gray-900"}`}
      style={selectedTheme === "notebook" ? {
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(0,0,0,0.08) 31px, rgba(0,0,0,0.08) 33px), linear-gradient(90deg, rgba(255,100,100,0.15) 0px, transparent 2px), linear-gradient(90deg, rgba(100,100,255,0.15) 60px, transparent 2px)`,
        backgroundSize: '100% 33px, 100% 100%, 100% 100%'
      } : {}}
    >

  {selectedTheme === "default" && (
    <>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-shift"></div>
      <div className="absolute inset-0 opacity-[0.02]" style={{backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px'}}></div>
    </>
  )}

  {selectedTheme === "notebook" && (
    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23noise)\' /%3E%3C/svg%3E")'}}/>
  )}

  {/* Founder Connect Modal for guest users */}
  {showFounderConnectModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowFounderConnectModal(false)} />
      <div className="relative w-full max-w-md rounded-3xl border border-gray-300 bg-white p-6 shadow-lg">
        <h3 className="mb-2 text-xl font-bold text-gray-900">Hey! 👋</h3>
        <p className="mb-4 text-sm text-gray-700">
          I'm Joseph. Thanks for checking this out!
        </p>
        <p className="mb-6 text-sm text-gray-700">
          I'd love to connect with you personally. Drop your name and email below, and I'll reach out soon.
        </p>
        
        <div className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="What should I call you?"
            value={founderConnectForm.name}
            onChange={(e) => setFounderConnectForm(prev => ({ ...prev, name: e.target.value }))}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-black placeholder:text-gray-400"
          />
          
          <input
            type="email"
            placeholder="Your email"
            value={founderConnectForm.email}
            onChange={(e) => setFounderConnectForm(prev => ({ ...prev, email: e.target.value }))}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && founderConnectForm.name && founderConnectForm.email) {
                const nameValidation = validateInput(founderConnectForm.name, 'name', { required: true });
                if (!nameValidation.valid) { alert(nameValidation.error); return; }
                const emailValidation = validateEmail(founderConnectForm.email);
                if (!emailValidation.valid) { alert(emailValidation.error); return; }
                setFounderConnectSubmitting(true);
                try {
                  const { error } = await supabase.from('founder_contact_requests').insert({ name: nameValidation.sanitized, email: emailValidation.sanitized });
if (error) { alert('Something went wrong. Please try again.'); return; }
fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-founder-contact-email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: nameValidation.sanitized, email: emailValidation.sanitized }),
}).catch(() => {});
alert("Thanks! I'll reach out to you soon. – Joseph");
                  setFounderConnectSent(true);
                  setShowFounderConnectModal(false);
                  setFounderConnectForm({ name: '', email: '' });
                } catch (e) { alert('Something went wrong. Please try again.'); }
                finally { setFounderConnectSubmitting(false); }
              }
            }}
            className="rounded-xl border border-gray-300 px-4 py-3 text-sm text-black placeholder:text-gray-400"
          />
        </div>
        
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => setShowFounderConnectModal(false)}
            className="rounded-2xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
          >
            Maybe later
          </button>
          <button
            onClick={async () => {
              const nameValidation = validateInput(founderConnectForm.name, 'name', { required: true });
              if (!nameValidation.valid) { alert(nameValidation.error); return; }
              const emailValidation = validateEmail(founderConnectForm.email);
              if (!emailValidation.valid) { alert(emailValidation.error); return; }
              setFounderConnectSubmitting(true);
              try {
                const { error } = await supabase.from('founder_contact_requests').insert({ name: nameValidation.sanitized, email: emailValidation.sanitized });
if (error) { alert('Something went wrong. Please try again.'); return; }
fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-founder-contact-email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: nameValidation.sanitized, email: emailValidation.sanitized }),
}).catch(() => {});
alert("Thanks! I'll reach out to you soon. – Joseph");
                setFounderConnectSent(true);
                setShowFounderConnectModal(false);
                setFounderConnectForm({ name: '', email: '' });
              } catch (e) { alert('Something went wrong. Please try again.'); }
              finally { setFounderConnectSubmitting(false); }
            }}
            disabled={founderConnectSubmitting || !founderConnectForm.name || !founderConnectForm.email}
            className="rounded-2xl border border-black bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {founderConnectSubmitting ? 'Sending...' : 'Connect with Joseph'}
          </button>
        </div>
      </div>
    </div>
  )}
  <div className={`w-full max-w-[96rem] relative z-10 ${selectedTheme === "default" ? "animate-slide-up" : ""}`}>
       <div className="mb-2 flex items-center justify-center gap-4">
  <h1 className={`text-3xl font-bold relative ${selectedTheme === "notebook" ? "font-permanent-marker text-[#1e40af] transform -rotate-1" : "text-white tracking-tight"}`}>
    {selectedTheme === "notebook" && (
      <span className="absolute -inset-2 bg-yellow-200/40 -z-10 transform rotate-1 rounded"></span>
    )}
    {isGuestBrowsing ? "Explore the community" : "Student dashboard"}
  </h1>

  {isGuestBrowsing ? (
    <>
      <button
        type="button"
        onClick={() => {
          navigateTo("studentProfile");
        }}
        className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition-all ${
          selectedTheme === "notebook"
            ? "border-2 border-[#1e40af] bg-[#1e40af] text-white hover:bg-[#1e3a8a] hover:border-[#1e3a8a] hover:-translate-y-0.5 hover:shadow-lg"
            : "border border-white bg-white text-black hover:bg-gray-100"
        }`}
      >
        Sign up to connect
      </button>
      <button
        type="button"
        onClick={() => {
          setIsGuestBrowsing(false);
          goBack();
        }}
        className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition-all ${
          selectedTheme === "notebook"
            ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
            : "border border-white text-white hover:bg-gray-50 hover:text-black"
        }`}
      >
        Back
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        onClick={() => {
          setEditProfileReturnScreen("dashboard");
          setScreen("editProfile");
        }}
        className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
          selectedTheme === "notebook"
            ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
            : "border border-white text-white hover:bg-gray-50 hover:text-black"
        }`}
      >
        Edit Profile
      </button>

      {/* Game PIN display */}
      {gamePin && !joinMode && (
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${selectedTheme === "notebook" ? "text-[#1e40af]" : "text-white"}`}>PIN: {gamePin}</span>
          <button
            type="button"
            onClick={() => {
              clearPin();
              setGamePin(null);
            }}
            className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
              selectedTheme === "notebook"
                ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
                : "border border-white text-white hover:bg-gray-50 hover:text-black"
            }`}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Join game input */}
      {joinMode && !gamePin && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={joinPinInput}
            onChange={(e) => setJoinPinInput(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && joinPinInput.length === 4) {
                joinPinGame();
              }
            }}
            placeholder="Enter PIN"
            className={`w-24 rounded-lg px-2 py-1 text-center text-sm tracking-widest bg-transparent ${
              selectedTheme === "notebook"
                ? "border-2 border-[#1e40af] text-[#1e40af] placeholder:text-[#1e40af]/50"
                : "border border-white text-white placeholder:text-white/50"
            }`}
          />
          <button
            type="button"
            onClick={() => joinPinGame()}
            disabled={joinPinInput.length !== 4}
            className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all disabled:opacity-50 ${
              selectedTheme === "notebook"
                ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
                : "border border-white text-white hover:bg-gray-50 hover:text-black"
            }`}
          >
            Join
          </button>
          <button
            type="button"
            onClick={() => {
              setJoinMode(false);
              setJoinPinInput("");
            }}
            className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
              selectedTheme === "notebook"
                ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
                : "border border-white text-white hover:bg-gray-50 hover:text-black"
            }`}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Create/Join buttons (shown when no PIN and not joining) */}
      {!gamePin && !joinMode && (
        <>
          <button
            type="button"
            onClick={async () => {
              setCreatingGame(true);
              await createPinGame();
              setCreatingGame(false);
            }}
            disabled={creatingGame}
            className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all disabled:opacity-50 ${
              selectedTheme === "notebook"
                ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
                : "border border-white text-white hover:bg-gray-50 hover:text-black"
            }`}
          >
            {creatingGame ? "Creating..." : "Create Game"}
          </button>
          <button
            type="button"
            onClick={() => {
              setJoinMode(true);
              setJoinPinInput("");
            }}
            className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
              selectedTheme === "notebook"
                ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
                : "border border-white text-white hover:bg-gray-50 hover:text-black"
            }`}
          >
            Join Game
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => setScreen("connections")}
        className={`relative rounded-xl px-4 py-1.5 text-sm font-semibold transition-all ${
          selectedTheme === "notebook"
            ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
            : "border border-white text-white hover:bg-gray-50 hover:text-black"
        }`}
      >
        Connections
        {Array.from(unreadCounts.values()).reduce((a, b) => a + b, 0) > 0 && (
          <span className={`absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
            selectedTheme === "notebook"
              ? "bg-yellow-200 border-2 border-[#1e40af] text-[#1e40af]"
              : "bg-white border border-black text-black"
          }`}>
            {Array.from(unreadCounts.values()).reduce((a, b) => a + b, 0) > 9 ? '9+' : Array.from(unreadCounts.values()).reduce((a, b) => a + b, 0)}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => {
          if (gamePin || multiplayerActive) {
            setShowTitleScreenConfirm(true);
          } else {
            setScreen("role");
          }
        }}
        className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition-all ${
          selectedTheme === "notebook"
            ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
            : "border border-white text-white hover:bg-gray-50 hover:text-black"
        }`}
      >
        Title screen
      </button>
    </>
  )}
</div>

        <p className={`mb-8 text-center text-sm ${selectedTheme === "notebook" ? "text-[#1e40af]/60" : "text-black/60"}`}>
          Same aesthetic for now — we'll plug in real widgets next.
        </p>

        <div className="grid gap-4">
          <div className="rounded-3xl border bg-white p-6 w-full px-10">

  <div className="grid grid-cols-2 gap-6">
  <div className="text-xs font-semibold uppercase tracking-wide text-black/50">
  Other students
</div>

<div className="text-xs font-semibold uppercase tracking-wide text-black/50">
  Professionals
</div>

    {/* ---------- Students column ---------- */}
    
    <div className="flex flex-col gap-3">
  <button
    className="w-full rounded-2xl border border-black bg-white px-5 py-4 font-semibold text-black transition-colors hover:bg-gray-50"
  >
    View Students
  </button>

  <div className="max-h-[70vh] overflow-y-auto pr-4 flex flex-col gap-3">
    {/* Your own profile card */}
    {!isGuestBrowsing && (
    <div className="w-full rounded-2xl border border-black bg-white px-5 py-4 font-semibold text-black flex items-center justify-between">
      <span>
        {studentProfile.linkedinUrl ? (
          <a
            href={studentProfile.linkedinUrl.match(/^https?:\/\/(www\.)?linkedin\.com/) ? studentProfile.linkedinUrl : `https://linkedin.com/in/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {studentProfile.firstName} {studentProfile.lastName}
          </a>
        ) : (
          <>{studentProfile.firstName} {studentProfile.lastName}</>
        )}
        {" • "}
        {studentProfile.year} {" • "}
        {studentProfile.major} {studentProfile.school ? ` • ${studentProfile.school}` : ''}
      </span>
    </div>
    )}

    {otherStudents
      .filter(s => !hiddenUsers.has(s.id))
      .sort((a, b) => {
        // For guest browsing, always keep founder at top
        if (isGuestBrowsing) {
          if (a.id === FOUNDER_ID) return -1;
          if (b.id === FOUNDER_ID) return 1;
          return 0; // Keep original order for non-founder
        }
        // For logged-in users, sort by connection priority
        const aPriority = getConnectionSortPriority(a.id, myConnections, pendingOutgoing, pendingIncoming);
        const bPriority = getConnectionSortPriority(b.id, myConnections, pendingOutgoing, pendingIncoming);
        return aPriority - bPriority;
      })
      .map((s, i) => (
  <div
    key={i}
    className="w-full rounded-2xl border border-black bg-white px-5 py-4 font-semibold text-black flex items-center justify-between animate-slide-up"
    style={{ animationDelay: `${i * 0.05}s` }}
  >
    <span>
      {s.linkedinUrl ? (
        <a
          href={s.linkedinUrl.startsWith('http') ? s.linkedinUrl : `https://${s.linkedinUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
          {s.firstName} {s.lastName}
        </a>
      ) : (
        <>{s.firstName} {s.lastName}</>
      )}
      {" • "}
      {s.year} {" • "}
      {s.major}{s.school ? ` • ${s.school}` : ''}
    </span>

    {/* Show connect button for founder when guest browsing */}
    {isGuestBrowsing && s.id === FOUNDER_ID && (
      founderConnectSent ? (
        <span className="text-sm text-gray-500">Pending</span>
      ) : (
        <button 
          className={connectButtonClass}
          onClick={() => setShowFounderConnectModal(true)}
        >
          Connect
        </button>
      )
    )}
    {/* Hide all buttons for guests (except founder above) */}
    {!isGuestBrowsing && (
      myConnections.has(s.id) ? (
        <span className="text-sm text-green-600 font-semibold">Connected</span>
      ) : pendingOutgoing.has(s.id) ? (
        <span className="text-sm text-gray-500">Pending</span>
      ) : pendingIncoming.has(s.id) ? (
        <div className="flex gap-2">
          <button 
            onClick={() => acceptConnection(s.id, pendingIncoming.get(s.id)!.id, `${s.firstName} ${s.lastName}`)}
            className="rounded-xl border border-green-600 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-600 transition-all duration-300 hover:bg-green-100 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(22,163,74,0.2)]"
          >
            Accept
          </button>
          <button 
            onClick={() => rejectConnection(s.id, pendingIncoming.get(s.id)!.id, `${s.firstName} ${s.lastName}`)}
            className="rounded-xl border border-red-600 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 transition-all duration-300 hover:bg-red-100 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(220,38,38,0.2)]"
          >
            Reject
          </button>
        </div>
      ) : blockedUsers.has(s.id) ? null : (
        <button 
          className={connectButtonClass}
          onClick={() => handleConnectClick(s.id, `${s.firstName} ${s.lastName}`)}
        >
          Connect
        </button>
      )
    )}
  </div>
))}
  </div>
</div>

    {/* ---------- Professionals column ---------- */}
    
    <div className="flex flex-col gap-3">
  <button
    className="w-full rounded-2xl border border-black bg-white px-5 py-4 font-semibold text-black transition-colors hover:bg-gray-50"
  >
    View Professionals
  </button>

  <div className="max-h-[70vh] overflow-y-auto pr-4 flex flex-col gap-3">
    {otherProfessionals
      .filter(p => !hiddenUsers.has(p.id))
      .sort((a, b) => {
        const aPriority = getConnectionSortPriority(a.id, myConnections, pendingOutgoing, pendingIncoming);
        const bPriority = getConnectionSortPriority(b.id, myConnections, pendingOutgoing, pendingIncoming);
        return aPriority - bPriority;
      })
      .map((p, i) => (
  <div
    key={i}
    className="w-full rounded-2xl border border-black bg-white px-5 py-[13px] font-semibold text-black flex items-center justify-between animate-slide-up"
    style={{ animationDelay: `${i * 0.05}s` }}
  >
    <span>
      {p.linkedinUrl ? (
        <a
          href={p.linkedinUrl.startsWith('http') ? p.linkedinUrl : `https://${p.linkedinUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          {p.firstName} {p.lastName}
        </a>
      ) : (
        <>{p.firstName} {p.lastName}</>
      )}
      {" • "}
      {p.company} {" • "}
      {p.workTitle}{p.school ? ` • ${p.school}` : ''}
    </span>

    {isGuestBrowsing ? null : myConnections.has(p.id) ? (
      <span className="text-sm text-green-600 font-semibold">Connected</span>
    ) : pendingOutgoing.has(p.id) ? (
      <span className="text-sm text-gray-500">Pending</span>
    ) : pendingIncoming.has(p.id) ? (
      <div className="flex gap-2">
        <button 
          onClick={() => acceptConnection(p.id, pendingIncoming.get(p.id)!.id, `${p.firstName} ${p.lastName}`)}
          className="rounded-xl border border-green-600 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-600 hover:bg-green-100"
        >
          Accept
        </button>
        <button 
          onClick={() => rejectConnection(p.id, pendingIncoming.get(p.id)!.id, `${p.firstName} ${p.lastName}`)}
          className="rounded-xl border border-red-600 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-100"
        >
          Reject
        </button>
      </div>
    ) : blockedUsers.has(p.id) ? null : (
      <button 
        className={connectButtonClass}
        onClick={() => handleConnectClick(p.id, `${p.firstName} ${p.lastName}`)}
      >
        Connect
      </button>
    )}
  </div>
))}

  </div>
</div>

  </div>
</div>

        </div>
      </div>

<ConfirmModal
  open={showConnectConfirm}
  title="Send connection request?"
  message={`This user has previously declined your connection request. Would you like to send another request to ${connectConfirmUser?.name || 'this user'}?`}
  cancelText="Go back"
  confirmText="Send request"
  onCancel={() => {
    setShowConnectConfirm(false);
    setConnectConfirmUser(null);
  }}
  onConfirm={() => {
    if (connectConfirmUser) {
      sendConnectionRequest(connectConfirmUser.id, connectConfirmUser.name);
    }
    setShowConnectConfirm(false);
    setConnectConfirmUser(null);
  }}
/>

    </main>
  );
}

/* ---------- professional dashboard ---------- */

if (screen === "professionalDashboard" && seatedRole === "professional") {
  const baseButton =
    "w-full rounded-3xl border px-6 font-semibold transition-colors duration-200 hover:bg-gray-50 hover:border-gray-300";

  return (
   <main
      className={`flex min-h-screen justify-center px-6 pt-16 min-[1536px]:max-[1650px]:scale-[0.85] min-[1536px]:max-[1650px]:origin-center ${selectedTheme === "notebook" ? "bg-[#f5f1e8]" : "bg-gradient-to-br from-gray-900 via-black to-gray-900"}`}
      style={selectedTheme === "notebook" ? {
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(0,0,0,0.08) 31px, rgba(0,0,0,0.08) 33px), linear-gradient(90deg, rgba(255,100,100,0.15) 0px, transparent 2px), linear-gradient(90deg, rgba(100,100,255,0.15) 60px, transparent 2px)`,
        backgroundSize: '100% 33px, 100% 100%, 100% 100%'
      } : {}}
    >

  {selectedTheme === "default" && (
    <>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-shift"></div>
      <div className="absolute inset-0 opacity-[0.02]" style={{backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px'}}></div>
    </>
  )}

  {selectedTheme === "notebook" && (
    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23noise)\' /%3E%3C/svg%3E")'}}/>
  )}

  <div className={`w-full max-w-[96rem] relative z-10 ${selectedTheme === "default" ? "animate-slide-up" : ""}`}>
       <div className="mb-2 flex items-center justify-center gap-4">
  <h1 className={`text-3xl font-bold relative ${selectedTheme === "notebook" ? "font-permanent-marker text-[#1e40af] transform -rotate-1" : "text-white tracking-tight"}`}>
    {selectedTheme === "notebook" && (
      <span className="absolute -inset-2 bg-yellow-200/40 -z-10 transform rotate-1 rounded"></span>
    )}
    Professional Dashboard
  </h1>

  <button
    type="button"
    onClick={() => {
      setEditProfileReturnScreen("professionalDashboard");
      setScreen("editProfile");
    }}
    className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
      selectedTheme === "notebook"
        ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
        : "border border-white text-white hover:bg-gray-50 hover:text-black"
    }`}
  >
    Edit Profile
  </button>

  {/* Game PIN display */}
  {gamePin && !joinMode && (
    <div className="flex items-center gap-2">
      <span className={`text-sm font-semibold ${selectedTheme === "notebook" ? "text-[#1e40af]" : "text-white"}`}>PIN: {gamePin}</span>
      <button
        type="button"
        onClick={() => {
          clearPin();
          setGamePin(null);
        }}
        className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
          selectedTheme === "notebook"
            ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
            : "border border-white text-white hover:bg-gray-50 hover:text-black"
        }`}
      >
        Cancel
      </button>
    </div>
  )}

  {/* Join game input */}
  {joinMode && !gamePin && (
    <div className="flex items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        value={joinPinInput}
        onChange={(e) => setJoinPinInput(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && joinPinInput.length === 4) {
            joinPinGame();
          }
        }}
        placeholder="Enter PIN"
        className={`w-24 rounded-lg px-2 py-1 text-center text-sm tracking-widest bg-transparent ${
          selectedTheme === "notebook"
            ? "border-2 border-[#1e40af] text-[#1e40af] placeholder:text-[#1e40af]/50"
            : "border border-white text-white placeholder:text-white/50"
        }`}
      />
      <button
        type="button"
        onClick={() => joinPinGame()}
        disabled={joinPinInput.length !== 4}
        className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all disabled:opacity-50 ${
          selectedTheme === "notebook"
            ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
            : "border border-white text-white hover:bg-gray-50 hover:text-black"
        }`}
      >
        Join
      </button>
      <button
        type="button"
        onClick={() => {
          setJoinMode(false);
          setJoinPinInput("");
        }}
        className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
          selectedTheme === "notebook"
            ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
            : "border border-white text-white hover:bg-gray-50 hover:text-black"
        }`}
      >
        Cancel
      </button>
    </div>
  )}

  {/* Create/Join buttons (shown when no PIN and not joining) */}
  {!gamePin && !joinMode && (
    <>
      <button
        type="button"
        onClick={async () => {
          setCreatingGame(true);
          await createPinGame();
          setCreatingGame(false);
        }}
        disabled={creatingGame}
        className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all disabled:opacity-50 ${
          selectedTheme === "notebook"
            ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
            : "border border-white text-white hover:bg-gray-50 hover:text-black"
        }`}
      >
        {creatingGame ? "Creating..." : "Create Game"}
      </button>
      <button
        type="button"
        onClick={() => {
          setJoinMode(true);
          setJoinPinInput("");
        }}
        className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
          selectedTheme === "notebook"
            ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
            : "border border-white text-white hover:bg-gray-50 hover:text-black"
        }`}
      >
        Join Game
      </button>
    </>
  )}

  <button
    type="button"
    onClick={() => setScreen("connections")}
    className={`relative rounded-xl px-4 py-1.5 text-sm font-semibold transition-all ${
      selectedTheme === "notebook"
        ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
        : "border border-white text-white hover:bg-gray-50 hover:text-black"
    }`}
  >
    Connections
    {Array.from(unreadCounts.values()).reduce((a, b) => a + b, 0) > 0 && (
      <span className={`absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
        selectedTheme === "notebook"
          ? "bg-yellow-200 border-2 border-[#1e40af] text-[#1e40af]"
          : "bg-white border border-black text-black"
      }`}>
        {Array.from(unreadCounts.values()).reduce((a, b) => a + b, 0) > 9 ? '9+' : Array.from(unreadCounts.values()).reduce((a, b) => a + b, 0)}
      </span>
    )}
  </button>
  <button
    type="button"
    onClick={() => {
      if (gamePin || multiplayerActive) {
        setShowTitleScreenConfirm(true);
      } else {
        setScreen("role");
      }
    }}
    className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition-all ${
      selectedTheme === "notebook"
        ? "border-2 border-[#1e40af] bg-transparent text-[#1e40af] hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
        : "border border-white text-white hover:bg-gray-50 hover:text-black"
    }`}
  >
    Title screen
  </button>
</div>

        <p className={`mb-8 text-center text-sm ${selectedTheme === "notebook" ? "text-[#1e40af]/60" : "text-black/60"}`}>
          Same aesthetic for now — we'll plug in real widgets next.
        </p>

        <div className="grid gap-4">
          <div className="rounded-3xl border bg-white p-6 w-full px-10">

  <div className="grid grid-cols-2 gap-6">
  <div className="text-xs font-semibold uppercase tracking-wide text-black/50">
  Other Professionals
</div>

<div className="text-xs font-semibold uppercase tracking-wide text-black/50">
  Students
</div>

    {/* ---------- ProfD Professionals column ---------- */}
<div className="flex flex-col gap-3">
  <button
    className="w-full rounded-2xl border border-black bg-white px-5 py-4 font-semibold text-black transition-colors hover:bg-gray-50"
  >
    View Professionals
  </button>

  <div className="max-h-[70vh] overflow-y-auto pr-2 flex flex-col gap-3">
    {/* Your own profile card */}
    <div className="w-full rounded-2xl border border-black bg-white px-5 py-4 font-semibold text-black flex items-center justify-between">
      <span>
        {studentProfile.linkedinUrl ? (
          <a
            href={studentProfile.linkedinUrl.startsWith('http') ? studentProfile.linkedinUrl : `https://${studentProfile.linkedinUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {studentProfile.firstName} {studentProfile.lastName}
          </a>
        ) : (
          <>{studentProfile.firstName} {studentProfile.lastName}</>
        )}
        {" • "}
        {studentProfile.company} {" • "}
        {studentProfile.workTitle}
      </span>
    </div>

    {otherProfessionals
      .filter(p => !hiddenUsers.has(p.id))
      .sort((a, b) => {
        const aPriority = getConnectionSortPriority(a.id, myConnections, pendingOutgoing, pendingIncoming);
        const bPriority = getConnectionSortPriority(b.id, myConnections, pendingOutgoing, pendingIncoming);
        return aPriority - bPriority;
      })
      .map((p, i) => (
  <div
    key={i}
    className="w-full rounded-2xl border border-black bg-white px-5 py-[14px] font-semibold text-black flex items-center justify-between animate-slide-up"
    style={{ animationDelay: `${i * 0.05}s` }}
  >
    <span>
      {p.linkedinUrl ? (
        <a
          href={p.linkedinUrl.startsWith('http') ? p.linkedinUrl : `https://${p.linkedinUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          {p.firstName} {p.lastName}
        </a>
      ) : (
        <>{p.firstName} {p.lastName}</>
      )}
      {" • "}
      {p.company} {" • "}
      {p.workTitle}{p.school ? ` • ${p.school}` : ''}
    </span>

    {myConnections.has(p.id) ? (
      <span className="text-sm text-green-600 font-semibold">Connected</span>
    ) : pendingOutgoing.has(p.id) ? (
      <span className="text-sm text-gray-500">Pending</span>
    ) : pendingIncoming.has(p.id) ? (
      <div className="flex gap-2">
        <button 
          onClick={() => acceptConnection(p.id, pendingIncoming.get(p.id)!.id, `${p.firstName} ${p.lastName}`)}
          className="rounded-xl border border-green-600 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-600 hover:bg-green-100"
        >
          Accept
        </button>
        <button 
          onClick={() => rejectConnection(p.id, pendingIncoming.get(p.id)!.id, `${p.firstName} ${p.lastName}`)}
          className="rounded-xl border border-red-600 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-100"
        >
          Reject
        </button>
      </div>
    ) : blockedUsers.has(p.id) ? null : (
      <button 
        className={connectButtonClass}
        onClick={() => handleConnectClick(p.id, `${p.firstName} ${p.lastName}`)}
      >
        Connect
      </button>
    )}
  </div>
))}

  </div>
</div>

    {/* ---------- ProfD Students column ---------- */}
<div className="flex flex-col gap-3">
  <button
    className="w-full rounded-2xl border border-black bg-white px-5 py-4 font-semibold text-black transition-colors hover:bg-gray-50"
  >
    View Students
  </button>

  <div className="max-h-[70vh] overflow-y-auto pr-2 flex flex-col gap-3">
    {otherStudents
      .filter(s => !hiddenUsers.has(s.id))
      .sort((a, b) => {
        const aPriority = getConnectionSortPriority(a.id, myConnections, pendingOutgoing, pendingIncoming);
        const bPriority = getConnectionSortPriority(b.id, myConnections, pendingOutgoing, pendingIncoming);
        return aPriority - bPriority;
      })
      .map((s, i) => (
  <div
    key={i}
    className="w-full rounded-2xl border border-black bg-white px-5 py-[13px] font-semibold text-black flex items-center justify-between animate-slide-up"
    style={{ animationDelay: `${i * 0.05}s` }}
  >
    <span>
      {s.linkedinUrl ? (
        <a
          href={s.linkedinUrl.startsWith('http') ? s.linkedinUrl : `https://${s.linkedinUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
          {s.firstName} {s.lastName}
        </a>
      ) : (
        <>{s.firstName} {s.lastName}</>
      )}
      {" • "}
      {s.year} {" • "}
      {s.major}{s.school ? ` • ${s.school}` : ''}
    </span>

    {isGuestBrowsing ? null : myConnections.has(s.id) ? (
      <span className="text-sm text-green-600 font-semibold">Connected</span>
    ) : pendingOutgoing.has(s.id) ? (
      <span className="text-sm text-gray-500">Pending</span>
    ) : pendingIncoming.has(s.id) ? (
      <div className="flex gap-2">
        <button 
          onClick={() => acceptConnection(s.id, pendingIncoming.get(s.id)!.id, `${s.firstName} ${s.lastName}`)}
          className="rounded-xl border border-green-600 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-600 hover:bg-green-100"
        >
          Accept
        </button>
        <button 
          onClick={() => rejectConnection(s.id, pendingIncoming.get(s.id)!.id, `${s.firstName} ${s.lastName}`)}
          className="rounded-xl border border-red-600 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-100"
        >
          Reject
        </button>
      </div>
    ) : blockedUsers.has(s.id) ? null : (
      <button 
        className={connectButtonClass}
        onClick={() => handleConnectClick(s.id, `${s.firstName} ${s.lastName}`)}
      >
        Connect
      </button>
    )}
  </div>
))}

  </div>
</div>
  </div>
</div>

        </div>
      </div>

<ConfirmModal
  open={showConnectConfirm}
  title="Send connection request?"
  message={`This user has previously declined your connection request. Would you like to send another request to ${connectConfirmUser?.name || 'this user'}?`}
  cancelText="Go back"
  confirmText="Send request"
  onCancel={() => {
    setShowConnectConfirm(false);
    setConnectConfirmUser(null);
  }}
  onConfirm={() => {
    if (connectConfirmUser) {
      sendConnectionRequest(connectConfirmUser.id, connectConfirmUser.name);
    }
    setShowConnectConfirm(false);
    setConnectConfirmUser(null);
  }}
/>

    </main>
  );
}

if (screen === "connections") {
  return (
    <main className="flex h-screen justify-center bg-black px-6 py-6 overflow-hidden">
      <div className="w-full max-w-[96rem] flex flex-col">
        <div className="mb-4 flex items-center justify-center gap-4 shrink-0">
          <h1 className="text-3xl font-bold text-white">Connections</h1>
          
          <button
            type="button"
            onClick={() => {
              if (gamePin || multiplayerActive) {
                setShowDashboardConfirm(true);
              } else {
                setScreen(seatedRole === "professional" ? "professionalDashboard" : "dashboard");
              }
            }}
            className="rounded-xl border border-white text-white px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-gray-50 hover:text-black"
          >
            Dashboard
          </button>
         <button
            type="button"
            onClick={() => {
              if (gamePin || multiplayerActive) {
                setShowTitleScreenConfirm(true);
              } else {
                setScreen("role");
              }
            }}
            className="rounded-xl border border-white text-white px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-gray-50 hover:text-black"
          >
            Title screen
          </button>
        </div>
        
        <p className="mb-8 text-center text-sm text-black/60">
          Message your connections
        </p>
        
        <div className="rounded-3xl border bg-white p-6 w-full flex-1 min-h-0 overflow-hidden">
          <div className="grid grid-cols-[350px_1fr] gap-6 h-full">
            
            {/* Left side - Connections list */}
            <div className="flex flex-col border-r pr-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-black/50 mb-4">
                Your Connections ({connectedUsers.length})
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2">
                {connectedUsers.length === 0 ? (
                  <div className="text-sm text-black/50 text-center py-8">
                    No connections yet. Connect with people from the Dashboard!
                  </div>
                ) : (
                  connectedUsers.map((user) => {
                    const lastMsg = lastMessages.get(user.id);
                    const unreadCount = unreadCounts.get(user.id) || 0;
                    
                    // Format date like LinkedIn
                    const formatDate = (dateStr: string) => {
                      const date = new Date(dateStr);
                      const now = new Date();
                      const diffMs = now.getTime() - date.getTime();
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      
                      if (diffDays === 0) {
                        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                      } else if (diffDays === 1) {
                        return 'Yesterday';
                      } else if (diffDays < 7) {
                        return date.toLocaleDateString([], { weekday: 'short' });
                      } else {
                        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                      }
                    };
                    
                    return (
                      <button
                        key={user.id}
                        onClick={() => setSelectedChatUser(user)}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                          selectedChatUser?.id === user.id ? 'border-black bg-gray-50' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold text-black ${unreadCount > 0 ? 'font-bold' : ''}`}>
                                {user.firstName} {user.lastName}
                              </span>
                              {unreadCount > 0 && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-[11px] font-bold text-white">
                                  {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                              )}
                            </div>
                            {lastMsg ? (
                              <div className={`text-sm truncate mt-0.5 ${unreadCount > 0 ? 'text-black font-medium' : 'text-black/60'}`}>
                                {lastMsg.senderId === sbUser?.id ? 'You: ' : ''}{lastMsg.text}
                              </div>
                            ) : user.linkedinUrl ? (
                              <div className="text-xs text-blue-600 truncate">
                                LinkedIn connected
                              </div>
                            ) : null}
                          </div>
                          {lastMsg && (
                            <div className={`text-xs whitespace-nowrap ${unreadCount > 0 ? 'text-black font-semibold' : 'text-black/50'}`}>
                              {formatDate(lastMsg.createdAt)}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            
            {/* Right side - Chat */}
            <div className="relative h-full">
              {!selectedChatUser ? (
                <div className="h-full flex items-center justify-center text-black/50">
                  Select a connection to start messaging
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div className="border-b pb-4 mb-4">
                    <div className="font-bold text-lg text-black">
                      {selectedChatUser.firstName} {selectedChatUser.lastName}
                    </div>
                    {selectedChatUser.linkedinUrl && (
                      <a
                        href={selectedChatUser.linkedinUrl.startsWith('http') ? selectedChatUser.linkedinUrl : `https://${selectedChatUser.linkedinUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View LinkedIn Profile
                      </a>
                    )}
                  </div>
                  
                  {/* Messages - scrollable area with padding at bottom for input */}
                  <div data-messages-container className="absolute inset-0 top-16 bottom-16 overflow-y-auto space-y-3 pr-2 flex flex-col">
                    <div className="flex-1" />
                    {messages.length === 0 ? (
                      <div className="text-center text-black/50 py-8">
                        No messages yet. Say hello!
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.senderId === sbUser?.id ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                              msg.senderId === sbUser?.id
                                ? 'bg-black text-white'
                                : 'bg-gray-100 text-black'
                            }`}
                          >
                            <div className="text-sm">{msg.text}</div>
                            <div className={`text-xs mt-1 ${
                              msg.senderId === sbUser?.id ? 'text-white/60' : 'text-black/40'
                            }`}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  {/* Message input - fixed at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 flex gap-3 bg-white pt-3">
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Type a message..."
                      className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm text-black focus:border-black focus:outline-none"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!messageInput.trim()}
                      className="rounded-xl border border-black bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

  /* ---------- edit profile ---------- */

if (screen === "editProfile") {
  const inputClass = selectedTheme === "notebook"
    ? "rounded-xl border-2 border-[#1e40af] text-[#1e40af] placeholder:text-[#1e40af]/50 bg-transparent px-4 py-3 text-sm"
    : "rounded-xl border border-white text-white placeholder:text-white/50 bg-transparent px-4 py-3 text-sm";
  const buttonClass = selectedTheme === "notebook"
    ? "rounded-2xl border-2 border-[#1e40af] text-[#1e40af] px-4 py-3 text-sm font-semibold transition-all hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
    : "rounded-2xl border border-white text-white px-4 py-3 text-sm font-semibold transition-colors hover:bg-gray-50 hover:text-black";
  
  const handleSaveProfile = async () => {
    if (!sbUser?.id) return;
    
    // === PROFILE VALIDATION (schema-based) ===
    const profileValidation = validateProfileData({
      firstName: studentProfile.firstName,
      lastName: studentProfile.lastName,
      email: studentProfile.email,
      year: studentProfile.year,
      major: studentProfile.major,
      school: studentProfile.school,
      company: studentProfile.company,
      workTitle: studentProfile.workTitle,
      linkedinUrl: studentProfile.linkedinUrl,
    });
    
    if (!profileValidation.valid) {
      const firstError = Object.values(profileValidation.errors)[0];
      alert(firstError || 'Please check your input');
      return;
    }
    
    const sanitizedProfile = profileValidation.sanitized;
    
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: toTitleCase(sanitizedProfile.firstName),
          last_name: toTitleCase(sanitizedProfile.lastName),
          year: seatedRole === 'student' ? sanitizedProfile.year : null,
          major: seatedRole === 'student' ? toTitleCase(sanitizedProfile.major) : null,
          school: sanitizedProfile.school || null,
          company: seatedRole === 'professional' ? sanitizedProfile.company : null,
          work_title: seatedRole === 'professional' ? sanitizedProfile.workTitle : null,
          linkedin_url: sanitizedProfile.linkedinUrl || null,
        })
        .eq('id', sbUser.id);
      
      if (error) {
        alert('Failed to save. Please try again.');
      } else {
        // Update local state with saved values
        setStudentProfile({
          ...studentProfile,
          firstName: toTitleCase(sanitizedProfile.firstName),
          lastName: toTitleCase(sanitizedProfile.lastName),
          year: seatedRole === 'student' ? sanitizedProfile.year : '',
          major: seatedRole === 'student' ? toTitleCase(sanitizedProfile.major) : '',
          school: sanitizedProfile.school || '',
          company: seatedRole === 'professional' ? sanitizedProfile.company : '',
          workTitle: seatedRole === 'professional' ? sanitizedProfile.workTitle : '',
          linkedinUrl: sanitizedProfile.linkedinUrl || '',
        });
        alert('Profile updated!');
        setScreen(editProfileReturnScreen);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <main
      className={`relative flex min-h-screen items-center justify-center px-6 ${selectedTheme === "notebook" ? "bg-[#f5f1e8]" : "bg-gradient-to-br from-gray-900 via-black to-gray-900"}`}
      style={selectedTheme === "notebook" ? {
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(0,0,0,0.08) 31px, rgba(0,0,0,0.08) 33px), linear-gradient(90deg, rgba(255,100,100,0.15) 0px, transparent 2px), linear-gradient(90deg, rgba(100,100,255,0.15) 60px, transparent 2px)`,
        backgroundSize: '100% 33px, 100% 100%, 100% 100%'
      } : {}}
    >

      {selectedTheme === "default" && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-shift"></div>
          <div className="absolute inset-0 opacity-[0.02]" style={{backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px'}}></div>
        </>
      )}

      {selectedTheme === "notebook" && (
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23noise)\' /%3E%3C/svg%3E")'}}/>
      )}

      <div className={`w-full max-w-md relative z-10 ${selectedTheme === "default" ? "animate-slide-up" : ""}`}>
        <h1 className={`mb-6 text-center text-3xl font-bold relative ${selectedTheme === "notebook" ? "font-permanent-marker text-[#1e40af] transform -rotate-1" : "text-white tracking-tight"}`}>
          {selectedTheme === "notebook" && (
            <span className="absolute -inset-2 bg-yellow-200/40 -z-10 transform rotate-1 rounded"></span>
          )}
          Edit Profile
        </h1>

        <div className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="First name"
            value={studentProfile.firstName}
            onChange={(e) =>
              setStudentProfile({ ...studentProfile, firstName: e.target.value })
            }
            className={inputClass}
          />

          <input
            type="text"
            placeholder="Last name"
            value={studentProfile.lastName}
            onChange={(e) =>
              setStudentProfile({ ...studentProfile, lastName: e.target.value })
            }
            className={inputClass}
          />

          <input
            type="text"
            placeholder="LinkedIn URL (optional)"
            value={studentProfile.linkedinUrl}
            onChange={(e) =>
              setStudentProfile({ ...studentProfile, linkedinUrl: e.target.value })
            }
            className={inputClass}
          />

          {seatedRole === "student" && (
            <>
              <input
                type="text"
                placeholder="School"
                value={studentProfile.school}
                onChange={(e) =>
                  setStudentProfile({ ...studentProfile, school: e.target.value })
                }
                className={inputClass}
              />

              <select
                value={studentProfile.year}
                onChange={(e) =>
                  setStudentProfile({ ...studentProfile, year: e.target.value })
                }
                className={`w-full rounded-xl px-4 py-3 text-sm appearance-none bg-transparent cursor-pointer ${
                  selectedTheme === "notebook"
                    ? "border-2 border-[#1e40af] text-[#1e40af]"
                    : "border border-white text-white"
                }`}
              >
                <option value="" disabled className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>Year</option>
                <option value="1" className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>1</option>
                <option value="2" className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>2</option>
                <option value="3" className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>3</option>
                <option value="4" className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>4</option>
                <option value="Other" className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>Other</option>
              </select>

              <input
                type="text"
                placeholder="Major"
                value={studentProfile.major}
                onChange={(e) =>
                  setStudentProfile({ ...studentProfile, major: e.target.value })
                }
                className={inputClass}
              />
            </>
          )}

          {seatedRole === "professional" && (
            <>
              <input
                type="text"
                placeholder="School"
                value={studentProfile.school}
                onChange={(e) =>
                  setStudentProfile({ ...studentProfile, school: e.target.value })
                }
                className={inputClass}
              />

              <input
                type="text"
                placeholder="Company"
                value={studentProfile.company}
                onChange={(e) =>
                  setStudentProfile({ ...studentProfile, company: e.target.value })
                }
                className={inputClass}
              />

              <input
                type="text"
                placeholder="Work title"
                value={studentProfile.workTitle}
                onChange={(e) =>
                  setStudentProfile({ ...studentProfile, workTitle: e.target.value })
                }
                className={inputClass}
              />
            </>
          )}

          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className={`mt-4 ${buttonClass} disabled:opacity-50`}
          >
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </button>

          <button
            type="button"
            onClick={() => setScreen(editProfileReturnScreen)}
            className={buttonClass}
          >
            Cancel
          </button>

          <div className={`mt-8 pt-6 ${selectedTheme === "notebook" ? "border-t-2 border-red-300" : "border-t border-white/10"}`}>
            <button
              type="button"
              onClick={async () => {
                const confirmed = window.confirm(
                  'Are you sure you want to delete your account? This will permanently remove all your data and cannot be undone.'
                );
                if (!confirmed) return;

                const doubleConfirm = window.confirm(
                  'This is permanent. All your profile data, connections, and game history will be deleted. Continue?'
                );
                if (!doubleConfirm) return;

                try {
                  if (!sbUser?.id) return;

                  // Delete profile from database
                  const { error: deleteError } = await supabase
                    .from('profiles')
                    .delete()
                    .eq('id', sbUser.id);

                  if (deleteError) {
                    alert('Failed to delete account. Please try again.');
                    return;
                  }

                  // Sign out
                  await supabase.auth.signOut();
                  setSbUser(null);
                  setStudentProfile({
                    firstName: '', lastName: '', email: '', password: '',
                    year: '', major: '', school: '', company: '', workTitle: '', linkedinUrl: '',
                  });
                  setSeatedRole(null);
                  setScreen('role');
                  alert('Your account has been deleted.');
                } catch (e) {
                  alert('Failed to delete account. Please try again.');
                }
              }}
              className={`w-full ${
                selectedTheme === "notebook"
                  ? "rounded-2xl border-2 border-red-400 text-red-500 px-4 py-3 text-sm font-semibold transition-all hover:bg-red-500 hover:text-white"
                  : "rounded-2xl border border-red-500/50 text-red-400 px-4 py-3 text-sm font-semibold transition-colors hover:bg-red-500 hover:text-white hover:border-red-500"
              }`}
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ---------- about screen ---------- */

if (screen === "about") {
  return (
    <main className={`relative flex min-h-screen items-center justify-center px-6 py-12 overflow-hidden ${
      selectedTheme === "notebook"
        ? "bg-[#f5f1e8]"
        : "bg-gradient-to-br from-gray-900 via-black to-gray-900"
    }`} style={selectedTheme === "notebook" ? {
      backgroundImage: `
        repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(0,0,0,0.08) 31px, rgba(0,0,0,0.08) 33px),
        linear-gradient(90deg, rgba(255,100,100,0.15) 0px, transparent 2px),
        linear-gradient(90deg, rgba(100,100,255,0.15) 60px, transparent 2px)
      `,
      backgroundSize: '100% 33px, 100% 100%, 100% 100%'
    } : {}}>

      {selectedTheme === "default" && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-shift"></div>
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}></div>
        </>
      )}

      {selectedTheme === "notebook" && (
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23noise)\' /%3E%3C/svg%3E")',
        }} />
      )}

      <div className={`w-full max-w-2xl relative z-10 ${selectedTheme === "default" ? "animate-slide-up" : ""}`}>
        <div className="mb-8 flex items-center justify-between">
          <h1 className={`font-bold ${
            selectedTheme === "notebook"
              ? "text-4xl font-permanent-marker text-[#1e40af] transform -rotate-1 relative"
              : "text-3xl text-white tracking-tight"
          }`}>
            {selectedTheme === "notebook" && (
              <span className="absolute -bottom-2 left-0 w-24 h-3 bg-yellow-200 opacity-40 -rotate-1 -z-10"></span>
            )}
            About
          </h1>
          <button
            type="button"
            onClick={() => setScreen("role")}
            className={`px-4 py-2 text-sm font-semibold transition-all duration-300 ${
              selectedTheme === "notebook"
                ? "font-caveat text-lg text-gray-700 hover:text-[#dc2626]"
                : "rounded-xl border border-white/20 text-white hover:bg-white hover:text-black hover:scale-[1.02]"
            }`}
            style={selectedTheme === "notebook" ? {
              border: '2px solid #6b7280',
              borderRadius: '8px 12px 10px 14px',
              background: 'rgba(229, 229, 229, 0.3)'
            } : {}}
          >
            Back
          </button>
        </div>

        <div className={`space-y-6 leading-relaxed ${
          selectedTheme === "notebook"
            ? "text-gray-800 font-caveat text-lg"
            : "text-white/90"
        }`}>
          <p>
            Hi!
            <br />
            <br />
            I'm a third year Economics student at UCLA interested in business, risk, and decision making.
          </p>

          <p>
            I built HeadsUp as a different way to approach networking. When I reach out to someone, I offer to play a quick poker game (no stakes) while having a coffee chat. The game gives structure to the conversation and makes the interaction more memorable and engaging.
          </p>

          <p>
            This project has been a way to learn product thinking. How do you design for behavior? What makes people actually use something? How do you go from idea to working product?
          </p>

          <p>
            I'm using it for my own outreach now. The experience has been great! Some people love the format, others prefer a traditional call. Either way, I learn something from each conversation.
          </p>

          <p>
            What started as a portfolio project has turned into something I genuinely want to grow. I'm exploring roles in product management, risk management, and FP&A, but I'm also open to seeing where HeadsUp can go. I'm proud of what I've built and always working to make it better.
          </p>

          <div className="mt-8 pt-6 border-t border-white/20">
            <p className="font-semibold text-white mb-2">Joseph Kim-Lee</p>
            <p className="text-sm text-white/70 mb-1">UCLA Economics '27</p>
            <div className="flex flex-col gap-1 text-sm">
              <a
                href="mailto:josephklwork@gmail.com"
                className="text-white/80 hover:text-white underline"
              >
                josephklwork@gmail.com
              </a>
              <a
                href="https://linkedin.com/in/joseph-kim-lee"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 hover:text-white underline"
              >
                linkedin.com/in/joseph-kim-lee
              </a>
              <a
                href="https://github.com/josephklwork-hash"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/80 hover:text-white underline"
              >
                github.com/josephklwork-hash
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

  /* ---------- game view ---------- */

  if (screen !== "game" || !seatedRole) return null;

 const dealerChipTop =
    "absolute -bottom-3 -right-3 flex h-10 w-10 items-center justify-center rounded-full border bg-white text-[20px] font-bold text-black shadow-sm";
  const dealerChipBottom =
    "absolute -top-3 -left-3 flex h-10 w-10 items-center justify-center rounded-full border bg-white text-[20px] font-bold text-black shadow-sm";

  const streetLabel = streetNameFromCount(displayStreet);

  const facingBetBottom = displayGame.bets[oppActualSeat] > displayGame.bets[myActualSeat];
  // Cap call amount to my remaining stack
  const bottomCallAmt = roundToHundredth(
    Math.min(
      Math.max(0, displayGame.bets[oppActualSeat] - displayGame.bets[myActualSeat]),
      displayGame.stacks[myActualSeat]
    )
  );

  const effectiveLastRaiseSize = multiplayerActive && mpState ? mpState.lastRaiseSize : lastRaiseSize;
  
  // When not facing a bet/raise
  const bottomMinRaise = facingBetBottom 
    ? roundToHundredth(displayGame.bets[oppActualSeat] + effectiveLastRaiseSize)
    : (displayStreet === 0 && displayGame.bets[myActualSeat] > 0 && displayGame.bets[oppActualSeat] > 0)
      ? roundToHundredth(Math.max(displayGame.bets[myActualSeat], displayGame.bets[oppActualSeat]) + BB)
      : BB;
  
  // Cap max bet to what opponent can actually call (effective stack)
  const bottomMaxTo = roundToHundredth(
    Math.min(
      displayGame.bets[myActualSeat] + displayGame.stacks[myActualSeat],  // My total chips
      displayGame.bets[oppActualSeat] + displayGame.stacks[oppActualSeat]  // Opponent's total chips
    )
  );

  const defaultTo = facingBetBottom
    ? bottomMinRaise
    : roundToHundredth((displayGame.pot + displayGame.bets.top + displayGame.bets.bottom) * 0.5);

  // Opening action logic
  const isOpeningAction = displayGame.bets[myActualSeat] === 0 && displayGame.bets[oppActualSeat] === 0;
  const effectiveBetSize = betSize === "" ? bottomMinRaise : betSize;
  const safeBetSize = Math.max(effectiveBetSize, bottomMinRaise);
  
  // Display value: preflop opening defaults to 2BB, postflop opening defaults to 1BB
  const openingDefault = (displayStreet === 0 && isOpeningAction) ? 2 : (isOpeningAction && displayStreet > 0 ? 1 : bottomMinRaise);
  const displayBetSize = (betSize === "" || betSize < bottomMinRaise) 
    ? openingDefault
    : betSize;

  const heroPosLabel = viewingSnapshot
  ? viewingSnapshot.heroPos
  : dealerSeat === mySeat ? "SB/D" : "BB";

const oppPosLabel = viewingSnapshot
  ? viewingSnapshot.oppPos
  : dealerSeat === mySeat ? "BB" : "SB/D";

  // Get hand start stacks (before blinds posted)
  const displayHandStartStacks = multiplayerActive && mpState 
    ? mpState.handStartStacks 
    : handStartStacks;
  
  const heroStartStack = viewingSnapshot 
    ? viewingSnapshot.heroStartStack 
    : displayHandStartStacks[myActualSeat];
  
  const oppStartStack = viewingSnapshot 
    ? viewingSnapshot.oppStartStack 
    : displayHandStartStacks[oppActualSeat];

// Filter action log to hide showdown results until river animation completes
const baseActionLog = viewingSnapshot ? viewingSnapshot.log : displayActionLog;
const displayedActionLog = (riverAnimationComplete || displayStreet < 5)
  ? baseActionLog
  : baseActionLog.filter(entry => {
      // Hide showdown-related entries until animation completes
      const text = entry.text.toLowerCase();
      return !text.includes('shows ') &&
             !text.includes('showdown') &&
             !text.includes('mucked') &&
             !text.includes('split pot');
    });

const displayedHistoryBoard = viewingSnapshot
  ? viewingSnapshot.endedBoard
  : [];

  return (
    <>

<ConfirmModal
  open={showResetConfirm}
  title="Reset game?"
  message="Are you sure? Stack sizes will be reset and the starting position will also reset."
  cancelText="Go back"
  confirmText="Reset game"
  onCancel={() => setShowResetConfirm(false)}
  onConfirm={() => {
  setShowResetConfirm(false);
  
  if (multiplayerActive && isHost) {
    // In multiplayer, only host can reset and broadcasts to joiner
    resetGame();
  } else if (!multiplayerActive) {
    // Single player can always reset
    resetGame();
  }
  // Joiner cannot reset in multiplayer - do nothing
}}
/>

<ConfirmModal
  open={showFoldConfirm}
  title="Fold hand?"
  message="Are you sure you would like to fold? If you fold, you will forfeit your share of the pot."
  cancelText="Go back"
  confirmText="Fold"
  onCancel={() => setShowFoldConfirm(false)}
  onConfirm={() => {
    setShowFoldConfirm(false);
    dispatchAction({ type: "FOLD" });
  }}
/>

<ConfirmModal
  open={showTitleScreenConfirm}
  title="Go to Title Screen?"
  message="Are you sure you'd like to go to the Title Screen? If you do, the game will end and stack sizes and positions will reset."
  cancelText="Go back"
  confirmText="Confirm"
  onCancel={() => setShowTitleScreenConfirm(false)}
  onConfirm={() => {
    setShowTitleScreenConfirm(false);
    setOpponentName(null);

    // Cleanup multiplayer and broadcast quit - use refs for reliability
    if (mpHostRef.current) {
      mpHostRef.current.destroy();
      setMpHost(null);
      mpHostRef.current = null;
    }
    if (mpJoinerRef.current) {
      mpJoinerRef.current.destroy();
      setMpJoiner(null);
      mpJoinerRef.current = null;
    }
    // Video cleanup
    setDailyRoomUrl(null);
    setVideoCallActive(false);
    setRoomCreationError(null);
    
    // Also broadcast quit directly via channel if game exists but controllers don't
    if (gameId && !mpHostRef.current && !mpJoinerRef.current) {
      const ch = supabase.channel(`game:${gameId}`);
      ch.send({
        type: "broadcast",
        event: "mp",
        payload: {
          event: "PLAYER_QUIT",
          sender: sbUser?.id ?? (mySeat === 'bottom' ? 'host' : 'joiner'),
        },
      }).catch(() => {});
      supabase.removeChannel(ch);
    }
    
    setMultiplayerActive(false);
    setOpponentQuit(false);
    setPlayAgainRequested(false);
    setOpponentWantsPlayAgain(false);
    setGameId(null);
    
    // Clear saved session so we don't reconnect
    sessionStorage.removeItem('headsup_gameId');
    sessionStorage.removeItem('headsup_mySeat');
    sessionStorage.removeItem('headsup_gamePin');
    sessionStorage.removeItem('headsup_dealerOffset');
    sessionStorage.removeItem('headsup_hostState');
    sessionStorage.removeItem('headsup_handHistory');
    
    clearTimers();
    clearPin();
    setGamePin(null);
    setJoinMode(false);
    setJoinPinInput("");
    setAiEnabled(false);
    setOtherStudents([]);
    setOtherProfessionals([]);
    setScreen("role");
  }}
/>

<ConfirmModal
  open={showDashboardConfirm}
  title="Go to Dashboard?"
  message="Are you sure you'd like to go to the Dashboard? If you do, the game will end and stack sizes and positions will reset."
  cancelText="Go back"
  confirmText="Confirm"
  onCancel={() => setShowDashboardConfirm(false)}
  onConfirm={() => {
    setShowDashboardConfirm(false);
    setOpponentName(null);

    // Cleanup multiplayer and broadcast quit - use refs for reliability
    if (mpHostRef.current) {
      mpHostRef.current.destroy();
      setMpHost(null);
      mpHostRef.current = null;
    }
    if (mpJoinerRef.current) {
      mpJoinerRef.current.destroy();
      setMpJoiner(null);
      mpJoinerRef.current = null;
    }
    // Video cleanup
    setDailyRoomUrl(null);
    setVideoCallActive(false);
    setRoomCreationError(null);
    
    // Also broadcast quit directly via channel if game exists but controllers don't
    if (gameId && !mpHostRef.current && !mpJoinerRef.current) {
      const ch = supabase.channel(`game:${gameId}`);
      ch.send({
        type: "broadcast",
        event: "mp",
        payload: {
          event: "PLAYER_QUIT",
          sender: sbUser?.id ?? (mySeat === 'bottom' ? 'host' : 'joiner'),
        },
      }).catch(() => {});
      supabase.removeChannel(ch);
    }
    
    setMultiplayerActive(false);
    setOpponentQuit(false);
    setPlayAgainRequested(false);
    setOpponentWantsPlayAgain(false);
    setGameId(null);
    
    // Clear saved session so we don't reconnect
    sessionStorage.removeItem('headsup_gameId');
    sessionStorage.removeItem('headsup_mySeat');
    sessionStorage.removeItem('headsup_gamePin');
    sessionStorage.removeItem('headsup_dealerOffset');
    sessionStorage.removeItem('headsup_hostState');
    sessionStorage.removeItem('headsup_handHistory');
    
    clearTimers();
    clearPin();
    setGamePin(null);
    setJoinMode(false);
    setJoinPinInput("");
    setAiEnabled(false);
    setScreen(seatedRole === "professional" ? "professionalDashboard" : "dashboard");
  }}
/>

      <main
        className={`relative flex items-center justify-center px-6 py-1 overflow-y-auto ${selectedTheme === "notebook" ? "bg-[#f5f1e8]" : "bg-gradient-to-br from-gray-900 via-black to-gray-900"}`}
        style={selectedTheme === "notebook" ? {
          minHeight: '100vh',
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(0,0,0,0.08) 31px, rgba(0,0,0,0.08) 33px), linear-gradient(90deg, rgba(255,100,100,0.15) 0px, transparent 2px), linear-gradient(90deg, rgba(100,100,255,0.15) 60px, transparent 2px)`,
          backgroundSize: '100% 33px, 100% 100%, 100% 100%'
        } : { minHeight: '100vh' }}
      >

      {selectedTheme === "default" && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-shift"></div>
          <div className="absolute inset-0 opacity-[0.02]" style={{backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px'}}></div>
        </>
      )}

      {selectedTheme === "notebook" && (
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23noise)\' /%3E%3C/svg%3E")'}}/>
      )}

     {/* Play Again UI - only show in multiplayer when game is over, opponent hasn't quit, and river animation completes */}
      {multiplayerActive && mpState?.gameOver && !opponentQuit && (riverAnimationComplete || displayStreet < 5) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
          {/* State 1: Neither player has requested - show Play Again button */}
          {!playAgainRequested && !opponentWantsPlayAgain && (
            <button
              onClick={() => {
                setPlayAgainRequested(true);
                // Send broadcast to opponent via the existing channel
                if (isHost && mpHost) {
                  mpHost['channel'].send({
                    type: "broadcast",
                    event: "mp",
                    payload: {
                      event: "PLAY_AGAIN_REQUEST",
                      sender: sbUser?.id ?? 'host',
                    },
                  });
                } else if (mpChannelRef.current) {
                  mpChannelRef.current.send({
                    type: "broadcast",
                    event: "mp",
                    payload: {
                      event: "PLAY_AGAIN_REQUEST",
                      sender: sbUser?.id ?? 'joiner',
                    },
                  });
                }
              }}
              className="rounded-2xl min-[1536px]:max-[1650px]:rounded-xl border border-black bg-white px-6 py-2 min-[1536px]:max-[1650px]:px-4 min-[1536px]:max-[1650px]:py-1.5 text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-black shadow-sm hover:bg-gray-50"
            >
              Play Again?
            </button>
          )}
          
          {/* State 2: I requested, waiting for opponent */}
          {playAgainRequested && !opponentWantsPlayAgain && (
            <div className="rounded-2xl min-[1536px]:max-[1650px]:rounded-xl border border-black bg-white px-6 py-2 min-[1536px]:max-[1650px]:px-4 min-[1536px]:max-[1650px]:py-1.5 text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-black shadow-sm">
              Sent request to {opponentName || "Opponent"}, waiting for response...
            </div>
          )}
          
          {/* State 3: Opponent requested, show Accept button */}
          {opponentWantsPlayAgain && !playAgainRequested && (
            <div className="flex items-center gap-3 rounded-2xl min-[1536px]:max-[1650px]:rounded-xl border border-black bg-white px-6 py-2 min-[1536px]:max-[1650px]:px-4 min-[1536px]:max-[1650px]:py-1.5 shadow-sm">
              <span className="text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-black">
                {opponentName || "Opponent"} wants to play again
              </span>
              <button
                onClick={() => {
                  // Send accept to opponent
                  if (isHost && mpHost) {
                    mpHost['channel'].send({
                      type: "broadcast",
                      event: "mp",
                      payload: {
                        event: "PLAY_AGAIN_ACCEPT",
                        sender: sbUser?.id ?? 'host',
                      },
                    });
                    // Host resets the game immediately
                    setPlayAgainRequested(false);
                    setOpponentWantsPlayAgain(false);
                    setHandLogHistory([]);
                    setLogViewOffset(0);
                    mpHost.resetGame();
                    setMpState(JSON.parse(JSON.stringify(mpHost.getState())));
                  } else if (mpChannelRef.current) {
                    mpChannelRef.current.send({
                      type: "broadcast",
                      event: "mp",
                      payload: {
                        event: "PLAY_AGAIN_ACCEPT",
                        sender: sbUser?.id ?? 'joiner',
                      },
                    });
                    // Joiner just clears states - will receive new state from host
                    setPlayAgainRequested(false);
                    setOpponentWantsPlayAgain(false);
                    setHandLogHistory([]);
                    setLogViewOffset(0);
                  }
                }}
                className="rounded-xl border border-green-600 bg-green-50 px-4 py-1 text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-green-600 hover:bg-green-100"
              >
                Accept
              </button>
            </div>
          )}
          
          {/* State 4: Both requested - starting new game */}
          {playAgainRequested && opponentWantsPlayAgain && (
            <div className="rounded-2xl min-[1536px]:max-[1650px]:rounded-xl border border-black bg-white px-6 py-2 min-[1536px]:max-[1650px]:px-4 min-[1536px]:max-[1650px]:py-1.5 text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-black shadow-sm">
              Starting new game...
            </div>
          )}
        </div>
      )}
      
      {/* Single player Play Again - only show after river animation completes */}
      {!multiplayerActive && gameOver && !playAgainRequested && (dealtCards.river || street < 5) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
          <button
            onClick={() => {
              setPlayAgainRequested(true);
              resetGame();
            }}
            className="rounded-2xl min-[1536px]:max-[1650px]:rounded-xl border border-black bg-white px-6 py-2 min-[1536px]:max-[1650px]:px-4 min-[1536px]:max-[1650px]:py-1.5 text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-black shadow-sm hover:bg-gray-50"
          >
            Play Again?
          </button>
        </div>
      )}

{/* Show Hand Button */}
{displayHandResult.status === "ended" && 
 canIShow &&
 !didIShow && 
 !((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver)) && (
  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
    <button
      onClick={() => {
        if (multiplayerActive && isHost && mpHost) {
          mpHost.showHand(mySeat);
          setMpState(JSON.parse(JSON.stringify(mpHost.getState())));
        } else if (multiplayerActive && mpChannelRef.current) {
          mpChannelRef.current.send({
            type: "broadcast",
            event: "mp",
            payload: {
              event: "SHOW_HAND",
              seat: mySeat,
              sender: sbUser?.id ?? 'joiner',
            },
          });
        } else {
          // Single player - update local state
          if (mySeat === "top") {
            setTopShowed(true);
          } else {
            setBottomShowed(true);
          }
          
          if (youC && youD) {
            logAction(mySeat, `Shows ${cardStr(youC)} ${cardStr(youD)}`);
          }
        }
      }}
      className="rounded-2xl min-[1536px]:max-[1650px]:rounded-xl border border-black bg-white px-6 py-2 min-[1536px]:max-[1650px]:px-4 min-[1536px]:max-[1650px]:py-1.5 text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-black shadow-sm hover:bg-gray-50"
    >
      Show Hand
    </button>
  </div>
)}

      {blindNotice && 
       displayHandResult.status === "playing" && 
       !((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver)) ? (
  <div className="absolute top-6 left-1/2 -translate-x-1/2 text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-white">
    {blindNotice}
  </div>
) : null}
        <div className="w-full max-w-6xl">
          <div className="relative z-10 mb-3 md:mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl min-[1536px]:max-[1650px]:text-xl font-bold text-white">HeadsUp</h1>
              <div className="text-sm min-[1536px]:max-[1650px]:text-xs text-white opacity-80 tabular-nums">
                {streetLabel}{" "}
                <span className="opacity-60">·</span>{" "}
                <span className="opacity-90">
  {opponentQuit
    ? "Opponent Quit!"
    : displayHandResult.status === "playing"
    ? displayToAct === mySeat
      ? "Your turn"
      : "Opponent thinking…"
    : ((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver))
      ? (displayGame.stacks[myActualSeat] <= 0
          ? "Game over — Opponent wins"
          : "Game over — You win")
      : "Hand ended (next hand in 8s)"}
</span>
              </div>
              {handResult.message ? (
                <div className="mt-1 text-sm min-[1536px]:max-[1650px]:text-xs text-white opacity-90">{handResult.message}</div>
              ) : null}
            </div>

            <div className="flex items-center gap-4 min-[1536px]:max-[1650px]:gap-3">

  {studentProfile.email && (
  <button
type="button"
onClick={() => {
  if (opponentQuit) {
    // Opponent already quit, go directly to dashboard
    if (mpHost) {
      mpHost.destroy();
      setMpHost(null);
    }
    if (mpJoiner) {
      mpJoiner.destroy();
      setMpJoiner(null);
    }
    setMultiplayerActive(false);
    setOpponentQuit(false);
    setOpponentName(null);

    sessionStorage.removeItem('headsup_gameId');
    sessionStorage.removeItem('headsup_mySeat');
    sessionStorage.removeItem('headsup_gamePin');
    sessionStorage.removeItem('headsup_dealerOffset');
    sessionStorage.removeItem('headsup_hostState');
    sessionStorage.removeItem('headsup_handHistory');

    clearTimers();
    clearPin();
    setGamePin(null);
    setJoinMode(false);
    setJoinPinInput("");
    setAiEnabled(false);
    setScreen(seatedRole === "professional" ? "professionalDashboard" : "dashboard");
  } else {
    setShowDashboardConfirm(true);
  }
}}
className="text-sm min-[1536px]:max-[1650px]:text-xs text-white underline opacity-80 hover:opacity-100"
>
    Dashboard
</button>
)}

  <button
    type="button"
    onClick={() => {
      if (opponentQuit) {
        // Opponent already quit, go directly to title screen
        if (mpHost) {
          mpHost.destroy();
          setMpHost(null);
        }
        if (mpJoiner) {
          mpJoiner.destroy();
          setMpJoiner(null);
        }
        setMultiplayerActive(false);
        setOpponentQuit(false);
        setOpponentName(null);

        // Clear saved session so we don't reconnect
        sessionStorage.removeItem('headsup_gameId');
        sessionStorage.removeItem('headsup_mySeat');
        sessionStorage.removeItem('headsup_gamePin');
        sessionStorage.removeItem('headsup_dealerOffset');
        sessionStorage.removeItem('headsup_hostState');
        sessionStorage.removeItem('headsup_joinerState');
        sessionStorage.removeItem('headsup_handHistory');

        clearTimers();
        clearPin();
        setGamePin(null);
        setJoinMode(false);
        setJoinPinInput("");
        setAiEnabled(false);
        setOtherStudents([]);
        setOtherProfessionals([]);
        setScreen("role");
      } else {
        // Show confirmation modal
        setShowTitleScreenConfirm(true);
      }
    }}
    className="text-sm min-[1536px]:max-[1650px]:text-xs text-white underline opacity-80 hover:opacity-100"
  >
    Title screen
  </button>

{/* Video Call Toggle - Only host can create, joiner auto-joins when room created */}
{multiplayerActive && !dailyRoomUrl && !opponentQuit && mySeat === "bottom" && (
  <button
    type="button"
    onClick={createDailyRoom}
    disabled={isCreatingRoom}
    className="text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-white underline opacity-80 hover:opacity-100 disabled:opacity-50"
  >
    {isCreatingRoom ? 'Starting video...' : 'Start Video Call'}
  </button>
)}

{/* Show waiting message for joiner */}
{multiplayerActive && !dailyRoomUrl && !opponentQuit && mySeat === "top" && (
  <span className="text-sm min-[1536px]:max-[1650px]:text-xs text-white/60">
    Waiting for host to start video...
  </span>
)}

{multiplayerActive && videoCallActive && (
  <span className="text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-white opacity-80">
    Video active
  </span>
)}

{roomCreationError && (
  <span className="text-sm min-[1536px]:max-[1650px]:text-xs text-red-400 opacity-90">
    {roomCreationError}
  </span>
)}

{opponentQuit && (
<div className="text-sm min-[1536px]:max-[1650px]:text-xs text-white opacity-90">
      Opponent Quit, Go To Title Screen
</div>
  )}

</div>
          </div>

          {/* Video Call - Draggable window */}
          {multiplayerActive && dailyRoomUrl && (
            <DailyVideoCall
              roomUrl={dailyRoomUrl}
              onJoinedCall={() => setVideoCallActive(true)}
              onLeftCall={() => {
                setVideoCallActive(false);
                if (mpChannelRef.current) {
                  mpChannelRef.current.send({
                    type: 'broadcast',
                    event: 'mp',
                    payload: {
                      event: 'VIDEO_CALL_ENDED',
                      sender: sbUser?.id ?? (mySeat === "bottom" ? 'host' : 'joiner'),
                    },
                  });
                }
              }}
              onError={(err) => {
                console.error('Daily video error:', err);
                setRoomCreationError(err?.message || 'Video connection failed');
                setDailyRoomUrl(null);
              }}
            />
          )}

          {/* ACTION LOG pinned left + TABLE centered */}
          <div className="relative mt-6 w-full">
            {/* LEFT: ACTION LOG */}
<div className="absolute -left-28 md:-left-36 min-[1536px]:max-[1650px]:!-left-[102px] top-0 w-[420px] md:w-[500px] min-[1536px]:max-[1650px]:w-[390px] rounded-3xl min-[1536px]:max-[1650px]:rounded-2xl border border-white/10 bg-black/20 p-3 md:p-4 min-[1536px]:max-[1650px]:p-2 text-white text-left">
 {/* Header row (matches your target screenshot) */}
<div className="mb-6 min-[1536px]:max-[1650px]:mb-4 relative flex w-full items-center gap-4 min-[1536px]:max-[1650px]:gap-3">
  {/* arrows */}
  <div className="flex items-center gap-2 shrink-0">
    <button
      type="button"
      className="rounded border border-white/20 bg-white/10 px-2 py-0.5 min-[1536px]:max-[1650px]:px-1.5 min-[1536px]:max-[1650px]:py-0 text-xs min-[1536px]:max-[1650px]:text-[10px] hover:bg-white/20"
      onClick={() => setLogViewOffset((o) => Math.min(o + 1, handLogHistory.length))}
    >
      ◀
    </button>

    <button
      type="button"
      className="rounded border border-white/20 bg-white/10 px-2 py-0.5 min-[1536px]:max-[1650px]:px-1.5 min-[1536px]:max-[1650px]:py-0 text-xs min-[1536px]:max-[1650px]:text-[10px] hover:bg-white/20"
      onClick={() => setLogViewOffset((o) => Math.max(o - 1, 0))}
    >
      ▶
    </button>
  </div>

  {/* Action + stacks: glued right after arrows */}
  <div className="flex items-baseline gap-3 min-[1536px]:max-[1650px]:gap-2 min-w-0">
    <div className="text-sm min-[1536px]:max-[1650px]:text-xs font-semibold text-white whitespace-nowrap">Action</div>

    <div className="text-xs min-[1536px]:max-[1650px]:text-[10px] font-normal text-white/70 tabular-nums whitespace-nowrap">
      {viewingSnapshot
        ? `You (${viewingSnapshot.heroPos}) ${formatBB(viewingSnapshot.heroStartStack)}bb · Opponent (${viewingSnapshot.oppPos}) ${formatBB(viewingSnapshot.oppStartStack)}bb`
        : `You (${heroPosLabel}) ${formatBB(heroStartStack)}bb · Opponent (${oppPosLabel}) ${formatBB(oppStartStack)}bb`}
    </div>
  </div>

  {/* Current hand pinned right */}
  <div className="absolute right-4 min-[1536px]:max-[1650px]:right-2 top-1/2 -translate-y-1/2 text-xs min-[1536px]:max-[1650px]:text-[10px] text-white/70 tabular-nums whitespace-nowrap">
  {logViewOffset === 0
    ? `Hand #${(multiplayerActive && mpState ? mpState.handId : handId) + 1}`
    : `Hand #${(handLogHistory[logViewOffset - 1]?.handNo ?? 0) + 1}`}
</div>
</div>

  {/* Card summary - shown for both current hand (if ended) and history */}
{(viewingSnapshot || displayHandResult.status === "ended") ? (
  <div className="mb-3 min-[1536px]:max-[1650px]:mb-2 flex flex-col gap-2 min-[1536px]:max-[1650px]:gap-1">
    <div className="flex items-start gap-4 min-[1536px]:max-[1650px]:gap-2">
      <div className="flex flex-col gap-1 text-xs min-[1536px]:max-[1650px]:text-[10px] text-white/70 whitespace-nowrap">
        <div>
          You:{" "}
          {viewingSnapshot ? (
            renderActionText(`${cardStr(viewingSnapshot.heroCards[0])} ${cardStr(viewingSnapshot.heroCards[1])}`)
          ) : (
            // Current hand display - always show your cards
            youC && youD
              ? renderActionText(`${cardStr(youC)} ${cardStr(youD)}`)
              : "No cards"
          )}
          {viewingSnapshot?.heroBest5 && viewingSnapshot.endedStreet === 5 ? (
            <span className="ml-2 opacity-60">
              → {renderActionText(viewingSnapshot.heroBest5.map(cardStr).join(" "))}
            </span>
          ) : (
            heroBest5 && dealtCards.river && (
              <span className="ml-2 opacity-60">
                → {renderActionText(heroBest5.map(cardStr).join(" "))}
              </span>
            )
          )}
        </div>

        <div>
          Opponent:{" "}
          {viewingSnapshot ? (
            viewingSnapshot.oppShown
              ? <>{renderActionText(`${cardStr(viewingSnapshot.oppCards[0])} ${cardStr(viewingSnapshot.oppCards[1])}`)}</>
              : viewingSnapshot.log.some(
                  (it) => it.seat === oppActualSeat && /fold/i.test(it.text)
                )
              ? "Folded"
              : "Mucked"
          ) : (
            // Current hand display - wait for river animation before showing mucked/folded
            displayHandResult.status === "ended" && (riverAnimationComplete || displayStreet < 5)
              ? (
                  // Show cards if conditions met
                  (displayHandResult.reason === "showdown" && (
                    mySeat === "bottom"
                      ? displayOppRevealed
                      : !displayYouMucked
                  )) || didOppShow
                ) && oppA && oppB
                  ? renderActionText(`${cardStr(oppA)} ${cardStr(oppB)}`)
                  : displayActionLog.some((it) => it.seat === oppActualSeat && /fold/i.test(it.text))
                  ? "Folded"
                  : "Mucked"
              : "" // Wait for animation to complete before showing status
          )}
          {viewingSnapshot?.oppShown && viewingSnapshot.oppBest5 && viewingSnapshot.endedStreet === 5 ? (
            <span className="ml-2 opacity-60">
              → {renderActionText(viewingSnapshot.oppBest5.map(cardStr).join(" "))}
            </span>
          ) : (
            oppBest5 && dealtCards.river && (riverAnimationComplete || displayStreet < 5) && (displayHandResult.status === "ended" && (
              (displayHandResult.reason === "showdown" && (
                myActualSeat === "bottom"
                  ? displayOppRevealed
                  : !displayYouMucked
              ))
              || didOppShow
            )) && (
              <span className="ml-2 opacity-60">
                → {renderActionText(oppBest5.map(cardStr).join(" "))}
              </span>
            )
          )}
        </div>
      </div>
    
    {/* Hand ranks display - updates dynamically as board runs out */}
    {viewingSnapshot ? (
      <>
        {viewingSnapshot.heroHandRank && viewingSnapshot.endedStreet === 5 && (
          <div className="text-xs text-white/60 pl-1">
            You: {viewingSnapshot.heroHandRank}
          </div>
        )}
        {viewingSnapshot.oppShown && viewingSnapshot.oppHandRank && viewingSnapshot.endedStreet === 5 && (
          <div className="text-xs text-white/60 pl-1">
            Opponent: {viewingSnapshot.oppHandRank}
          </div>
        )}
      </>
    ) : (
      <>
        {heroHandRank && (
          <div className="text-xs text-white/60 pl-1">
            You: {heroHandRank}
          </div>
        )}
        {oppHandRank && (riverAnimationComplete || displayStreet < 5) && (displayHandResult.status === "ended" && (
          (displayHandResult.reason === "showdown" && (
            myActualSeat === "bottom"
              ? displayOppRevealed
              : !displayYouMucked
          ))
          || didOppShow
        )) && (
          <div className="text-xs text-white/60 pl-1">
            Opponent: {oppHandRank}
          </div>
        )}
      </>
    )}
  </div>

    <div className="flex items-center gap-2 min-w-0 overflow-hidden">
      {viewingSnapshot ? (
        displayedHistoryBoard.map((c, i) => (
          <div key={i} className="scale-[0.75] origin-left shrink-0">
            <CardTile card={c} />
          </div>
        ))
      ) : (
        // Only show board cards after river animation completes (or if hand ended before river)
        (riverAnimationComplete || displayStreet < 5) && board.slice(0, displayStreet).map((c, i) => (
          <div key={i} className="scale-[0.75] origin-left shrink-0">
            <CardTile card={c} />
          </div>
        ))
      )}
    </div>
  </div>
) : null}

{/* Log list */}
{displayedActionLog.length === 0 ? (
  <div className="text-sm min-[1536px]:max-[1650px]:text-xs opacity-70">—</div>
) : (
  <div className="max-h-[calc(100vh-220px)] min-[1536px]:max-[1650px]:max-h-[calc(100vh-180px)] w-full overflow-auto pr-1">
    <div className="w-full text-sm min-[1536px]:max-[1650px]:text-xs">
      {displayedActionLog.slice(-30).map((a) => (
        <div
          key={a.id}
          className="grid w-full grid-cols-[1fr_1fr_1fr] items-center py-2 leading-none"
        >
          <div
            className="text-center text-xs min-[1536px]:max-[1650px]:text-[10px] uppercase tracking-wide text-white/60 -translate-x-4.5 leading-none"
            style={{ paddingTop: "3px" }}
          >
            {a.street}
          </div>

          <div
            className="text-center font-semibold text-white leading-none min-[1536px]:max-[1650px]:text-xs"
            style={{ marginLeft: "-56px" }}
          >
            {a.seat === myActualSeat ? `You (${heroPosLabel})` : `Opponent (${oppPosLabel})`}
          </div>

          <div className="text-center text-white/90 tabular-nums break-words leading-none min-[1536px]:max-[1650px]:text-xs">
            {renderActionText(a.text)}
          </div>
        </div>
      ))}
    </div>
  </div>
)}

</div>

            {/* CENTER: TABLE */}
            <div className="mx-auto flex w-fit flex-col items-center gap-[60px] origin-center" style={{ transform: `scale(${tableScale})` }}>
              {/* TOP SEAT (Opponent) */}
              <div className={`animate-seat-appear relative h-[260px] w-[216px] -translate-y-6 rounded-3xl border border-white/20 bg-black/50 text-center ${showWinAnimation === 'opponent' && (riverAnimationComplete || displayStreet < 5) ? ((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver) ? 'permanent-win-glow' : 'animate-win-glow') : displayToAct === oppActualSeat && displayHandResult.status === 'playing' ? 'turn-active' : ''}`}>
                {!amIDealer && <div className={dealerChipTop}>D</div>}

                <div className="absolute -bottom-14 left-1/2 -translate-x-1/2">
                  <BetChip amount={oppBet} label={oppLabel} />
                  {chipsToPot.filter(c => c.from === 'opponent').map(c => (
                    <div key={c.id} className="absolute inset-0 animate-chip-to-pot-opponent pointer-events-none">
                      <BetChip amount={c.amount} />
                    </div>
                  ))}
                </div>

                {/* Action flash for opponent */}
                {actionFlashes.filter(f => f.seat === 'opponent').map(f => (
                  <div key={f.id} className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                    <div className="animate-action-flash whitespace-nowrap rounded-lg bg-white/90 px-3 py-1 text-xs font-bold text-black shadow-lg">
                      {f.text}
                    </div>
                  </div>
                ))}

                <div className="flex h-full flex-col justify-center">
                  <div className="-mt-3 text-sm uppercase text-white opacity-60">{opponentName || "Opponent"}</div>
                  <div className="mt-2 text-sm text-white flex items-center justify-center gap-2">
                    <span>Stack:{" "}</span>
                    <span className={`font-semibold tabular-nums transition-all duration-300 ${showWinAnimation === 'opponent' && (riverAnimationComplete || displayStreet < 5) ? ((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver) ? 'permanent-stack-win' : 'animate-stack-win') : ''}`}>{formatBB(oppStack)}bb</span>
                    {showWinAnimation === 'opponent' && winAmount > 0 && (riverAnimationComplete || displayStreet < 5) && (
                      <span className="animate-win-amount font-bold text-green-500">
                        +{formatBB(winAmount)}bb
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex justify-center gap-3">
                    {oppA && oppB ? (
                      // When viewing history, use snapshot's oppShown; otherwise use live state
                      (viewingSnapshot
                        ? viewingSnapshot.oppShown
                        : ((riverAnimationComplete || displayStreet < 5) && displayHandResult.status === "ended" && (
                            // Showdown: check if opponent was required to show
                            (displayHandResult.reason === "showdown" && (
                              mySeat === "bottom"
                                ? displayOppRevealed
                                : !displayYouMucked
                            ))
                            // OR opponent clicked Show Hand button
                            || didOppShow
                          ))
                      ) ? (
  <>
    <div className={`${dealtCards[amIDealer ? 'bbCard1' : 'sbCard1'] ? 'animate-deal-to-top' : (cardsVisible[amIDealer ? 'bbCard1' : 'sbCard1'] ? '' : 'opacity-0')} ${flippedCards.oppCard1 ? 'animate-flip-card' : ''}`}>
      <CardTile card={oppA} />
    </div>
    <div className={`${dealtCards[amIDealer ? 'bbCard2' : 'sbCard2'] ? 'animate-deal-to-top' : (cardsVisible[amIDealer ? 'bbCard2' : 'sbCard2'] ? '' : 'opacity-0')} ${flippedCards.oppCard2 ? 'animate-flip-card' : ''}`}>
      <CardTile card={oppB} />
    </div>
  </>
) : (
  <>
    <div className={dealtCards[amIDealer ? 'bbCard1' : 'sbCard1'] ? 'animate-deal-to-top' : (cardsVisible[amIDealer ? 'bbCard1' : 'sbCard1'] ? '' : 'opacity-0')}>
      <CardBack />
    </div>
    <div className={dealtCards[amIDealer ? 'bbCard2' : 'sbCard2'] ? 'animate-deal-to-top' : (cardsVisible[amIDealer ? 'bbCard2' : 'sbCard2'] ? '' : 'opacity-0')}>
      <CardBack />
    </div>
  </>
)

                    ) : null}
                  </div>

                  {/* Opponent hand rank - show when cards are visible */}
                  {oppHandRank && (viewingSnapshot
                    ? viewingSnapshot.oppShown
                    : ((riverAnimationComplete || displayStreet < 5) && displayHandResult.status === "ended" && (
                        (displayHandResult.reason === "showdown" && (
                          mySeat === "bottom"
                            ? displayOppRevealed
                            : !displayYouMucked
                        ))
                        || didOppShow
                      ))
                  ) && (
                    <div className="text-xs font-semibold text-white/80 mt-2">
                      {oppHandRank}
                    </div>
                  )}
                </div>
              </div>

              {/* BOARD (always current hand) */}
<div className="relative flex h-56 items-center justify-center">
  {/* Pot display — centered above board cards */}
  <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
    <div className="text-lg font-bold text-white tabular-nums tracking-wide whitespace-nowrap">
      Pot: {formatBB(roundToHundredth(
        isAnimatingAllIn ? winAmount : (displayGame.pot + displayGame.bets.top + displayGame.bets.bottom)
      ))}bb
    </div>
  </div>
  {/* Pot-to-winner flying chip */}
  {potToWinner && (
    <div className={`absolute top-0 left-1/2 -translate-x-1/2 z-20 pointer-events-none ${
      potToWinner.target === 'hero' ? 'animate-pot-to-hero' : 'animate-pot-to-opponent'
    }`}>
      <div className="flex h-9 w-9 flex-col items-center justify-center rounded-full border bg-yellow-400 text-black shadow-lg">
        <div className="text-[11px] font-bold leading-none tabular-nums">
          {formatBB(potToWinner.amount)}
        </div>
        <div className="mt-[1px] text-[9px] font-semibold leading-none opacity-70">
          BB
        </div>
      </div>
    </div>
  )}
  <div className="absolute flex gap-3 top-[40px]">
    {board.slice(0, displayStreet).map((c, i) => {
      // Determine which animation to apply based on card index
      const cardKey = i === 0 ? 'flop1' : i === 1 ? 'flop2' : i === 2 ? 'flop3' : i === 3 ? 'turn' : 'river';
      const shouldAnimate = dealtCards[cardKey];
      return (
        <div key={i} className={shouldAnimate ? 'animate-deal-to-board' : 'opacity-0'}>
          <CardTile card={c} />
        </div>
      );
    })}
  </div>
</div>

              {/* BOTTOM SEAT (You) */}
              <div className={`animate-seat-appear relative h-[260px] w-[216px] -translate-y-6 rounded-3xl border border-white/20 bg-black/50 text-center ${showWinAnimation === 'hero' && (riverAnimationComplete || displayStreet < 5) ? ((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver) ? 'permanent-win-glow' : 'animate-win-glow') : displayToAct === mySeat && displayHandResult.status === 'playing' ? 'turn-active' : ''}`}>
                {amIDealer && <div className={dealerChipBottom}>D</div>}

                <div className="absolute -top-14 left-1/2 -translate-x-1/2">
                  <BetChip amount={myBet} label={myLabel} />
                  {chipsToPot.filter(c => c.from === 'hero').map(c => (
                    <div key={c.id} className="absolute inset-0 animate-chip-to-pot-hero pointer-events-none">
                      <BetChip amount={c.amount} />
                    </div>
                  ))}
                </div>

                {/* Action flash for hero — overlays "You" label area */}
                {actionFlashes.filter(f => f.seat === 'hero').map(f => (
                  <div key={f.id} className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                    <div className="animate-action-flash whitespace-nowrap rounded-lg bg-white/90 px-3 py-1 text-xs font-bold text-black shadow-lg">
                      {f.text}
                    </div>
                  </div>
                ))}

                <div className="flex h-full flex-col justify-center">
                  <div className="-mt-1 text-sm uppercase text-white opacity-60">You</div>
                  <div className="text-xl font-semibold capitalize text-white">{studentProfile.firstName || "Guest"}</div>

                  <div className="mt-1 text-sm text-white flex items-center justify-center gap-2">
                    <span>Stack:{" "}</span>
                    <span className={`font-semibold tabular-nums transition-all duration-300 ${showWinAnimation === 'hero' && (riverAnimationComplete || displayStreet < 5) ? ((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver) ? 'permanent-stack-win' : 'animate-stack-win') : ''}`}>
                      {formatBB(myStack)}bb
                    </span>
                    {showWinAnimation === 'hero' && winAmount > 0 && (riverAnimationComplete || displayStreet < 5) && (
                      <span className="animate-win-amount font-bold text-green-500">
                        +{formatBB(winAmount)}bb
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col items-center gap-2">
                 <div className="flex justify-center gap-3">
                   {youC && youD ? (
                    // When viewing history, use snapshot's heroShown; otherwise use live state
                    (viewingSnapshot
                      ? !viewingSnapshot.heroShown
                      : false  // Always show your own cards on your screen
                    ) ? (
                     <>
                      <div className={dealtCards[amIDealer ? 'sbCard1' : 'bbCard1'] ? 'animate-deal-to-bottom' : 'opacity-0'}>
                        <CardBack />
                      </div>
                      <div className={dealtCards[amIDealer ? 'sbCard2' : 'bbCard2'] ? 'animate-deal-to-bottom' : 'opacity-0'}>
                        <CardBack />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={`${dealtCards[amIDealer ? 'sbCard1' : 'bbCard1'] ? 'animate-deal-to-bottom' : (cardsVisible[amIDealer ? 'sbCard1' : 'bbCard1'] ? '' : 'opacity-0')} ${flippedCards.myCard1 ? 'animate-flip-card' : ''}`}>
                        <CardTile card={youC} />
                      </div>
                      <div className={`${dealtCards[amIDealer ? 'sbCard2' : 'bbCard2'] ? 'animate-deal-to-bottom' : (cardsVisible[amIDealer ? 'sbCard2' : 'bbCard2'] ? '' : 'opacity-0')} ${flippedCards.myCard2 ? 'animate-flip-card' : ''}`}>
                        <CardTile card={youD} />
                      </div>
                    </>
                  )
                ) : null}
              </div>

  </div>
</div>

                {/* Hand rank — outside the border */}
                {heroHandRank && !(handResult.status === "ended" && youMucked) ? (
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-semibold text-white/80 whitespace-nowrap">
                    {heroHandRank}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* ACTION PANEL (bottom-right) */}
          {displayToAct === mySeat && displayHandResult.status === "playing" && (
            <div className="fixed bottom-4 md:bottom-6 right-4 md:right-6 z-50 flex w-[280px] md:w-[320px] flex-col gap-2 md:gap-3 origin-bottom-right" style={{ transform: `scale(${tableScale})` }}>
              {displayGame.stacks[myActualSeat] > bottomCallAmt && displayGame.stacks[oppActualSeat] > 0 && bottomMaxTo > bottomMinRaise && (
                <div className="rounded-2xl border bg-white p-3 text-black shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">{facingBetBottom ? "Raise to" : "Bet to"}</div>
                    <div className="text-sm font-bold tabular-nums">{formatBB(displayBetSize)} BB</div>
                  </div>

                  <div className="mb-2 flex gap-1.5">
                    {[33, 50, 75].map(pct => {
                      const currentPot = displayGame.pot + displayGame.bets.top + displayGame.bets.bottom;
                      const target = facingBetBottom
                        ? roundToHundredth(displayGame.bets[oppActualSeat] + (pct / 100) * (currentPot + bottomCallAmt))
                        : roundToHundredth((pct / 100) * currentPot);
                      const clamped = Math.min(Math.max(target, bottomMinRaise), bottomMaxTo);
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setBetSizeRounded(clamped)}
                          className="flex-1 rounded-lg border border-gray-200 py-1 text-xs font-semibold text-black transition-colors hover:bg-gray-100 active:bg-gray-200"
                        >
                          {pct}%
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setBetSizeRounded(bottomMaxTo)}
                      className="flex-1 rounded-lg border border-gray-200 py-1 text-xs font-bold text-black transition-colors hover:bg-gray-100 active:bg-gray-200"
                    >
                      All In
                    </button>
                  </div>

                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="range"
                      min={bottomMinRaise}
                      max={bottomMaxTo}
                      step={0.01}
                      value={betSize === "" ? bottomMinRaise : Math.max(betSize, bottomMinRaise)}
                      onChange={(e) => setBetSizeRounded(Number(e.target.value))}
                      className="w-full"
                    />

                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      min={0.01}
                      max={bottomMaxTo}
                      value={betSize === "" ? "" : betSize}
                      placeholder=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setBetSize("");
                        } else {
                          const num = Number(val);
                          // Allow any number up to max, don't enforce minimum during typing
                          if (num > 0) {
                            setBetSize(Math.min(num, bottomMaxTo));
                          }
                        }
                      }}
                      onBlur={() => {
                        // On blur, enforce minimum
                        if (betSize === "" || betSize < bottomMinRaise) {
                          setBetSizeRounded((displayStreet === 0 && isOpeningAction) ? 2 : bottomMinRaise);
                        } else {
                          setBetSizeRounded(Math.min(betSize, bottomMaxTo));
                        }
                      }}
                      className="w-24 rounded-xl border px-2 py-1 text-sm tabular-nums"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 w-full">
                <button
  type="button"
  onClick={() => {
    // Determine if fold warning should show
    const facingBet = displayGame.bets[oppActualSeat] > displayGame.bets[myActualSeat];
    
    // Show warning when not facing a bet (can check for free)
    const shouldWarn = !facingBet;
    
    if (shouldWarn) {
      setShowFoldConfirm(true);
    } else {
      dispatchAction({ type: "FOLD" });
    }
  }}
  disabled={!(displayToAct === mySeat && displayHandResult.status === "playing") || actionInProgress}
  className="h-[64px] w-[100px] rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:bg-gray-100 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
>
  Fold
</button>

               <button
  type="button"
  onClick={() => {
    dispatchAction(facingBetBottom ? { type: "CALL" } : { type: "CHECK" });
  }}
  disabled={!(displayToAct === mySeat && displayHandResult.status === "playing") || actionInProgress}
  className="flex h-[64px] w-[100px] flex-col items-center justify-center rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:bg-gray-100 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
>
  <div>{facingBetBottom ? "Call" : "Check"}</div>

  {facingBetBottom && (
    <div className="mt-0.5 text-xs font-bold tabular-nums">
      {formatBB(bottomCallAmt)} BB
    </div>
  )}
</button>

                {displayGame.stacks[myActualSeat] > bottomCallAmt && displayGame.stacks[oppActualSeat] > 0 && (
                  <button
  type="button"
  onClick={() => {
    const finalSize = betSize === "" || betSize < bottomMinRaise ? openingDefault : Math.max(betSize, bottomMinRaise);
    dispatchAction({ type: "BET_RAISE_TO", to: finalSize });
  }}
  disabled={!(displayToAct === mySeat && displayHandResult.status === "playing") || actionInProgress}
  className="flex h-[64px] w-[100px] flex-col items-center justify-center rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:bg-gray-100 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
>
  <div className="text-sm leading-tight">
    {facingBetBottom ? "Raise" : "Bet"}
  </div>

  <div className="mt-0.5 w-full text-center text-xs font-bold tabular-nums">
    {formatBB(displayBetSize)} BB
  </div>
</button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}