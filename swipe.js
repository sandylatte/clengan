// Swipe a row left to reveal Delete.
//
// Pointer events rather than touch events, so a mouse drag on the desktop
// behaves the same as a thumb. `touch-action: pan-y` on the moving surface
// hands vertical scrolling back to the browser and keeps the horizontal axis
// for us — without it the page and the row fight each other on every drag.
//
// A swipe is unreachable from a keyboard and invisible to a screen reader, so
// it is never the ONLY way to delete: the editor that opens on tap carries a
// Delete button, and that is the path assistive tech takes. This is an
// accelerator, not an interface.

const ACTION_WIDTH = 88;
// Below this a drag is a tap, not a swipe. Small enough that a deliberate
// nudge opens, large enough that a fingertip resting on a scroll does not.
const OPEN_AT = ACTION_WIDTH / 2;
// Horizontal intent has to beat vertical by this much before the row moves,
// or a diagonal scroll drags rows sideways the whole way down the list.
const AXIS_LOCK = 8;

let openRow = null;

export function closeOpenRow() {
  if (!openRow) return;
  openRow.style.transform = '';
  openRow.classList.remove('is-open');
  openRow = null;
}

// Returns the element rows are appended to, having wired one row's gesture.
export function attachSwipe({ surface, onDelete, onOpen }) {
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let decided = false;
  let moved = 0;

  const setX = (x) => {
    surface.style.transform = x ? `translateX(${x}px)` : '';
  };

  // The transition is suppressed by a CLASS for the length of the gesture,
  // not by :active. Under pointer capture :active is not reliably set, and
  // any easing left running during a drag makes the row lag the finger by
  // its own duration — the surface has to track the pointer exactly.
  const setDragging = (on) => surface.classList.toggle('is-dragging', on);

  surface.addEventListener('pointerdown', (event) => {
    // Only a primary press, and never on the delete button behind the row.
    if (event.button !== 0) return;
    startX = event.clientX;
    startY = event.clientY;
    dragging = true;
    decided = false;
    moved = 0;
    // A row left open elsewhere closes as soon as another is touched, so the
    // list never has two half-open rows.
    if (openRow && openRow !== surface) closeOpenRow();
  });

  surface.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (!decided) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > AXIS_LOCK) {
        // Vertical wins: this is a scroll. Let go entirely.
        dragging = false;
        return;
      }
      if (Math.abs(dx) < AXIS_LOCK) return;
      decided = true;
      setDragging(true);
      // Capture can throw for a pointer the browser no longer considers
      // active; losing it only costs us moves outside the element.
      try { surface.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
    }

    const base = surface === openRow ? -ACTION_WIDTH : 0;
    // Clamped: the row cannot be pulled past the action, and cannot be pushed
    // right of its resting place, because there is nothing revealed that way.
    moved = Math.max(-ACTION_WIDTH, Math.min(0, base + dx));
    setX(moved);
  });

  const release = () => {
    if (!dragging) return;
    dragging = false;
    setDragging(false);
    if (!decided) return;
    if (moved <= -OPEN_AT) {
      setX(-ACTION_WIDTH);
      surface.classList.add('is-open');
      openRow = surface;
    } else {
      setX(0);
      surface.classList.remove('is-open');
      if (openRow === surface) openRow = null;
    }
  };

  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', () => {
    // A cancelled gesture must not leave the row stranded mid-swipe.
    dragging = false;
    decided = false;
    setDragging(false);
    setX(surface === openRow ? -ACTION_WIDTH : 0);
  });

  surface.addEventListener('click', (event) => {
    // A swipe ends in a click too. Opening the editor after a swipe would
    // put a dialog over the action the user was reaching for.
    if (decided) {
      event.preventDefault();
      decided = false;
      return;
    }
    if (surface === openRow) {
      closeOpenRow();
      return;
    }
    onOpen();
  });

  return { onDelete };
}
