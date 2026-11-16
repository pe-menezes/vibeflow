// The stage of the spec sheet in the live demo, as a pure function of where the conversation sits
// on screen. The sheet is an accent: the page is complete without this module, and the component
// only calls it on wide screens with motion allowed.
//
// Contract (test/site-demo.test.mjs proves it by property):
// * a mark counts once its top passes DEMO_LINE of the viewport height;
// * the stage is the highest stage among the marks that passed, FIRST_STAGE when none did;
// * once the end of the section is on screen, the stage is the last one;
// * scrolling down never lowers the stage.

export const FIRST_STAGE = 1;

// A mark counts when its top is above 86% of the viewport height.
export const DEMO_LINE = 0.86;

// Slack, in pixels, for the section's bottom edge to count as on screen.
const END_SLACK = 2;

/**
 * @param {{ top: number, stage: number }[]} marks the conversation marks, top relative to the viewport
 * @param {{ bottom: number, viewport: number }} view the section's bottom edge and the viewport height
 * @returns {number} the stage the sheet shows
 */
export function demoStage(marks, { bottom, viewport }) {
  const last = lastStage(marks);
  if (bottom <= viewport + END_SLACK) return last;
  const line = viewport * DEMO_LINE;
  let stage = FIRST_STAGE;
  for (const mark of marks) {
    if (mark.top < line && mark.stage > stage) stage = mark.stage;
  }
  return stage;
}

/** The highest stage any mark brings, FIRST_STAGE when there are no marks. */
export function lastStage(marks) {
  let last = FIRST_STAGE;
  for (const mark of marks) if (mark.stage > last) last = mark.stage;
  return last;
}
