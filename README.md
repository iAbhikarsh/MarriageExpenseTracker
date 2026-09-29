# Marriage Expense Tracker

This is a standalone GitHub Pages app. It uses the existing Firebase project, but stores marriage data in separate Firestore collections: `marriage_expenses`, `marriage_categories`, and `marriage_settings`. It does not read or write the House Expense Tracker's `expenses` collection.

## Publish at the requested URL

1. Create a **public** GitHub repository named `MarriageExpenseTracker` under `iAbhikarsh`. Do not rename or change the existing `HouseExpenseTracker` repository. Put the app files at the repository root.
2. In the MarriageExpenseTracker repository, open **Settings → Secrets and variables → Actions** and add repository secrets named `APIKEY`, `AUTHDOMAIN`, `PROJECTID`, `STORAGEBUCKET`, `MESSAGINGSENDERID`, and `APPID`. Use the values from the Firebase web app configuration. Secrets from the HouseExpenseTracker repository are not automatically shared.
3. Open **Settings → Pages** and set the source to **GitHub Actions**.
4. Push these files to the `main` branch, or run **Actions → Deploy to GitHub Pages → Run workflow**. The deployed URL will be:

https://iabhikarsh.github.io/MarriageExpenseTracker

On first load, the app creates its default category documents, a budget document, and an expense metadata document. Expense records and custom categories are then saved in Firestore and shared across devices.

The local `firebase-config.js` is ignored by Git; the workflow creates it from repository secrets during deployment. Because the browser needs this configuration, the generated values will still be visible to site visitors.

## Enable sign-in and Firestore access

1. In Firebase Console, open **Authentication → Sign-in method** and enable **Email/Password**. Add `localhost` and `iabhikarsh.github.io` under **Settings → Authorized domains**.
2. Each approved person creates an account in the app and verifies their email from the verification link. In **Authentication → Users**, copy each user's UID.
3. In **Firestore Data**, create a `marriage_users` document whose document ID is that user's UID. Add `email` (matching the verified Auth email), `username` (the same email), `role` (`editor` or `reader`), and `createdAt` (timestamp). Assign `editor` only to the two designated accounts; assign `reader` to other approved accounts. Users cannot create or change their own role profile.
4. In **Firestore Database → Rules**, publish the complete contents of `firestore.rules` for the Marriage Expense Tracker project's `(default)` database. These rules grant access only to verified users with a provisioned profile. Readers can read tracker collections; editors can read and write. They do not grant access to other collections.
5. Sign out and back in after provisioning. The first editor login seeds default categories, `marriage_settings/budget`, and `marriage_expenses/_metadata`; reader logins do not write setup data.

Editors can add one planned amount per category from the **Plan** page. These records are stored in `marriage_plans` and are compared with actual category expense totals in the Overview line chart. Make sure the published Firestore rules include the `marriage_plans` match block before using the feature.

Firebase Authentication securely manages email/password credentials; the app never stores passwords in Firestore. `marriage_users` stores the verified email, username, role, and creation timestamp, keyed by Firebase UID. Profile documents and roles must be provisioned in Firebase Console; the app cannot change them. Email/password sign-in avoids SMS verification charges. Firebase services still have free-tier usage limits; usage beyond those limits or enabling a paid billing plan may incur charges. The two apps use separate collections but share the Firebase project and its billing/quota.