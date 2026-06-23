// Flat-config ESLint setup for Kirk's calculator.
// Goal: catch obvious mistakes (undef vars, unused imports) without rewriting Kirk's style.
import js from "@eslint/js"
import globals from "globals"

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                d3: "readonly",
                Popper: "readonly",
                dagre: "readonly",
                pako: "readonly",
            },
        },
        rules: {
            // Kirk's style uses lots of intentional unused params and globals.
            // d3 callback signatures pass (event, d, i, arr) positionally; ignore those by name.
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^(_|d$|i$|event$|arr$)", "varsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-prototype-builtins": "off",
            "no-inner-declarations": "off",
            "no-empty": ["warn", { "allowEmptyCatch": true }],
            "no-constant-condition": ["error", { "checkLoops": false }],
        },
    },
    {
        // Tests + tools run in Node, not browser.
        files: ["tools/**/*.js", "tests/**/*.js"],
        languageOptions: {
            globals: { ...globals.node },
        },
    },
    {
        // Don't lint vendored third-party code or generated artifacts.
        ignores: [
            "third_party/**",
            "d3-sankey/**",
            "data/**",
            "node_modules/**",
            "images/**",
            "docs/**",
            "posts/**",
        ],
    },
]
