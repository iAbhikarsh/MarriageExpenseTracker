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
2. Run the app and create an account for each approved email address. In **Authentication → Users**, copy each account's UID.
3. Replace `REPLACE_WITH_FIRST_ALLOWED_UID` in `firestore.rules` with the first UID. Add any other approved UIDs as comma-separated quoted entries in the list.
4. In **Firestore Database → Rules**, merge all four `marriage_*` match blocks and helper from `firestore.rules` into the existing rules, replacing only matching marriage rules if present. Do not replace the House Expense Tracker's rules. Check that no broader matching rule grants public access to these collections, since matching Firestore allows combine permissively.
5. Publish the rules. Sign in to the app again; it will create `marriage_users/{uid}` with the account email as username, the default category documents, `marriage_settings/budget`, and `marriage_expenses/_metadata` on first successful access.

Firebase Authentication securely manages email/password credentials; the app never stores passwords in Firestore. `marriage_users` stores only the allowlisted user's email/username and creation timestamp, keyed by Firebase UID. The rules template grants access only to listed Firebase UIDs. Do not publish the app with the placeholder UID. Email/password sign-in avoids SMS verification charges. Firebase services still have free-tier usage limits; usage beyond those limits or enabling a paid billing plan may incur charges. The two apps use separate collections but share the Firebase project and its billing/quota.