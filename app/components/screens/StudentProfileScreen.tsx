// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabaseClient';
import { validateInput, validateEmail, validatePassword, validateProfileData, validateMessage } from '../../utils/validation';
import { formatBB, getConnectionSortPriority, toTitleCase } from '../../utils/formatting';
import { GAME_CONFIG } from '../../gameConfig';
import ConfirmModal from '../ConfirmModal';

export default function StudentProfileScreen(p: Record<string, any>) {
  const { auth, creatingAccount, goBack, handleOAuthSignIn, oauthLoading, screen, seatedRole, selectedTheme, setCreatingAccount, setScreen, setSeatedRole, setShowPassword, setStudentProfile, showPassword, studentProfile } = p;

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

      <div className={`w-full max-w-md relative z-10 ${selectedTheme === "default" ? "animate-slide-up" : ""}`}>
        <h1 className={`mb-6 text-center font-bold ${
          selectedTheme === "notebook"
            ? "text-4xl font-permanent-marker text-[#1e40af] transform -rotate-1"
            : "text-3xl text-white tracking-tight"
        }`}>
          {selectedTheme === "notebook" && (
            <span className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-3 bg-yellow-200 opacity-40 -rotate-1 -z-10"></span>
          )}
          Sign up
        </h1>

        <div className="flex flex-col gap-3 mb-4">
          <button
            type="button"
            disabled={oauthLoading}
            onClick={() => handleOAuthSignIn('google')}
            className={`flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              selectedTheme === "notebook"
                ? "font-caveat text-lg text-gray-700 hover:bg-blue-50"
                : "rounded-2xl border border-white/40 text-white hover:bg-white hover:text-black"
            }`}
            style={selectedTheme === "notebook" ? {
              border: '2px solid #9ca3af',
              borderRadius: '8px 12px 10px 14px',
            } : {}}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill={selectedTheme === "notebook" ? "#4285F4" : "currentColor"} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill={selectedTheme === "notebook" ? "#34A853" : "currentColor"} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill={selectedTheme === "notebook" ? "#FBBC05" : "currentColor"} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill={selectedTheme === "notebook" ? "#EA4335" : "currentColor"} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {oauthLoading ? 'Redirecting...' : 'Continue with Google'}
          </button>

          <button
            type="button"
            disabled={oauthLoading}
            onClick={() => handleOAuthSignIn('linkedin_oidc')}
            className={`flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              selectedTheme === "notebook"
                ? "font-caveat text-lg text-gray-700 hover:bg-blue-50"
                : "rounded-2xl border border-white/40 text-white hover:bg-white hover:text-black"
            }`}
            style={selectedTheme === "notebook" ? {
              border: '2px solid #9ca3af',
              borderRadius: '8px 12px 10px 14px',
            } : {}}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill={selectedTheme === "notebook" ? "#0A66C2" : "currentColor"}>
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            {oauthLoading ? 'Redirecting...' : 'Continue with LinkedIn'}
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className={`flex-1 h-px ${selectedTheme === "notebook" ? "bg-gray-300" : "bg-white/20"}`}></div>
          <span className={`text-xs ${selectedTheme === "notebook" ? "font-caveat text-sm text-gray-400" : "text-white/40"}`}>or sign up with email</span>
          <div className={`flex-1 h-px ${selectedTheme === "notebook" ? "bg-gray-300" : "bg-white/20"}`}></div>
        </div>

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
    borderRadius: '10px 8px 14px 10px',
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

          <input
  type="email"
  placeholder="Email"
  value={studentProfile.email}
  onChange={(e) =>
    setStudentProfile({ ...studentProfile, email: e.target.value })
  }
  className="rounded-xl border border-white px-4 py-3 text-sm text-white placeholder:text-white/50 bg-transparent"
/>

<div className="relative">
  <input
    type={showPassword ? "text" : "password"}
    placeholder="Password"
    value={studentProfile.password}
    onChange={(e) =>
      setStudentProfile({ ...studentProfile, password: e.target.value })
    }
    className="w-full rounded-xl border border-white px-4 py-3 text-sm pr-12 text-white placeholder:text-white/50 bg-transparent"
  />
  <button
    type="button"
    onClick={() => setShowPassword(!showPassword)}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/60 hover:text-white"
  >
    {showPassword ? "Hide" : "Show"}
  </button>
</div>

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
  disabled={creatingAccount || !seatedRole || !studentProfile.email || !studentProfile.password || !studentProfile.firstName || !studentProfile.lastName}
  onClick={async () => {
    setCreatingAccount(true);
    
    // === EMAIL VALIDATION ===
    const emailValidation = validateEmail(studentProfile.email);
    if (!emailValidation.valid) {
      alert(emailValidation.error);
      recordRateLimitAttempt('SIGNUP');
      setCreatingAccount(false);
      return;
    }
    
    // === PASSWORD VALIDATION ===
    const passwordValidation = validatePassword(studentProfile.password);
    if (!passwordValidation.valid) {
      alert(passwordValidation.errors[0]);
      recordRateLimitAttempt('SIGNUP');
      setCreatingAccount(false);
      return;
    }
    
    // === PROFILE VALIDATION (schema-based, rejects unexpected fields) ===
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
      recordRateLimitAttempt('SIGNUP');
      setCreatingAccount(false);
      return;
    }
    
    // Record attempt before API call
    recordRateLimitAttempt('SIGNUP');
    
    try {
      const sanitizedProfile = profileValidation.sanitized;
      
      // Create auth user (no email verification required)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailValidation.sanitized,
        password: studentProfile.password,
      });
      
      if (authError) {
        alert('Sign up failed: ' + authError.message);
        setCreatingAccount(false);
        return;
      }
      
      if (!authData.user) {
        alert('Sign up failed. Please try again.');
        setCreatingAccount(false);
        return;
      }
      
      // Create profile immediately (no email verification wait)
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: emailValidation.sanitized,
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

      alert("Profile created successfully.");
      
      // Success - reset rate limit and update state
      resetRateLimit('SIGNUP');

      // Keep user signed in with their profile info
      setStudentProfile({
        firstName: toTitleCase(sanitizedProfile.firstName),
        lastName: toTitleCase(sanitizedProfile.lastName),
        email: emailValidation.sanitized,
        password: '',
        year: seatedRole === 'student' ? sanitizedProfile.year : '',
        major: seatedRole === 'student' ? toTitleCase(sanitizedProfile.major) : '',
        school: sanitizedProfile.school || '',
        company: seatedRole === 'professional' ? sanitizedProfile.company : '',
        workTitle: seatedRole === 'professional' ? sanitizedProfile.workTitle : '',
        linkedinUrl: sanitizedProfile.linkedinUrl || '',
      });
      
      // Navigate to title screen (user is now signed in)
      setScreen("role");
      
    } catch (e) {
      alert('Sign up failed. Please try again.');
    } finally {
      setCreatingAccount(false);
    }
  }}

  className={`mt-4 rounded-2xl border border-white text-white px-4 py-3 text-sm font-semibold transition-colors ${
    !creatingAccount && seatedRole && studentProfile.email && studentProfile.password && studentProfile.firstName && studentProfile.lastName ? "hover:bg-gray-50 hover:text-black" : "opacity-50 cursor-not-allowed"
  }`}
>
  {creatingAccount ? "Creating account..." : "Continue"}
</button>

          <button
            type="button"
            disabled={creatingAccount}
            onClick={() => {
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
              goBack();
            }}
            className={`rounded-2xl border border-white text-white px-4 py-3 text-sm font-semibold transition-colors ${creatingAccount ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 hover:text-black"}`}
          >
            Go back
          </button>
        </div>
</fieldset>
      </div>
    </main>
  );
}