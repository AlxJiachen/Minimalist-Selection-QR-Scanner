let isProcessing = false;
let isOffscreenReady = false;
let pendingPayload = null;
const notificationMap = new Map();

// 统一解锁函数
function unlock() {
  isProcessing = false;
  pendingPayload = null;
  console.log("%c[System] 🔓 锁已释放，准备好下一次任务", "color: #2ecc71; font-weight: bold;");
}

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.CLIPBOARD, chrome.offscreen.Reason.DOM_SCRAPING],
    justification: 'QR Decode'
  });
}

// 只有在 Offscreen 准备好后才发送数据
async function sendToOffscreen(payload) {
  if (isOffscreenReady) {
    chrome.runtime.sendMessage({ type: 'decode-request-v3', payload });
  } else {
    pendingPayload = payload; // 先存起来，等 READY 信号
    await ensureOffscreen();
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (/^(edge|chrome):\/\//.test(tab.url)) return;
  
  // 优化7：尝试给已存在的脚本发消息，失败了再重新注入
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'START_SCAN' });
  } catch (e) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  switch (message.type) {
    case 'OFFSCREEN_READY':
      isOffscreenReady = true;
      if (pendingPayload) {
        chrome.runtime.sendMessage({ type: 'decode-request-v3', payload: pendingPayload });
        pendingPayload = null;
      }
      break;

    case 'process-qr-code':
      if (isProcessing) return;
      isProcessing = true;
      console.log("%c[System] 🔒 已上锁，正在处理...", "color: #e67e22; font-weight: bold;");
      sendToOffscreen(message.payload);
      break;

    case 'decode-qr-result':
      unlock(); // 收到结果立即解锁
      handleResult(message);
      break;

    case 'CANCEL_SCAN':
      unlock(); // 用户取消立即解锁
      break;
  }
  return true;
});

function handleResult(msg) {
  const notifId = "qr-" + Date.now();
  chrome.notifications.create(notifId, {
    type: 'basic', iconUrl: 'icons/icon128.png',
    title: msg.success ? '识别成功' : '识别失败',
    message: msg.success ? '结果已自动复制，点击可打开链接。' : '未发现有效的二维码。',
    priority: msg.success ? 2 : 1
  });
  if (msg.success) notificationMap.set(notifId, msg.result);
}

chrome.notifications.onClicked.addListener((id) => {
  const content = notificationMap.get(id);
  if (content && content.startsWith('http')) chrome.tabs.create({ url: content });
  chrome.notifications.clear(id);
  notificationMap.delete(id);
});