// background.js

// 1. 启动选区截图
chrome.action.onClicked.addListener((tab) => {
  // 禁止在受保护页面运行
  if (tab.url.startsWith('edge://') || tab.url.startsWith('chrome://')) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  }).catch(err => console.error("脚本注入失败:", err));
});

// 2. 离屏文档单例管理
async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.CLIPBOARD, chrome.offscreen.Reason.DOM_SCRAPING],
    justification: 'Decodes QR codes.',
  });
}

// 3. 消息中转站
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // A. 接收来自网页选区的截图数据
  if (message.type === 'process-qr-code') {
    (async () => {
      await ensureOffscreenDocument();
      chrome.runtime.sendMessage({ type: 'decode-v5-request', payload: message.payload });
    })();
  }

  // B. 接收来自离屏文档的 Debug 图像并转发回网页控制台
  if (message.type === 'debug-log-relay') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'debug-log-to-page', url: message.url });
    });
  }

  // C. 接收最终识别结果并通知
if (message.type === 'decode-qr-result') {
    if (message.success) {
      const resultText = message.result;
      
      // 使用识别结果作为 Notification ID，方便点击时提取
      chrome.notifications.create(resultText, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '识别成功 (点击可打开)',
        message: '结果已复制：' + resultText,
        priority: 2,
        eventTime: Date.now() + 5000 // 提示点击属性
      });
    } else {
      chrome.notifications.create('failed', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '识别失败',
        message: '未发现有效的二维码',
        priority: 1
      });
    }
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  // 排除掉失败的弹窗 ID
  if (notificationId === 'failed') return;

  // 判断是否是合法链接
  if (notificationId.startsWith('http')) {
    chrome.tabs.create({ url: notificationId });
  } else {
    // 如果不是链接，搜索该文本或仅仅关闭弹窗
    console.log("识别内容非链接，不执行跳转:", notificationId);
  }
  
  // 点击后手动关闭弹窗
  chrome.notifications.clear(notificationId);
});