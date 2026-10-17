// A test preload for task-completed.test.mjs: readFileSync throws, as a fault inside the hook would.
const fs = require('node:fs');
const real = fs.readFileSync;
fs.readFileSync = (...a) => {
  if (a[0] === 0) throw new Error('test fault');
  return real(...a);
};
require('node:module').syncBuiltinESMExports();
