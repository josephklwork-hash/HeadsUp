"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { GAME_CONFIG, BASE_SB, BASE_BB } from './gameConfig';
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

import { MultiplayerHost } from "./multiplayerHost";
import { MultiplayerJoiner } from "./multiplayerJoiner";
import type { HostState } from "./multiplayerHost";
import DailyVideoCall from './components/DailyVideoCall';

import type {
  Role, Screen, Seat, Card, Street, StreetName,
  GameState, HandResult, HandEndReason,
  ActionLogItem, HandLogSnapshot, AuthoritativeState,
} from './types';
import {
  drawUniqueCards, roundToHundredth, formatBB,
  clamp, uid, streetNameFromCount,
} from './utils/formatting';
import {
  checkRateLimit, recordRateLimitAttempt,
  validateMessage,
} from './utils/validation';
import {
  initAudio, setMuted as setSoundMuted,
  playDealCard, playCheck, playCall, playBetRaise,
  playFold, playAllIn, playWin, playLose,
} from './utils/soundManager';

export const dynamic = 'force-dynamic';  // ← THIS LINE

// Game configuration imported from shared gameConfig.ts file
// To change game settings, edit gameConfig.ts
const STARTING_STACK_BB = GAME_CONFIG.STARTING_STACK_BB;

import {
  RANK_TO_VALUE, VALUE_TO_NAME, compareScore, evaluate7,
  cardStr, handDesc, handRankOnly, pluralRank,
  best5From7, sortBest5ForDisplay,
} from './poker/evaluator';

import CardTile from './components/CardTile';
import CardBack from './components/CardBack';
import BetChip from './components/BetChip';
import ConfirmModal from './components/ConfirmModal';
import ActionPanel from './components/ActionPanel';
import ActionLog from './components/ActionLog';
import GameHeader from './components/GameHeader';
import RoleScreen from './components/screens/RoleScreen';
import StudentProfileScreen from './components/screens/StudentProfileScreen';
import OAuthProfileScreen from './components/screens/OAuthProfileScreen';
import StudentLoginScreen from './components/screens/StudentLoginScreen';
import StudentDashboard from './components/screens/StudentDashboard';
import ProfessionalDashboard from './components/screens/ProfessionalDashboard';
import ConnectionsScreen from './components/screens/ConnectionsScreen';
import EditProfileScreen from './components/screens/EditProfileScreen';
import AboutScreen from './components/screens/AboutScreen';

const connectButtonClass =
  "rounded-xl border border-black bg-white px-3 py-1 text-sm font-semibold text-black transition-all duration-300 hover:bg-gray-50 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(0,0,0,0.15)]";


/* ---------- main ---------- */

