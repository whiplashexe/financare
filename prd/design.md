# Financare: Design Prompt

Companion to [`user_flow.md`](./user_flow.md), [`endpoint.md`](./endpoint.md), and [`erd.md`](./erd.md). This file holds the prompts for **FigCraft** (connected to Claude), which builds the design directly in Figma, plus the design system the prompts refer to.

FigCraft acts on a real Figma file, so the order matters: foundations first (variables), then components, then screens. Screens must use the variables and components, never raw values.

How to use it:
1. Open (or create) a Figma file named "Financare" and make sure FigCraft is connected to it.
2. Run **Phase 0** (Section 1): file setup, variables, and text styles.
3. Run **Phase 1** (Section 2): the component library.
4. Run the **screen prompts** (Section 4) one at a time, in order. Each one starts from the Master Context (Section 3), which you paste once at the start of the session.
5. After each phase, run the **review prompt** (Section 6).
6. Section 5 is the token reference; it is the source of truth when you build the real React Native components.

Note: the prompts describe intent in Figma terms (variables, components, auto layout) and do not name FigCraft's individual tools, so FigCraft can pick whichever of its tools fits.

---

## 1. Phase 0: File Setup, Variables, Text Styles

```text
Set up the Figma file "Financare" as a design system foundation. Do not draw any
screens yet.

PAGES (in this order)
Cover, Foundations, Components, 01 Auth, 02 Dashboard, 03 Transactions,
04 Templates, 05 Accounts, 06 Plans, 07 Reports, 08 Profile.

VARIABLES (create as Figma variables, collection "Tokens", mode "Light")
Color (stone theme, semantic names):
- background #FFFFFF, foreground #0C0A09
- card #FFFFFF, border #E7E5E4, input #E7E5E4
- muted #F5F5F4, muted-foreground #78716C
- primary #1C1917, primary-foreground #FAFAF9
- secondary #F5F5F4, secondary-foreground #1C1917
- ring #A8A29E
- income #059669, warning #D97706, destructive #DC2626
Number:
- radius-sm 4, radius-md 8, radius-lg 12, radius-full 999
- space-1 4, space-2 8, space-3 12, space-4 16, space-6 24, space-8 32
- screen-padding 16, touch-target 44

TEXT STYLES (system font, Inter if available)
title 24/semibold, section 16/semibold, body 14/regular, body-strong 14/semibold,
caption 12/regular, balance 32/semibold with tabular numbers.

FOUNDATIONS PAGE
Lay out swatches for every color variable with its name and hex, the type scale,
the spacing scale, and the radii. Name everything exactly as above.

RULES
- No hardcoded colors, sizes, or radii from now on; always bind to variables
  and text styles.
- Layers use clear names (Button/Default, Card/Account, Row/Transaction).
```

---

## 2. Phase 1: Component Library

```text
On the Components page, build the component library in the style of React Native
Reusables (shadcn/ui for React Native), using only the variables and text styles
from Foundations. Use auto layout everywhere, and create real components with
variants and properties, not loose frames.

COMPONENTS
- Button: variants default, secondary, outline, ghost, destructive, icon; sizes
  default and sm; states default, pressed, disabled, loading. Height 44.
- Input, Textarea (states default, focus, error, disabled) with Label and helper
  or error text. Amount Input variant with large number text.
- Select, Switch, Checkbox, Segmented control (Tabs).
- Badge: default, secondary, outline, income, warning.
- Card with header, content, footer slots.
- Avatar/Icon tile for categories and account types (Lucide icons, 20px).
- Progress bar (default and warning).
- Alert (default and warning) and Toast.
- Dialog and AlertDialog, and a bottom sheet styled like Dialog.
- Dropdown menu item, Separator, Skeleton.
- Money: variants shown and hidden ("Rp ••••••"), sizes balance, body, caption;
  tones income (+), outcome (-), transfer (neutral).
- Row/Transaction (category icon, name, account and time, Money, photo count),
  with variants income, outcome, transfer ("BRI → Cash", swap icon), auto
  (shows "Otomatis" badge).
- Card/Account (type icon, name, institution, last 4, Money, archived variant).
- Card/Reminder (title, due, funding status, three action buttons).
- Chip (template chip, filter chip; selected and unselected).
- Bottom tab bar with 5 tabs (Dashboard, Transactions, Plans, Reports, Profile),
  active and inactive states, and the floating "+" button.
- Header (title, back, trailing action) and Empty state (icon, title, text, button).
- Photo strip with 5 slots (empty, uploading with progress, uploaded, failed).

Show every variant laid out in a labelled grid on the Components page.
```

---

## 3. Master Context

Paste this once at the start of the session, before the screen prompts.

