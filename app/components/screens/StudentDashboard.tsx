// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabaseClient';
import { validateInput, validateEmail, validatePassword, validateProfileData, validateMessage } from '../../utils/validation';
import { formatBB, getConnectionSortPriority, toTitleCase } from '../../utils/formatting';
import { GAME_CONFIG } from '../../gameConfig';
import ConfirmModal from '../ConfirmModal';

export default function StudentDashboard(p: Record<string, any>) {
  const { acceptConnection, blockedUsers, clearPin, connectButtonClass, connectConfirmUser, createPinGame, creatingGame, FOUNDER_ID, founderConnectForm, founderConnectSent, founderConnectSubmitting, game, gamePin, goBack, handleConnectClick, hiddenUsers, isGuestBrowsing, joinMode, joinPinGame, joinPinInput, multiplayerActive, myConnections, navigateTo, otherProfessionals, otherStudents, pendingIncoming, pendingOutgoing, rejectConnection, screen, selectedTheme, sendConnectionRequest, setConnectConfirmUser, setCreatingGame, setEditProfileReturnScreen, setFounderConnectForm, setFounderConnectSent, setFounderConnectSubmitting, setGamePin, setIsGuestBrowsing, setJoinMode, setJoinPinInput, setScreen, setShowConnectConfirm, setShowFounderConnectModal, setShowTitleScreenConfirm, showConnectConfirm, showFounderConnectModal, studentProfile, unreadCounts } = p;

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