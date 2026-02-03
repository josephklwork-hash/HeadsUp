// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabaseClient';
import { validateInput, validateEmail, validatePassword, validateProfileData, validateMessage } from '../../utils/validation';
import { formatBB, getConnectionSortPriority, toTitleCase } from '../../utils/formatting';
import { GAME_CONFIG } from '../../gameConfig';
import ConfirmModal from '../ConfirmModal';

export default function OAuthProfileScreen(p: Record<string, any>) {
  const { auth, creatingAccount, sbUser, screen, seatedRole, selectedTheme, setCreatingAccount, setSbUser, setScreen, setSeatedRole, setStudentProfile, studentProfile } = p;

  return (
    <main className={`relative flex min-h-screen items-center justify-center px-6 overflow-hidden ${
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