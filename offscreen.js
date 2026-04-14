// offscreen.js (v3.0.9)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'decode-request-v3') processImageRobust(message.payload);
});

async function processImageRobust(p) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = async () => {
    try {
      const scale = 3;
      const padding = 60;
      const realW = p.relW * img.naturalWidth;
      const realH = p.relH * img.naturalHeight;
      const realX = p.relX * img.naturalWidth;
      const realY = p.relY * img.naturalHeight;

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(realW * scale + padding * 2);
      canvas.height = Math.floor(realH * scale + padding * 2);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      const debugData = {}; // 用于存放所有步骤的完整源码

      // 1. 原图
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, realX, realY, realW, realH, padding, padding, realW * scale, realH * scale);
      debugData.step1_raw = canvas.toDataURL("image/png");

      let result = null, winner = "none";

      if ('BarcodeDetector' in window) {
        try {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(canvas);
          if (barcodes.length > 0) { result = barcodes[0].rawValue; winner = "Native API"; }
        } catch (e) {}
      }

      if (!result) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // 2. T=0.10
        const t10 = adaptiveThreshold(imageData, 0.10);
        ctx.putImageData(t10, 0, 0);
        debugData.step2_t10 = canvas.toDataURL("image/png");
        let code = jsQR(t10.data, t10.width, t10.height);
        if (code) { result = code.data; winner = "jsQR (T=0.10)"; }

        if (!result) {
          // 3. T=0.16
          const t16 = adaptiveThreshold(imageData, 0.16);
          ctx.putImageData(t16, 0, 0);
          debugData.step3_t16 = canvas.toDataURL("image/png");
          code = jsQR(t16.data, t16.width, t16.height);
          if (code) { result = code.data; winner = "jsQR (T=0.16)"; }
        }

        if (!result) {
          // 4. 反色
          const inv = invert(adaptiveThreshold(imageData, 0.12));
          ctx.putImageData(inv, 0, 0);
          debugData.step4_inv = canvas.toDataURL("image/png");
          code = jsQR(inv.data, inv.width, inv.height);
          if (code) { result = code.data; winner = "jsQR (Inverted)"; }
        }
      }

      // --- 重点：调试信息输出 ---
      console.groupCollapsed(`%c🔍 扫码全路径诊断 | 最终结果: ${result ? '✅' : '❌'} | 引擎: ${winner}`, 
        `color: white; background: ${result ? '#2ecc71' : '#e74c3c'}; padding: 3px 10px; border-radius: 4px; font-weight: bold;`);
      
      // 遍历四种图，输出预览和“下载链接”
      Object.keys(debugData).forEach(key => {
        const url = debugData[key];
        const w = 120, h = (canvas.height / canvas.width) * w;
        
        console.log(`%c${key}`, "font-weight: bold; color: #34495e;");
        // 打印缩略图预览
        console.log("%c ", `font-size: 1px; padding: ${h/2}px ${w/2}px; background: url(${url}) no-repeat; background-size: contain; line-height: ${h}px; border: 1px solid #eee; margin: 5px 0;`);
        // 打印下载链接（这比复制源码更Nice，你可以直接存成文件传给我）
        console.log(`%c📥 下载此图: %c[右键点击保存]`, "color: #666;", `color: #007bff; text-decoration: underline; cursor: pointer;`);
        console.log(url); // 虽然这里会被截断，但下方有不截断的
      });

      console.log("%c💡 技巧：下方 Object 展开后，右键点击属性选 'Copy string contents' 可复制完整源码（不被截断）", "color: #999; font-style: italic;");
      console.dir(debugData); // 关键：用 dir 输出对象，里面的字符串不会被截断
      
      console.groupEnd();

      if (result) copyToClipboard(result);
      chrome.runtime.sendMessage({ type: 'decode-qr-result', success: !!result, result: result || "", engine: winner });
    } catch (e) {
      chrome.runtime.sendMessage({ type: 'decode-qr-result', success: false });
    }
  };
  img.src = p.imgSrc;
}

// 辅助函数保持原样...
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
      const x1 = Math.max(1, x-S/2|0), x2 = Math.min(w, x+S/2|0);
      const y1 = Math.max(1, y-S/2|0), y2 = Math.min(h, y+S/2|0);
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
    id.data[i] = 255 - id.data[i];
    id.data[i+1] = 255 - id.data[i+1];
    id.data[i+2] = 255 - id.data[i+2];
  }
  return id;
}
function copyToClipboard(t) {
  const el = document.createElement("textarea");
  el.value = t; document.body.appendChild(el);
  el.select(); document.execCommand('copy');
  document.body.removeChild(el);
}