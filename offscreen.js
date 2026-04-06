chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'decode-v5-request') {
    processImage(message.payload);
  }
});

async function processImage(p) {
  const img = new Image();
  img.crossOrigin = "anonymous"; 
  
  img.onload = async () => {
    const canvas = document.createElement('canvas');
    const realX = p.relX * img.naturalWidth;
    const realY = p.relY * img.naturalHeight;
    const realW = p.relW * img.naturalWidth;
    const realH = p.relH * img.naturalHeight;

    canvas.width = Math.max(1, realW);
    canvas.height = Math.max(1, realH);
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, realX, realY, realW, realH, 0, 0, canvas.width, canvas.height);

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(data.data, data.width, data.height);

    if (code) {
      await smartCopyToClipboard(code.data);
      chrome.runtime.sendMessage({ type: 'decode-qr-result', success: true, result: code.data });
    } else {
      chrome.runtime.sendMessage({ type: 'decode-qr-result', success: false });
    }
  };

  img.onerror = () => {
    chrome.runtime.sendMessage({ type: 'decode-qr-result', success: false, error: "图片加载失败" });
  };

  img.src = p.imgSrc;
}

async function smartCopyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
}