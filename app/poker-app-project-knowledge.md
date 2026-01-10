# Poker Networking App - Project Knowledge

## Project Vision

A poker networking application similar to LinkedIn that combines casual gaming with professional networking opportunities.

### Core Features

1. **PIN-Based Gaming (No Account Required)**
   - Users can play without creating accounts
   - One player creates a game and receives a PIN
   - Other player joins using the PIN
   - Enables quick, casual gameplay between any users

2. **Account System (Two User Types)**
   - **Students**: Can create accounts to access enhanced features and dashboard
   - **Professionals**: Can create accounts with separate professional dashboard
   - Both account types can still use PIN-based games

3. **User Dashboards**
   - **Student Dashboard**: 
     - Friends list (left side)
     - Professionals list (right side)
     - Profile/stats area
   - **Professional Dashboard**: TBD
   - Access from login or in-game (with warning about game reset)

## Technical Architecture

### Frontend
- **Framework**: Next.js with React and TypeScript
- **Styling**: Tailwind CSS
- **File**: `page.tsx` (main game component)

### Backend
- **Database/Auth**: Supabase
- **Real-time Communication**: Supabase Realtime channels
- **Deployment**: Vercel

### Game Structure
- **Game Type**: Heads-up (1v1) No-Limit Texas Hold'em
- **Blinds**: 0.5 BB (Small Blind) / 1 BB (Big Blind)
- **Starting Stack**: 50 BB
- **Blind Increases**: Every 10 hands (25% stack reduction)

## Current Implementation Status

### Working Features
✅ Single-player poker game with AI opponent
✅ Complete poker mechanics (betting, raising, calling, folding, checking)
✅ Hand evaluation (straight flush to high card)
✅ Action logging with hand history
✅ Supabase authentication setup
✅ PIN-based game creation and joining
✅ Two devices can connect via PIN
✅ Real-time multiplayer synchronization
✅ Actions sync between players
✅ Different cards dealt to each player
✅ Deployed to Vercel

### Known Issues
⚠️ Host device (game creator) works perfectly
⚠️ Joined device has UI bugs:
- Dealer button position incorrect
- Blind amounts reversed (SB shows 1BB, BB shows 0.5BB)
- Card tiles missing/incorrect display
- General perspective/display issues

### Root Cause
The entire UI was built for "bottom" perspective (single-player). The joiner device (assigned "top" seat) needs proper perspective mapping to flip UI elements correctly.

## Multiplayer Architecture

### Host-Client Model
- **Host** (game creator, mySeat="bottom"): 
  - Authoritative source of game state
  - Runs all game logic
  - Deals cards
  - Processes actions from both players
  - Broadcasts state updates

- **Joiner** (enters PIN, mySeat="top"):
  - Receives state updates from host
  - Sends actions to host
  - Displays game from their perspective

### Communication Flow
1. Host creates game → generates PIN
2. Joiner enters PIN → joins channel
3. Host deals cards and manages state
4. Players send actions via Supabase Realtime
5. Host processes and broadcasts updated state
6. Both devices update their displays

### State Synchronization Messages
Current message types include:
- `NEW_HAND`: Start new hand with initial state
- `SET_HAND_ID`: Synchronize hand number
- `DEAL`: Send card information
- `POST_BLINDS`: Post blind bets
- `ACTION`: Player action (fold, check, call, bet, raise)
- `ADVANCE_STREET`: Move to next betting round
- `SHOWDOWN`: End hand and show results
- `RESET`: Reset game state
- `SYNC`: Various synchronization events

### Key Code Sections

**Game State Management** (lines ~1000-1200):
- Multiplayer channel subscription
- Message handling for different event types
- State synchronization logic

**Action Functions**:
- `actFold()`: Handle fold action
- `actCheck()`: Handle check action
- `actCall()`: Handle call action
- `actBetRaise()`: Handle bet/raise action

**Game Flow**:
- `resetGame()`: Initialize new game
- `startHand()`: Begin new hand
- `advanceStreet()`: Progress to next street (flop, turn, river)
- `endHand()`: Complete hand and determine winner

**Blind Posting** (lines ~2000-2050):
- Posts small blind (SB) and big blind (BB)
- Logs blind actions
- Syncs between devices

