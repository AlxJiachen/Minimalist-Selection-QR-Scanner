(function() {
  if (window.hasQrSelectionOverlay) return;
  window.hasQrSelectionOverlay = true;

  // 1. 提取清理逻辑，确保彻底释放资源
  const cleanup = () => {
    if (overlay && overlay.parentNode) {
      document.body.removeChild(overlay);
    }
    // 移除全局键盘监听，防止内存泄漏
    document.removeEventListener('keydown', handleKeyDown);
    window.hasQrSelectionOverlay = false;
  };

  // 2. 键盘支持：ESC 随时退出
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      cleanup();
    }
  };
  document.addEventListener('keydown', handleKeyDown);

  // 3. 创建蒙层
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0,0,0,0.3);
    z-index: 2147483647;
    cursor: crosshair;
    user-select: none;
    -webkit-user-select: none;
  `;

  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
  const ctx = canvas.getContext('2d');
  
  overlay.appendChild(canvas);
  document.body.appendChild(overlay);

  let startX, startY, isDrawing = false;
  let rect = { x: 0, y: 0, w: 0, h: 0 };

  overlay.addEventListener('mousedown', (e) => {
    isDrawing = true;
    startX = e.clientX; 
    startY = e.clientY;
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    rect.w = Math.abs(e.clientX - startX);
    rect.h = Math.abs(e.clientY - startY);
    rect.x = Math.min(e.clientX, startX);
    rect.y = Math.min(e.clientY, startY);

    // 绘制蒙层和绿色选框
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = '#00FF00'; 
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  });

  overlay.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    
    // 忽略过小的选区（可能是误点）
    if (rect.w < 10 || rect.h < 10) {
      cleanup();
      return;
    }
    
    // 定位选区下的图片
    const centerX = rect.x + rect.w / 2;
    const centerY = rect.y + rect.h / 2;
    
    // 暂时禁用蒙层点击，以便抓取下方的图片元素
    overlay.style.pointerEvents = 'none';
    const targetImg = document.elementFromPoint(centerX, centerY);
    
    if (targetImg && (targetImg.tagName === 'IMG' || targetImg.tagName === 'CANVAS')) {
      const imgRect = targetImg.getBoundingClientRect();
      const payload = {
        imgSrc: targetImg.src || (targetImg.tagName === 'CANVAS' ? targetImg.toDataURL() : ""),
        relX: (rect.x - imgRect.left) / imgRect.width,
        relY: (rect.y - imgRect.top) / imgRect.height,
        relW: rect.w / imgRect.width,
        relH: rect.h / imgRect.height
      };
      chrome.runtime.sendMessage({ type: 'selection-done-v5', payload });
    } else {
      console.warn("未能在选区中心找到有效的 IMG 或 CANVAS 元素");
    }
    
    cleanup();
  });

})();