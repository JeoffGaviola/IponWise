import { ArrowLeft, Mail, PiggyBank } from 'lucide-react';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@iponwise.app';

const CONTENT = {
  terms: {
    title: 'Terms of Service',
    updated: 'October 10, 2026',
    sections: [
      ['Account responsibilities', 'You are responsible for keeping your account credentials private and for the activity recorded under your account. Provide accurate information and notify IponWise if you believe your account has been accessed without permission.'],
      ['Proper use', 'Use IponWise only for lawful personal record-keeping. Do not attempt to probe, disrupt, reverse engineer, overload, or gain unauthorized access to the application, its APIs, or another person’s records.'],
      ['Financial records and limitations', 'IponWise stores the deposits, withdrawals, goals, and reminders that you enter. It does not connect to bank accounts, verify balances, process payments, or provide financial, tax, or investment advice. Review records before relying on them.'],
      ['Data management', 'You may update your profile and delete records through the application where those controls are available. Account and data deletion requests can be sent to the support address below.'],
      ['Availability and changes', 'The service may change or be temporarily unavailable for maintenance, security, or provider outages. We may update these terms when the service or applicable requirements change.'],
      ['Contact', `Questions about these terms can be sent to ${SUPPORT_EMAIL}.`],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: 'October 10, 2026',
    sections: [
      ['Information we process', 'IponWise processes your email address and authentication metadata, profile preferences, profile images you upload, and the savings records, goals, and reminders you choose to store.'],
      ['How information is used', 'We use this information to authenticate you, display your profile, save and calculate your records, provide reports and reminders, protect the service, and respond to support requests.'],
      ['Supabase and storage', 'Authentication and PostgreSQL data are hosted with Supabase. Profile images are normalized by the FastAPI service and stored in a private Supabase Storage bucket. The database stores an ownership-scoped object path; the application creates short-lived signed URLs for display.'],
      ['Sharing and security', 'IponWise does not sell personal information. Data is shared with service providers only as needed to operate authentication, database, storage, hosting, and error-free delivery. Access tokens are verified server-side, ownership is enforced in database queries, and service-role credentials remain on the backend.'],
      ['Retention and deletion', 'Records are retained while your account is active or as needed to provide the service and meet legal or security obligations. You can remove profile images and request account data deletion by contacting support. Deletion may require reasonable verification.'],
      ['Privacy requests and contact', `For access, correction, deletion, or privacy questions, contact ${SUPPORT_EMAIL}.`],
    ],
  },
};

export default function LegalPage({ type = 'privacy' }) {
  const content = CONTENT[type] || CONTENT.privacy;
  return (
    <main className="legal-page">
      <header className="legal-header">
        <a className="legal-brand" href="/"><span className="legal-brand-mark"><PiggyBank size={21} /></span><strong>Ipon<span>Wise</span></strong></a>
        <a className="btn btn-secondary btn-md legal-back" href="/"><ArrowLeft size={16} /> Back to IponWise</a>
      </header>
      <article className="legal-card">
        <p className="eyebrow">IPONWISE</p>
        <h1>{content.title}</h1>
        <p className="legal-updated">Last updated: {content.updated}</p>
        {content.sections.map(([heading, body]) => <section key={heading}><h2>{heading}</h2><p>{body}</p></section>)}
        <a className="legal-contact" href={`mailto:${SUPPORT_EMAIL}`}><Mail size={16} /> Contact support</a>
      </article>
    </main>
  );
}
