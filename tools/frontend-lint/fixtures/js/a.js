// Fixture for selftest.mjs: loaded before b.js. Lines marked BAD must be reported.
const first = 1;
later(); // BAD: b.js declares it, and hoisting stops at the script boundary
console.log(second); // BAD: b.js defines it after this runs
missingName(); // BAD: defined nowhere

// Fine: these run when called, after every script has loaded.
function usesLaterInside() {
  return later() + second + Published.later();
}
document.addEventListener("click", () => later());
