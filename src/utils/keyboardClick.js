/**
 * For elements that use onClick but are not native <button> (cards, rows).
 * Enter / Space should trigger the same action (keyboard + screen-reader parity).
 *
 * @param {() => void} action
 * @returns {import('react').KeyboardEventHandler}
 */
export function keyboardActivateHandler(action) {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };
}
