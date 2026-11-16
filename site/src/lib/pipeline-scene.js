// The pipeline scene pinned to the scroll: the scroll is the timeline. Each quarter of it takes
// the flow from one gate to the next and lights the step of that gate. Where the scene does not
// pin (narrow or short screen, reduced motion, no script) the section runs as a normal one, with
// the flow drawn to the end and the four steps lit.
//
// sceneState() is pure and tested in test/site-pipeline.test.mjs; bindPipelineScene() is the only
// part that touches the DOM, and nothing runs when the module loads.
import { FRONT_STOPS, activeStep, clamp01, flowFront, scrollProgress } from './flow.js';

// The same query the component's CSS pins the stage under (checked by the test).
export const SCENE_QUERY = '(min-width: 860px) and (min-height: 660px) and (prefers-reduced-motion: no-preference)';
// Past this progress the flow has reached the verdict.
export const ARRIVAL = 0.93;
const ALL = [true, true, true, true];

// What the scene shows at a scroll progress (0 to 1), pinned or not.
export function sceneState(progress, pinned) {
  if (!pinned) return { front: FRONT_STOPS[4], step: 3, gates: ALL, steps: ALL, arrived: true };
  const p = clamp01(progress);
  const step = activeStep(p);
  return {
    front: flowFront(p),
    step,
    gates: [0, 1, 2, 3].map((i) => i <= step),
    steps: [0, 1, 2, 3].map((i) => i === step),
    arrived: p > ARRIVAL,
  };
}

// Ties the scroll to the scene inside `root`: the track ([data-scene-track]), the stage
// ([data-scene-stage]), the gates ([data-gate]), the steps ([data-step]) and the verdict
// ([data-scene-end]). `flow` is what createFlow() returned for the scene's canvas.
export function bindPipelineScene(root, flow) {
  const track = root.querySelector('[data-scene-track]');
  const stage = root.querySelector('[data-scene-stage]');
  const gates = [...root.querySelectorAll('[data-gate]')];
  const steps = [...root.querySelectorAll('[data-step]')];
  const end = root.querySelector('[data-scene-end]');
  if (!track || !stage) return;
  const scene = matchMedia(SCENE_QUERY);
  const motion = () => document.documentElement.classList.contains('motion-ok');

  function update() {
    const pinned = scene.matches && motion();
    const r = track.getBoundingClientRect();
    const s = sceneState(scrollProgress(r.top, r.height, stage.offsetHeight), pinned);
    gates.forEach((g, i) => { g.dataset.active = String(s.gates[i]); });
    steps.forEach((el, i) => { el.dataset.active = String(s.steps[i]); });
    if (end) end.hidden = !s.arrived;
    flow.goTo(s.front);
  }

  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  scene.addEventListener('change', update);
  update();
}
