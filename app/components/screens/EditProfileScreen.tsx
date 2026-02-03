// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabaseClient';
import { validateInput, validateEmail, validatePassword, validateProfileData, validateMessage } from '../../utils/validation';
import { formatBB, getConnectionSortPriority, toTitleCase } from '../../utils/formatting';
import { GAME_CONFIG } from '../../gameConfig';
import ConfirmModal from '../ConfirmModal';

export default function EditProfileScreen(p: Record<string, any>) {
  const { auth, editProfileReturnScreen, game, savingProfile, sbUser, screen, seatedRole, selectedTheme, setSavingProfile, setSbUser, setScreen, setSeatedRole, setStudentProfile, studentProfile } = p;

  const inputClass = selectedTheme === "notebook"
    ? "rounded-xl border-2 border-[#1e40af] text-[#1e40af] placeholder:text-[#1e40af]/50 bg-transparent px-4 py-3 text-sm"
    : "rounded-xl border border-white text-white placeholder:text-white/50 bg-transparent px-4 py-3 text-sm";
  const buttonClass = selectedTheme === "notebook"
    ? "rounded-2xl border-2 border-[#1e40af] text-[#1e40af] px-4 py-3 text-sm font-semibold transition-all hover:bg-[#1e40af] hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
    : "rounded-2xl border border-white text-white px-4 py-3 text-sm font-semibold transition-colors hover:bg-gray-50 hover:text-black";
  
  const handleSaveProfile = async () => {
    if (!sbUser?.id) return;
    
    // === PROFILE VALIDATION (schema-based) ===
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
      alert(firstError || 'Please check your input');
      return;
    }
    
    const sanitizedProfile = profileValidation.sanitized;
    
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: toTitleCase(sanitizedProfile.firstName),
          last_name: toTitleCase(sanitizedProfile.lastName),
          year: seatedRole === 'student' ? sanitizedProfile.year : null,
          major: seatedRole === 'student' ? toTitleCase(sanitizedProfile.major) : null,
          school: sanitizedProfile.school || null,
          company: seatedRole === 'professional' ? sanitizedProfile.company : null,
          work_title: seatedRole === 'professional' ? sanitizedProfile.workTitle : null,
          linkedin_url: sanitizedProfile.linkedinUrl || null,
        })
        .eq('id', sbUser.id);
      
      if (error) {
        alert('Failed to save. Please try again.');
      } else {
        // Update local state with saved values
        setStudentProfile({
          ...studentProfile,
          firstName: toTitleCase(sanitizedProfile.firstName),
          lastName: toTitleCase(sanitizedProfile.lastName),
          year: seatedRole === 'student' ? sanitizedProfile.year : '',
          major: seatedRole === 'student' ? toTitleCase(sanitizedProfile.major) : '',
          school: sanitizedProfile.school || '',
          company: seatedRole === 'professional' ? sanitizedProfile.company : '',
          workTitle: seatedRole === 'professional' ? sanitizedProfile.workTitle : '',
          linkedinUrl: sanitizedProfile.linkedinUrl || '',
        });
        alert('Profile updated!');
        setScreen(editProfileReturnScreen);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <main
      className={`relative flex min-h-screen items-center justify-center px-6 ${selectedTheme === "notebook" ? "bg-[#f5f1e8]" : "bg-gradient-to-br from-gray-900 via-black to-gray-900"}`}
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

      <div className={`w-full max-w-md relative z-10 ${selectedTheme === "default" ? "animate-slide-up" : ""}`}>
        <h1 className={`mb-6 text-center text-3xl font-bold relative ${selectedTheme === "notebook" ? "font-permanent-marker text-[#1e40af] transform -rotate-1" : "text-white tracking-tight"}`}>
          {selectedTheme === "notebook" && (
            <span className="absolute -inset-2 bg-yellow-200/40 -z-10 transform rotate-1 rounded"></span>
          )}
          Edit Profile
        </h1>

        <div className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="First name"
            value={studentProfile.firstName}
            onChange={(e) =>
              setStudentProfile({ ...studentProfile, firstName: e.target.value })
            }
            className={inputClass}
          />

          <input
            type="text"
            placeholder="Last name"
            value={studentProfile.lastName}
            onChange={(e) =>
              setStudentProfile({ ...studentProfile, lastName: e.target.value })
            }
            className={inputClass}
          />

          <input
            type="text"
            placeholder="LinkedIn URL (optional)"
            value={studentProfile.linkedinUrl}
            onChange={(e) =>
              setStudentProfile({ ...studentProfile, linkedinUrl: e.target.value })
            }
            className={inputClass}
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
                className={inputClass}
              />

              <select
                value={studentProfile.year}
                onChange={(e) =>
                  setStudentProfile({ ...studentProfile, year: e.target.value })
                }
                className={`w-full rounded-xl px-4 py-3 text-sm appearance-none bg-transparent cursor-pointer ${
                  selectedTheme === "notebook"
                    ? "border-2 border-[#1e40af] text-[#1e40af]"
                    : "border border-white text-white"
                }`}
              >
                <option value="" disabled className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>Year</option>
                <option value="1" className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>1</option>
                <option value="2" className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>2</option>
                <option value="3" className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>3</option>
                <option value="4" className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>4</option>
                <option value="Other" className={selectedTheme === "notebook" ? "bg-[#f5f1e8] text-[#1e40af]" : "bg-black text-white"}>Other</option>
              </select>

              <input
                type="text"
                placeholder="Major"
                value={studentProfile.major}
                onChange={(e) =>
                  setStudentProfile({ ...studentProfile, major: e.target.value })
                }
                className={inputClass}
              />
            </>
          )}

          {seatedRole === "professional" && (
            <>
              <input
                type="text"
                placeholder="School"
                value={studentProfile.school}
                onChange={(e) =>
                  setStudentProfile({ ...studentProfile, school: e.target.value })
                }
                className={inputClass}
              />

              <input
                type="text"
                placeholder="Company"
                value={studentProfile.company}
                onChange={(e) =>
                  setStudentProfile({ ...studentProfile, company: e.target.value })
                }
                className={inputClass}
              />

              <input
                type="text"
                placeholder="Work title"
                value={studentProfile.workTitle}
                onChange={(e) =>
                  setStudentProfile({ ...studentProfile, workTitle: e.target.value })
                }
                className={inputClass}
              />
            </>
          )}

          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className={`mt-4 ${buttonClass} disabled:opacity-50`}
          >
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </button>

          <button
            type="button"
            onClick={() => setScreen(editProfileReturnScreen)}
            className={buttonClass}
          >
            Cancel
          </button>

          <div className={`mt-8 pt-6 ${selectedTheme === "notebook" ? "border-t-2 border-red-300" : "border-t border-white/10"}`}>
            <button
              type="button"
              onClick={async () => {
                const confirmed = window.confirm(
                  'Are you sure you want to delete your account? This will permanently remove all your data and cannot be undone.'
                );
                if (!confirmed) return;

                const doubleConfirm = window.confirm(
                  'This is permanent. All your profile data, connections, and game history will be deleted. Continue?'
                );
                if (!doubleConfirm) return;

                try {
                  if (!sbUser?.id) return;

                  // Delete profile from database
                  const { error: deleteError } = await supabase
                    .from('profiles')
                    .delete()
                    .eq('id', sbUser.id);

                  if (deleteError) {
                    alert('Failed to delete account. Please try again.');
                    return;
                  }

                  // Sign out
                  await supabase.auth.signOut();
                  setSbUser(null);
                  setStudentProfile({
                    firstName: '', lastName: '', email: '', password: '',
                    year: '', major: '', school: '', company: '', workTitle: '', linkedinUrl: '',
                  });
                  setSeatedRole(null);
                  setScreen('role');
                  alert('Your account has been deleted.');
                } catch (e) {
                  alert('Failed to delete account. Please try again.');
                }
              }}
              className={`w-full ${
                selectedTheme === "notebook"
                  ? "rounded-2xl border-2 border-red-400 text-red-500 px-4 py-3 text-sm font-semibold transition-all hover:bg-red-500 hover:text-white"
                  : "rounded-2xl border border-red-500/50 text-red-400 px-4 py-3 text-sm font-semibold transition-colors hover:bg-red-500 hover:text-white hover:border-red-500"
              }`}
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}