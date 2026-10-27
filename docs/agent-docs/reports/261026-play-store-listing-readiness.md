# Google Play app information and store listing readiness

**App:** Robin Talks  
**Reviewed:** 2026-10-26  
**Scope:** Google Play Console dashboard section “Provide app information and create your store listing,” compared with the repository’s current app behavior and assets.

## Summary

The app has a clear English-practice use case and includes an in-app privacy-policy link and a public privacy-policy page implementation. The Google Play setup section is still **0 of 11 tasks complete**. The store listing editor has the app name “Robin Talks,” but its short and full descriptions are empty, and the required listing graphics/screenshots have not been added. Complete the declarations and listing materials in Play Console before moving to closed testing.

“Implemented” below describes evidence in the repository. It does not mean a Play Console declaration has been submitted or approved.

## Section-by-section assessment

| Play Console task | App evidence and assessment | Readiness |
|---|---|---|
| **Set privacy policy** | A detailed policy is implemented at `apps/backend/src/routes/legal/legal-pages.ts`, including account/profile data, practice transcripts and debriefs, voice transcription, AI providers, retention, deletion, and children. The app renders the policy link from `apps/mobile/src/lib/core/legalLinks.tsx` (described in `docs/agent-docs/conventions.md`). Play Console requires a policy URL on the listing and within the app. The policy URL field was blank when inspected, and a working deployed backend URL was not verified. Add and test the public URL before submission. | **Partial; Console field missing** |
| **Sign in details** | Account sign-in is required to practice. The app has account sign-in flows, and the backend uses email OTP confirmation (`docs/agent-docs/architecture.md`; `docs/agent-docs/directory-map.md`). Play Console explicitly asks for usable review access when any feature is restricted. Add working reviewer credentials and instructions for any OTP/verification step. Do not rely on reviewers creating an account themselves. | **Required; reviewer access not supplied** |
| **Ads** | No ad-serving feature or ad SDK was identified in the app flows reviewed. If the production build also contains no ads, declare that the app does not contain ads. Confirm the release build and any remotely configured content before submitting. | **Likely satisfies; verify production build and declare** |
| **Content rating** | Robin Talks provides simulated English conversations, speech transcription, coaching, and session summaries (`README.md`, `apps/backend/src/routes/legal/legal-pages.ts`). The content-rating questionnaire has not been completed. Answer it based on all shipped scenarios and any generated content, including the pharmacy scenario; do not infer a rating from the app category alone. | **Incomplete; questionnaire required** |
| **Target audience** | The privacy policy says the app is not directed to children under 13 (`apps/backend/src/routes/legal/legal-pages.ts`). The product is an English-speaking practice app. Select audience age groups that match the actual intended users and marketing, and complete any resulting Families-policy requirements. The Console declaration is not complete. | **Incomplete; likely 13+ if that matches intended audience** |
| **Data safety** | The app transmits account email/identifier and learner profile data, and stores practice transcripts, summaries/debriefs, and memory in backend services (`docs/agent-docs/architecture.md`; `apps/backend/src/routes/legal/legal-pages.ts`). Voice recordings are sent for transcription; raw audio is not retained as session history, while transcripts may be saved. Practice messages/context go to OpenRouter for processing by an OpenAI model, and audio goes through OpenRouter to Google Gemini (privacy policy). This is data collection/sharing that must be accurately represented in the questionnaire, including relevant data types, purposes, service providers, and deletion controls. The policy also says users can delete sessions, memory, and accounts. The questionnaire is currently at its overview and has not been submitted. | **Incomplete; detailed disclosure required** |
| **Government apps** | The product described in the repository is a consumer English-practice app. No government purpose or government affiliation was identified. Declare accordingly if that remains true for the published app and its branding. | **Likely satisfies; declare** |
| **Financial features** | The user-facing product reviewed is English-language practice, not a financial service or financial advice product. A Borel-managed bridge contains purchase-related implementation (`apps/mobile/src/lib/core/borel/borel-systemui.js`), so verify whether any in-app products or paid access are exposed in the production build before answering. If products are offered, ensure the declaration and listing accurately cover them. | **Needs production-build check before declaration** |
| **Health** | The app is not presented as a health product. A built-in pharmacy conversation scenario is for language practice; policy terms warn users not to rely on the app for medical decisions. Declare based on the app’s actual features and generated content, and avoid describing it as medical guidance. | **Likely satisfies; declare** |
| **Select an app category and provide contact details** | The app’s core purpose is English speaking practice, making **Education** the best-fit category to assess in Console. The listing also needs valid developer contact details. This declaration/task is not complete, and no confirmed public support contact was found in the reviewed listing or app metadata. | **Incomplete; choose category and provide contact** |
| **Set up your store listing** | The Console editor showed “Robin Talks” as the app name, but the short description (0/80) and full description (0/4000) were empty. It showed no uploaded app icon, feature graphic, or phone screenshots. A project icon exists at `apps/mobile/assets/icon.png` and is a 512×512 PNG, which matches the Console’s stated icon dimensions; it still needs to be uploaded in the listing. The repository contains no phone screenshots or feature graphic in `apps/mobile/assets/`. Console asks for 2–8 phone screenshots and a feature graphic in addition to the icon. | **Incomplete; listing assets and descriptions required** |

## Recommended completion order

1. Publish and verify the privacy-policy URL, then enter it in Play Console.
2. Provide reviewer sign-in instructions and a review account that handles the email verification flow.
3. Finish the ads, content rating, target audience, data safety, government, financial, and health declarations. Check the built production app for any purchase UI/products before answering the financial declaration.
4. Set the Education category and developer contact details.
5. Write the short and full descriptions; upload the 512×512 icon, feature graphic, and at least two phone screenshots.
6. Recheck the dashboard until it reports all 11 tasks complete.

## Evidence reviewed

- Google Play Console dashboard, “Provide app information and create your store listing”: **0 of 11 completed**.
- Privacy Policy task: URL field empty; Console states that a privacy policy must be linked on the listing and within the app.
- Sign in details task: Console indicates review access details are required for restricted app content/features.
- Data safety task: questionnaire overview states that collected/shared data and applicable SDK/service-provider transfers must be disclosed.
- Default store listing editor: name present; short/full descriptions empty; icon, feature graphic, and phone screenshots not uploaded.
- Repository documentation: `README.md`, `docs/agent-docs/architecture.md`, `docs/agent-docs/conventions.md`, and `docs/agent-docs/screens-and-navigation.md`.
- Implementation and assets: `apps/backend/src/routes/legal/legal-pages.ts`, `apps/mobile/app.json`, `apps/mobile/assets/icon.png`, `apps/mobile/src/screens/Session/index.tsx`, and `apps/mobile/src/lib/core/borel/borel-systemui.js`.

## Limits of this assessment

This is a readiness review, not a policy approval or final data-safety legal determination. The report uses repository evidence and the Console state visible during review. It does not validate the deployed privacy URL, inspect a signed production binary, verify remotely configured features, or submit any Console answers.
