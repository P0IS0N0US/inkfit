/* What the capture page is doing, kept apart from the page: which shape is being
   asked for, what has been drawn and what is still to send. No DOM and no clock,
   so tests can run it. The page turns events into these calls, and ends a
   drawing by calling finish() once no new stroke has started for a moment.

   A round asks for each shape once, in shuffled order, so the drawer stays
   hasty. It is sent when it ends, and can be dropped from until then. A failed
   send keeps the round, to be sent again or dropped from. Part of it may have
   been written by then, so a drawing dropped after a failure can stay in its
   file. */

export class Session {
  /** @param {{shape: string, label: string}[]} prompts
   * @param {(list: any[]) => any[]} shuffle
   * @param {string} tag What makes this page's drawing ids its own. */
  constructor(prompts, shuffle, tag) {
    this.prompts = prompts;
    this.shuffle = shuffle;
    this.tag = tag;
    this.drawn = 0;
    this.input = null;
    this.round = 1;
    this.sending = false;
    this.strokes = [];       // the current drawing's finished strokes
    this.stroke = null;      // the stroke being drawn
    this.drawingInput = null;
    this.startRound();
  }

  startRound() {
    this.queue = this.shuffle(this.prompts);   // what is still to draw, the current one first
    this.done = [];                            // this round's finished drawings
  }

  /** What to tell the drawer. */
  get text() {
    if (!this.input) return 'Pick what you are drawing with';
    if (this.sending) return 'Saving';
    if (!this.queue.length) return 'Could not save. Tap the pad to retry';
    return `Draw ${this.queue[0].label}`;
  }

  get progress() {
    const total = this.prompts.length;
    return `Round ${this.round}, ${Math.min(total, total - this.queue.length + 1)} of ${total}`;
  }

  /** Whether the round is over and not on its way. */
  get unsent() {
    return !this.queue.length && !this.sending;
  }

  /** Whether a press would start a stroke. */
  get ready() {
    return Boolean(this.input) && !this.sending && !this.stroke && this.queue.length > 0;
  }

  /** The input applies from the next drawing: one under way keeps the one it started with. */
  pick(input) {
    this.input = input;
  }

  /** Starts a stroke, unless one can't start now. @param {number[]} point */
  press(point) {
    if (!this.ready) return false;
    if (!this.strokes.length) this.drawingInput = this.input;
    this.stroke = [point];
    return true;
  }

  /** @param {number[]} point */
  move(point) {
    this.stroke?.push(point);
  }

  /** @param {number[]} point */
  release(point) {
    if (!this.stroke) return;
    this.stroke.push(point);
    this.strokes.push(this.stroke);
    this.stroke = null;
  }

  /** Forgets the stroke being drawn. The drawing's finished strokes stay. */
  cancel() {
    this.stroke = null;
  }

  /** Ends the current drawing. */
  finish() {
    if (this.stroke || !this.strokes.length) return;
    this.drawn += 1;
    const id = `${this.tag}-${this.drawn}`;
    this.done.push({ id, shape: this.queue[0].shape, input: this.drawingInput, strokes: this.strokes });
    this.strokes = [];
    this.queue.shift();
  }

  /** Undoes the current drawing, or else the last finished one, which is then asked
   * for again. Not during a send, which has already left, or during a stroke, which
   * would land under the wrong shape. */
  drop() {
    if (this.sending || this.stroke) return;
    if (this.strokes.length) {
      this.strokes = [];
    } else if (this.done.length) {
      const last = this.done.pop();
      this.queue.unshift(this.prompts.find(p => p.shape === last.shape));
    }
  }

  /** What to send now. */
  send() {
    this.sending = true;
    return this.done;
  }

  sent() {
    this.sending = false;
    this.round += 1;
    this.startRound();
  }

  failed() {
    this.sending = false;
  }
}
