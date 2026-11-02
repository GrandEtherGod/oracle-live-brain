import { execFile } from 'child_process';
import path from 'path';

describe('oracle live brain connection', () => {
  it('starts the server, streams state, and advances counters after a turn', (done) => {
    const script = path.join(__dirname, '..', 'scripts', 'connection-test.mjs');
    execFile(
      process.execPath,
      [script],
      { timeout: 50000, env: process.env, cwd: path.join(__dirname, '..', '..') },
      (err, stdout, stderr) => {
        if (err) {
          done(new Error(`${stdout}\n${stderr}\n${err.message}`));
          return;
        }
        expect(stdout).toMatch(/counters advanced/);
        done();
      },
    );
  }, 60000);
});
