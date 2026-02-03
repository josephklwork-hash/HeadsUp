/* ---------- shared types ---------- */

export type Role = "student" | "professional";

export type Screen =
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

export type Seat = "top" | "bottom";

export type Card = {
  rank: string;
  suit: string;
};

export type Street = 0 | 3 | 4 | 5;
export type StreetName = "Preflop" | "Flop" | "Turn" | "River";

export type GameState = {
  stacks: { top: number; bottom: number };
  bets: { top: number; bottom: number }; // chips currently in front (this street)
  pot: number; // chips already pulled into pot from prior streets
};

export type HandStatus = "playing" | "ended";
export type HandEndReason = "fold" | "showdown" | null;

export type HandResult = {
  status: HandStatus;
  winner: Seat | "tie" | null;
  reason: HandEndReason;
  message: string;
  potWon: number;
};

export type ActionLogItem = {
  id: string;
  sequence: number;
  street: StreetName;
  seat: Seat;
  text: string;
};

export type HandLogSnapshot = {
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

export type AuthoritativeState = {
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

export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
export const SUITS = ["♠", "♥", "♦", "♣"];
