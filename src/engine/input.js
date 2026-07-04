// The only module allowed to touch the DOM for input. Emits generic events
// into game.input.queue for other systems to consume each frame. No
// weapon/enemy id knowledge here — just raw input semantics (mouse pos,
// mouse down/up, key press, wheel).

export function createInputState() {
  return {
    mouseX: 640,
    mouseY: 360,
    mouseDown: false,
    queue: [], // events: {type: 'fire'|'fireStart'|'fireEnd'|'selectWeapon'|'cycleWeapon', ...}
  };
}

export function attachInput(canvas, inputState, onFirstGesture) {
  let gestureFired = false;
  const fireGestureOnce = () => {
    if (!gestureFired) {
      gestureFired = true;
      if (typeof onFirstGesture === 'function') onFirstGesture();
    }
  };

  function toCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  canvas.addEventListener('mousemove', (e) => {
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    inputState.mouseX = x;
    inputState.mouseY = y;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    fireGestureOnce();
    inputState.mouseDown = true;
    inputState.queue.push({ type: 'fireStart' });
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    inputState.mouseDown = false;
    inputState.queue.push({ type: 'fireEnd' });
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    inputState.queue.push({ type: 'cycleWeapon', dir: e.deltaY > 0 ? 1 : -1 });
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    fireGestureOnce();
    if (['1', '2', '3', '4'].includes(e.key)) {
      inputState.queue.push({ type: 'selectWeapon', key: e.key });
    } else if (e.key === 'q' || e.key === 'Q') {
      inputState.queue.push({ type: 'cycleWeapon', dir: -1 });
    } else if (e.key === 'e' || e.key === 'E') {
      inputState.queue.push({ type: 'cycleWeapon', dir: 1 });
    } else if (e.key === 'Enter' || e.key === ' ') {
      inputState.queue.push({ type: 'confirm' });
    } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      inputState.queue.push({ type: 'pause' });
    } else if (e.key === 'm' || e.key === 'M') {
      inputState.queue.push({ type: 'menu' });
    }
  });

  canvas.addEventListener('click', () => {
    inputState.queue.push({ type: 'click' });
  });
}

export function drainQueue(inputState) {
  const events = inputState.queue;
  inputState.queue = [];
  return events;
}
