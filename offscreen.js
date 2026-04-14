
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'decode-v5-request') processImage(message.payload);
});


async function processImage(p) {
  console.log("1. 接收到的原始数据:", p);
  const img = new Image();
  img.crossOrigin = "anonymous";
  
  img.onload = async () => {
    try {
      // 自检 A: 图片原始尺寸
      console.log(`2. 图片载入成功: ${img.naturalWidth}x${img.naturalHeight}`);
      if (img.naturalWidth === 0) throw new Error("图片宽度为0，可能跨域受限");

      const scale = 3;
      const padding = 40;
      
      const realW = p.relW * img.naturalWidth;
      const realH = p.relH * img.naturalHeight;
      const realX = p.relX * img.naturalWidth;
      const realY = p.relY * img.naturalHeight;

      // 自检 B: 计算出的绝对坐标
      console.log(`3. 裁剪坐标自检: x=${realX.toFixed(1)}, y=${realY.toFixed(1)}, w=${realW.toFixed(1)}, h=${realH.toFixed(1)}`);

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(realW * scale + padding * 2);
      canvas.height = Math.floor(realH * scale + padding * 2);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      // 涂白底
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制原图
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        img, 
        realX, realY, realW, realH, 
        padding, padding, realW * scale, realH * scale
      );

      // --- 【关键调试点 1：看看没经过算法处理的原始裁剪图是不是白的】 ---
      const rawUrl = canvas.toDataURL();
      chrome.runtime.sendMessage({ type: 'debug-log-relay', url: "RAW_CROP: " + rawUrl });

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const processed = adaptiveThreshold(imageData, 0.1);
      ctx.putImageData(processed, 0, 0);

      // --- 【关键调试点 2：算法处理后的图】 ---
      const finalUrl = canvas.toDataURL();
      chrome.runtime.sendMessage({ type: 'debug-log-relay', url: "PROCESSED: " + finalUrl });

      let code = jsQR(processed.data, processed.width, processed.height);
      if (!code) {
        const inv = invert(processed);
        ctx.putImageData(inv, 0, 0);
        code = jsQR(inv.data, inv.width, inv.height);
      }

      if (code) {
        copy(code.data);
        chrome.runtime.sendMessage({ type: 'decode-qr-result', success: true, result: code.data });
      } else {
        chrome.runtime.sendMessage({ type: 'decode-qr-result', success: false });
      }
    } catch (e) {
      console.error("解码中断:", e);
      chrome.runtime.sendMessage({ type: 'decode-qr-result', success: false });
    }
  };

  img.onerror = () => console.error("图片加载失败，URL 可能无效:", p.imgSrc);
  img.src = p.imgSrc;
}

function adaptiveThreshold(id, T) {
  const { width: w, height: h, data: d } = id;
  const gray = new Uint8Array(w * h);
  const int = new Int32Array((w + 1) * (h + 1));
  const out = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const g = (d[i] * 77 + d[i+1] * 150 + d[i+2] * 29) >> 8;
      gray[y * w + x] = g; s += g;
      int[(y + 1) * (w + 1) + (x + 1)] = int[y * (w + 1) + (x + 1)] + s;
    }
  }
  const S = Math.floor(w / 8);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(1, x-S/2), x2 = Math.min(w, x+S/2);
      const y1 = Math.max(1, y-S/2), y2 = Math.min(h, y+S/2);
      const count = (x2 - x1) * (y2 - y1);
      const sum = int[y2*(w+1)+x2] - int[(y1-1)*(w+1)+x2] - int[y2*(w+1)+(x1-1)] + int[(y1-1)*(w+1)+(x1-1)];
      const res = (gray[y * w + x] * count < sum * (1.0 - T)) ? 0 : 255;
      const idx = (y * w + x) * 4;
      out[idx] = out[idx+1] = out[idx+2] = res; out[idx+3] = 255;
    }
  }
  return new ImageData(out, w, h);
}

function invert(id) {
  for (let i = 0; i < id.data.length; i += 4) {
    id.data[i] = id.data[i+1] = id.data[i+2] = 255 - id.data[i];
  }
  return id;
}

function copy(t) {
  const el = document.createElement("textarea");
  el.value = t; document.body.appendChild(el);
  el.select(); document.execCommand('copy');
  document.body.removeChild(el);
}