export default function Home() {
  const [seatedRole, setSeatedRole] = useState<Role | null>(null);

  const [handId, setHandId] = useState(0);
  const [gameSession, setGameSession] = useState(0);
  const [sbUser, setSbUser] = useState<User | null>(null);


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
const setStreet = (next: Street | ((prev: Street) => Street)) =>
  setAuth((prev) => ({
    ...prev,
    street: typeof next === "function" ? next(prev.street) : next,
  }));

const toAct = auth.toAct;
const setToAct = (next: Seat | ((prev: Seat) => Seat)) =>
  setAuth((prev) => ({
    ...prev,
    toAct: typeof next === "function" ? next(prev.toAct) : next,
  }));

const actionLog = auth.actionLog;
const setActionLog = (next: ActionLogItem[] | ((prev: ActionLogItem[]) => ActionLogItem[])) =>
  setAuth((prev) => {
    const value = typeof next === "function" ? next(prev.actionLog) : next;
    return { ...prev, actionLog: value };
  });

const handResult = auth.handResult;
const setHandResult = (next: HandResult | ((prev: HandResult) => HandResult)) =>
  setAuth((prev) => ({
    ...prev,
    handResult: typeof next === "function" ? next(prev.handResult) : next,
  }));

const gameOver = auth.gameOver;
const setGameOver = (next: boolean | ((prev: boolean) => boolean)) =>
  setAuth((prev) => ({
    ...prev,
    gameOver: typeof next === "function" ? next(prev.gameOver) : next,
  }));

const setEndedBoardSnapshot = (next: Street | ((prev: Street) => Street)) =>
  setAuth((prev) => ({
    ...prev,
    endedBoardSnapshot:
      typeof next === "function" ? next(prev.endedBoardSnapshot) : next,
  }));

const lastAggressor = auth.lastAggressor;
const setLastAggressor = (next: (Seat | null) | ((prev: Seat | null) => Seat | null)) =>
  setAuth((prev) => ({
    ...prev,
    lastAggressor: typeof next === "function" ? next(prev.lastAggressor) : next,
  }));

const actionsThisStreet = auth.actionsThisStreet;
const setActionsThisStreet = (next: number | ((prev: number) => number)) =>
  setAuth((prev) => ({
    ...prev,
    actionsThisStreet:
      typeof next === "function" ? next(prev.actionsThisStreet) : next,
  }));

const lastToActAfterAggro = auth.lastToActAfterAggro;
const setLastToActAfterAggro = (next: (Seat | null) | ((prev: Seat | null) => Seat | null)) =>
  setAuth((prev) => ({
    ...prev,
    lastToActAfterAggro:
      typeof next === "function" ? next(prev.lastToActAfterAggro) : next,
  }));

const sawCallThisStreet = auth.sawCallThisStreet;
const setSawCallThisStreet = (next: boolean | ((prev: boolean) => boolean)) =>
  setAuth((prev) => ({
    ...prev,
    sawCallThisStreet:
      typeof next === "function" ? next(prev.sawCallThisStreet) : next,
  }));

const lastRaiseSize = auth.lastRaiseSize;
const setLastRaiseSize = (next: number | ((prev: number) => number)) =>
  setAuth((prev) => ({
    ...prev,
    lastRaiseSize:
      typeof next === "function" ? next(prev.lastRaiseSize) : next,
  }));

const checked = auth.checked;
const setChecked = (next: { top: boolean; bottom: boolean } | ((prev: { top: boolean; bottom: boolean }) => { top: boolean; bottom: boolean })) =>
  setAuth((prev) => ({
    ...prev,
    checked: typeof next === "function" ? next(prev.checked) : next,
  }));

const setShowdownFirst = (next: (Seat | null) | ((prev: Seat | null) => Seat | null)) =>
  setAuth((prev) => ({
    ...prev,
    showdownFirst:
      typeof next === "function" ? next(prev.showdownFirst) : next,
  }));

const oppRevealed = auth.oppRevealed;
const setOppRevealed = (next: boolean | ((prev: boolean) => boolean)) =>
  setAuth((prev) => ({
    ...prev,
    oppRevealed: typeof next === "function" ? next(prev.oppRevealed) : next,
  }));

const youMucked = auth.youMucked;
const setYouMucked = (next: boolean | ((prev: boolean) => boolean)) =>
  setAuth((prev) => ({
    ...prev,
    youMucked: typeof next === "function" ? next(prev.youMucked) : next,
  }));

const canShowTop = auth.canShowTop;
const setCanShowTop = (next: boolean | ((prev: boolean) => boolean)) =>
  setAuth((prev) => ({
    ...prev,
    canShowTop: typeof next === "function" ? next(prev.canShowTop) : next,
  }));

const canShowBottom = auth.canShowBottom;
const setCanShowBottom = (next: boolean | ((prev: boolean) => boolean)) =>
  setAuth((prev) => ({
    ...prev,
    canShowBottom: typeof next === "function" ? next(prev.canShowBottom) : next,
  }));

const topShowed = auth.topShowed;
const setTopShowed = (next: boolean | ((prev: boolean) => boolean)) =>
  setAuth((prev) => ({
    ...prev,
    topShowed: typeof next === "function" ? next(prev.topShowed) : next,
  }));

const bottomShowed = auth.bottomShowed;
const setBottomShowed = (next: boolean | ((prev: boolean) => boolean)) =>
  setAuth((prev) => ({
    ...prev,
    bottomShowed: typeof next === "function" ? next(prev.bottomShowed) : next,
  }));

const streetBettor = auth.streetBettor;
const setStreetBettor = (next: (Seat | null) | ((prev: Seat | null) => Seat | null)) =>
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

  const [, setScreenHistory] = useState<Screen[]>(["role"]);

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mpChannelRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tempChannelRef = useRef<any>(null);

  function _applyActionFromSeat(seat: Seat, action: GameAction) {
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

  function _applyRemoteDeal(nextCards: Card[]) {
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

// Sound state
const [soundMuted, setSoundMutedState] = useState(false);
const winSoundPlayedRef = useRef<string | null>(null);

useEffect(() => {
  const saved = sessionStorage.getItem('headsup_soundMuted');
  if (saved === 'true') {
    setSoundMutedState(true);
    setSoundMuted(true);
  }
}, []);

useEffect(() => {
  sessionStorage.setItem('headsup_soundMuted', String(soundMuted));
  setSoundMuted(soundMuted);
}, [soundMuted]);

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
    playDealCard();

    await new Promise(r => setTimeout(r, 100));
    setDealtCards(prev => ({ ...prev, bbCard1: true }));
    setCardsVisible(prev => ({ ...prev, bbCard1: true }));
    playDealCard();

    await new Promise(r => setTimeout(r, 100));
    setDealtCards(prev => ({ ...prev, sbCard2: true }));
    setCardsVisible(prev => ({ ...prev, sbCard2: true }));
    playDealCard();

    await new Promise(r => setTimeout(r, 100));
    setDealtCards(prev => ({ ...prev, bbCard2: true }));
    setCardsVisible(prev => ({ ...prev, bbCard2: true }));
    playDealCard();

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
const [, setRejectionCounts] = useState<Map<string, number>>(new Map());
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

async function sendConnectionRequest(recipientId: string, _recipientName: string) {
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

async function acceptConnection(odId: string, connectionId: string, _odName: string) {
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
  } catch (err: unknown) {
    console.error('Failed to create video room:', err);
    setRoomCreationError(err instanceof Error ? err.message : 'Failed to start video call');
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
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Clean up temp channel from joinPinGame to avoid duplicate channel collision
  if (tempChannelRef.current) {
    supabase.removeChannel(tempChannelRef.current);
    tempChannelRef.current = null;
  }

  const ch = supabase.channel(`game:${gameId}`);
  mpChannelRef.current = ch;

  // Track if we've sent our info (to avoid infinite loop)
  let sentMyInfo = false;
  const _hostController: MultiplayerHost | null = null;
  const _joinerController: MultiplayerJoiner | null = null;

  // Set up listeners BEFORE subscribing (required for Supabase realtime)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  } catch {
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
      } catch {
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
      } catch {
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
    const { data: attemptsData } = await supabase
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
    .subscribe(() => {
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
        } catch {
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
          } catch {
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
        } catch {
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
          } catch {
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
    } catch {
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
        playDealCard();

        await new Promise(r => setTimeout(r, 100));
        setDealtCards(prev => ({ ...prev, flop2: true }));
        playDealCard();

        await new Promise(r => setTimeout(r, 100));
        setDealtCards(prev => ({ ...prev, flop3: true }));
        playDealCard();
      }

      if (displayStreet >= 4 && !dealtCards.turn) {
        // Only deal turn if not already dealt
        // All-in: 2000ms delay, Normal: 300ms delay
        await new Promise(r => setTimeout(r, isAllIn ? 2000 : 300));
        setDealtCards(prev => ({ ...prev, turn: true }));
        playDealCard();
      }

      if (displayStreet >= 5 && !dealtCards.river) {
        // Only deal river if not already dealt
        // All-in: 3000ms delay, Normal: 300ms delay
        await new Promise(r => setTimeout(r, isAllIn ? 3000 : 300));
        setDealtCards(prev => ({ ...prev, river: true }));
        playDealCard();
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
      winSoundPlayedRef.current = null;
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

      // Sound effects for actions
      if (/^folds/.test(text)) playFold();
      else if (/^checks/.test(text)) playCheck();
      else if (/^calls/.test(text)) playCall();
      else if (/^(bets|raises)/.test(text)) playBetRaise();

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

      const soundKey = `${handId}-${showWinAnimation}`;
      if (winSoundPlayedRef.current !== soundKey) {
        winSoundPlayedRef.current = soundKey;
        if (showWinAnimation === 'hero') playWin(); else playLose();
      }

      setTimeout(() => setPotToWinner(null), 700);
    }
  }, [showWinAnimation, riverAnimationComplete, displayStreet, displayHandResult.status, displayHandResult.potWon, handId]);

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
  
  const myLabel = amIDealer ? "SB" : "BB";
  const oppLabel = amIDealer ? "BB" : "SB";


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
  } catch {
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

async function _getOrCreateUser() {
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
      console.log("[joinPinGame] Getting session...");
      const { data: sessionData, error: sessionErr } = await authTimeout(supabase.auth.getSession());
      console.log("[joinPinGame] getSession result:", { hasSession: !!sessionData?.session, hasUser: !!sessionData?.session?.user, sessionErr });

      if (sessionData?.session?.user) {
        user = sessionData.session.user;
        console.log("[joinPinGame] Using existing session user:", user.id, "isAnon:", user.is_anonymous);
      } else {
        // No valid session — sign out to clear stale tokens, then create fresh anonymous user
        console.log("[joinPinGame] No session, signing out stale tokens...");
        await supabase.auth.signOut().catch((e) => console.log("[joinPinGame] signOut error (ignored):", e));
        console.log("[joinPinGame] Attempting anonymous sign-in...");
        const { data: anonData, error: anonErr } = await authTimeout(supabase.auth.signInAnonymously());
        console.log("[joinPinGame] signInAnonymously result:", { hasUser: !!anonData?.user, anonErr });
        if (anonErr || !anonData.user) throw anonErr ?? new Error("No user returned from anonymous sign-in");
        user = anonData.user;
        console.log("[joinPinGame] Created anonymous user:", user.id);
      }
    } catch (err) {
      console.error("[joinPinGame] Auth failed:", err);
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
    // Clean up any previous temp channel
    if (tempChannelRef.current) {
      supabase.removeChannel(tempChannelRef.current);
      tempChannelRef.current = null;
    }
    const tempChannel = supabase.channel(`game:${gameRow.id}`);
    tempChannelRef.current = tempChannel;
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

function _applyRemoteReset(p: {
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
  setEndedBoardSnapshot(p.endedBoardSnapshot as Street);
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

  function _triggerGameOverSequence() {
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
  _showdownFirstOverride: Seat | null = null
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
if (!multiplayerActive) {
  const nextDealerOffset: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
  setDealerOffset(nextDealerOffset);
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
  function canCheck(seat: Seat, g: GameState = gameRef.current, _st: Street = streetRef.current) {
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

  const newSeatStack = roundToHundredth(Math.max(0, seatStack - addPrev));
  const newSeatBet = roundToHundredth(seatBet + addPrev);

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
  playAllIn();
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
  if (withinBlock >= GAME_CONFIG.WARNING_STARTS_AT_HAND && withinBlock <= GAME_CONFIG.BLINDS_INCREASE_EVERY_N_HANDS) {
    // Blind notice computed for future use
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
  // Initialize audio on first user gesture
  initAudio();

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const { error: updateError } = await supabase
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  return <RoleScreen {...{clearTimers, createPinGame, creatingGame, game, gamePin, isCreatingPin, joinMode, joinPinGame, joinPinInput, navigateTo, resetGame, screen, seatedRole, selectedTheme, setCreatingGame, setEditProfileReturnScreen, setGamePin, setIsGuestBrowsing, setJoinMode, setJoinPinInput, setOtherProfessionals, setOtherStudents, setScreen, setSeatedRole, setSelectedTheme, setStudentMenuOpen, setStudentProfile, setThemeMenuOpen, studentMenuOpen, studentProfile, themeMenuOpen}} />;
}


/* ---------- Sign Up setup ---------- */

if (screen === "studentProfile") {
  return <StudentProfileScreen {...{auth, creatingAccount, goBack, handleOAuthSignIn, oauthLoading, screen, seatedRole, selectedTheme, setCreatingAccount, setScreen, setSeatedRole, setShowPassword, setStudentProfile, showPassword, studentProfile}} />;
}

/* ---------- OAuth profile completion ---------- */

if (screen === "oauthProfileCompletion") {
  return <OAuthProfileScreen {...{auth, creatingAccount, sbUser, screen, seatedRole, selectedTheme, setCreatingAccount, setSbUser, setScreen, setSeatedRole, setStudentProfile, studentProfile}} />;
}

/* ---------- student login ---------- */

if (screen === "studentLogin") {
  return <StudentLoginScreen {...{auth, goBack, handleOAuthSignIn, loginEmail, loginPassword, oauthLoading, screen, selectedTheme, setLoginEmail, setLoginPassword, setScreen, setSeatedRole, setShowLoginPassword, setStudentProfile, showLoginPassword}} />;
}

/* ---------- student dashboard ---------- */

if (screen === "dashboard" && (seatedRole === "student" || isGuestBrowsing)) {
  return <StudentDashboard {...{acceptConnection, blockedUsers, clearPin, connectButtonClass, connectConfirmUser, createPinGame, creatingGame, FOUNDER_ID, founderConnectForm, founderConnectSent, founderConnectSubmitting, game, gamePin, goBack, handleConnectClick, hiddenUsers, isGuestBrowsing, joinMode, joinPinGame, joinPinInput, multiplayerActive, myConnections, navigateTo, otherProfessionals, otherStudents, pendingIncoming, pendingOutgoing, rejectConnection, screen, selectedTheme, sendConnectionRequest, setConnectConfirmUser, setCreatingGame, setEditProfileReturnScreen, setFounderConnectForm, setFounderConnectSent, setFounderConnectSubmitting, setGamePin, setIsGuestBrowsing, setJoinMode, setJoinPinInput, setScreen, setShowConnectConfirm, setShowFounderConnectModal, setShowTitleScreenConfirm, showConnectConfirm, showFounderConnectModal, studentProfile, unreadCounts}} />;
}

/* ---------- professional dashboard ---------- */

if (screen === "professionalDashboard" && seatedRole === "professional") {
  return <ProfessionalDashboard {...{acceptConnection, blockedUsers, clearPin, connectButtonClass, connectConfirmUser, createPinGame, creatingGame, game, gamePin, handleConnectClick, hiddenUsers, isGuestBrowsing, joinMode, joinPinGame, joinPinInput, multiplayerActive, myConnections, otherProfessionals, otherStudents, pendingIncoming, pendingOutgoing, rejectConnection, screen, selectedTheme, sendConnectionRequest, setConnectConfirmUser, setCreatingGame, setEditProfileReturnScreen, setGamePin, setJoinMode, setJoinPinInput, setScreen, setShowConnectConfirm, setShowTitleScreenConfirm, showConnectConfirm, studentProfile, unreadCounts}} />;
}

if (screen === "connections") {
  return <ConnectionsScreen {...{connectedUsers, gamePin, lastMessages, messageInput, messages, multiplayerActive, sbUser, screen, seatedRole, selectedChatUser, sendMessage, setMessageInput, setScreen, setSelectedChatUser, setShowDashboardConfirm, setShowTitleScreenConfirm, unreadCounts}} />;
}

  /* ---------- edit profile ---------- */

if (screen === "editProfile") {
  return <EditProfileScreen {...{auth, editProfileReturnScreen, game, savingProfile, sbUser, screen, seatedRole, selectedTheme, setSavingProfile, setSbUser, setScreen, setSeatedRole, setStudentProfile, studentProfile}} />;
}

/* ---------- about screen ---------- */

if (screen === "about") {
  return <AboutScreen {...{game, screen, selectedTheme, setScreen}} />;
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

  // Opening action logic
  const isOpeningAction = displayGame.bets[myActualSeat] === 0 && displayGame.bets[oppActualSeat] === 0;
  
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

const headerStatusText = opponentQuit
  ? "Opponent Quit!"
  : displayHandResult.status === "playing"
  ? displayToAct === mySeat
    ? "Your turn"
    : "Opponent thinking…"
  : ((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver))
    ? (displayGame.stacks[myActualSeat] <= 0
        ? "Game over — Opponent wins"
        : "Game over — You win")
    : "Hand ended (next hand in 8s)";

const handleDashboardClick = () => {
  if (opponentQuit) {
    if (mpHost) { mpHost.destroy(); setMpHost(null); }
    if (mpJoiner) { mpJoiner.destroy(); setMpJoiner(null); }
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
};

const handleTitleScreenClick = () => {
  if (opponentQuit) {
    if (mpHost) { mpHost.destroy(); setMpHost(null); }
    if (mpJoiner) { mpJoiner.destroy(); setMpJoiner(null); }
    setMultiplayerActive(false);
    setOpponentQuit(false);
    setOpponentName(null);
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
    setShowTitleScreenConfirm(true);
  }
};

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
        className={`relative flex items-start md:items-center justify-center px-6 pt-3 pb-1 md:pt-1 h-[100dvh] overflow-hidden md:h-auto md:min-h-screen md:overflow-y-auto ${selectedTheme === "notebook" ? "bg-[#f5f1e8]" : "bg-gradient-to-br from-gray-900 via-black to-gray-900"}`}
        style={selectedTheme === "notebook" ? {
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(0,0,0,0.08) 31px, rgba(0,0,0,0.08) 33px), linear-gradient(90deg, rgba(255,100,100,0.15) 0px, transparent 2px), linear-gradient(90deg, rgba(100,100,255,0.15) 60px, transparent 2px)`,
          backgroundSize: '100% 33px, 100% 100%, 100% 100%'
        } : undefined}
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
              className="rounded-2xl border border-black bg-white px-6 py-2 text-sm font-semibold text-black shadow-sm hover:bg-gray-50"
            >
              Play Again?
            </button>
          )}
          
          {/* State 2: I requested, waiting for opponent */}
          {playAgainRequested && !opponentWantsPlayAgain && (
            <div className="rounded-2xl border border-black bg-white px-6 py-2 text-sm font-semibold text-black shadow-sm">
              Sent request to {opponentName || "Opponent"}, waiting for response...
            </div>
          )}
          
          {/* State 3: Opponent requested, show Accept button */}
          {opponentWantsPlayAgain && !playAgainRequested && (
            <div className="flex items-center gap-3 rounded-2xl border border-black bg-white px-6 py-2 shadow-sm">
              <span className="text-sm font-semibold text-black">
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
                className="rounded-xl border border-green-600 bg-green-50 px-4 py-1 text-sm font-semibold text-green-600 hover:bg-green-100"
              >
                Accept
              </button>
            </div>
          )}
          
          {/* State 4: Both requested - starting new game */}
          {playAgainRequested && opponentWantsPlayAgain && (
            <div className="rounded-2xl border border-black bg-white px-6 py-2 text-sm font-semibold text-black shadow-sm">
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
            className="rounded-2xl border border-black bg-white px-6 py-2 text-sm font-semibold text-black shadow-sm hover:bg-gray-50"
          >
            Play Again?
          </button>
        </div>
      )}

{/* Show Hand Button — positioned in same area as betting panel (bottom-right) */}
{displayHandResult.status === "ended" &&
 canIShow &&
 !didIShow &&
 !((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver)) && (
  <div className="fixed bottom-4 md:bottom-6 right-4 md:right-6 z-50" style={{ transform: `scale(${tableScale})` }}>
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
      className="h-[64px] w-[100px] rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm transition-all duration-300 hover:bg-gray-100 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(0,0,0,0.1)] active:scale-[0.98]"
    >
      Show Hand
    </button>
  </div>
)}

      {blindNotice && 
       displayHandResult.status === "playing" && 
       !((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver)) ? (
  <div className="absolute top-6 left-1/2 -translate-x-1/2 text-sm font-semibold text-white">
    {blindNotice}
  </div>
) : null}
        <div className="w-full max-w-6xl">
          <GameHeader
            streetLabel={streetLabel}
            statusText={headerStatusText}
            handResultMessage={handResult.message}
            showDashboardLink={!!studentProfile.email}
            opponentQuit={opponentQuit}
            multiplayerActive={multiplayerActive}
            dailyRoomUrl={dailyRoomUrl}
            isCreatingRoom={isCreatingRoom}
            videoCallActive={videoCallActive}
            roomCreationError={roomCreationError}
            mySeat={mySeat}
            soundMuted={soundMuted}
            onDashboardClick={handleDashboardClick}
            onTitleScreenClick={handleTitleScreenClick}
            onCreateDailyRoom={createDailyRoom}
            onToggleSound={() => setSoundMutedState(prev => !prev)}
          />

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
          <div className="relative mt-[10px] md:mt-6 w-full">
            <ActionLog
              logViewOffset={logViewOffset}
              setLogViewOffset={setLogViewOffset}
              handLogHistory={handLogHistory}
              viewingSnapshot={viewingSnapshot}
              heroPosLabel={heroPosLabel}
              heroStartStack={heroStartStack}
              oppPosLabel={oppPosLabel}
              oppStartStack={oppStartStack}
              multiplayerActive={multiplayerActive}
              mpHandId={multiplayerActive && mpState ? mpState.handId : null}
              handId={handId}
              displayHandResult={displayHandResult}
              youC={youC}
              youD={youD}
              heroBest5={heroBest5}
              dealtRiver={dealtCards.river}
              oppA={oppA}
              oppB={oppB}
              oppBest5={oppBest5}
              displayActionLog={displayActionLog}
              didOppShow={didOppShow}
              displayOppRevealed={displayOppRevealed}
              displayYouMucked={displayYouMucked}
              riverAnimationComplete={riverAnimationComplete}
              displayStreet={displayStreet}
              myActualSeat={myActualSeat}
              oppActualSeat={oppActualSeat}
              heroHandRank={heroHandRank}
              oppHandRank={oppHandRank}
              displayedHistoryBoard={displayedHistoryBoard}
              board={board}
              displayedActionLog={displayedActionLog}
              mySeat={mySeat}
              tableScale={tableScale}
            />

            {/* CENTER: TABLE */}
            <div className="mx-auto flex w-fit flex-col items-center gap-[90px] md:gap-[60px] pb-[110px] md:pb-0 origin-top md:origin-center" style={{ transform: `scale(${tableScale})` }}>
              {/* TOP SEAT (Opponent) */}
              <div className={`animate-seat-appear relative h-[290px] w-[240px] md:h-[260px] md:w-[216px] md:-translate-y-6 rounded-3xl border border-white/20 bg-black/50 text-center ${showWinAnimation === 'opponent' && (riverAnimationComplete || displayStreet < 5) ? ((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver) ? 'permanent-win-glow' : 'animate-win-glow') : displayToAct === oppActualSeat && displayHandResult.status === 'playing' ? 'turn-active' : ''}`}>
                {!amIDealer && <div className={dealerChipTop}>D</div>}

                <div className="absolute -bottom-[70px] md:-bottom-14 left-1/2 -translate-x-1/2">
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
  <div className="absolute top-[17px] md:top-0 left-1/2 -translate-x-1/2 z-10">
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
  <div className="absolute flex gap-3 top-[57px] md:top-[40px]">
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
              <div className={`animate-seat-appear relative h-[290px] w-[240px] md:h-[260px] md:w-[216px] -translate-y-6 rounded-3xl border border-white/20 bg-black/50 text-center ${showWinAnimation === 'hero' && (riverAnimationComplete || displayStreet < 5) ? ((multiplayerActive && mpState?.gameOver) || (!multiplayerActive && gameOver) ? 'permanent-win-glow' : 'animate-win-glow') : displayToAct === mySeat && displayHandResult.status === 'playing' ? 'turn-active' : ''}`}>
                {amIDealer && <div className={dealerChipBottom}>D</div>}

                <div className="absolute -top-[70px] md:-top-14 left-1/2 -translate-x-1/2">
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
          <ActionPanel
            tableScale={tableScale}
            displayGame={displayGame}
            myActualSeat={myActualSeat}
            oppActualSeat={oppActualSeat}
            mySeat={mySeat}
            displayToAct={displayToAct}
            displayHandResult={displayHandResult}
            bottomCallAmt={bottomCallAmt}
            bottomMaxTo={bottomMaxTo}
            bottomMinRaise={bottomMinRaise}
            displayBetSize={displayBetSize}
            facingBetBottom={facingBetBottom}
            betSize={betSize}
            actionInProgress={actionInProgress}
            displayStreet={displayStreet}
            isOpeningAction={isOpeningAction}
            openingDefault={openingDefault}
            setBetSizeRounded={setBetSizeRounded}
            setBetSize={setBetSize}
            setShowFoldConfirm={setShowFoldConfirm}
            dispatchAction={dispatchAction}
          />
        </div>
      </main>
    </>
  );
}