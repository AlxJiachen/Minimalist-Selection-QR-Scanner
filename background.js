chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
});

let lastUrl = "";

chrome.runtime.onMessage.addListener(async (m) => {
  if (m.type === 'selection-done-v5') {
    await ensureOffscreen();
    chrome.runtime.sendMessage({ type: 'decode-v5-request', payload: m.payload });
  }

  if (m.type === 'decode-qr-result') {
    if (m.success) {
      lastUrl = m.result;
      showNotification("解码成功 (已复制)", m.result + "\n\n点击通知可直接打开链接");
    } else {
      showNotification("扫码失败", "选区内未识别到二维码");
    }
  }
});

chrome.notifications.onClicked.addListener(() => {
  if (lastUrl) {
    const target = lastUrl.startsWith('http') ? lastUrl : `https://www.bing.com/search?q=${encodeURIComponent(lastUrl)}`;
    chrome.tabs.create({ url: target });
  }
});

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['DOM_PARSER'], 
    justification: '用于在离屏画布中解析二维码像素，保护用户数据隐私。'
  });
}

function showNotification(title, msg) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png', 
    title: title, 
    message: msg, 
    priority: 2, 
    isClickable: true
  });
}