// This file MUST have zero imports.  Vitest executes setupFiles sequentially
// with await import(); a file with no static imports evaluates immediately
// (nothing to hoist), so this assignment is visible to the Node module system
// before the next setup file's imports are resolved.
//
// Vitest's jsdom environment sets NODE_ENV to 'production' to simulate a
// browser.  That causes react-dom/test-utils to load its production bundle,
// which calls React.act() — absent in the production React bundle — and
// crashes every @testing-library/react render() call.  Setting NODE_ENV here
// (before react-dom is first required) makes it load the development bundle.
process.env.NODE_ENV = 'test'
