# ISS Mobile PWA, first iteration

This is a separate phone only mobile companion for ISS.

## Included

1. Login through Supabase Auth
2. Phone portrait layout guard
3. Installable PWA setup
4. Student Search
5. My Loads
6. Simple grade encoding for T1, T2, and T3
7. My Advisory list
8. Simple adviser profile editing
9. PL Monitoring subject cards

## Before publishing

Open `config.js` and replace the placeholders:

```js
window.ISS_MOBILE_CONFIG = {
    supabaseUrl: "PASTE_SUPABASE_URL_HERE",
    supabaseAnonKey: "PASTE_SUPABASE_ANON_KEY_HERE",
    passwordResetUrl: "https://rhiemarjade.github.io/iss-password-reset/"
};
```

Use only the Supabase anon key. Do not place the service role key in this project.

## GitHub Pages setup

Upload these files to a new repository, then enable GitHub Pages from the repository settings. Use the root folder as the Pages source.

## Phone only behavior

The app opens only on phone sized portrait screens. On wider screens or landscape mode, it shows a phone only message.

## Notes

This version is intentionally minimal. It does not include SF9, SF10, Excel export, bulk reports, or desktop workflows.
