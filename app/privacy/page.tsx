export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-white/60 mb-8">Last updated: February 1, 2025</p>

        <section className="space-y-6 text-white/80 leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">1. Introduction</h2>
            <p>
              HeadsUp (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates headsupnetwork.com. This Privacy Policy explains how we collect, use, and protect your information when you use our platform.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">2. Information We Collect</h2>
            <p className="mb-2">When you create an account, we collect:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Name and email address</li>
              <li>Role (student or professional)</li>
              <li>School, major, year, company, and work title (as provided)</li>
              <li>LinkedIn profile URL (optional)</li>
            </ul>
            <p className="mt-2">
              If you sign in with Google or LinkedIn, we receive your name and email from those services. We do not receive or store your passwords from third-party providers.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>To create and manage your account</li>
              <li>To display your profile to other users for networking purposes</li>
              <li>To facilitate connection requests between users</li>
              <li>To enable multiplayer gameplay and video calls</li>
              <li>To send connection request notifications via email</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">4. Third-Party Services</h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li><strong>Supabase</strong> &ndash; authentication and database hosting</li>
              <li><strong>Google Sign-In</strong> &ndash; optional authentication</li>
              <li><strong>LinkedIn Sign-In</strong> &ndash; optional authentication</li>
              <li><strong>Daily.co</strong> &ndash; video call functionality</li>
              <li><strong>SendGrid</strong> &ndash; email delivery for connection requests</li>
              <li><strong>Vercel</strong> &ndash; application hosting</li>
            </ul>
            <p className="mt-2">Each service has its own privacy policy governing how they handle data.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">5. Data Sharing</h2>
            <p>
              We do not sell your personal information. Your profile information (name, school, company, role) is visible to other registered users for networking purposes. We only share your email address when you initiate or receive a connection request.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">6. Data Security</h2>
            <p>
              We use industry-standard security measures including encrypted connections (HTTPS), secure authentication, and row-level security on our database to keep your data safe.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">7. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. You can delete your account and all associated data at any time from your profile settings.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">8. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Withdraw consent for data processing</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">9. Contact</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at josephklwork@gmail.com.
            </p>
          </div>
        </section>

        <div className="mt-12 pt-6 border-t border-white/10">
          <a href="/" className="text-white/60 hover:text-white transition-colors">&larr; Back to HeadsUp</a>
        </div>
      </div>
    </main>
  );
}
