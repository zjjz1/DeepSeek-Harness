# @deepseek-ai/dsh-client-ui-statistics

Statistics plugin: a sidebar-foot entry above Settings opening a centered modal. The modal is currently a placeholder; the session/usage metrics surface lands in a later change.

## Model Experience

No model-visible surface: this plugin is pure presentation with no session-log writes.

## Known Limitations and Deferred Work

- The panel is a static placeholder — no metrics are rendered yet (session/usage aggregates need a root-scope projection read path to be wired in).
