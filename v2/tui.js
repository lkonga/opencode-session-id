// @bun
// v2/src/tui.tsx
import { Plugin } from "@opencode/plugin/tui";

// v2/src/session-id.ts
var CHANNEL_HIDING_SESSION_ID = "latest";
function sessionIDRow(input) {
  if (!input.sessionID)
    return;
  if (input.channel === CHANNEL_HIDING_SESSION_ID)
    return;
  return input.sessionID;
}
function createSessionIDRow(input) {
  return () => sessionIDRow({ channel: input.channel(), sessionID: input.sessionID() });
}

// v2/src/jsx/runtime.ts
import { createComponent, createElement, spread } from "@opentui/solid";
function normalizeProps(props) {
  if (!("key" in props))
    return props;
  const { key: _key, ...rest } = props;
  return rest;
}
function jsx(type, props = {}) {
  const normalized = normalizeProps(props);
  if (typeof type === "function")
    return createComponent(type, normalized);
  const element = createElement(type);
  spread(element, normalized);
  return element;
}
var jsxDEV = jsx;
// v2/src/tui.tsx
var PLUGIN_ID = "opencode-session-id-v2-tui";
function SessionID(props) {
  const row = createSessionIDRow({
    channel: () => props.context.app.channel,
    sessionID: () => props.sessionID
  });
  return () => {
    const sessionID = row();
    return sessionID ? /* @__PURE__ */ jsxDEV("text", {
      fg: props.context.theme.text.muted,
      children: sessionID
    }, undefined, false, undefined, this) : undefined;
  };
}
var tui_default = Plugin.define({
  id: PLUGIN_ID,
  setup: (context) => context.ui.slot({
    prepend: "sidebar.title",
    render: (input) => /* @__PURE__ */ jsxDEV(SessionID, {
      context,
      sessionID: input.sessionID
    }, undefined, false, undefined, this)
  })
});
export {
  PLUGIN_ID,
  tui_default as default
};

//# debugId=3B3B7A91A8351BE464756E2164756E21
//# sourceMappingURL=tui.js.map
