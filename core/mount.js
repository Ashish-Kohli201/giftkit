// mountElement: the one place an element is instantiated. Builds ctx, validates params, loads element CSS.
import { deepTemplate, ensureCss, template } from './util.js';
import { validate } from './validate.js';

const noop = () => {};

/**
 * @param element  an element module (default export of elements/<kind>/<id>/index.js)
 * @param container DOM node to mount into (gets data-element / data-kind)
 * @param opts { theme, params, assets, vars, store, hooks, usePlaceholders }
 *   hooks: { onComplete, onFail, emit, onExit }
 * @returns { destroy() }
 */
export async function mountElement(element, container, { theme, params = {}, assets, vars = {}, store, hooks = {}, usePlaceholders = false } = {}) {
  const merged = usePlaceholders ? { ...element.placeholderParams, ...params } : params;
  const finalParams = deepTemplate(merged, vars);
  const errors = validate(element.paramsSchema, finalParams, `${element.id}.params`);
  if (errors.length) throw new Error(`Invalid params for "${element.id}":\n - ${errors.join('\n - ')}`);

  await ensureCss(element.layout);
  container.replaceChildren();
  container.dataset.element = element.id;
  container.dataset.kind = element.kind;

  // Copy resolution: gift params.copy  >  theme copy["<element>.<key>"]  >  element default
  const t = (key, v = {}) =>
    template(finalParams.copy?.[key] ?? theme.copy?.[`${element.id}.${key}`] ?? element.copy?.[key] ?? key, { ...vars, ...v });

  const ctx = {
    params: finalParams,
    assets,
    vars,
    t,
    fx: theme.fx,
    dialogs: theme.dialogs,
    store: store ?? { get: (_k, f) => f, set: noop },
    onComplete: hooks.onComplete ?? noop,
    onFail: hooks.onFail ?? noop,
    onExit: hooks.onExit ?? noop,
    emit: hooks.emit ?? noop,
  };

  const instance = await element.mount(container, ctx);
  theme.decorate?.(element.id, container, ctx);
  return { destroy() { instance?.destroy?.(); container.replaceChildren(); } };
}
