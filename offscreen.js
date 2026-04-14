chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });

chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'decode-request-v3') processImage(m.payload);
});

// 基础算法函数（保持极简）
function getGrayAndIntegral(id) {
  const { width: w, height: h, data: d } = id;
  const gray = new Uint8Array(w * h), int = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const g = (d[i] * 77 + d[i+1] * 150 + d[i+2] * 29) >> 8;
      gray[y * w + x] = g; s += g;
      int[(y + 1) * (w + 1) + (x + 1)] = int[y * (w + 1) + (x + 1)] + s;
    }
  }
  return { gray, int, w, h };
}

function applyThreshold(p, T, inv = false) {
  const { gray, int, w, h } = p, out = new Uint8ClampedArray(w * h * 4);
  const S = w >> 3, th = 1.0 - T;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(1, x - S/2|0), x2 = Math.min(w, x + S/2|0);
      const y1 = Math.max(1, y - S/2|0), y2 = Math.min(h, y + S/2|0);
      const sum = int[y2*(w+1)+x2] - int[(y1-1)*(w+1)+x2] - int[y2*(w+1)+(x1-1)] + int[(y1-1)*(w+1)+(x1-1)];
      let res = (gray[y * w + x] * (x2-x1)*(y2-y1) < sum * th) ? 0 : 255;
      if (inv) res = 255 - res;
      const i = (y * w + x) * 4;
      out[i] = out[i+1] = out[i+2] = res; out[i+3] = 255;
    }
  }
  return new ImageData(out, w, h);
}

const engines = {
  native: (cv) => new Promise(async (res, rej) => {
    if (!('BarcodeDetector' in window)) return rej();
    try {
      const b = await new BarcodeDetector({ formats: ['qr_code'] }).detect(cv);
      b.length > 0 ? res({ data: b[0].rawValue, win: "Native" }) : rej();
    } catch (e) { rej(); }
  }),
  js: (prep, T, name, inv = false) => new Promise((res, rej) => {
    const td = applyThreshold(prep, T, inv);
    const c = jsQR(td.data, td.width, td.height);
    c ? res({ data: c.data, win: name, imgData: td }) : rej();
  })
};

async function processImage(p) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onerror = () => chrome.runtime.sendMessage({ type: 'decode-qr-result', success: false });
  img.onload = async () => {
    try {
      const sc = 3, pd = 60, rw = p.relW * img.naturalWidth, rh = p.relH * img.naturalHeight;
      const cv = document.createElement('canvas');
      cv.width = rw * sc + pd * 2; cv.height = rh * sc + pd * 2;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, p.relX * img.naturalWidth, p.relY * img.naturalHeight, rw, rh, pd, pd, rw * sc, rh * sc);
      
      const prep = getGrayAndIntegral(ctx.getImageData(0, 0, cv.width, cv.height));
      

      let final = null;
      try {
        final = await Promise.any([
          engines.native(cv),
          engines.js(prep, 0.10, "T10"),
          engines.js(prep, 0.16, "T16"),
          engines.js(prep, 0.12, "Invert", true)
        ]);
      } catch (e) { /* 全部失败 */ }

      // --- 【延迟 Debug 生成】 ---
      // 只有识别流程彻底结束了，才回头去生成那几张沉重的 DataURL
      const debug = { step1_raw: cv.toDataURL() };
      // 重新生成中间图用于 Debug 控制台显示（仅在需要打印时执行）
      [ [0.10, 'step2_t10', false], [0.16, 'step3_t16', false], [0.12, 'step4_inv', true] ].forEach(([t, key, inv]) => {
        ctx.putImageData(applyThreshold(prep, t, inv), 0, 0);
        debug[key] = cv.toDataURL();
      });

      console.groupCollapsed(`QR Result: ${final ? '✅' : '❌'} | ${final?.win || 'none'}`);
      Object.entries(debug).forEach(([k, v]) => {
        console.log(k);
        console.log("%c ", `font-size:1px; padding:50px 80px; background:url(${v}) no-repeat; background-size:contain;`);
      });
      console.dir(debug); console.groupEnd();

      if (final) {
        const el = document.createElement("textarea");
        el.value = final.data; document.body.appendChild(el); el.select();
        document.execCommand('copy'); document.body.removeChild(el);
      }

      chrome.runtime.sendMessage({ 
        type: 'decode-qr-result', 
        success: !!final, 
        result: final?.data || "", 
        engine: final?.win || "none" 
      });
    } catch (e) { 
      chrome.runtime.sendMessage({ type: 'decode-qr-result', success: false }); 
    }
  };
  img.src = p.imgSrc;
}