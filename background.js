let isProcessing = false;
let processTimer = null;
const notificationMap = {};

chrome.action.onClicked.addListener((tab) => {
  if (tab.url.startsWith('edge://') || tab.url.startsWith('chrome://')) return;
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
});

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.CLIPBOARD, chrome.offscreen.Reason.DOM_SCRAPING],
    justification: 'QR Decode'
  });
}

async function sendMessageToOffscreen(payload, retryCount = 0) {
  try {
    await chrome.runtime.sendMessage({ type: 'decode-request-v3', payload });
  } catch (e) {
    if (retryCount < 15) {
      await new Promise(r => setTimeout(r, 60));
      return sendMessageToOffscreen(payload, retryCount + 1);
    }
    resetLock();
  }
}

function resetLock() {
  isProcessing = false;
  if (processTimer) clearTimeout(processTimer);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'process-qr-code') {
    if (isProcessing) return;
    isProcessing = true;
    processTimer = setTimeout(resetLock, 10000); 
    ensureOffscreen().then(() => sendMessageToOffscreen(message.payload));
    return true;
  }
  if (message.type === 'decode-qr-result') {
    resetLock();
    if (message.success) {
      console.log(`%c[审计] 识别成功 | 引擎: ${message.engine}`, "color: #2ecc71; font-weight: bold;");
    }
    handleResult(message); 
    return true;
  }
});

function handleResult(msg) {
  const notifId = "qr-" + Date.now();
  if (msg.success) {
    chrome.notifications.create(notifId, {
      type: 'basic', iconUrl: 'icons/icon128.png',
      title: '识别成功', message: '结果已自动复制，点击可打开链接。', priority: 2
    });
    notificationMap[notifId] = msg.result;
  } else {
    chrome.notifications.create(notifId, {
      type: 'basic', iconUrl: 'icons/icon128.png',
      title: '识别失败', message: '未发现有效的二维码。', priority: 1
    });
  }
}

chrome.notifications.onClicked.addListener((id) => {
  const content = notificationMap[id];
  if (content && content.startsWith('http')) chrome.tabs.create({ url: content });
  chrome.notifications.clear(id);
});