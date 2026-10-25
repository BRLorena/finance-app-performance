# Patches

`*.patch` files here are applied to `finance_app` (with `git apply`) before it's
built, so a proposed change can be measured without pushing it to the app's
repository. Empty by default.

Make one from a `finance_app` checkout with `git diff > ../finance-app-performance/app/patches/my-change.patch`.
