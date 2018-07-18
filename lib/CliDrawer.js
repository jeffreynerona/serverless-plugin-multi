const ansiDiffer = require('ansi-diff');
const _ = require('lodash');

class CliDrawer {
  constructor(options) {
    this.tty = process.stdout.isTTY;
    this.diff = ansiDiffer({ width: this.tty ? process.stdout.columns : undefined });
    this.buffer = [];
    this.draw = _.throttle(this._draw.bind(this), 50);
    this.interval = 250;
    this.truncate = options && options.truncate;
  }

  pushLine(str) {
    if (!this.tty) console.log(str);
    this.buffer.push(str);
    this.draw();
    return this.buffer.length - 1;
  }

  updateLine(i, str) {
    if (!this.tty) return console.log(str);
    this.buffer[i] = str;
    this.draw();
  }

  overwriteLine(i, offset, str) {
    if (!this.tty) return console.log(str);
    const prev = this.buffer[i];
    this.buffer[i] = prev.substring(0, offset) + str + prev.substring(offset + str.length);
    this.draw();
  }

  _draw() {
    // do not draw if not tty
    if (!this.tty) return;
    const output = this.buffer.map(line => (this.truncate ? line.substring(0, this.diff.width - 1) : line)).join('\n');
    const changes = this.diff.update(output);
    process.stdout.write(changes);
  }

  clear() {
    this._draw();
    if (!this.tty) return console.log('');
    process.stdout.write('\u001b[?25h');
    console.log('');
  }
}

module.exports = CliDrawer;
