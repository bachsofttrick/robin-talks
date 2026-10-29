const PAGE_STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 48px 24px;
    background: #fbfbfa; color: #4a4a46;
    font: 400 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 27px; line-height: 1.25; letter-spacing: -0.02em; color: #1c1c19; margin: 0; }
  .subtitle { margin: 6px 0 0; font-size: 13px; color: #8a8a83; }
  h2 { font-size: 16px; color: #1c1c19; margin: 32px 0 6px; }
  p, li { margin: 0 0 10px; }
  ul { margin: 0 0 10px; padding-left: 22px; }
  a { color: #5b53d4; }
  footer { margin-top: 44px; padding-top: 20px; border-top: 1px solid #e7e7e2; font-size: 12.5px; color: #8a8a83; }
  @media (prefers-color-scheme: dark) {
    body { background: #131312; color: #a9a9a2; }
    h1, h2 { color: #f2f2ee; }
    a { color: #9d95ff; }
    footer { border-top-color: #2b2b28; }
  }
`;

function page(title: string, description: string, content: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | Robin Talks</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index, follow">
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p class="subtitle">Robin Talks · Effective October 10, 2026</p>
    ${content}
    <footer>Robin Talks is published and operated by the developer identified on the app’s store listing.</footer>
  </main>
</body>
</html>`;
}

export const PRIVACY_POLICY_HTML = page(
  "Robin Talks Privacy Policy",
  "How Robin Talks collects, uses, and protects information when you use the mobile app.",
  `
    <h2>Who is responsible</h2>
    <p>Robin Talks is published and operated by the developer identified on the app store listing where you downloaded it. In this policy, “we” means that developer. This policy covers the Robin Talks mobile app and related account and practice services.</p>

    <h2>Information we collect</h2>
    <ul>
      <li><strong>Account information:</strong> your email address, account identifier, display name, and authentication and session records. Session records may include your IP address and device or browser user-agent information.</li>
      <li><strong>Practice profile:</strong> the name Robin uses for you and the English level you select.</li>
      <li><strong>Practice content:</strong> the scenario you choose, text you enter, the conversation transcript, Robin’s replies, session summaries and debriefs, and notes Robin saves as memory for future practice.</li>
      <li><strong>Voice recordings:</strong> when you choose voice practice, the app records audio after you grant microphone permission and send your turn. The recording is sent for speech-to-text transcription. Robin Talks does not save the recording as session history; the resulting transcript may be saved with your session.</li>
      <li><strong>Device preferences:</strong> the app keeps limited settings on your device, including your practice profile and whether you have allowed a particular AI feature to send content.</li>
    </ul>

    <h2>How AI features use your content</h2>
    <p>Before an AI feature first sends content from your device, Robin Talks asks for your permission. If you decline, that request is not sent. You can keep using text practice instead of voice practice.</p>
    <p>For Robin’s conversation and coaching, the app sends your messages and relevant practice context, such as your selected level, display name, saved memory, and recent practice notes, to OpenRouter.ai for processing by an OpenAI model. For voice transcription, the audio recording is sent through OpenRouter.ai to Google Gemini. These services process the content to provide the requested AI feature under their own terms and privacy practices. Avoid including sensitive information in a conversation.</p>
    <p>AI-generated replies, corrections, summaries, and transcriptions can be inaccurate. Review them before relying on them.</p>

    <h2>How we use information</h2>
    <p>We use information to create and secure your account, provide English practice, continue an unfinished session, prepare debriefs, keep your practice memory, respond to support requests, and maintain and protect the service. We do not sell personal information or use it for cross-app targeted advertising.</p>

    <h2>When information is shared</h2>
    <p>We share information with service providers that help operate the app, including our account and database hosting, email delivery, and AI processing providers. They receive information needed for their service, such as an email address to deliver a verification or password-reset code, or practice content to generate an answer or transcript. We may also disclose information when required by law or when reasonably necessary to protect users, the service, or our legal rights.</p>
    <p>Service providers may process information in countries other than the country where you live. Their own privacy notices describe their processing and retention practices.</p>

    <h2>Storage and retention</h2>
    <p>Account details, your practice profile, transcripts, debriefs, and memory are stored with the app’s account and data services so you can use them in later sessions. We keep account information and saved practice data while your account remains active, unless a longer period is required for legal or security purposes.</p>
    <p>You can delete all sessions or all memory in Settings. You can delete your account from the account controls in the app; account deletion removes the account and its associated app data from active service records. Service providers may retain limited copies where required by law or under their own backup and security processes.</p>

    <h2>Your choices and requests</h2>
    <p>You can deny microphone access in your device settings, decline an AI sharing request, delete sessions or memory in Settings, and delete your account in the app. You may contact the developer through the contact details on the store listing where you downloaded Robin Talks to request access to, correction of, or deletion of personal information, or to ask a privacy question. You may also have the right to complain to your local data protection authority.</p>

    <h2>Children</h2>
    <p>Robin Talks is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided personal information, contact the developer through the app’s store listing so it can be reviewed and deleted.</p>

    <h2>Security</h2>
    <p>We use reasonable administrative and technical measures to protect information. No method of storage or transmission can be guaranteed completely secure.</p>

    <h2>Changes to this policy</h2>
    <p>We may update this policy as Robin Talks changes. We will publish the updated policy here and revise its effective date. If a change materially affects how information is used, we will provide notice in the app or through another appropriate channel.</p>

    <h2>Contact</h2>
    <p>For questions or requests about this policy, contact the developer using the contact information on the app store listing where you downloaded Robin Talks.</p>
  `,
);

export const TERMS_OF_SERVICE_HTML = page(
  "Robin Talks Terms of Service",
  "Terms for using the Robin Talks mobile English speaking practice app.",
  `
    <h2>Agreement</h2>
    <p>These Terms of Service govern your use of Robin Talks, an English-speaking practice app. By creating an account or using the app, you agree to these Terms and the Robin Talks Privacy Policy. If you do not agree, do not use the app.</p>

    <h2>Who may use Robin Talks</h2>
    <p>You must be at least 13 years old, or the minimum age required to use an online service where you live if that age is higher. If you are below the age of legal majority where you live, your parent or legal guardian must permit your use and accept these Terms on your behalf.</p>

    <h2>Your account</h2>
    <p>Some features require an account. You agree to provide an email address you control, keep your sign-in credentials secure, and use your account yourself. You are responsible for activity under your account and should tell us promptly if you believe someone has accessed it without permission.</p>
    <p>You may stop using Robin Talks at any time. You can delete your account in the app’s account controls. Deleting your account removes your account and its associated practice data from active service records and cannot be undone.</p>

    <h2>Using the app</h2>
    <p>Robin Talks provides simulated English conversations, speech transcription, coaching, session summaries, and practice memory. You may use the app for personal, non-commercial English-language practice under a limited, revocable, non-transferable license while you comply with these Terms.</p>
    <p>You agree not to use Robin Talks to break the law, infringe another person’s rights, interfere with the service, probe or bypass its security, distribute malware, or submit content that you do not have permission to use.</p>

    <h2>Your content and AI processing</h2>
    <p>You retain any rights you have in the text and other content you submit. You give us permission to host, transmit, and process that content only as reasonably necessary to provide, secure, and support Robin Talks. When you request an AI feature and grant the in-app permission, your practice content may be sent to OpenRouter.ai and its named AI provider to generate a response or transcript, as described in the Privacy Policy.</p>
    <p>Do not submit confidential or sensitive information that you do not want processed by the app’s service providers.</p>

    <h2>AI and learning content</h2>
    <p>Robin Talks is a language-practice tool, not a teacher, interpreter, or professional adviser. AI-generated conversation, corrections, feedback, summaries, and transcriptions may be incomplete or wrong. You are responsible for deciding whether a suggestion is appropriate. Do not rely on the app for medical, legal, financial, emergency, or other consequential decisions.</p>

    <h2>Ownership</h2>
    <p>Robin Talks and its software, design, branding, and materials are owned by the developer or its licensors and are protected by applicable intellectual-property laws. These Terms give you permission to use the app; they do not transfer ownership to you.</p>

    <h2>Availability and changes</h2>
    <p>We may update, suspend, or discontinue features to maintain or improve Robin Talks, comply with law, or address security or operational needs. We do not promise uninterrupted availability. We will provide notice when a change materially affects your use, where reasonably practical.</p>

    <h2>Disclaimer</h2>
    <p>To the extent permitted by law, Robin Talks is provided “as is” and “as available,” without warranties that the app will be uninterrupted, error-free, or suitable for a particular purpose. These Terms do not limit consumer rights or warranties that cannot lawfully be excluded where you live.</p>

    <h2>Limits on liability</h2>
    <p>To the extent permitted by law, the developer is not liable for indirect, incidental, special, consequential, or punitive loss, or for loss of data, profits, or goodwill arising from your use of Robin Talks. Nothing in these Terms excludes liability that cannot lawfully be excluded or limited.</p>

    <h2>Ending or changing these Terms</h2>
    <p>We may suspend or end access if you materially violate these Terms, create a risk to users or the service, or if we must do so by law. We may update these Terms by publishing a revised version here and changing the effective date. If you continue using Robin Talks after an update takes effect, you accept the revised Terms to the extent allowed by law.</p>

    <h2>Applicable law and consumer rights</h2>
    <p>These Terms are subject to the laws that apply to your use of Robin Talks, without removing any mandatory consumer protections available where you live.</p>

    <h2>Contact</h2>
    <p>For questions about these Terms, contact the developer using the contact information on the app store listing where you downloaded Robin Talks.</p>
  `,
);

export const ACCOUNT_DELETION_HTML = page(
  "Robin Talks Account Deletion",
  "How to request deletion of your Robin Talks account.",
  `
    <h2>Delete your account</h2>
    <p>To request deletion of your Robin Talks account, email <a href="mailto:support@lesteuai.com">support@lesteuai.com</a>.</p>
  `,
);