```text
Product: "Financare", a personal money manager for iOS and Android. Users record
income, outcome, and transfers between their own accounts (bank, e-wallet, cash),
attach receipt photos, and plan recurring and one-time payments with reminders.
UI language: Indonesian. Currency: IDR only, whole numbers, "Rp1.500.000".

Frame: 390 x 844, portrait, light mode only.

Style: minimalist, calm, white and stone only; flat cards with 1px borders, small
radii, solid stone-900 primary buttons, generous whitespace, no gradients or
decorative shadows. Color is information: income emerald, warning amber, delete
red. Outcome amounts stay stone-950.

Working rules for every screen:
1. Use the Financare variables, text styles, and components only. Never raw values.
2. Build with auto layout; screens must resize sensibly.
3. Name frames "<Screen> / <State>" (e.g. "Dashboard / Filled").
4. Provide the states each prompt asks for (filled, loading, empty, error).
5. Every balance uses the Money component; hidden state shows "Rp ••••••".
   Transaction amounts, plan amounts, and the monthly summary are never hidden.
6. Transfers are one neutral row, never counted in income/outcome.
7. Warnings (negative balance, insufficient funds) are amber Alerts and never
   block saving.
8. One primary button per screen; touch targets at least 44.
9. Place frames on the matching page in a row with consistent spacing, and
   connect them with prototype links where the flow is described.
```

---

## 4. Screen Prompts

Run in order. Each prompt assumes Phase 0, Phase 1, and the Master Context are done. After each one, FigCraft should list the frames it created.

### 4.1 Auth (page "01 Auth")

```text
Build the Login, Register, and Forgot password screens.
Login: wordmark "Financare" top-left, title "Masuk", email, password with
show/hide, primary "Masuk" button, "Lupa password?" link, "Belum punya akun? Daftar".
Register: name, email, password, confirm password, helper "Minimal 8 karakter".
Forgot password: email field; then a second frame "Cek email Anda" with a code
input and a new password field.
States: default, field errors (email already used, weak password), rate limit
("Terlalu banyak percobaan, coba lagi 15 menit"), loading button.
Add prototype links: Login ↔ Register, Login → Forgot password.
```

Also on this page: the **App lock** screen (PIN pad 3x4, biometrics button, "Gagal 5 kali? Masuk dengan password") and the **Onboarding** steps (1: "Buat akun pertama Anda" with a Skip link; 2: notification permission with explanation and the email fallback option if denied).

### 4.2 Dashboard (page "02 Dashboard")

```text
Build the Dashboard. Top: greeting and an eye icon (hide/show). Total balance
card (balance style, "Rp ••••••" when hidden), then a horizontal list of Account
cards (archived excluded). Month summary card with income, outcome, and net.
"Perlu tindakan" list with Reminder cards. "7 hari ke depan" upcoming reminders
(recurring and one-time; amber funding status when short). "Transaksi terakhir"
with 5 Transaction rows and a "Lihat semua" link. Bottom tab bar and floating "+".
Frames: Filled, Balance hidden, Loading (Skeleton), Empty (no transactions),
Error (offline with Retry).
```

### 4.3 New transaction and transactions (page "03 Transactions")

```text
Build the New transaction modal. Tabs: Pengeluaran, Pemasukan, Transfer. Template
chips on top (horizontal, "+ Template"). Amount first, then name, account
(default last used), category (filtered by type, optional), date (default today,
future dates disabled), location with "Isi otomatis", note, tags, and the Photo
strip. Primary "Simpan" pinned to the bottom.
Transfer tab: source and destination with a swap button, amount, admin fee
(optional), date, and shortcuts "Tarik tunai" and "Setor tunai".
Frames: Outcome filled, Income, Transfer, Negative-balance warning, Photo
uploading, Upload failed (retry), Future-date error with a "Buat Rencana Sekali"
button.

Then build the Transactions screen: search bar, filter chips (date range, type,
account, category, tag), rows grouped by day with a daily subtotal. Date range
sheet with presets (Hari ini, 7 hari, Bulan ini, Pilih tanggal) and a calendar
range picker. Transaction detail (all fields, photo gallery, full-screen viewer,
actions Edit, "Simpan sebagai template", Hapus). Trash screen with rows
"dihapus permanen dalam 12 hari" and a Restore button.
Frames for the list: Filled, Loading, Empty, Error.
```

### 4.4 Templates (page "04 Templates")

```text
Build the Templates list (sorted by most used, with use count) and the "Simpan
sebagai template" dialog. Rows show name, type badge, amount or "Isi tiap kali",
and account. A row with a missing account shows an amber "Pilih akun" tag.
Actions: "Catat sekarang" (only when nothing is missing), edit, delete.
Frames: Filled, Empty, Delete confirmation.
```

### 4.5 Accounts and categories (page "05 Accounts")

```text
Build the Accounts list (total balance on top, Account cards, archived section
collapsed), the Create/Edit account form (name, type segmented control
Bank/E-wallet/Cash, institution hidden for Cash, initial balance, last 4, color
and icon pickers, include-in-total switch), and the AlertDialog "Saldo akan
berubah dari Rp3.000.000 menjadi Rp3.500.000. Lanjutkan?".
Also build Categories with Income and Outcome tabs, a protected "Lainnya" row
(no delete or rename), and the delete AlertDialog "12 transaksi akan
dipindahkan ke Lainnya."
Frames: Filled, Balance hidden, Empty, Form default, Form error.
```

### 4.6 Plans (page "06 Plans")

