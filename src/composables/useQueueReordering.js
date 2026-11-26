import { ref } from "vue";

export function useQueueReordering({ library, queue, isInteractingWithItem }) {
  const draggedIndex = ref(null);
  const hoverIndex = ref(null);
  const dropPosition = ref(null);

  function calculateDropPosition(cursorY, rect, index) {
    const relY = cursorY - rect.top;
    const ratio = Math.max(0, Math.min(1, relY / rect.height));

    if (draggedIndex.value !== null && draggedIndex.value < index) {
      return ratio < 0.2 ? "before" : "after";
    }
    if (draggedIndex.value !== null && draggedIndex.value > index) {
      return ratio > 0.8 ? "after" : "before";
    }
    return ratio < 0.5 ? "before" : "after";
  }

  function handleDragStart(event, index) {
    isInteractingWithItem.value = true;
    draggedIndex.value = index;
    hoverIndex.value = index;
    dropPosition.value = null;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleDragOver(event, index) {
    hoverIndex.value = index;
    const rect = event.currentTarget.getBoundingClientRect();
    dropPosition.value = calculateDropPosition(event.clientY, rect, index);
  }

  function handleListDragOver(event) {
    if (draggedIndex.value === null) return;
    const listItems = event.currentTarget.querySelectorAll(".queue-track-row");
    if (!listItems.length) return;
    const lastRect = listItems[listItems.length - 1].getBoundingClientRect();
    if (event.clientY > lastRect.bottom) {
      hoverIndex.value = queue().length - 1;
      dropPosition.value = "after";
    }
  }

  function handleListDrop() {
    if (draggedIndex.value === null) return;
    if (hoverIndex.value !== null) handleDrop(hoverIndex.value);
  }

  function handleDrop(targetIndex) {
    if (
      draggedIndex.value === null ||
      targetIndex === null ||
      targetIndex === undefined
    ) {handleDragEnd(); return;}

    const currentQueue = queue();
    const fromIndex = draggedIndex.value;
    const targetSong = currentQueue[targetIndex];
    if (!targetSong) {handleDragEnd(); return;}

    const queueCopy = [...currentQueue];
    const [movedSong] = queueCopy.splice(fromIndex, 1);
    let targetPos = queueCopy.findIndex((song) => song.id === targetSong.id);
    if (targetPos === -1) targetPos = targetIndex;

    const insertIndex =
      dropPosition.value === "before" ? targetPos : targetPos + 1;
    queueCopy.splice(Math.max(0, Math.min(queueCopy.length, insertIndex)), 0, movedSong);
    library.playQueue = queueCopy;
    handleDragEnd();

    setTimeout(() => {isInteractingWithItem.value = false;}, 150);
  }

  function handleDragEnd() {
    draggedIndex.value = null;
    hoverIndex.value = null;
    dropPosition.value = null;
    setTimeout(() => {isInteractingWithItem.value = false;}, 100);
  }

  function handleTouchItemStart(event, index) {
    isInteractingWithItem.value = true;
    draggedIndex.value = index;
    hoverIndex.value = index;
    dropPosition.value = null;
  }

  function handleTouchItemMove(event) {
    if (draggedIndex.value === null) return;
    const touch = event.touches[0];
    const targetRow = document
      .elementFromPoint(touch.clientX, touch.clientY)
      ?.closest(".queue-track-row");

    if (!targetRow?.parentElement) return;
    const rows = Array.from(targetRow.parentElement.children);
    const targetIndex = rows.indexOf(targetRow);
    if (targetIndex === -1) return;

    hoverIndex.value = targetIndex;
    dropPosition.value = calculateDropPosition(
      touch.clientY,
      targetRow.getBoundingClientRect(),
      targetIndex,
    );
  }

  function handleTouchItemEnd() {
    if (draggedIndex.value !== null && hoverIndex.value !== null) {handleDrop(hoverIndex.value);} else {
      handleDragEnd();
    }
  }

  return {
    draggedIndex,
    hoverIndex,
    dropPosition,
    handleDragStart,
    handleDragOver,
    handleListDragOver,
    handleListDrop,
    handleDrop,
    handleDragEnd,
    handleTouchItemStart,
    handleTouchItemMove,
    handleTouchItemEnd,
  };
}
