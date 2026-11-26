# Design: adopt Reka UI

Date: 2026-11-26. Status: **approved** on 2026-11-26. Branch: `generic-scenarios`.

## Intent

The native selects look and behave inconsistently: the browser draws the arrow against the border and decides how the list opens. Replace every select with a Reka UI one, and replace other hand-built components where Reka UI is better.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Reka UI, headless, styled with our CSS | One dependency |
| B | Build our own | We would own positioning, keyboard and screen reader behaviour |
| C | Nuxt UI | Brings Tailwind and another look |
| D | Restyle native selects | Fixes only the arrow |

## Goals and limits

- Same look (existing tokens, light and dark, 960px and 720px), same copy, same behaviour except the improvements below.
- Pages keep using our `ui/` components; only their insides use Reka UI.
- No new features, no Tailwind, no visual redesign.

## Replacements

| Ours | Reka UI | Gain |
|---|---|---|
| Every `<select>` (switcher, sort, filter operator, bulk attribute and action, delete-option destination) → new `ui/Select` | Select | Opens below or above as space allows, stays on screen, scrolls, typeahead, padded arrow |
| `ui/Modal` and the confirmations built on it | Dialog, AlertDialog | Tested focus trapping and restore, background scroll lock and isolation; focus no longer escapes while saving |
| `ui/Toast`, `useToast` | Toast | Screen reader announcements, pause on hover, swipe to dismiss |
| `scenario/ColorPicker` | Popover + RadioGroup | Never opens off screen, arrow-key navigation, hand-written outside-click code removed |
| `ui/Seg` | ToggleGroup or RadioGroup (single, cannot be emptied) | Arrow keys, one Tab stop |
| `ui/Chip` groups | ToggleGroup | Arrow keys, one Tab stop per group |
| `ui/Switch`, `ui/Checkbox` | Switch, Checkbox | Proper states including indeterminate; tests no longer need forced clicks |
| Practice progress bar | Progress | Announced to screen readers (today it is not) |

**Unchanged:** `Btn`, `Badge`, `Empty`, `Skeleton` and text inputs (nothing to gain); the native `<details>` track record and the number input (already adequate). The unused select variant of `ui/Input` is removed.

## Constraints

- `reka-ui` 2.x (2.11.0 at writing; requires Vue 3.4 or later). Package commands use pnpm 11.
- Reka's select does not accept an empty-string value; "All scenarios" and "Default" sorting need an internal placeholder.
- Server-rendered pages (header, content) must show the selected value on first paint with no hydration warnings.
- Selects and popovers opened inside dialogs must appear above them and close before the dialog on Escape.
- On phones the new list replaces the system picker.

## Testing

The existing end-to-end suite is the safety net. Flow helpers change how they operate controls; behaviour assertions stay. New tests: a select near the bottom edge opens upward and stays within the viewport (390px included), keyboard operation, Escape inside a dialog, color picker near an edge, toast announcement.

## Order of work

1. Dependency and `ui/Select`, all selects.
2. Dialogs.
3. Switch, Checkbox, Seg, Chip, Progress.
4. Toast and color picker.

## Left to the builder

Component internals, wrapper props, CSS details.
