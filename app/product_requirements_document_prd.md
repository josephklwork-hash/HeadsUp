# Product Requirements Document (PRD)

## Product Name
**Heads-Up Poker Networking Platform**

## Overview
A web-based, real-time, heads-up Texas Hold’em application that functions as both a **game** and a **professional networking platform**.

Users can instantly play via a **PIN-based game flow**, with **no account required**. After playing (or independently), users may optionally create an account as either a **Student** or a **Professional**, unlocking networking features such as dashboards, discovery, and connections.

The core vision is to lower the barrier to meaningful professional interaction by embedding it inside a short, structured, competitive activity.

---

## Goals
- Allow **any user (with or without an account)** to create or join a heads-up poker game via PIN.
- Ensure two users can complete a **fully synchronized poker match** from start to finish.
- Provide a clear upgrade path from **guest player → registered user**.
- Support **role-based networking** between Students and Professionals.
- Enable users to discover, connect, and coordinate interactions through gameplay.
- Serve as a portfolio-grade demonstration of real-time systems, state synchronization, and product thinking.

---

## Non-Goals
- Full-ring or multi-table poker
- Gambling, real-money wagering, or payouts
- **Ranked ladders**
- **Public matchmaking**
- Chat, voice, or video (initial scope)

---

## Target Users

### Guest Users (No Account)
- Anyone who wants to quickly play a heads-up poker game
- Can create or join games via PIN
- No persistence or networking features

### Students
- College or early-career users
- Create a Student account after (or before) playing
- Discover professionals and other students
- Use the game as a low-pressure networking tool

### Professionals
- Working professionals, mentors, or recruiters
- Create a Professional account
- Discover students
- Use short poker games as an icebreaker for conversation

---

## Core User Flows

### 1. Guest Gameplay (No Account)
- User clicks **Create Game** or **Join Game**
- System generates or accepts a **4-digit PIN**
- Two users join the same game instance
- Full game can be played start to finish
- No account required

### 2. Account Creation (Optional)
- Guest user may create an account at any time
- User selects role: **Student** or **Professional**
- Account unlocks dashboards and networking features

### 3. Dashboards

#### Student Dashboard
- View newly registered Professionals
- View other Students
- See basic profile information

#### Professional Dashboard
- View newly registered Students
- View other Professionals (optional / future)
- See basic profile information

### 4. Connections
- Users can send **connect requests** (LinkedIn-style)
- Mutual connections unlock coordination features

### 5. Coordinated Play & Coffee Chats
- Connected users can:
  - Coordinate poker play times
  - Schedule coffee chats
  - Use heads-up poker games as the interaction medium

### 6. Gameplay (Account or Guest)
- Game starts once both seats are filled
- All actions synchronize in real time
- Game ends on fold, showdown, or when a stack reaches 0

---

## Functional Requirements

### Multiplayer & Sync
- Real-time action broadcasting between clients
- Deterministic state updates (no divergence)
- Sender-originated actions must not re-trigger locally
- Game state must remain consistent after refresh (best-effort)

### Game Rules
- Heads-up No-Limit Texas Hold’em
- Blinds increase at predefined hand intervals
- Legal bet sizing enforced
- All-in logic:
  - Overbets capped at opponent stack
  - Excess chips returned
  - Board runs out automatically after all-in + call

### Roles
- Each user has a role: `student` or `professional`
- Roles affect UI labels and dashboard context only (initially)

### UI/UX
- Buttons disabled during async operations
- Clear visual indication of:
  - Whose turn it is
  - Stack sizes
  - Blinds
  - Game state (playing, hand over, game over)
- No ghost clicks or duplicate actions

---

## Technical Requirements

### Frontend
- React + Next.js (App Router)
- TypeScript (strict)
- Tailwind CSS
- Deterministic game engine logic

### Backend / Infrastructure
- Supabase (Postgres + Realtime)
- Anonymous auth support
- Row Level Security (RLS)
- Realtime broadcast channels per game

### State Management
- Local authoritative state with remote reconciliation
- Suppression flags to prevent feedback loops
- Timers managed via refs (not render state)

---

## Data Models (High-Level)

### games
- id
- pin
- status
- created_at

### game_players
- game_id
- user_id
- seat (top | bottom)
- role (student | professional)
- joined_at

---

## Edge Cases & Constraints
- Prevent actions when not player’s turn
- Prevent interaction during game creation
- Prevent multiple joins to same seat
- Handle disconnects gracefully
- Ensure game cannot continue after terminal state

---

## Trust & Safety

### Data Protection
- User **emails and passwords** must never be exposed to the client beyond what is strictly required
- All authentication handled via secure, battle-tested providers (e.g. Supabase Auth)
- Passwords stored only as **hashed and salted values**
- No plaintext credentials stored or logged

### Game State Integrity
- Current game states must be protected from:
  - Unauthorized reads
  - Unauthorized writes
  - Cross-game interference
- Each game instance isolated via scoped realtime channels
- Only seated players may broadcast or apply game actions

### Network & API Security
- Row Level Security (RLS) enforced on all database tables
- Clients may only access rows they are authorized to see
- All database mutations validated server-side
- Rate limiting applied to:
  - Game creation
  - PIN join attempts

### Abuse & Misuse Prevention
- Prevent brute-force PIN guessing
- Prevent duplicate connections from the same user to the same seat
- Gracefully handle malicious or malformed client payloads

### Operational Safety
- Secrets (API keys, service keys) stored only in environment variables
- No secrets committed to source control
- Production and development environments strictly separated

---

## Success Metrics
- Two devices can complete a full game without desync
- No illegal actions possible via UI
- No frozen states during or after all-ins
- Clean deployment with zero runtime errors

---

## Future Extensions (Out of Scope)
- In-app chat, voice, or video
- Automated scheduling tools
- Match history analytics
- Reputation scores or ratings
- Recruiter pipelines or ATS integrations

---

## Open Questions
- Persistence of completed games
- Post-game interaction flow
- Moderation and abuse prevention

