---
'biatec-wallet-use-wallet-client': patch
---

The built-in connect dialog now also respects an explicit `data-theme="dark"` / `data-theme="light"` attribute on `<html>` (in addition to the system's `prefers-color-scheme`), so a host page with its own light/dark toggle always gets a matching dialog instead of one that only follows the OS setting.

Both bundled examples (`examples/react-ts`, `examples/vanilla-ts`) now ship a light/dark toggle button that sets this attribute and persists the choice, demonstrating the pattern end to end.