```text
Build the Plans tab with segments Rutin and Sekali. Recurring card: name, amount,
frequency, next due date, reminder offsets, auto-record badge, pause/resume.
One-time card: name, date, target, funding Progress, status Badge. "+ Rencana"
opens a type chooser.
Forms: recurring (name, type, amount, account, frequency, start and end dates,
reminder chips Hari-H/H-1/H-3/H-7, auto-record switch with the note "Transaksi
dibuat otomatis saat jatuh tempo") and one-time (name, date, funds to prepare,
source account, location, note, reminder chips 1/3/7/14 days).
One-time plan detail: funding progress, "Transfer ke akun sumber" button, actions
Selesai, Batalkan, Jadwal ulang. Missed state with an amber badge.
Reminder screen: "Gym Rp350.000 jatuh tempo besok" with Sudah dibayar, Lewati
periode ini, Ingatkan nanti.
Frames: lists Filled and Empty, each form, detail Planned/Missed, balance hidden
variant of funding ("Dana cukup" / "Dana belum cukup", no figures).
```

### 4.7 Reports (page "07 Reports")

```text
Build Reports with three views: spending by category (horizontal bars, no pie
chart, stone shades with the top category darkest), 6-month income vs outcome
trend (two-series bars, emerald and stone-900), and cash flow per account (table
with in, out, net). Date range picker on top. Caption "Transfer tidak dihitung".
Frames: each view Filled, plus Empty.
```

### 4.8 Profile and settings (page "08 Profile")

```text
Build Profile and Settings: name and email header, groups Akun (edit profile,
timezone, change password), Privasi (Sembunyikan saldo switch, kunci aplikasi
PIN/biometrik, lindungi layar), Notifikasi (send time 08:00, quiet hours, push
and email switches), Data (trash), and Keluar. "Hapus akun" opens an AlertDialog
that explains all data and photos will be deleted and asks for the password.
```

---

## 5. Design System Reference

### 5.1 Color tokens

| Token | Value | Use |
|---|---|---|
| `background` | `#FFFFFF` | Screens |
| `foreground` | stone-950 `#0C0A09` | Primary text |
| `card` / `border` | `#FFFFFF` / stone-200 `#E7E5E4` | Cards, inputs |
| `muted` | stone-100 `#F5F5F4` | Secondary surfaces, disabled, chips |
| `muted-foreground` | stone-500 `#78716C` | Captions, placeholders |
| `primary` | stone-900 `#1C1917` | Main button, active tab |
| `income` | emerald-600 `#059669` | Income amounts and badges |
| `warning` | amber-600 `#D97706` | Negative balance, insufficient funds |
| `destructive` | red-600 `#DC2626` | Delete only |
| `ring` | stone-400 `#A8A29E` | Focus outline |

### 5.2 Typography and spacing

| Role | Size / weight |
|---|---|
| Screen title | 24 / semibold |
| Section title | 16 / semibold |
| Total balance | 32 / semibold, tabular numbers |
| Body | 14 / regular |
| Caption | 12 / regular, `muted-foreground` |

Spacing scale: 4, 8, 12, 16, 24, 32. Side padding 16. Minimum touch target 44 px.

### 5.3 Status badges

| Status | Style |
|---|---|
| Direncanakan (planned) | outline, stone |
| Selesai (done) | secondary, stone |
| Terlewat (missed) | amber outline |
| Dibatalkan (cancelled) | secondary, line-through text |
| Otomatis (auto-recorded) | secondary badge on a transaction row |
| Diarsipkan (archived) | secondary badge on an account |

### 5.4 Mapping to the PRD

| PRD concept | Design decision |
|---|---|
| Hide balance (user_flow 9.3) | Single `Money` component with shown/hidden variants; eye icon next to total; "Rp ••••••" |
| Negative balance warning | Amber `Alert` under the form and on the account card; no figure when balance is hidden |
| Transfer is one row (5.2) | One row "BRI → Cash", swap icon, neutral color, never counted in income/outcome |
| Templates (5.6) | Horizontal chip row on New transaction, most used first; "Record now" when nothing is missing |
| Receipt photos (5.1) | 5-slot strip, count "2/5", progress per thumbnail, failed upload does not block Save |
| Action needed (6.2, 9.1) | Dashboard list with three actions: Already paid, Skip, Remind later |
| Funding sufficiency (7.2) | Progress bar `available / target`, amber when short; status text only when balance is hidden |

---

## 6. Review Prompt (run after each phase)

```text
Review what you just built in the Figma file against these checks and fix any
failure, then report what you changed:
1. Every fill, stroke, radius, and spacing is bound to a variable; no raw values.
2. Every text uses a text style.
3. Screens use component instances, not detached copies.
4. Auto layout is on every container; nothing is clipped at 390 px width.
5. Only stone, white, income, warning, and destructive colors are used.
6. Touch targets are at least 44 and body text is at least 14.
7. Layers and frames are named as agreed and sit on the correct page.
8. Required states exist for each screen (filled, loading, empty, error).
Take a screenshot of each new frame and check it visually before reporting.
```
