chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sff-autofill-here",
    title: "⚡ Autofill this form",
    contexts: ["editable", "page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sff-autofill-here" && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "SFF_RUN_AUTOFILL" });
  }
});

// The content script can't query the browser window's state directly (F11 / OS
// fullscreen doesn't fire any DOM event content scripts can see), so it asks the
// background worker, which can via chrome.windows.get(). This is the authoritative
// signal — no pixel/dimension guessing.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SFF_GET_WINDOW_STATE" && sender.tab && sender.tab.windowId !== undefined) {
    chrome.windows.get(sender.tab.windowId, {}, (win) => {
      sendResponse({ state: win ? win.state : "normal" });
    });
    return true; // async response
  }
  return false;
});