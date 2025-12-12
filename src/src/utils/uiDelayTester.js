import {
  onClipboardUpdated,
  offClipboardUpdated,
  runUiDelayTest as invokeUiDelayTest,
} from './electronService';

export async function runUiDelaySmokeTest({ count = 100, timeoutMs = 15000 } = {}) {
  const testId = `ui-delay-${Date.now()}`;
  const deltas = [];

  let resolveWait;
  let rejectWait;
  const waitForAll = new Promise((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });

  const timer = setTimeout(() => {
    rejectWait?.(new Error(`UI delay test timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const handler = (items) => {
    if (!Array.isArray(items) || items.length === 0) return;

    const now = Date.now();
    items.forEach((item) => {
      if (item.uiTestId !== testId) return;
      const emittedAt = item.uiEmittedAt || now;
      deltas.push(now - emittedAt);
    });

    if (deltas.length >= count) {
      resolveWait?.();
    }
  };

  onClipboardUpdated(handler);
  await invokeUiDelayTest({ count, testId });

  try {
    await waitForAll;
  } finally {
    offClipboardUpdated(handler);
    clearTimeout(timer);
  }

  if (deltas.length === 0) {
    throw new Error('No UI delay samples were collected.');
  }

  const average = deltas.reduce((sum, v) => sum + v, 0) / deltas.length;
  const max = Math.max(...deltas);
  const over500ms = deltas.filter((v) => v > 500).length;

  console.log(
    `[UI Delay Test] testId=${testId} count=${deltas.length} avg=${average.toFixed(
      2
    )}ms max=${max.toFixed(2)}ms over500ms=${over500ms}`
  );

  return {
    testId,
    count: deltas.length,
    averageMs: average,
    maxMs: max,
    over500ms,
    samples: deltas,
  };
}

if (typeof window !== 'undefined') {
  window.runUiDelaySmokeTest = runUiDelaySmokeTest;
}
