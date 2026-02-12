// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabaseClient';
import { validateInput, validateEmail, validatePassword, validateProfileData, validateMessage } from '../../utils/validation';
import { formatBB, getConnectionSortPriority, toTitleCase } from '../../utils/formatting';
import { GAME_CONFIG } from '../../gameConfig';
import ConfirmModal from '../ConfirmModal';

export default function ProfessionalDashboard(p: Record<string, any>) {
  const { acceptConnection, blockedUsers, clearPin, connectButtonClass, connectConfirmUser, createPinGame, creatingGame, game, gamePin, handleConnectClick, hiddenUsers, isGuestBrowsing, joinMode, joinPinGame, joinPinInput, multiplayerActive, myConnections, otherProfessionals, otherStudents, pendingIncoming, pendingOutgoing, rejectConnection, screen, selectedTheme, sendConnectionRequest, setConnectConfirmUser, setCreatingGame, setEditProfileReturnScreen, setGamePin, setJoinMode, setJoinPinInput, setScreen, setShowConnectConfirm, setShowTitleScreenConfirm, showConnectConfirm, studentProfile, unreadCounts } = p;

  const baseButton =
    "w-full rounded-3xl border px-6 font-semibold transition-colors duration-200 hover:bg-gray-50 hover:border-gray-300";

  return (
   <main
      className={`flex min-h-screen justify-center px-6 pt-16 ${selectedTheme === "notebook" ? "bg-[#f5f1e8]" : "bg-gradient-to-br from-gray-900 via-black to-gray-900"}`}
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
          href={p.linkedinUrl.match(/^https?:\/\/(www\.)?linkedin\.com/) ? p.linkedinUrl : `https://linkedin.com/in/`}
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
          href={s.linkedinUrl.match(/^https?:\/\/(www\.)?linkedin\.com/) ? s.linkedinUrl : `https://linkedin.com/in/`}
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