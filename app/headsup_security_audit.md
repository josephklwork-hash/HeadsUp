# HeadsUp Security Audit Report

**Date:** January 11, 2026  
**Application:** HeadsUp - Poker Networking Platform  
**Tech Stack:** Next.js, Supabase (PostgreSQL + Auth + Realtime)

---

## Executive Summary

| Risk Level | Count | Status |
|------------|-------|--------|
| 🔴 HIGH | 3 | Needs immediate attention |
| 🟠 MEDIUM | 4 | Should fix before launch |
| 🟡 LOW | 3 | Nice to have |

---

## 🔴 HIGH PRIORITY ISSUES

### 1. Overly Permissive Game Update Policy

**Location:** Supabase RLS Policy - `games` table  
**Current Policy:**
```sql
CREATE POLICY "Anyone can update games"
  ON games FOR UPDATE
  TO authenticated, anon
  USING (true);
```

**Risk:** Any user (including anonymous) can update ANY game's status. An attacker could:
- Mark games as "active" prematurely
- Change game statuses to disrupt other players
- Potentially manipulate game data

**Fix - Run this SQL:**
```sql
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can update games" ON games;

-- Create a restrictive policy: only game creator or players can update
CREATE POLICY "Game participants can update games"
  ON games FOR UPDATE
  TO authenticated, anon
  USING (
    created_by = auth.uid() OR
    id IN (
      SELECT game_id FROM game_players 
      WHERE user_id = auth.uid()
    )
  );
```

---

### 2. No Rate Limiting on PIN Guessing

**Location:** `joinPinGame()` function in `page.tsx`  
**Current Code:** No rate limiting - users can guess PINs unlimited times

**Risk:** With only 9,000 possible 4-digit PINs (1000-9999), an attacker could:
- Brute-force guess PINs in seconds
- Join random people's games
- Disrupt games maliciously

**Fix Option A - Client-side throttling (quick fix):**
Add to `page.tsx` after the state declarations:

```typescript
// Rate limiting for PIN attempts
const [pinAttempts, setPinAttempts] = useState(0);
const [pinLockoutUntil, setPinLockoutUntil] = useState<number | null>(null);
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60000; // 1 minute
```

Then modify `joinPinGame()`:
```typescript
async function joinPinGame() {
  const pin = joinPinInput.trim();
  if (pin.length !== 4) return;
  
  // Rate limiting check
  if (pinLockoutUntil && Date.now() < pinLockoutUntil) {
    const secondsLeft = Math.ceil((pinLockoutUntil - Date.now()) / 1000);
    alert(`Too many attempts. Please wait ${secondsLeft} seconds.`);
    return;
  }
  
  // ... rest of function ...
  
  // On failed PIN lookup, increment attempts
  if (gameErr || !gameRow) {
    setPinAttempts(prev => {
      const newCount = prev + 1;
      if (newCount >= MAX_PIN_ATTEMPTS) {
        setPinLockoutUntil(Date.now() + LOCKOUT_DURATION_MS);
        return 0; // Reset counter
      }
      return newCount;
    });
    // ... existing error handling ...
  }
}
```

**Fix Option B - Server-side rate limiting (recommended):**
Create a Supabase Edge Function or use Supabase's built-in rate limiting.

---

### 3. Session Storage Contains Sensitive Game State

**Location:** `page.tsx` - reconnection logic  
**Issue:** Game state including card information is stored in sessionStorage

```typescript
sessionStorage.setItem('headsup_hostState', JSON.stringify(newState));
```

**Risk:** 
- Cards are visible in browser DevTools
- State could be manipulated for cheating
- XSS attacks could steal game state

**Fix:**
Don't store cards in sessionStorage. Instead, re-request cards from host on reconnect:

```typescript
// Instead of saving full state with cards:
sessionStorage.setItem('headsup_hostState', JSON.stringify(newState));

// Save only non-sensitive state:
const safeState = {
  ...newState,
  cards: null, // Don't persist cards
};
sessionStorage.setItem('headsup_hostState', JSON.stringify(safeState));
```

---

## 🟠 MEDIUM PRIORITY ISSUES

### 4. No Input Validation on Profile Fields

**Location:** Sign-up form in `page.tsx`

**Risk:** Users can enter malicious content in profile fields:
- XSS via LinkedIn URL
- SQL injection attempts (blocked by Supabase, but still bad practice)
- Excessively long strings

**Fix - Add validation:**
```typescript
// Add these validation functions
function isValidLinkedInUrl(url: string): boolean {
  if (!url) return true; // Optional field
  const pattern = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/i;
  return pattern.test(url);
}

function sanitizeInput(input: string, maxLength: number = 100): string {
  return input.trim().slice(0, maxLength);
}

// In the sign-up onClick handler, before supabase.auth.signUp:
if (studentProfile.linkedinUrl && !isValidLinkedInUrl(studentProfile.linkedinUrl)) {
  alert('Please enter a valid LinkedIn profile URL');
  return;
}
```

---

### 5. Anonymous Users Can Spam Game Creation

**Location:** Supabase RLS Policy - `games` table

