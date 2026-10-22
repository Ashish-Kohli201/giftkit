// SORTABLE: reorder a list by dragging a grip handle (pointer events, so it works with a finger as well as a mouse).
// HTML5 drag and drop is not used: it does not work on touch screens. Every list also has up / down buttons, so nothing
// depends on dragging.
//
//   makeSortable(listEl, { itemSelector: '.night', handleSelector: '.grip', onMove(from, to) { ... } })
//
// `from` and `to` are positions among the list's current items. The caller changes its data and rebuilds the list;
// this module only handles the gesture.

const THRESHOLD = 4; // pixels of movement before a press becomes a drag

export function makeSortable(list, { itemSelector, handleSelector, onMove }) {
  let drag = null;

  const items = () => [...list.querySelectorAll(`:scope > ${itemSelector}`)];

  function onDown(e) {
    const handle = e.target.closest(handleSelector);
    if (!handle || !list.contains(handle) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const item = handle.closest(itemSelector);
    const all = items();
    drag = { item, from: all.indexOf(item), to: all.indexOf(item), startY: e.clientY, active: false, handle, rects: all.map((el) => el.getBoundingClientRect()), id: e.pointerId };
    handle.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onMoveEvent(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.startY;
    if (!drag.active) {
      if (Math.abs(dy) < THRESHOLD) return;
      drag.active = true;
      drag.item.classList.add('is-dragging');
      list.classList.add('is-sorting');
    }
    drag.item.style.transform = `translateY(${dy}px)`;
    // the position the item would land in: where its centre sits among the other items' original positions
    const centre = drag.rects[drag.from].top + drag.rects[drag.from].height / 2 + dy;
    let to = drag.from;
    drag.rects.forEach((r, i) => { if (i < drag.from && centre < r.top + r.height / 2) to = Math.min(to, i); if (i > drag.from && centre > r.top + r.height / 2) to = Math.max(to, i); });
    if (to !== drag.to) {
      drag.to = to;
      items().forEach((el, i) => el.classList.toggle('drop-before', i === to && to < drag.from));
      items().forEach((el, i) => el.classList.toggle('drop-after', i === to && to > drag.from));
    }
  }

  function end(e, cancelled) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const { item, from, to, active, handle, id } = drag;
    handle.releasePointerCapture?.(id);
    item.classList.remove('is-dragging'); item.style.transform = '';
    list.classList.remove('is-sorting');
    items().forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    drag = null;
    if (active && !cancelled && to !== from) onMove(from, to);
  }

  list.addEventListener('pointerdown', onDown);
  list.addEventListener('pointermove', onMoveEvent);
  list.addEventListener('pointerup', (e) => end(e, false));
  list.addEventListener('pointercancel', (e) => end(e, true));
  // a handle that is focused can also be moved with the arrow keys
  list.addEventListener('keydown', (e) => {
    const handle = e.target.closest?.(handleSelector);
    if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const all = items();
    const from = all.indexOf(handle.closest(itemSelector));
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= all.length) return;
    e.preventDefault();
    onMove(from, to);
  });
}

/** Move one entry of an array from one position to another (returns the same array). */
export function moveItem(array, from, to) {
  const [x] = array.splice(from, 1);
  array.splice(to, 0, x);
  return array;
}
