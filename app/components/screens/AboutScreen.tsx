// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabaseClient';
import { validateInput, validateEmail, validatePassword, validateProfileData, validateMessage } from '../../utils/validation';
import { formatBB, getConnectionSortPriority, toTitleCase } from '../../utils/formatting';
import { GAME_CONFIG } from '../../gameConfig';
import ConfirmModal from '../ConfirmModal';

export default function AboutScreen(p: Record<string, any>) {
  const { game, screen, selectedTheme, setScreen } = p;

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