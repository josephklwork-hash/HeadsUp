// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabaseClient';
import { validateInput, validateEmail, validatePassword, validateProfileData, validateMessage } from '../../utils/validation';
import { formatBB, getConnectionSortPriority, toTitleCase } from '../../utils/formatting';
import { GAME_CONFIG } from '../../gameConfig';
import ConfirmModal from '../ConfirmModal';

export default function RoleScreen(p: Record<string, any>) {
  const { clearTimers, createPinGame, creatingGame, game, gamePin, isCreatingPin, joinMode, joinPinGame, joinPinInput, navigateTo, resetGame, screen, seatedRole, selectedTheme, setCreatingGame, setEditProfileReturnScreen, setGamePin, setIsGuestBrowsing, setJoinMode, setJoinPinInput, setOtherProfessionals, setOtherStudents, setScreen, setSeatedRole, setSelectedTheme, setStudentMenuOpen, setStudentProfile, setThemeMenuOpen, studentMenuOpen, studentProfile, themeMenuOpen } = p;


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
        className="text-sm font-semibold text-white underline opacity-90 hover:opacity-100"
      >
        {studentProfile.firstName} {studentProfile.lastName}
      </button>

      {studentMenuOpen && (
        <div className="absolute right-0 mt-2 w-40 rounded-xl border bg-white shadow-md">
          <button
            type="button"
            onClick={() => {
              setStudentMenuOpen(false);
              setEditProfileReturnScreen("role");
              setScreen("editProfile");
            }}
            className="w-full flex items-center px-4 py-2 text-left text-sm font-semibold text-black hover:bg-gray-100"
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
            className="w-full flex items-center px-4 py-2 text-left text-sm font-semibold text-black hover:bg-gray-100"
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
      className={`text-sm font-semibold ${
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
      className={`text-sm font-semibold ${
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
        className={`text-sm font-semibold ${
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
        className={`text-sm font-semibold ${
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
        className={`text-sm font-semibold ${
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
        className={`text-sm font-semibold ${
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
          className={`text-sm font-semibold ${
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

      <div className="w-full max-w-xl flex flex-col relative z-10">
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

        <h1 className={`mb-3 text-center font-bold relative ${
          selectedTheme === "notebook"
            ? "text-6xl font-permanent-marker text-[#1e40af] transform -rotate-1"
            : "text-5xl text-white tracking-tight animate-slide-up"
        }`}>
          {selectedTheme === "notebook" && (
            <span className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-64 h-3 bg-yellow-200 opacity-40 -rotate-1 -z-10"></span>
          )}
          HeadsUp
        </h1>

        <p className={`mb-12 text-center relative ${
          selectedTheme === "notebook"
            ? "text-lg font-caveat text-gray-700 leading-relaxed px-8"
            : "text-base text-white/60 leading-relaxed max-w-md mx-auto animate-slide-up-delay-1"
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

      <div className="h-[220px] flex flex-col justify-start">

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
        : "text-lg font-semibold tabular-nums text-white"
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
          : "py-4 text-base"
      } max-w-sm`}
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
        className={`w-full max-w-xs px-4 py-3 text-center tracking-widest tabular-nums ${
          selectedTheme === "notebook"
            ? "text-3xl font-permanent-marker text-[#dc2626] placeholder:text-[#dc2626]/30 bg-white/60"
            : "rounded-xl border border-white text-lg text-white placeholder:text-white/50 bg-transparent"
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
      : "py-4 text-base"
  } max-w-sm ${
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
      : "py-4 text-base"
  } max-w-sm`}
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
      : "py-10 text-xl bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-sm"
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
      : "py-10 text-xl bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-sm"
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