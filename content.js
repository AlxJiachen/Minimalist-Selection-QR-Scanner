// content.js
(function() {
  // 强制移除旧的蒙层（如果存在），防止状态死锁
  const oldOverlay = document.getElementById('qr-scanner-overlay');
  if (oldOverlay) oldOverlay.remove();

  const cleanup = () => {
    const overlay = document.getElementById('qr-scanner-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', handleKeyDown);
  };

  const handleKeyDown = (e) => { if (e.key === 'Escape') cleanup(); };
  document.addEventListener('keydown', handleKeyDown);

  const overlay = document.createElement('div');
  overlay.id = 'qr-scanner-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);z-index:2147483647;cursor:crosshair;';

  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
  const ctx = canvas.getContext('2d');
  
  overlay.appendChild(canvas);
  document.body.appendChild(overlay);

  let startX, startY, isDrawing = false;
  let rect = { x: 0, y: 0, w: 0, h: 0 };

  overlay.onmousedown = (e) => {
    isDrawing = true;
    startX = e.clientX; 
    startY = e.clientY;
  };

  overlay.onmousemove = (e) => {
    if (!isDrawing) return;
    rect.w = Math.abs(e.clientX - startX);
    rect.h = Math.abs(e.clientY - startY);
    rect.x = Math.min(e.clientX, startX);
    rect.y = Math.min(e.clientY, startY);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = '#00FF00'; 
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  };

  overlay.onmouseup = () => {
    if (!isDrawing) return;
    isDrawing = false;
    if (rect.w < 10 || rect.h < 10) { cleanup(); return; }
    
    overlay.style.pointerEvents = 'none';
    const target = document.elementFromPoint(rect.x + rect.w/2, rect.y + rect.h/2);
    
    if (target && (target.tagName === 'IMG' || target.tagName === 'CANVAS')) {
      const r = target.getBoundingClientRect();
      chrome.runtime.sendMessage({
        type: 'process-qr-code',
        payload: {
          imgSrc: target.src || (target.tagName === 'CANVAS' ? target.toDataURL() : ""),
          relX: (rect.x - r.left) / r.width,
          relY: (rect.y - r.top) / r.height,
          relW: rect.w / r.width,
          relH: rect.h / r.height
        }
      });
    }
    cleanup();
  };

  // 接收并打印 Debug 图像
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'debug-log-to-page') {
      console.log("QR_DEBUG_IMAGE:", msg.url);
    }
  });
})();