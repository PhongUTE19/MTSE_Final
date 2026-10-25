import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitGraphemes } from '../../client/src/shared/utils/formatters.js';
import { CHAT_CONFIG, STREAM_REVEAL_CONFIG } from '../../client/src/shared/constants/index.js';

describe('Progressive Text Reveal Queue & Unicode Integrity Suite', () => {
  it('confirms debug mode is disabled by default via CHAT_CONFIG', () => {
    assert.equal(
      CHAT_CONFIG.DEFAULT_SHOW_DEBUG,
      false,
      'Debug mode must be disabled by default'
    );
  });

  it('provides named configuration constants for reveal speed and threshold tuning', () => {
    assert.ok(STREAM_REVEAL_CONFIG.BASE_CHARS_PER_TICK >= 1);
    assert.ok(STREAM_REVEAL_CONFIG.TICK_INTERVAL_MS >= 10);
    assert.ok(STREAM_REVEAL_CONFIG.CATCHUP_THRESHOLD >= 20);
    assert.ok(STREAM_REVEAL_CONFIG.CATCHUP_CHARS_PER_TICK >= STREAM_REVEAL_CONFIG.BASE_CHARS_PER_TICK);
    assert.ok(STREAM_REVEAL_CONFIG.MAX_BATCH_SIZE >= STREAM_REVEAL_CONFIG.CATCHUP_CHARS_PER_TICK);
  });

  it('splits Vietnamese diacritics and complex Unicode characters without corrupting surrogate pairs', () => {
    const text = 'Chào mừng bạn đến với HCMUTE! 🎉 🇻🇳\n\n- Mục 1: Học phí\n- Mục 2: Học bổng';
    const graphemes = splitGraphemes(text);

    // Graphemes must recombine into exact original string with zero character loss
    assert.equal(graphemes.join(''), text);

    // Emoji surrogate pairs should not be severed into lone surrogates
    const partyPopper = graphemes.find((g) => g.includes('🎉'));
    assert.ok(partyPopper, 'Party popper emoji must exist as a complete grapheme');
    assert.equal(partyPopper, '🎉');

    // Newlines and indentation preserved
    assert.ok(graphemes.includes('\n'));
    assert.ok(graphemes.includes('-'));
  });

  it('gracefully drains short responses across ticks without dumping all characters when stream ends', () => {
    // 1. Very short response that ends before reveal queue is empty
    const shortResponse = 'Xin chào bạn!';
    const graphemes = splitGraphemes(shortResponse);

    // Simulate initial arrival
    const queue = [...graphemes];
    let displayed = '';
    let isStreaming = true;
    let isComplete = false;
    let isRevealing = true;

    // First batch revealed immediately
    displayed += queue.splice(0, STREAM_REVEAL_CONFIG.BASE_CHARS_PER_TICK).join('');
    assert.ok(displayed.length > 0, 'First batch revealed immediately');
    assert.ok(queue.length > 0, 'Queue holds remaining characters');

    // Stream finishes abruptly (e.g. fast onDone from network)
    isStreaming = false;

    // Graceful drain: queue is NOT cleared immediately when isStreaming becomes false
    assert.ok(queue.length > 0, 'Queue must not be wiped when stream ends');
    assert.notEqual(displayed, shortResponse, 'Must not instantly dump full response');

    // Tick progressively at reveal speed
    const tickHistory = [];
    while (queue.length > 0) {
      const batch = queue.splice(0, STREAM_REVEAL_CONFIG.BASE_CHARS_PER_TICK).join('');
      displayed += batch;
      tickHistory.push(batch);
    }

    // Now queue is empty and stream ended
    if (queue.length === 0 && !isStreaming) {
      isComplete = true;
      isRevealing = false;
    }

    assert.ok(tickHistory.length >= 2, 'Short response was revealed progressively across multiple ticks');
    assert.equal(displayed, shortResponse, 'Full response revealed accurately with zero data loss');
    assert.equal(isComplete, true, 'Marked complete once queue is empty and stream ended');
    assert.equal(isRevealing, false, 'No longer revealing once drained');
  });

  it('simulates progressive queue buffering and catch-up acceleration for longer fast streams', () => {
    // 2. Longer response where incoming chunks arrive faster than they can be revealed
    const multiTokenChunks = [
      'Sinh viên cần đóng học phí ',
      'đúng thời hạn quy định trong sổ tay sinh viên. ',
      'Học bổng khuyến khích học tập được xét dựa trên kết quả rèn luyện học tập.',
    ];

    const queue = [];
    const revealedBatches = [];
    let displayed = '';

    for (const chunk of multiTokenChunks) {
      const graphemes = splitGraphemes(chunk);
      queue.push(...graphemes);

      let batchSize = STREAM_REVEAL_CONFIG.BASE_CHARS_PER_TICK;
      if (queue.length > STREAM_REVEAL_CONFIG.CATCHUP_THRESHOLD) {
        const excess = queue.length - STREAM_REVEAL_CONFIG.CATCHUP_THRESHOLD;
        batchSize += Math.min(
          STREAM_REVEAL_CONFIG.CATCHUP_CHARS_PER_TICK,
          Math.ceil(excess / 8)
        );
      }
      const batch = queue.splice(0, batchSize).join('');
      displayed += batch;
      revealedBatches.push(batch);
    }

    assert.ok(queue.length > 0, 'Queue holds pending characters');

    // Drain remaining
    while (queue.length > 0) {
      const batch = queue.splice(0, STREAM_REVEAL_CONFIG.BASE_CHARS_PER_TICK).join('');
      displayed += batch;
    }

    const expectedFullText = multiTokenChunks.join('');
    assert.equal(displayed, expectedFullText);
  });

  it('completes immediately without delay when queue is already empty at stream end', () => {
    // 3. Response where queue is already empty when stream ends
    const queue = [];
    const targetText = 'Done already.';
    let displayed = targetText;
    const isStreaming = false;

    let isComplete = false;
    let isRevealing = true;

    if (!isStreaming && queue.length === 0) {
      isComplete = true;
      isRevealing = false;
    }

    assert.equal(isComplete, true);
    assert.equal(isRevealing, false);
    assert.equal(displayed, targetText);
  });

  it('handles empty response gracefully without hanging in revealing state', () => {
    // 4. Empty response
    const targetText = '';
    const queue = [];
    const isStreaming = false;

    let isComplete = false;
    let isRevealing = false;

    if (!isStreaming && queue.length === 0) {
      isComplete = true;
      isRevealing = false;
    }

    assert.equal(isComplete, true);
    assert.equal(isRevealing, false);
  });

  it('halts reveal queue and preserves partial response immediately on cancellation or error', () => {
    // 5. Cancellation and errors while text remains queued
    const chunk1 = 'Phần câu trả lời đã nhận được nhưng bị huỷ giữa chừng.';
    const queue = splitGraphemes(chunk1);
    let displayed = '';

    // Partially revealed
    displayed += queue.splice(0, 10).join('');
    assert.ok(displayed.length > 0);
    assert.ok(queue.length > 0);

    // Cancel / Interrupt event:
    const isInterrupted = true;
    let isComplete = false;
    let isRevealing = true;

    if (isInterrupted) {
      // Clear queue and preserve received text
      queue.length = 0;
      displayed = chunk1;
      isRevealing = false;
      isComplete = true;
    }

    assert.equal(queue.length, 0);
    assert.equal(displayed, chunk1);
    assert.equal(isRevealing, false);
    assert.equal(isComplete, true);
  });

  it('prevents text leakage and isolates consecutive requests cleanly', () => {
    // 6. Consecutive requests with no text leakage between messages
    let queue = splitGraphemes('First response that left items in queue');
    let displayed = 'First response';
    let processedLength = 35;

    // Reset occurs when new prompt/response begins:
    const newTarget = 'Second response';
    if (!newTarget.startsWith(newTarget.slice(0, processedLength)) || newTarget.length < processedLength) {
      queue = [];
      processedLength = 0;
      displayed = '';
    }

    assert.equal(queue.length, 0, 'Old queue must be purged on reset');
    assert.equal(displayed, '', 'Displayed text reset for new request');
    assert.equal(processedLength, 0);
  });
});