**Current:** Anyone can create unlimited games
**Risk:** DoS attack by creating thousands of games

**Fix - Add game creation limits:**
```sql
-- Create a function to count recent games by user
CREATE OR REPLACE FUNCTION user_recent_games_count(user_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER 
  FROM games 
  WHERE created_by = user_uuid 
  AND created_at > NOW() - INTERVAL '1 hour';
$$ LANGUAGE SQL SECURITY DEFINER;

-- Update the insert policy
DROP POLICY IF EXISTS "Anyone can create games" ON games;

CREATE POLICY "Rate limited game creation"
  ON games FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    user_recent_games_count(auth.uid()) < 10  -- Max 10 games per hour
  );
```

---

### 6. No CSRF Protection on Sensitive Actions

**Location:** Connection requests, profile updates

**Risk:** Malicious sites could trigger actions on behalf of logged-in users

**Fix:** Supabase handles this via JWT tokens, but ensure:
- All state-changing operations go through authenticated Supabase calls ✅ (already done)
- Consider adding custom CSRF tokens for extra security

---

### 7. Console Logging Sensitive Data

**Location:** Multiple places in `page.tsx`

```typescript
console.log("Anonymous user created:", user.id);
console.log("PIN:", pin);
```

**Risk:** 
- User IDs visible in console
- PINs logged could be seen in shared screens

**Fix:** Remove or conditionally disable in production:
```typescript
const isDev = process.env.NODE_ENV === 'development';

// Replace console.log calls:
if (isDev) console.log("Anonymous user created:", user.id);
```

---

## 🟡 LOW PRIORITY ISSUES

### 8. No Password Strength Requirements

**Location:** Sign-up form

**Current:** No minimum password requirements
**Risk:** Weak passwords vulnerable to brute force

**Fix:**
```typescript
function isStrongPassword(password: string): boolean {
  // At least 8 chars, 1 uppercase, 1 lowercase, 1 number
  const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return pattern.test(password);
}

// In sign-up handler:
if (!isStrongPassword(studentProfile.password)) {
  alert('Password must be at least 8 characters with uppercase, lowercase, and number');
  return;
}
```

---

### 9. Email Enumeration Possible

**Location:** Login/Sign-up

**Issue:** Different error messages for "user exists" vs "wrong password" allow attackers to discover valid emails

**Fix:** Use generic error messages:
```typescript
// Instead of showing specific Supabase errors:
alert('Invalid email or password');
```

---

### 10. No Session Timeout

**Location:** Authentication flow

**Issue:** Sessions don't expire
**Risk:** Stolen session tokens remain valid indefinitely

**Fix:** Configure in Supabase Dashboard:
1. Go to Authentication → Settings
2. Set "JWT expiry" to a reasonable value (e.g., 1 hour)
3. Enable "Refresh token rotation"

---

## Current Database Tables & Their Security Status

| Table | RLS | Status | Notes |
|-------|-----|--------|-------|
| `games` | ✅ | ⚠️ | UPDATE policy too permissive |
| `game_players` | ✅ | ✅ | Policies look OK |
| `profiles` | ✅ | ✅ | Properly scoped to user |
| `connections` | ✅ | ✅ | Properly scoped to participants |
| `messages` | ✅ | ✅ | Properly scoped |

---

## Recommended SQL to Run (All Fixes)

```sql
-- ============================================
-- HEADSUP SECURITY FIXES
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Fix overly permissive game update policy
DROP POLICY IF EXISTS "Anyone can update games" ON games;

CREATE POLICY "Game participants can update games"
  ON games FOR UPDATE
  TO authenticated, anon
  USING (
    created_by = auth.uid() OR
    id IN (
      SELECT game_id FROM game_players 
      WHERE user_id = auth.uid()
    )
  );

-- 2. Add rate limiting function for game creation
CREATE OR REPLACE FUNCTION user_recent_games_count(user_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COALESCE(COUNT(*)::INTEGER, 0)
  FROM games 
  WHERE created_by = user_uuid 
  AND created_at > NOW() - INTERVAL '1 hour';
$$ LANGUAGE SQL SECURITY DEFINER;

-- 3. Update game creation policy with rate limiting
DROP POLICY IF EXISTS "Anyone can create games" ON games;

CREATE POLICY "Rate limited game creation"
  ON games FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    user_recent_games_count(auth.uid()) < 10
  );

-- 4. Add index for faster rate limit checks
CREATE INDEX IF NOT EXISTS idx_games_created_by_recent 
ON games(created_by, created_at DESC);

-- 5. Ensure DELETE policy exists (cleanup old games)
CREATE POLICY IF NOT EXISTS "Users can delete their own games"
  ON games FOR DELETE
  TO authenticated, anon
  USING (created_by = auth.uid());
```

---

## Implementation Priority

1. **Today:** Run the SQL fixes above
2. **This week:** Add client-side rate limiting for PIN guessing
3. **Before launch:** Remove console.log statements, add input validation
4. **Nice to have:** Password strength, session timeouts

---

## Questions?

Let me know if you want me to:
1. Provide the exact code changes for any fix
2. Explain any vulnerability in more detail
3. Add additional security measures
