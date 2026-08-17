# @deepseek-ai/dsh-client-ui-plugin-market

Plugin market plugin for the dsh web GUI: registers one entry into the sidebar-foot action list (`sidebar.footer.action`, rendered directly above the Settings seat) that opens a centered modal panel hosting the plugin market website in an iframe. The modal mirrors the Settings shell's mask/panel family: a full-viewport mask plus a centered `role="dialog"` panel whose header carries the title and close button and whose body is filled by the iframe.

The entry renders the sidebar's compact 34px row in the wide column and the 36px rail circle when collapsed, reusing the same token rhythm as the Settings trigger. Modal open state is component-local viewing state — no store is registered. The iframe `src` is the `DEFAULT_PLUGIN_MARKET_URL` constant in `src/client/PluginMarketPanel.tsx`; a deployment replaces the constant to point at its own market.

`PluginMarketEntryProps` composes the `sidebar.footer.action` owner share (`wide`) and the standard `pluginMarket` locale seat. Registration goes through `ctx.slots.inject('sidebar.footer.action', ...)`, so it waits on ui-sidebar's declaration and rolls back with the plugin fiber.

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; the entry and panel components remain package-internal behind the slot registration.

## Model Experience

None, as the plugin renders a browser-only iframe surface; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The iframe URL is a hardcoded constant** — `DEFAULT_PLUGIN_MARKET_URL` in `src/client/PluginMarketPanel.tsx` — not yet a user-editable setting; configurability through a settings section is deferred.
- **No focus trap beyond baseline** — entering the dialog focuses the close button and Escape closes it, but tab order is not contained inside the modal.
- **Embedded-site interaction is out of scope** — the market page handles install/activation; this plugin only browses.
