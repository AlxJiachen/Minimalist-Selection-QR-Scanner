chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'decode-v5-request') {
    processImage(message.payload);
  }
});

async function processImage(p) {
  console.log("离屏文档：接收到解码请求", p);
  
  const img = new Image();
  img.crossOrigin = "anonymous"; 


  img.onload = async () => {
    console.log("离屏文档：图片加载成功，开始处理 Canvas");
    
    try {
      const canvas = document.createElement('canvas');
      const padding = 20; 
      
      const realX = p.relX * img.naturalWidth;
      const realY = p.relY * img.naturalHeight;
      const realW = p.relW * img.naturalWidth;
      const realH = p.relH * img.naturalHeight;

      canvas.width = Math.max(1, realW + (padding * 2));
      canvas.height = Math.max(1, realH + (padding * 2));
      
      const ctx = canvas.getContext('2d');
      
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(
        img, 
        realX, realY, realW, realH, 
        padding, padding, realW, realH
      );

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      console.log("离屏文档：正在调用 jsQR 解码...");
      
      const code = jsQR(data.data, data.width, data.height);

      if (code) {
        console.log("离屏文档：解码成功！内容：", code.data);
        await smartCopyToClipboard(code.data);
        chrome.runtime.sendMessage({ type: 'decode-qr-result', success: true, result: code.data });
      } else {
        console.warn("离屏文档：未识别到二维码");
        chrome.runtime.sendMessage({ type: 'decode-qr-result', success: false });
      }
    } catch (err) {
      console.error("离屏文档：处理过程出错", err);
      chrome.runtime.sendMessage({ type: 'decode-qr-result', success: false, error: err.message });
    }
  };

  img.onerror = (e) => {
    console.error("离屏文档：图片加载失败，可能是跨域问题", e);
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