## Testing Setup

### Local Development
- Run `npm run dev` on development machine
- Access via `localhost:3000` on same device
- Access via `http://YOUR_IP:3000` from other devices on same network

### Multiplayer Testing
**Option 1: Same WiFi Network**
- Both devices connect to same WiFi
- Development machine runs `npm run dev`
- Other device accesses via development machine's IP

**Option 2: iPhone Hotspot**
- iPhone creates hotspot
- Mac connects to iPhone hotspot
- Mac runs `npm run dev`
- Get Mac IP: `ipconfig getifaddr en0`
- iPhone accesses `http://MAC_IP:3000`

**Option 3: ngrok (for remote testing)**
- Run `npx ngrok http 3000`
- Use provided public URL on both devices

**Option 4: Vercel Preview Deployment**
- Push code to GitHub
- Access Vercel preview URL on both devices

## Code Patterns and Preferences

### Code Change Format
When making changes, provide:
- **FIND**: Exact code block to locate
- **REPLACE WITH**: Exact replacement code
- **Location**: Line numbers when possible
- No suggestions, no "it may look like this"
- Show complete blocks for additions/deletions

### Game Logic Flow
1. Cards are dealt to both players
2. Blinds are posted (SB/BB)
3. Preflop betting begins (SB acts first)
4. Flop is dealt (3 community cards)
5. Post-flop betting (BB acts first)
6. Turn is dealt (4th community card)
7. Post-turn betting
8. River is dealt (5th community card)
9. Post-river betting
10. Showdown (if not folded)

### Seat Terminology
- `"top"`: Opponent's seat (upper portion of screen)
- `"bottom"`: Player's seat (lower portion of screen, "You")
- `mySeat`: Current device's assigned seat position
- `dealerSeat`: Current dealer button position

## Recent Changes and Fixes

### Duplicate Message Fixes
Eliminated redundant message sends:
- Combined `NEW_HAND` and `SET_HAND_ID` into single message
- Removed duplicate blind logging
- Reduced race conditions from multiple simultaneous messages

### Blind Posting Issues
- Blinds weren't appearing in hand history for joined device
- Fixed by ensuring host includes blind actions before sending snapshots
- Still needs verification that fix is working correctly

## Next Steps

### Immediate Priorities
1. Fix joiner device perspective issues
2. Ensure blind posts display correctly on both devices
3. Test complete hand flow on both devices
4. Verify all-in situations work in multiplayer

### Future Features
- Student/Professional account creation flows
- Dashboard implementations
- Friend system
- Professional booking system
- Profile and statistics tracking
- Hand history review
- Mobile optimization
- Progress saving between sessions

## File Structure

### Main Components
- `/page.tsx`: Main game component (2000+ lines)
- Supabase configuration (database, auth, realtime)
- Authentication forms (student email/password, professional LinkedIn)
- Game UI (cards, buttons, action log, chip counts)
- Multiplayer communication logic

### Key Data Types
```typescript
type Seat = "top" | "bottom";
type Street = 0 | 3 | 4 | 5; // Preflop, Flop, Turn, River
type Card = { rank: string; suit: string };
type GameState = {
  stacks: { top: number; bottom: number };
  bets: { top: number; bottom: number };
  pot: number;
};
```

## Important Constants
- `SB = 0.5` (Small Blind)
- `BB = 1` (Big Blind)  
- `STARTING_STACK_BB = 50`
- `BLINDS_INCREASE_EVERY_N_HANDS = 10`
- `STACK_REDUCTION_FACTOR = 0.25`

## Authentication Flows

### Student Login
- Email/password authentication via Supabase
- Standard signup/login forms
- Access to student dashboard after login

### Professional Login  
- LinkedIn OAuth authentication
- Professional-specific signup flow
- Access to professional dashboard after login

### No Account Flow
- Direct access to game creation/joining
- PIN-based game matching
- No persistent data storage

## Design Philosophy
- Keep multiplayer simple with host-client architecture
- Host is single source of truth
- Minimize message types and complexity
- Prioritize getting core gameplay working before adding features
- Fix perspective issues before implementing additional features
