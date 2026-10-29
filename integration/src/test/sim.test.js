'use strict';

const {MultiRandomRunner} = require('./sim');

describe('sim', () => {
  it('test', async () => {
    const opts = {totalGames: 100, prng: [1, 2, 3, 4]};
    expect(await (new MultiRandomRunner(opts).run())).toBe(0);
  });
  it('sodium', async () => {
    const opts = {totalGames: 100, prng: 'sodium,00000001000000020000000300000004'};
    expect(await (new MultiRandomRunner(opts).run())).toBe(0);
  });
});
